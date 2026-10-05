'use strict';

const { extractPdfTextLayout } = require('./pdf-layout');
const MODES = ['body', 'after', 'inline', 'footnotes'];
function normalizeFootnoteMode(value) { return MODES.includes(value) ? value : 'body'; }
function textOf(lines) {
  return lines.map(line => line.text).join('\n').replace(/([A-Za-z])-\n(?=[a-z])/g, '$1').trim();
}

function partitionFootnotes(items, viewport, rules = [], options = {}) {
  const layout = extractPdfTextLayout(items, { viewport });
  const height = Number(viewport?.height), width = Number(viewport?.width);
  if (!(height > 0 && width > 0) || !layout.lines.length) return { layout, body: layout, notes: { ...layout, text: '', lines: [] }, regions: [] };
  const positioned = (items || []).filter(item => item.str?.trim() && item.transform?.length >= 6)
    .map(item => ({ x: item.transform[4], y: item.transform[5], height: Math.abs(item.height || item.transform[3]), weight: item.str.trim().length }));
  const upper = positioned.filter(item => item.y > height * .22 && item.y < height * .92);
  const counts = new Map();
  for (const item of upper) { const size = Math.round(item.height * 10) / 10; counts.set(size, (counts.get(size) || 0) + item.weight); }
  const bodySize = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!bodySize) return { layout, body: layout, notes: { ...layout, text: '', lines: [] }, regions: [] };
  const regions = [];
  // First-page correspondence blocks can span both columns and use a star instead of a number.
  if (options.pageNumber === 1) {
    const ordered = [...layout.lines].sort((a, b) => b.y - a.y);
    for (const line of ordered) {
      if (line.y > height * .28 || line.y < height * .035
        || !/^[*\u2217\u2020\u2021\s]*(?:corresponding author|correspondence|e[-\s]?mail address)\b/i.test(line.text)) continue;
      const below = ordered.filter(candidate => candidate.y <= line.y && candidate.y > height * .035);
      const spans = positioned.filter(item => item.y <= line.y + bodySize * .5 && item.y > height * .035 && item.weight > 2);
      const small = spans.length && spans.every(item => item.height <= bodySize * .96);
      const metadata = below.some(candidate => candidate !== line
        && /e[-\s]?mail address|doi\.org|received\b|accepted\b|available\s*online|copyright|\u00a9/i.test(candidate.text));
      const rule = rules.some(rule => rule.y > line.y && rule.y - line.y < bodySize * 3
        && rule.x >= line.xMin - bodySize * 2 && rule.x <= line.xMin + bodySize && rule.width > 20 && rule.width < width * .45);
      const above = ordered.filter(candidate => candidate.y > line.y + bodySize * .5);
      const gap = above.length ? Math.min(...above.map(candidate => candidate.y)) - line.y : 0;
      if (!small || !metadata || (!rule && gap < bodySize * 2)) continue;
      regions.push({ xMin: Math.min(...below.map(l => l.xMin)) - 2, xMax: Math.max(...below.map(l => l.xMax)) + 2,
        yMin: Math.min(...below.map(l => l.y)) - bodySize * .6, yMax: line.y + bodySize * .6 });
      break;
    }
  }
  for (const left of layout.twoColumn ? [true, false] : [true]) {
    const column = layout.lines.filter(line => !layout.twoColumn || (line.xMin < width / 2) === left).sort((a, b) => b.y - a.y);
    for (let i = 0; i < column.length; i++) {
      const line = column[i];
      if (regions.some(region => line.y >= region.yMin && line.y <= region.yMax && line.xMin >= region.xMin && line.xMax <= region.xMax)) continue;
      if (line.y > height * .28 || line.y < height * .035 || !/^\d{1,3}\s+\S/.test(line.text)) continue;
      const nearby = positioned.filter(item => Math.abs(item.y - line.y) <= bodySize * .6 && item.x >= line.xMin - 2 && item.x <= line.xMax + 2);
      const letters = nearby.filter(item => item.weight > 2);
      if (!letters.length) continue;
      const size = letters.reduce((sum, item) => sum + item.height * item.weight, 0) / letters.reduce((sum, item) => sum + item.weight, 0);
      const rule = rules.some(rule => rule.y > line.y && rule.y - line.y < bodySize * 3
        && rule.x >= line.xMin - bodySize && rule.x <= line.xMin + bodySize && rule.width > 20 && rule.width < width * .45);
      const gap = i > 0 ? column[i - 1].y - line.y : 0;
      // Require independent layout evidence; small table text alone is insufficient.
      if (size > bodySize * .94 || (!rule && (size > bodySize * .91 || gap < bodySize * 1.7))) continue;
      const below = column.slice(i).filter(candidate => candidate.y > height * .035);
      const consistent = below.every(candidate => {
        const spans = positioned.filter(item => Math.abs(item.y - candidate.y) <= bodySize * .5 && item.x >= candidate.xMin - 2 && item.x <= candidate.xMax + 2 && item.weight > 2);
        return !spans.length || spans.every(item => item.height <= bodySize * .96);
      });
      if (!consistent) continue;
      regions.push({ xMin: Math.min(...below.map(l => l.xMin)) - 2, xMax: Math.max(...below.map(l => l.xMax)) + 2,
        yMin: Math.min(...below.map(l => l.y)) - bodySize * .6, yMax: line.y + bodySize * .6 });
      break;
    }
  }
  const isNote = line => regions.some(region => line.xMin >= region.xMin && line.xMax <= region.xMax && line.y >= region.yMin && line.y <= region.yMax);
  const notes = layout.lines.filter(isNote), body = layout.lines.filter(line => !isNote(line));
  return { layout, body: { ...layout, lines: body, text: textOf(body) }, notes: { ...layout, lines: notes, text: textOf(notes) }, regions };
}
function splitFootnotesInRange(text, partition) {
  let body = text; const notes = [];
  for (let i = 0; i < partition.notes.lines.length; i++) {
    const line = partition.notes.lines[i], next = partition.notes.lines[i + 1];
    const value = /[A-Za-z]-$/.test(line.text) && /^[a-z]/.test(next?.text || '') ? line.text.slice(0, -1) : line.text;
    const pattern = value.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const re = new RegExp(pattern, 'g'), matches = [...body.matchAll(re)];
    if (matches.length === 1) { notes.push(matches[0][0]); body = body.slice(0, matches[0].index) + '\n' + body.slice(matches[0].index + matches[0][0].length); }
  }
  return { body: body.trim(), notes: notes.join('\n') };
}

