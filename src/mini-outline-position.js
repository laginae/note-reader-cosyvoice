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
module.exports = { pdfViewer, browsingIndex, elementHeading };
