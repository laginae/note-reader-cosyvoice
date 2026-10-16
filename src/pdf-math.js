'use strict';

const { academicOptions, omission, formulaNoticeWithPause, formulaNoticeEnding } = require('./academic-speech');
const { structuredMathSpeech } = require('./structured-math');

const mathGlyph = /[\u{1d400}-\u{1d7ff}\u220f\u2211\u221a\u222b-\u2233]/u;
const prose = value => /[\u3400-\u9fff]/u.test(value)
  || (value.match(/[A-Za-z]{4,}/g) || []).some(word => !/^(?:sqrt|sinh|cosh|tanh|sin|cos|tan|log|exp|lim)$/i.test(word));

// Infer a dedicated math font only when its glyphs support it. Italic prose,
// dates, percentages and ordinary numbers alone are not formula evidence.
function mathFonts(items, names = {}) {
  const fonts = new Map();
  for (const item of items) {
    if (!item.fontName) continue;
    const value = fonts.get(item.fontName) || { signals: 0, prose: false };
    if (mathGlyph.test(item.str)) value.signals++;
    value.prose ||= prose(item.str);
    fonts.set(item.fontName, value);
  }
  return new Set([...fonts].filter(([name, value]) => !value.prose && (value.signals >= 2
    || /Math|CM(?:MI|SY|EX|R|BX)\d|MS[AB]M\d/i.test(names[name] || ''))).map(([name]) => name));
}

function pdfFontNames(page, items) {
  const names = {};
  for (const font of new Set(items.map(item => item.fontName).filter(Boolean))) {
    try {
      // Optional PDF.js font metadata; glyph evidence remains the fallback.
      if (page.commonObjs?.has?.(font)) names[font] = String(page.commonObjs.get(font)?.name || '');
    } catch (_) { /* Unavailable font metadata must not stop reading. */ }
  }
  return names;
}