async function footnoteRules(page, OPS) {
  if (!page.getOperatorList || !OPS) return [];
  try {
    const list = await page.getOperatorList(), rules = [];
    for (let i = 0; i < list.fnArray.length; i++) {
      if (list.fnArray[i] !== OPS.constructPath) continue;
      const [ops, coords] = list.argsArray[i] || [];
      if (!Array.isArray(ops) && !ArrayBuffer.isView(ops)) continue;
      let index = 0, from = null;
      for (const op of ops) {
        if (op === OPS.moveTo) { from = [coords[index++], coords[index++]]; }
        else if (op === OPS.lineTo) {
          const to = [coords[index++], coords[index++]];
          if (from && Math.abs(from[1] - to[1]) < 1) rules.push({ x: Math.min(from[0], to[0]), y: to[1], width: Math.abs(to[0] - from[0]) });
          from = to;
        } else if (op === OPS.curveTo) index += 6;
        else if (op === OPS.rectangle) { index += 4; from = null; }
        else if (op !== OPS.closePath) { from = null; break; }
      }
    }
    return rules;
  } catch (_) { return []; }
}

function addFootnoteSettings(container, plugin, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  new Setting(container).setName(zh ? 'PDF 脚注朗读' : 'PDF footnote reading')
    .setDesc(zh ? '默认只读正文。结合页底编号、字号和间距识别脚注及首页作者、出版信息，不确定的文字保留。仅朗读选中文字时仍读完整所选内容。' : 'Body only by default. Detects bottom-page notes and first-page correspondence/publication blocks using size and spacing; uncertain text is retained. Selection-only reading preserves the selected text.')
    .addDropdown(dropdown => {
      const labels = zh ? ['只读正文', '正文结束后读脚注', '保留原顺序（含脚注）', '只读脚注'] : ['Body only', 'Footnotes after body', 'Original order, including footnotes', 'Footnotes only'];
      MODES.forEach((mode, i) => dropdown.addOption(mode, labels[i]));
      dropdown.setValue(normalizeFootnoteMode(plugin.settings.pdfFootnoteMode)).onChange(async value => {
        plugin.settings.pdfFootnoteMode = normalizeFootnoteMode(value); await plugin.saveSettings();
      });
    });
}
module.exports = { partitionFootnotes, footnoteRules, normalizeFootnoteMode, addFootnoteSettings, splitFootnotesInRange };
