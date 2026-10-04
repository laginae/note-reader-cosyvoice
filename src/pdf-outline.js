'use strict';
const { extractPdfTextLayout } = require('./pdf-layout');
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
  const repeats = new Map();
  const sizes = new Map();
  for (const page of pages) for (const item of page.items) {
    const size = Math.round(item.height * 10) / 10;
    sizes.set(size, (sizes.get(size) || 0) + item.str.length);
  }
  const bodyHeight = [...sizes].sort((a,b) => b[1]-a[1])[0]?.[0] || 10;
  for (const page of pages) for (const line of page.lines) {
    const key = line.text.replace(/\d+/g, '#').trim();
    if (line.y > page.height * 0.93 || line.y < page.height * 0.07) {
      if (!repeats.has(key)) repeats.set(key, new Set());
      repeats.get(key).add(page.number);
    }
  }
  const entries = [];
  let lastTopNumber = 0;
  for (const page of pages) for (const line of page.lines) {
    const text = line.text.trim();
    if (line.offset < 0 || text.length < 3 || text.length > 180) continue;
    if (line.y < page.height * 0.04 || line.y > page.height * 0.97) continue;
    if ((repeats.get(text.replace(/\d+/g, '#'))?.size || 0) > 1) continue;
    if (/^(?:fig(?:ure)?\.?|table|equation|eq\.?|图|表)\s*[\dIVX]/i.test(text) || /^\(?[\d.]+\)?$/.test(text)) continue;
    const numbered = text.match(/^(\d+(?:\.\d+)*\.?|[IVXLC]+[.)]|第[一二三四五六七八九十\d]+[章节])\s+(.+)/);
    const semantic = /^(abstract|introduction|conclusions?|references|acknowledg(?:e)?ments?|appendix(?:\s+[A-Z])?|摘要|引言|结论|参考文献)$/i.test(text);
    const candidates = page.items.filter(item => Math.abs(item.transform[5] - line.y) <= page.bodyHeight * 0.6
      && item.transform[4] >= line.xMin - 2 && item.transform[4] + item.width <= line.xMax + 2);
    const lineHeight = candidates.length ? Math.max(...candidates.map(i=>i.height)) : bodyHeight;
    if (lineHeight < bodyHeight * 0.94) continue;
    const prominent = candidates.some(item => item.height >= bodyHeight * 1.25 || /bold|black|demi/i.test(page.styles[item.fontName]?.fontFamily || item.fontName || ''));
    if (!numbered && !semantic && (page.number === 1 || /[,;@]/.test(text))) continue;
    if (!semantic && !numbered && !(prominent && text.length < 90 && !/[.;:,]$/.test(text))) continue;
    if (numbered && /^\d{4}\b/.test(text)) continue;
    if (/^\d+\s/.test(text) && (!prominent || text.length > 80)) continue;
    const top = text.match(/^(\d+)\.\s/);
    if (top && Number(top[1]) <= lastTopNumber) continue;
    // Papers sometimes place the first body sentence on the heading's line.
    const title = numbered ? `${numbered[1]} ${numbered[2].match(/^(.+?\.)\s+(?=[A-Z])/)?.[1] || numbered[2]}` : text;
    if (top) lastTopNumber = Number(top[1]);
    entries.push({ title, level: numbered && /^\d/.test(numbered[1]) ? Math.min(6, numbered[1].replace(/\.$/, '').split('.').length) : 1,
      page: page.number, offset: line.offset, x: line.xMin, y: line.y, inferred: true });
    if (entries.length >= 1000) return entries;
  }
  return entries;
}

async function scanPdfOutline(pdf, { isCurrent = () => true, progress = () => {} } = {}) {
  if (pdf.numPages > 2000) throw new Error('PDF exceeds the 2,000-page outline limit.');
  const pages = []; let chars = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (!isCurrent()) throw new Error('Cancelled');
    const page = await pdf.getPage(n);
    try {
      const content = await page.getTextContent(), viewport = page.getViewport({ scale: 1 });
      const layout = extractPdfTextLayout(content.items, { viewport });
      chars += layout.text.length;
      if (chars > 5000000) throw new Error('PDF exceeds the outline text limit.');
      const items = content.items.filter(i => i.str?.trim() && i.transform);
      const heights = items.map(i => Math.abs(i.height || i.transform[3])).sort((a,b) => a-b);
      pages.push({ number: n, text: layout.text, lines: indexedLines(layout), height: viewport.height,
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