function pdfMathChanges(layout, items, settings = {}, names = {}) {
  const options = academicOptions(settings);
  const skipAll = options.academicMathMode === 'skip' || options.mathReadingLanguage === 'skip';
  if (!skipAll && options.academicMathMode !== 'smart') return [];
  const positioned = items.filter(item => item.str?.trim() && item.transform?.length >= 6);
  if (!positioned.length || !layout.lines.length) return [];
  const heights = positioned.map(item => Math.max(1, Math.abs(item.height || item.transform[3]))).sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)], tolerance = Math.max(2, height * .5);
  const fonts = mathFonts(positioned, names), groups = layout.lines.map(() => []);
  for (const item of positioned) {
    let nearest = -1, distance = Infinity;
    layout.lines.forEach((line, index) => {
      const delta = Math.abs(item.transform[5] - line.y);
      if (delta < distance && delta <= tolerance && item.transform[4] >= line.xMin - 2
        && item.transform[4] + Math.abs(item.width) <= line.xMax + 2) { nearest = index; distance = delta; }
    });
    if (nearest >= 0) groups[nearest].push(item);
  }
  const rows = layout.lines.map((line, index) => {
    const tokens = groups[index].sort((a, b) => a.transform[4] - b.transform[4]);
    let cursor = 0;
    const mapped = tokens.map(item => {
      const value = item.str.replace(/[ \t]+/g, ' ').trim();
      const start = line.text.indexOf(value, cursor);
      if (start >= 0) cursor = start + value.length;
      return { item, start, end: start + value.length,
        math: fonts.has(item.fontName) || (mathGlyph.test(value) && !prose(value)) };
    });
    if (!mapped.length || mapped.some(token => token.start < 0)) return { line, mapped: [], display: false };
    // Plain-font standalone equations need an operator and no prose words.
    const plainEquation = /[=\u2264\u2265\u2248\u2260]/.test(line.text)
      && /[A-Za-z\u0370-\u03ff\u{1d400}-\u{1d7ff}]/u.test(line.text) && !prose(line.text)
      && (line.text.match(/[A-Za-z]+/g) || []).every(word => word.length === 1 || /^(?:min|max|sin|cos|tan|log|exp|lim|sqrt)$/i.test(word));
    const neutral = value => /^[\s\d()[\]{},.;:+\-\u2212=<>/|]+$/.test(value);
    const display = plainEquation || (mapped.every(token => token.math || neutral(token.item.str)));
    if (display) mapped.forEach(token => { token.math = true; });
    return { line, mapped, display, equation: plainEquation || /[=\u2264\u2265\u2248\u2260\u222b-\u2233]/.test(line.text),
      supported: plainEquation || mapped.some(token => fonts.has(token.item.fontName) || mathGlyph.test(token.item.str)) };
  });
  const complex = text => {
    if (structuredMathSpeech(text.trim().replace(/[,;.]$/, ''), false, true) !== null) return false;
    const value = text.normalize('NFKC').replace(/\s/g, '');
    return value.length > 24 || /[\u220f\u2211\u222b-\u2233]/.test(value)
      || (value.length > 16 && (value.match(/[=+\-\u2212\u2264\u2265/|]/g) || []).length >= 3);
  };
  // Group adjacent display rows within one column before deciding complexity;
  // fractions, limits and equation numbers must not leak as isolated audio.
  let block = [];
  const finishBlock = () => {
    if (block.some(row => row.supported) && block.some(row => row.equation)
      && (skipAll || block.length > 1 || complex(block.map(row => row.line.text).join(' ')))) {
      block.forEach((row, i) => { row.skipDisplay = true; row.continuation = i > 0; });
    }
    block = [];
  };
  for (const row of rows) {
    const previous = block.at(-1)?.line;
    if (!row.display || (previous && (previous.y - row.line.y < 0 || previous.y - row.line.y > height * 2.6
      || Math.max(...block.map(item => item.line.xMax)) < row.line.xMin
      || Math.min(...block.map(item => item.line.xMin)) > row.line.xMax))) finishBlock();
    if (row.display) block.push(row);
  }
  finishBlock();
  // Prefer the same line or preceding prose. A page starting with formulas
  // uses the following prose; formula glyphs alone do not identify a language.
  let context = '';
  for (const row of rows) {
    if (!row.display && prose(row.line.text)) context = row.line.text;
    row.noticeContext = context;
  }
  context = '';
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row.display && prose(row.line.text)) context = row.line.text;
    row.noticeContext ||= context;
  }
  const changes = [];
  for (const row of rows) {
    const { line, mapped } = row;
    const runs = [];
    for (const token of mapped) {
      if (!token.math) continue;
      const last = runs.at(-1);
      if (last && !line.text.slice(last.end, token.start).trim()) last.end = token.end;
      else runs.push({ start: token.start, end: token.end });
    }
    const selected = runs.filter(run => row.skipDisplay || (skipAll && row.supported !== false)
      || (!row.display && complex(line.text.slice(run.start, run.end))));
    if (!selected.length) continue;
    const notice = row.continuation ? '' : omission('formula', options, row.noticeContext);
    let text = '', offset = 0;
    for (const run of selected) {
      text += line.text.slice(offset, run.start);
      const before = text.trim() ? text : rows[rows.indexOf(row) - 1]?.line.text || '';
      offset = run.end;
      if (notice) {
        const ending = formulaNoticeEnding(notice, line.text.slice(offset));
        const spoken = formulaNoticeWithPause(notice, before).replace(notice, ending.notice);
        text = text.trimEnd() + spoken.replace(/^(?=Formula|公式)/, ' ') + ' ';
        offset += ending.consumed;
      } else text += ' ';
    }
    text = (text + line.text.slice(offset)).replace(/[ \t]+/g, ' ').trim();
    changes.push({ source: line.text, text, xMin: line.xMin, y: line.y,
      omitted: mapped.filter(token => selected.some(run => token.start >= run.start && token.end <= run.end))
        .map(token => ({ str: token.item.str, x: token.item.transform[4], y: token.item.transform[5] })) });
  }
  return changes;
}

function applyPdfMathChanges(text, changes = []) {
  // Replace verified complete source lines after outline/selection/footnote
  // filtering. Keep uncertain partial matches instead of deleting nearby prose.
  const bySource = new Map();
  for (const change of changes) {
    if (bySource.has(change.source) && bySource.get(change.source) !== change.text) bySource.set(change.source, null);
    else if (!bySource.has(change.source)) bySource.set(change.source, change.text);
  }
  return String(text).split('\n').map(line => {
    const trimmed = line.trim();
    const replacement = bySource.get(trimmed);
    if (typeof replacement === 'string') return replacement;
    // Layout extraction joins hyphenated prose across PDF lines. Preserve that
    // join when an inline formula earlier on the same line was transformed.
    const joined = changes.filter(change => /[A-Za-z]-$/.test(change.source)
      && trimmed.startsWith(change.source.slice(0, -1)) && /^[a-z]/.test(trimmed.slice(change.source.length - 1)));
    if (joined.length === 1) return joined[0].text.replace(/-$/, '') + trimmed.slice(joined[0].source.length - 1);
    return line;
  }).join('\n').trim();
}

module.exports = { pdfMathChanges, applyPdfMathChanges, pdfFontNames };
