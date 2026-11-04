'use strict';
const { extractPdfTextLayout } = require('./pdf-layout');
const { outlineTypography, detectPdfHeadings } = require('./pdf-outline-detection');
const HEADING_NUMBER = /^(\d+(?:\.\d+)*\.?|[IVXLC]+[.)]|第[一二三四五六七八九十\d]+[章节])\s+/;

function numberedBookmark(entry, page) {
  if (HEADING_NUMBER.test(entry.title)) return { ...entry };
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const title = normalize(entry.title);
  if (title.length < 3) return { ...entry };
  const matches = page.lines.filter(line => {
    const prefix = line.text.match(HEADING_NUMBER);
    if (!prefix || line.offset < 0) return false;
    const content = page.text.slice(line.offset + prefix[0].length, line.offset + prefix[0].length + entry.title.length * 2 + 80);
    return normalize(content).startsWith(title);
  });
  if (matches.length !== 1) return { ...entry };
  const prefix = matches[0].text.match(HEADING_NUMBER)[1];
  return { ...entry, title: `${prefix} ${entry.title}`, originalTitle: entry.title };
}

function indexedLines(layout) {
  let cursor = 0;
  return layout.lines.map(line => {
    const needle = line.text.replace(/-$/, '');
    const offset = layout.text.indexOf(needle, cursor);
    if (offset >= 0) cursor = offset + needle.length;
    return { ...line, offset };
  });
}

function inferOutline(pages) {
  return detectPdfHeadings(pages.map(page => ({
    ...outlineTypography({ text: page.text, lines: page.lines }, page.items, page.styles,
      { height: page.height, viewBox: page.view }), number: page.number,
  })));
}

async function scanPdfOutline(pdf, { isCurrent = () => true, progress = () => {} } = {}) {
  if (pdf.numPages > 2000) throw new Error('PDF exceeds the 2,000-page outline limit.');
  const pages = []; let chars = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (!isCurrent()) throw new Error('Cancelled');
    const page = await pdf.getPage(n);
    try {
      const content = await page.getTextContent(), viewport = page.getViewport({ scale: 1, rotation: 0 });
      const layout = extractPdfTextLayout(content.items, { viewport });
      chars += layout.text.length;
      if (chars > 5000000) throw new Error('PDF exceeds the outline text limit.');
      const items = content.items.filter(i => i.str?.trim() && i.transform);
      const heights = items.map(i => Math.abs(i.height || i.transform[3])).sort((a,b) => a-b);
      pages.push({ number: n, text: layout.text, lines: indexedLines(layout), height: viewport.height,
        view: page.view || viewport.viewBox, width: viewport.width,
        items, styles: content.styles || {}, bodyHeight: heights[Math.floor(heights.length / 2)] || 10 });
      progress(n, pdf.numPages);
    } finally { page.cleanup?.(); }
  }
  const bookmarks = [];
  async function visit(nodes, level = 1) {
    if (level > 20 || bookmarks.length > 2000) throw new Error('PDF bookmark tree is too large.');
    for (const node of nodes || []) {
      if (!isCurrent()) throw new Error('Cancelled');
      let dest = node.dest;
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (Array.isArray(dest)) {
        const pageIndex = Number.isInteger(dest[0]) ? dest[0] : await pdf.getPageIndex(dest[0]);
        const page = pages[pageIndex];
        if (page) {
          const kind = dest[1]?.name;
          const y = kind === 'XYZ' ? dest[3] : /^(FitH|FitBH)$/.test(kind) ? dest[2] : null;
          const x = kind === 'XYZ' ? dest[2] : null;
          const line = Number.isFinite(y) ? [...page.lines].sort((a,b) =>
            (Math.abs(a.y-y) + (Number.isFinite(x) ? Math.abs(a.xMin-x) * 0.2 : 0)) -
            (Math.abs(b.y-y) + (Number.isFinite(x) ? Math.abs(b.xMin-x) * 0.2 : 0)))[0] : null;
          bookmarks.push({ title: String(node.title || '').slice(0,500), level: Math.min(6,level), page: page.number,
            offset: Math.max(0,line?.offset || 0), x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : page.height,
            inferred: false });
        }
      }
      await visit(node.items, level + 1);
    }
  }
  await visit(await pdf.getOutline());
  return { pages, bookmarks, entries: bookmarks.length
    ? bookmarks.map(entry => numberedBookmark(entry, pages[entry.page - 1])) : inferOutline(pages) };
}

function sectionRange(entries, index, pages, remaining = false) {
  const start = entries[index];
  if (!start) throw new Error('Choose a section.');
  const later = entries.slice(index + 1).find(e => e.level <= start.level
    && (e.page > start.page || (e.page === start.page && e.offset > start.offset)));
  const end = remaining ? null : later;
  return { startPage: start.page, startOffset: start.offset,
    endPage: end?.page || pages.length, endOffset: end ? end.offset : pages[pages.length-1].text.length };
}

module.exports = { indexedLines, inferOutline, scanPdfOutline, sectionRange, numberedBookmark };
