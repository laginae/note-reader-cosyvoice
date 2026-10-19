'use strict';

const { academicOptions, contextualMathOptions, mathSpeech, omission, formulaNoticeWithPause, formulaNoticeEnding, complexListeningMath } = require('./academic-speech');
const { structuredMathSpeech } = require('./structured-math');

const mathGlyph = /[\u{1d400}-\u{1d7ff}\u220f\u2211\u221a\u222b-\u2233]|(?<![\p{Script=Greek}\p{M}])[\u0391-\u03c9](?![\p{Script=Greek}\p{M}])/u;
const mathOperator = /[=+\-\u2212<>\u2264\u2265\u2248\u2260\u00d7\u00f7\u00b1\u2213*/|]/;
const prose = value => /[\u3400-\u9fff]/u.test(value)
  || /\p{Script=Greek}{2,}/u.test(value)
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
  const filtering = skipAll || options.academicMathMode === 'smart';
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
    // Text-layer selections can expose one shared fallback font. Recover short
    // script labels only from their smaller size and proximity to a math atom.
    mapped.forEach((token, i) => {
      const previous = mapped[i - 1];
      if (!previous || !/^[A-Za-z0-9]{1,8}$/.test(token.item.str.trim())) return;
      const base = previous.item, script = token.item;
      const baseHeight = Math.abs(base.height || base.transform[3]);
      const scriptHeight = Math.abs(script.height || script.transform[3]);
      const gap = script.transform[4] - base.transform[4] - Math.abs(base.width);
      const shift = Math.abs(script.transform[5] - base.transform[5]);
      if ((previous.math || /^[A-Za-z]$/.test(base.str.trim())) && scriptHeight < baseHeight * .85
        && gap >= -baseHeight * .3 && gap <= baseHeight * .7 && shift > baseHeight * .02 && shift < baseHeight * .7) {
        previous.math = true;
        token.math = true;
        token.script = script.transform[5] < base.transform[5] ? '_' : '^';
      }
    });
    // Shared fallback fonts also hide operators and script digits. Join them
    // only inside a math-anchored run; ordinary prose still ends the run.
    let candidates = [];
    const finishCandidates = () => {
      if (candidates.some(token => token.math)
        && candidates.some(token => mathOperator.test(token.item.str))) {
        candidates.forEach((token, index) => {
          // Do not absorb a prose article such as "a" before a styled variable.
          if (!token.math && /^[A-Za-z]$/.test(token.item.str.trim())
            && !mathOperator.test(candidates[index - 1]?.item.str || '')
            && !mathOperator.test(candidates[index + 1]?.item.str || '')) return;
          token.math = true;
        });
      }
      candidates = [];
    };
    for (const token of mapped) {
      if (token.math || /^[A-Za-z]$/.test(token.item.str.trim())
        || /^[\s\d()[\]{}+*\-\u2212=<>/|\u2264\u2265\u2248\u2260\u00d7\u00f7\u00b1\u2213]+$/.test(token.item.str)) candidates.push(token);
      else finishCandidates();
    }
    finishCandidates();
    // Plain-font standalone equations need an operator and no prose words.
    const plainEquation = /[=\u2264\u2265\u2248\u2260]/.test(line.text)
      && /[A-Za-z\u0370-\u03ff\u{1d400}-\u{1d7ff}]/u.test(line.text) && !prose(line.text)
      && (line.text.match(/[A-Za-z]+/g) || []).every(word => word.length === 1 || /^(?:min|max|sin|cos|tan|log|exp|lim|sqrt)$/i.test(word));
    const neutral = value => /^[\s\d()[\]{},.;:+*\-\u2212=<>/|\u2264\u2265\u2248\u2260\u00d7\u00f7\u00b1\u2213]+$/.test(value);
    const mathFunction = value => /^(?:min|max|sin|cos|tan|log|exp|lim|sqrt)$/.test(value.trim());
    const display = plainEquation || mapped.every(token => token.math || neutral(token.item.str) || mathFunction(token.item.str));
    if (display) mapped.forEach(token => { token.math = true; });
    return { line, mapped, display, equation: plainEquation || /[=\u2264\u2265\u2248\u2260\u222b-\u2233]/.test(line.text),
      supported: plainEquation || mapped.some(token => fonts.has(token.item.fontName) || mathGlyph.test(token.item.str)) };
  });
  const complex = text => {
    if (structuredMathSpeech(text.trim().replace(/[,;.]$/, ''), false, true) !== null) return false;
    const value = text.normalize('NFKC').replace(/\s/g, '');
    return complexListeningMath(text) || value.length > 24 || /[\u220f\u2211\u222b-\u2233]/.test(value)
      || (/\|[^|]+\|/.test(value) && (value.match(/[=<>\u2264\u2265\u2248\u2260]/g) || []).length > 1)
      || (value.length > 16 && (value.match(/[=+\-\u2212\u2264\u2265/|]/g) || []).length >= 3);
  };
  // Group adjacent display rows within one column before deciding complexity;
  // fractions, limits and equation numbers must not leak as isolated audio.
  let block = [];
  const finishBlock = () => {
    if (filtering && block.some(row => row.supported) && block.some(row => row.equation)
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
    const selected = runs.filter(run => {
      const source = line.text.slice(run.start, run.end);
      run.omit = row.skipDisplay || (skipAll && row.supported !== false)
        || (filtering && !row.display && complex(source));
      if (run.omit) return true;
      if (!mathOperator.test(source)) return false;
      const tokens = mapped.filter(token => token.start >= run.start && token.end <= run.end);
      const expression = tokens.map(token => token.script ? `${token.script}{${token.item.str.trim()}}` : token.item.str.trim()).join(' ');
      const local = contextualMathOptions(options, line.text.slice(0, run.start) || row.noticeContext, line.text.slice(run.end));
      const spoken = mathSpeech(expression, { ...local, academicMathMode:'all', academicSkipNotice:true });
      if (!spoken || spoken === 'Formula.' || spoken === '公式。') return false;
      run.speech = spoken;
      return true;
    });
    if (!selected.length) continue;
    const notice = row.continuation ? '' : omission('formula', options, row.noticeContext);
    let text = '', offset = 0;
    for (const run of selected) {
      text += line.text.slice(offset, run.start);
      const before = text.trim() ? text : rows[rows.indexOf(row) - 1]?.line.text || '';
      offset = run.end;
      if (!run.omit) text += ' ' + run.speech + ' ';
      else if (notice) {
        const ending = formulaNoticeEnding(notice, line.text.slice(offset));
        const spoken = formulaNoticeWithPause(notice, before).replace(notice, ending.notice);
        text = text.trimEnd() + spoken.replace(/^(?=Formula|公式)/, ' ') + ' ';
        offset += ending.consumed;
      } else text += ' ';
    }
    text = (text + line.text.slice(offset)).replace(/[ \t]+/g, ' ').trim();
    changes.push({ source: line.text, text, xMin: line.xMin, y: line.y,
      omitted: mapped.filter(token => selected.some(run => run.omit && token.start >= run.start && token.end <= run.end))
        .map(token => ({ str: token.item.str, x: token.item.transform[4], y: token.item.transform[5] })) });
  }
  // Extraction may already have joined a hyphenated word across these rows.
  // Keep an exact whole-line alias, never replace an uncertain prose substring.
  for (let i = 0; i < rows.length; i++) {
    const group = [rows[i].line];
    while (i + 1 < rows.length && /[A-Za-z]-$/.test(rows[i].line.text) && /^[a-z]/.test(rows[i + 1].line.text)) group.push(rows[++i].line);
    if (group.length < 2) continue;
    const transformed = group.map(line => changes.find(change => change.source === line.text && change.y === line.y && change.xMin === line.xMin));
    const join = lines => lines.join('\n').replace(/([A-Za-z])-\n(?=[a-z])/g, '$1');
    for (const change of transformed.filter(Boolean)) {
      change.joinedSource = join(group.map(line => line.text));
      change.joinedText = join(group.map((line, index) => transformed[index]?.text ?? line.text));
    }
  }
  return changes;
}

function applyPdfMathChanges(text, changes = []) {
  // Replace verified complete source lines after outline/selection/footnote
  // filtering. Keep uncertain partial matches instead of deleting nearby prose.
  const bySource = new Map();
  for (const change of changes) {
    for (const [source, replacement] of [[change.source, change.text], [change.joinedSource, change.joinedText]]) {
      if (typeof source !== 'string') continue;
      if (bySource.has(source) && bySource.get(source) !== replacement) bySource.set(source, null);
      else if (!bySource.has(source)) bySource.set(source, replacement);
    }
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
