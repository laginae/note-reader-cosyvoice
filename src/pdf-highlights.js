'use strict';

const { extractPdfTextLayout } = require('./pdf-layout');
const { compact } = require('./markdown-source');
const { inside } = require('./pdf-ancillary');

function pdfPageLines(page, clean, source = null, footnote = false) {
  const bounds = page.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) return null;
  const spans = [...page.querySelectorAll('.textLayer span')].filter(span => !span.querySelector('span') && span.textContent.trim());
  const positioned = spans.map(span => ({ span, rect: span.getBoundingClientRect() })).filter(item => item.rect.width > 0 && item.rect.height > 0);
  if (!positioned.length) return null;
  let items = positioned.map(({ span, rect }) => ({ str: span.textContent, width: rect.width, height: rect.height,
    transform: [rect.height, 0, 0, rect.height, rect.left - bounds.left, bounds.top - rect.top] }));
  const original = source?.items?.filter(item => item.str?.trim());
  const exact = original?.length === positioned.length && original.every((item, index) => item.str === positioned[index].span.textContent);
  if (exact) items = original;
  const layout = extractPdfTextLayout(items, { viewport: exact ? source.viewport : { width: bounds.width, height: bounds.height } });
  const heights = items.map(item => Math.max(1, Math.abs(item.height || 0), Math.abs(item.transform?.[1] || 0), Math.abs(item.transform?.[3] || 0))).sort((a, b) => a - b);
  const middle = Math.floor(heights.length / 2);
  const medianHeight = heights.length % 2 ? heights[middle] : (heights[middle - 1] + heights[middle]) / 2;
  // Match the layout's baseline tolerance; paired columns can shift its mean baseline.
  const tolerance = Math.max(2, medianHeight * 0.5);
  const lineNodes = layout.lines.map(() => []);
  positioned.forEach(({ span, rect }, i) => {
    const item = items[i], x = exact ? item.transform[4] : rect.left - bounds.left;
    const y = exact ? item.transform[5] : bounds.top - rect.top;
    const width = exact ? Math.abs(item.width) : rect.width;
    let nearest = -1, distance = Infinity;
    layout.lines.forEach((line, index) => {
      const delta = Math.abs(y - line.y);
      if (delta <= tolerance && delta < distance && x >= line.xMin - 2 && x + width <= line.xMax + 2) {
        nearest = index; distance = delta;
      }
    });
    if (nearest >= 0) lineNodes[nearest].push(span);
  });
  const ancillaryFilter = source?.omittedRegions?.length || source?.contentScope === 'glossary';
  if (exact && (ancillaryFilter || (source.footnoteMode && source.footnoteMode !== 'inline' && source.footnoteRegions?.length))) {
    const indices = layout.lines.map((line, index) => ({ line, index })).filter(({ line }) => {
      if (source.omittedRegions?.some(region => inside(line, region))) return false;
      if (source.contentScope === 'glossary') return source.glossaryRegions?.some(region => inside(line, region));
      if (!source.footnoteMode || source.footnoteMode === 'inline') return true;
      const isNote = source.footnoteRegions?.some(region => line.y >= region.yMin && line.y <= region.yMax
        && line.xMin >= region.xMin && line.xMax <= region.xMax);
      return Boolean(isNote) === footnote;
    });
    layout.lines = indices.map(({ line }) => line);
    const keptNodes = indices.map(({ index }) => lineNodes[index]);
    lineNodes.splice(0, lineNodes.length, ...keptNodes);
    layout.text = layout.lines.map(line => line.text).join('\n').replace(/([A-Za-z])-\n(?=[a-z])/g, '$1').trim();
  } else if (!exact && (ancillaryFilter || (source?.footnoteRegions?.length && source.footnoteMode !== 'inline'))) return null;
  const text = compact(clean(layout.text));
  let offset = 0;
  const lines = layout.lines.map((line, index) => {
    const nextText = layout.lines[index + 1]?.text || '';
    const joined = /[A-Za-z]-$/.test(line.text) && /^[a-z]/.test(nextText)
      ? line.text.slice(0, -1) : line.text;
    const value = compact(clean(joined));
    // Only resume after a context-sensitive transformation at a unique exact line.
    let start = value && text.startsWith(value, offset) ? offset : -1;
    if (start < 0 && value) {
      const found = text.indexOf(value);
      if (found >= offset && text.indexOf(value, found + 1) < 0) start = found;
    }
    const end = start < 0 ? -1 : start + value.length;
    if (end >= 0) offset = end;
    const nodes = lineNodes[index];
    return { start, end, text: value, nodes };
  }).filter(line => line.start >= 0);
  if (!text || !lines.length) return null;
  return { text, lines };
}

