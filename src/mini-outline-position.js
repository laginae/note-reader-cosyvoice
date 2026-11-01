'use strict';
const { headingAt } = require('./mini-outline');
function pdfViewer(view) {
  const child = view.viewer?.child || view.pdfViewer?.child;
  return [child?.pdfViewer?.pdfViewer, child?.pdfViewer, child?.pdfViewerApplication?.pdfViewer].find(v => v?.getPageView || v?.scrollPageIntoView);
}
function browsingIndex(view, data) {
  if (data.kind === 'markdown') {
    const line = view.currentMode?.getScroll?.() ?? view.previewMode?.getScroll?.();
    if (Number.isFinite(line)) return headingAt(data.entries, line, 'line');
    const cm = view.editor?.cm;
    if (cm?.viewport && cm.state?.doc?.lineAt) return headingAt(data.entries, cm.state.doc.lineAt(cm.viewport.from).number - 1, 'line');
    return -1;
  }
  if (data.kind === 'html') {
    let current = -1;
    data.entries.forEach((entry, i) => { if (entry.element?.isConnected && entry.element.getBoundingClientRect().top <= 100) current = i; });
    return current;
  }
  const viewer = pdfViewer(view), page = viewer?.currentPageNumber;
  if (!page) return -1;
  const pageView = viewer.getPageView?.(page - 1), top = viewer.container?.getBoundingClientRect?.().top;
  const singleHeadingOnPage = data.entries.filter(e => e.page === page).length === 1;
  let current = -1;
  data.entries.forEach((entry, i) => {
    if (entry.page < page) current = i;
    if (entry.page !== page) return;
    const point = pageView?.viewport?.convertToViewportPoint?.(entry.x || 0, entry.y);
    if (point && Number.isFinite(top) && pageView.div.getBoundingClientRect().top + point[1] <= top + 80) current = i;
    else if (!point && singleHeadingOnPage) current = i;
  });
  return current;
}
function elementHeading(entries, element) {
  if (!element?.isConnected) return -1;
  let current = -1;
  entries.forEach((entry, i) => {
    if (entry.element?.isConnected && (entry.element === element || entry.element.contains(element) || (entry.element.compareDocumentPosition(element) & 4))) current = i;
  });
  return current;
}
function scrollDocumentEdge(view, data, end, workspace) {
  if (data.kind === 'markdown') {
    const lines = data.text.split('\n'), line = end ? lines.length - 1 : 0;
    if (view.getMode?.() === 'preview' && view.previewMode?.applyScroll) return view.previewMode.applyScroll(line);
    if (!view.editor?.scrollIntoView) throw Error('Document view unavailable');
    const pos = view.editor.offsetToPos?.(end ? data.text.length : 0) || { line, ch: end ? lines[line].length : 0 };
    return view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
  if (data.kind === 'html') {
    const doc = data.doc, root = doc?.scrollingElement || doc?.documentElement || doc?.body;
    if (!root) throw Error('Document view unavailable');
    root.scrollTop = end ? Math.max(root.scrollHeight, doc.body?.scrollHeight || 0) : 0;
    return;
  }
  const viewer = pdfViewer(view), count = viewer?.pagesCount || data.model?.pages?.length || data.pages?.length;
  const pageNumber = end ? count : 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw Error('PDF page unavailable');
  if (!viewer?.scrollPageIntoView) {
    if (!workspace?.openLinkText) throw Error('PDF view unavailable');
    return workspace.openLinkText(`${data.file.path}#page=${pageNumber}${end ? '&offset=0,0,0' : ''}`, '', false);
  }
  const target = { pageNumber };
  if (end) {
    const page = viewer.getPageView?.(pageNumber - 1), viewport = page?.viewport;
    // Convert the visual bottom edge so rotated or cropped pages do not assume a zero PDF origin.
    const point = viewport?.convertToPdfPoint?.(0, viewport.height) || page?.pdfPage?.view?.slice(0, 2) || [0, 0];
    if (!point.every(Number.isFinite)) throw Error('PDF position unavailable');
    target.destArray = [null, { name: 'XYZ' }, point[0], point[1], null];
  }
  return viewer.scrollPageIntoView(target);
}
module.exports = { pdfViewer, browsingIndex, elementHeading, scrollDocumentEdge };
