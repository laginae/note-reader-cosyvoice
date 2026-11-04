'use strict';

const SEMANTIC = /^(?:abstract|introduction|background|related work|literature review|materials?(?: and methods?)?|methods?|methodology|results?(?: and discussion)?|discussion|conclusions?(?: and (?:discussion|future work))?|references|bibliography|acknowledg(?:e)?ments?|appendi(?:x|ces)(?:\s+[A-Z])?|supplementary materials?|funding|author contributions?|competing interests|data availability(?: statement)?|conflicts? of interest|\u6458\u8981|\u5f15\u8a00|\u7eea\u8bba|\u7814\u7a76\u65b9\u6cd5|\u5b9e\u9a8c\u65b9\u6cd5|\u7ed3\u679c\u4e0e\u8ba8\u8bba|\u7ed3\u679c|\u8ba8\u8bba|\u7ed3\u8bba|\u53c2\u8003\u6587\u732e|\u81f4\u8c22|\u9644\u5f55(?:[A-Z\d]+)?)\s*[.:\uFF1A\u3002]?$/i;
const NUMBER = /^(?:([1-9]\d{0,2}(?:\.\d{1,2}){0,5})\.?\s+|([IVXLC]+)[.)]\s+|(\u7b2c[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f6\u3007\d]+[\u7ae0\u8282])\s*|([A-H])[.)]\s+)(\S.*)$/;
const CAPTION = /^(?:fig(?:ure)?\.?|table|equation|eq\.?|\u56fe|\u8868)\s*[\dIVX\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]/i;
const ACADEMIC_LABEL = /^(?:(?:theorem|lemma|proposition|corollary|definition|assumption|remark|example)\s+(?:\d+(?:\.\d+)*|[IVXLC]+|[A-Z](?:\.\d+)*)|(?:\u547d\u9898|\u5b9a\u7406|\u5f15\u7406|\u63a8\u8bba|\u5b9a\u4e49|\u5047\u8bbe|\u4f8b|\u6ce8)\s*(?:\d+(?:\.\d+)*|[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f6\u3007]+))(?=\s|[(:.\uFF1A\u3002]|$)/i;
const SENTENCE = /[;\u3002\uFF1B]|[a-z]{2}\.\s+[A-Z]/;
const INVALID = /[=+\u2212\u00d7\u2211\u222b{}\[\]\\\x00-\x08\x0e-\x1f]|https?:\/\/|doi\s*:|@|\u00a9/i;
const UNITS = /^(?:[kMGTmun]?W(?:h)?|[kMGT]?Hz|kg|kPa|MPa|mol|%)(?:\b|\s|[,\uFF0C])/;
const CJK = /[\u3400-\u9fff]/;
const mode = weights => [...weights].sort((a, b) => b[1] - a[1])[0]?.[0];
function addWeight(weights, key, count) { if (key) weights.set(key, (weights.get(key) || 0) + count); }
function numbering(text) {
  const match = text.match(NUMBER);
  if (!match) return null;
  return { token: match[1] || match[2] || match[3] || match[4], body: match[5],
    level: match[1] ? match[1].split('.').length : match[3]?.endsWith('\u8282') || match[4] ? 2 : 1,
    kind: match[1] ? 'decimal' : match[2] ? 'roman' : match[3] ? 'chinese' : 'letter' };
}

function academicBlock(text) {
  text = text.trim().normalize('NFKC');
  const label = text.match(ACADEMIC_LABEL) || text.match(/^(?:proof\b|\u8bc1\u660e)(?=\s|[.:\uFF1A\u3002]|$)/i);
  if (!label) return false;
  const tail = text.slice(label[0].length).trim().replace(/^\([^()]*\)\s*/, '').replace(/^[.:\uFF1A\u3002]\s*/, '');
  // A bare label introduces a statement; a topic about that statement can be a heading.
  return !tail || SENTENCE.test(tail) || /[.!?\u3002]$/.test(tail)
    || /^(?:let|suppose|assume|if|then|given|consider|every|all|we|there exists|for (?:any|every|all)|it (?:is|follows)|since|by (?:definition|contradiction|induction))\b/i.test(tail)
    || /^(?:\u4ee4|\u8bbe|\u82e5|\u5047\u8bbe|\u5bf9\u4e8e|\u4efb\u610f|\u5b58\u5728|\u7531\u6b64|\u6839\u636e|\u9996\u5148)/.test(tail);
}

function academicContinuation(title, next) {
  if (!/\b(?:of|for|on|about|to|using|via|and)(?:\s+the)?\s*$/i.test(title)
    && !/(?:\u5173\u4e8e|\u9488\u5bf9|\u5bf9\u4e8e|\u57fa\u4e8e|\u4e0e|\u548c|\u53ca)\s*$/.test(title)) return false;
  const text = next.trim().normalize('NFKC'), label = text.match(ACADEMIC_LABEL);
  if (!label) return false;
  const tail = text.slice(label[0].length).trim();
  return !tail || /^\([^()]*\)$/.test(tail);
}

function numericBodyContinuation(row, bodySize) {
  if (row.prominent || row.num?.kind !== 'decimal' || row.num.level !== 1) return false;
  const { line, page, index, num } = row, next = page.lines[index + 1];
  if (!next || next.footnote || next.offset < 0) return false;
  const count = /^(?:(?:observations?|samples?|records?|patients?|participants?|measurements?)\b|(?:\u4e2a|\u6761|\u7ec4|\u9879|\u6b21|\u540d|\u4efd)(?:\u6837\u672c|\u8bb0\u5f55|\u6570\u636e|\u8bd5\u9a8c|\u5b9e\u9a8c|\u6d4b\u91cf|\u53c2\u4e0e\u8005|\u60a3\u8005))/i.test(num.body);
  const narrative = /\b(?:is|are|was|were|has|have|had|contains?|includes?|increased?|decreased?|yielded?|remained?)\b|\u5305\u542b|\u589e\u52a0|\u51cf\u5c11|\u5f97\u5230|\u91c7\u7528|\u5206\u522b|\u5171\u6709|\u5171\u8ba1/i.test(num.body);
  const continuation = /^[a-z]/.test(next.text.trim()) || /^(?:\u8fd9\u4e9b|\u4e0a\u8ff0|\u5176\u4e2d|\u5e76|\u4ee5\u53ca|\u800c|\u56e0\u6b64|\u4ece\u800c|\u5206\u522b|\u5176\u4f59|\u5269\u4f59)/.test(next.text.trim());
  const clauses = num.body.split(/[,\uFF0C]/).filter(part => /\p{L}/u.test(part)).length;
  // Require both continued prose and a filled, same-column body line, not just a verb.
  return count && narrative && continuation && clauses >= 2
    && line.y - next.y >= bodySize * .65 && line.y - next.y <= bodySize * 1.9
    && Math.abs(next.xMin - line.xMin) <= bodySize * 2.5 && line.xMax >= next.xMax - bodySize * 2
    && next.font === line.font && Math.abs(next.fontSize - line.fontSize) < .5;
}

function outlineTypography(layout, items, styles = {}, viewport = {}) {
  const positioned = (items || []).filter(item => item.str?.trim() && item.transform);
  const sizes = new Map(), fonts = new Map();
  for (const item of positioned) {
    const size = Math.round(Math.abs(item.height || item.transform[3]) * 10) / 10;
    addWeight(sizes, size, item.str.trim().length);
    addWeight(fonts, item.fontName, item.str.trim().length);
  }
  const bodySize = mode(sizes) || 10, bodyFont = mode(fonts) || '';
  // Vertical bands avoid rescanning every text item for every line on large pages.
  const bands = new Map(), bandHeight = Math.max(1, bodySize * .6);
  for (const item of positioned) {
    const band = Math.floor(item.transform[5] / bandHeight);
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push(item);
  }
  const lines = layout.lines.map(line => {
    const band = Math.floor(line.y / bandHeight);
    const parts = [band - 1, band, band + 1].flatMap(key => bands.get(key) || []).filter(item =>
      Math.abs(item.transform[5] - line.y) <= bandHeight && item.transform[4] >= line.xMin - 2
      && item.transform[4] + item.width <= line.xMax + 3);
    const ownFonts = new Map(), ownSizes = new Map();
    let boldChars = 0, chars = 0;
    for (const item of parts) {
      const weight = item.str.trim().length;
      addWeight(ownFonts, item.fontName, weight);
      addWeight(ownSizes, Math.round(Math.abs(item.height || item.transform[3]) * 10) / 10, weight);
      chars += weight;
      if (/bold|black|demi|heavy/i.test((styles[item.fontName]?.fontFamily || '') + (item.fontName || ''))) boldChars += weight;
    }
    return { ...line, fontSize: mode(ownSizes) || line.fontSize || bodySize,
      font: mode(ownFonts) || line.font || '', bold: chars ? boldChars >= chars * .6 : !!line.bold };
  });
  const origin = Number(viewport.viewBox?.[1]) || 0;
  const height = viewport.viewBox ? viewport.viewBox[3] - origin : viewport.height;
  return { ...layout, lines, bodySize, bodyFont, origin, height, rotated: !!((Number(viewport.rotation) || 0) % 360) };
}

function detectPdfHeadings(pages) {
  const repeats = new Map(), headingFonts = new Set();
  const sizes = new Map(), fonts = new Map();
  for (const page of pages) {
    const weight = Math.max(1, page.text?.length || 0);
    addWeight(sizes, page.bodySize, weight);
    addWeight(fonts, page.bodyFont, weight);
  }
  const bodySize = mode(sizes) || 10, bodyFont = mode(fonts) || '';
  const key = text => text.replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase();
  const eligible = [];
  for (const page of pages) {
    if (page.rotated) continue;
    for (const line of page.lines) {
      const y = (line.y - (page.origin || 0)) / page.height;
      if (y > .93 || y < .07) {
        const value = key(line.text);
        if (!repeats.has(value)) repeats.set(value, new Set());
        repeats.get(value).add(page.number);
      }
    }
  }
  for (const page of pages) {
    if (page.rotated) continue;
    const body = bodySize;
    for (let index = 0; index < page.lines.length; index++) {
      const line = page.lines[index], text = line.text.trim().normalize('NFKC');
      const y = (line.y - (page.origin || 0)) / page.height;
      if (line.footnote || line.offset < 0 || text.length < 2 || text.length > 160 || y < .035 || y > .975) continue;
      if ((repeats.get(key(text))?.size || 0) > 1 || CAPTION.test(text) || academicBlock(text)) continue;
      if (/^\(?[\d.]+\)?$/.test(text) || /(?:\.{3,}|\u2026|\u00b7{3,})\s*\d+\s*$/.test(text)) continue;
      const num = numbering(text), semantic = SEMANTIC.test(num?.body || text);
      if ((line.fontSize || body) < body * .94 || (!semantic && (INVALID.test(text) || SENTENCE.test(num?.body || text)))) continue;
      if (num && (!/[\p{L}]/u.test(num.body) || UNITS.test(num.body))) continue;
      if (!semantic && (text.length > (num ? 115 : 85) || text.split(/\s+/).length > (num ? 18 : 13))) continue;
      if (!semantic && /[,;:\uFF0C\uFF1B\uFF1A]$/.test(text)) continue;
      const large = line.fontSize >= body * 1.12;
      const distinct = !!line.font && line.font !== bodyFont;
      const strong = large || line.bold;
      // Learn the document's heading face, including same-size CJK subheadings.
      if (distinct && (semantic || (num && strong))) headingFonts.add(line.font);
      eligible.push({ page, line, index, text, num, semantic, strong, distinct });
    }
  }
  for (const row of eligible) row.prominent = row.strong || (row.distinct && headingFonts.has(row.line.font));
  const numeric = new Map();
  for (const row of eligible) if (row.num?.kind === 'decimal') {
    if (!numeric.has(row.num.token)) numeric.set(row.num.token, []);
    numeric.get(row.num.token).push(row);
  }
  const supported = row => {
    if (row.num?.kind !== 'decimal') return false;
    const parts = row.num.token.split('.'), last = Number(parts.pop()), parent = parts.join('.');
    const reliable = token => (numeric.get(token) || []).some(other => other !== row && (other.prominent || other.semantic));
    if (parent && reliable(parent)) return true;
    return [last - 1, last + 1].filter(n => n > 0).some(n => reliable(parent ? `${parent}.${n}` : String(n)));
  };
  const entries = [], consumed = new Set(); let inReferences = false;
  for (const row of eligible) {
    const { page, line, num, semantic, prominent, text } = row;
    if (consumed.has(line)) continue;
    if (/^(?:appendix|appendices|\u9644\u5f55)/i.test(num?.body || text)) inReferences = false;
    if (inReferences && !semantic && (num || !prominent)) continue;
    if (numericBodyContinuation(row, bodySize)) continue;
    if (num) {
      if (!prominent && !semantic && (!supported(row) || text.length > 80 || /[,.\uFF0C]$/.test(text))) continue;
      if (!prominent && !semantic && !/^[\p{Lu}\u3400-\u9fff]/u.test(num.body)) continue;
      if (num.kind === 'letter' && !entries.length) continue;
    } else if (!semantic && (!prominent || page.number === 1 || text.length < 5
      || /[.;:\u3002\uFF1B\uFF1A]$/.test(text) || (headingFonts.size && !headingFonts.has(line.font)))) continue;
    let title = text, lastLine = line;
    // Only join matching heading typography; source offsets/text remain untouched.
    if (!semantic && prominent && (row.distinct || line.fontSize >= bodySize * 1.12)) {
      for (let step = 1; step <= 3; step++) {
        const next = page.lines[row.index + step];
        const reference = next && academicContinuation(title, next.text);
        if (!next || next.footnote || next.offset < 0 || next.text.length > 85 || numbering(next.text.trim()) || SEMANTIC.test(next.text.trim())
          || CAPTION.test(next.text) || (academicBlock(next.text) && !reference)
          || INVALID.test(next.text) || (!reference && /[.;!?\u3002\uFF1B\uFF01\uFF1F]/.test(next.text))
          || Math.abs(next.xMin - line.xMin) > line.fontSize * 1.5 || lastLine.y - next.y < line.fontSize * .65
          || lastLine.y - next.y > line.fontSize * 1.8 || next.font !== line.font || Math.abs(next.fontSize - line.fontSize) > .5) break;
        title += CJK.test(title.slice(-1)) && CJK.test(next.text[0]) ? next.text.trim() : ' ' + next.text.trim();
        consumed.add(next);
        lastLine = next;
      }
    }
    entries.push({ title, level: num?.level || 1, page: page.number, offset: line.offset,
      x: line.xMin, y: line.y, inferred: true });
    if (/^(?:references|bibliography|\u53c2\u8003\u6587\u732e)\s*[.:\uFF1A\u3002]?$/i.test(num?.body || text)) inReferences = true;
    if (entries.length >= 1000) break;
  }
  return entries;
}

module.exports = { outlineTypography, detectPdfHeadings, numbering };