function matchPdfChunk(pages, chunk) {
  const needle = compact(chunk), text = pages.map(page => page.text).join('');
  if (!needle) return [];
  const start = text.indexOf(needle);
  if (start < 0 || text.indexOf(needle, start + 1) >= 0) return [];
  const end = start + needle.length, result = [];
  let offset = 0;
  for (const page of pages) {
    for (const line of page.lines) if (offset + line.start < end && offset + line.end > start) result.push(...line.nodes);
    offset += page.text.length;
  }
  return [...new Set(result)];
}

function mergeHighlightRects(rects) {
  const rows = [];
  for (const rect of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const center = rect[1] + rect[3] / 2;
    const row = rows.find(row => Math.abs(center - row.center) <= Math.min(rect[3], row.height) * 0.4);
    if (row) row.rects.push(rect);
    else rows.push({ center, height: rect[3], rects: [rect] });
  }
  return rows.flatMap(row => {
    const merged = [];
    for (const rect of row.rects.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      // Fill word spaces, but leave column gutters and large table gaps clear.
      if (last && rect[0] - last[0] - last[2] <= row.height * 0.9) {
        const right = Math.max(last[0] + last[2], rect[0] + rect[2]);
        const bottom = Math.max(last[1] + last[3], rect[1] + rect[3]);
        last[1] = Math.min(last[1], rect[1]);
        last[2] = right - last[0]; last[3] = bottom - last[1];
      } else merged.push([...rect]);
    }
    return merged;
  });
}

class PdfReadingHighlights {
  constructor(plugin) { this.plugin = plugin; this.marked = new Set(); this.cached = new Map(); this.overlays = new Map(); }
  discardCache(view) {
    for (const observer of this.cached.get(view)?.observers || []) observer.disconnect();
    this.cached.delete(view);
  }
  clearCache() { for (const view of this.cached.keys()) this.discardCache(view); }
  clear() {
    for (const node of this.marked) node.classList.remove('note-reader-pdf-current');
    this.marked.clear();
    for (const { element } of this.overlays.values()) element.remove();
    this.overlays.clear();
  }
  renderOverlays(nodes) {
    const pages = new Map();
    for (const node of nodes) {
      const page = node.closest('[data-page-number]');
      if (!page) continue;
      if (!pages.has(page)) pages.set(page, []);
      const bounds = page.getBoundingClientRect(), rect = node.getBoundingClientRect();
      if (!(bounds.width > 0 && bounds.height > 0 && rect.width > 0 && rect.height > 0)) continue;
      pages.get(page).push([rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height]);
    }
    for (const [page, overlay] of this.overlays) if (!pages.has(page)) {
      overlay.element.remove(); this.overlays.delete(page);
    }
    for (const [page, rawRects] of pages) {
      const bounds = page.getBoundingClientRect();
      const rects = mergeHighlightRects(rawRects).map(([x, y, w, h]) =>
        [x / bounds.width * 100, y / bounds.height * 100, w / bounds.width * 100, h / bounds.height * 100]);
      const signature = JSON.stringify(rects);
      let overlay = this.overlays.get(page);
      if (!overlay || !overlay.element.isConnected) {
        const element = page.ownerDocument.createElement('div');
        element.className = 'note-reader-pdf-overlay';
        element.setAttribute('aria-hidden', 'true');
        // Obsidian dims the entire text layer. Keep marks outside it.
        page.appendChild(element);
        overlay = { element, signature: null }; this.overlays.set(page, overlay);
      }
      if (overlay.signature === signature && overlay.element.children.length === rects.length) continue;
      overlay.element.replaceChildren(...rects.map(([left, top, width, height]) => {
        const mark = page.ownerDocument.createElement('div');
        mark.className = 'note-reader-pdf-rectangle';
        Object.assign(mark.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
        return mark;
      }));
      overlay.signature = signature;
    }
  }
  update() {
    const plugin = this.plugin, session = plugin.activeSession, highlight = plugin.getCurrentReadingHighlight();
    if (session?.sourceKind !== 'pdf' || !highlight || plugin.settings.readingHighlight === 'off') {
      this.clear(); this.clearCache(); return;
    }
    const pageNumber = session.chunkPageNumbers?.[highlight.index];
    if (!Number.isInteger(pageNumber)) { this.clear(); this.clearCache(); return; }
    const next = new Set(), live = new Set();
    for (const leaf of plugin.app.workspace.getLeavesOfType('pdf')) {
      const view = leaf.view;
      if (view.file?.path !== session.filePath || (session.fileMtime && view.file?.stat?.mtime !== session.fileMtime)) continue;
      const root = view.contentEl || view.containerEl;
      const page = root?.querySelector(`[data-page-number="${pageNumber}"]`);
      if (!page) continue;
      live.add(view);
      const following = root.querySelector(`[data-page-number="${pageNumber + 1}"]`);
      const signature = `${session.id}:${highlight.index}:${plugin.settings.stripMarkdown}:${plugin.settings.mathReadingLanguage}:${page.getBoundingClientRect().width}:${page.getBoundingClientRect().height}`;
      const first = page.querySelector('.textLayer span'), last = page.querySelector('.textLayer')?.lastElementChild;
      const nextFirst = following?.querySelector('.textLayer span');
      const layers = [page.querySelector('.textLayer'), following?.querySelector('.textLayer')].filter(Boolean);
      let cache = this.cached.get(view);
      if (!cache || cache.signature !== signature || cache.first !== first || cache.last !== last || cache.nextFirst !== nextFirst
        || cache.dirty || cache.layers.length !== layers.length || cache.layers.some((layer, i) => layer !== layers[i])
        || cache.observers.some(observer => observer.takeRecords().length > 0)
        || cache.nodes.some(node => !node.isConnected)
        || (!cache.nodes.length && Date.now() - cache.created > 1000)) {
        this.discardCache(view);
        const clean = text => plugin.sanitizeAudioExportText(text);
        const currentPage = pdfPageLines(page, clean, session.pdfHighlightPages?.get(pageNumber), Boolean(session.chunkFootnotes?.[highlight.index]));
        const nextPage = following ? pdfPageLines(following, clean, session.pdfHighlightPages?.get(pageNumber + 1), Boolean(session.chunkFootnotes?.[highlight.index])) : null;
        cache = { signature, first, last, nextFirst, layers, observers: [], dirty: false, created: Date.now(), nodes: currentPage
          ? matchPdfChunk(nextPage ? [currentPage, nextPage] : [currentPage], session.chunks[highlight.index]) : [] };
        // Text-layer updates can replace middle spans without changing either endpoint.
        for (const layer of layers) {
          const Observer = layer.ownerDocument.defaultView?.MutationObserver;
          if (!Observer) continue;
          const observer = new Observer(() => { cache.dirty = true; });
          observer.observe(layer, { subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ['style'] });
          cache.observers.push(observer);
        }
        this.cached.set(view, cache);
      }
      for (const node of cache.nodes) if (node.isConnected) next.add(node);
    }
    for (const view of this.cached.keys()) if (!live.has(view)) this.discardCache(view);
    for (const node of this.marked) if (!next.has(node)) node.classList.remove('note-reader-pdf-current');
    for (const node of next) node.classList.add('note-reader-pdf-current');
    this.marked = next;
    this.renderOverlays(next);
  }
  destroy() { this.clear(); this.clearCache(); }
}

module.exports = { PdfReadingHighlights, pdfPageLines, matchPdfChunk, mergeHighlightRects };
