'use strict';

const { extractPdfTextLayout } = require('./pdf-layout');
const inside = (line, region) => line.y >= region.yMin && line.y <= region.yMax && line.xMin >= region.xMin && line.xMax <= region.xMax;
const textOf = lines => lines.map(line => line.text).join('\n').replace(/([A-Za-z])-\n(?=[a-z])/g, '$1').trim();
function edgeKey(line, viewport) {
  const band = line.y > viewport.height * .93 ? 'top' : line.y < viewport.height * .045 ? 'bottom' : '';
  if (!band) return '';
  const value = line.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return `${band}:${Math.round(line.xMin / viewport.width * 10)}:${value}`;
}
function recurringEdges(pages) {
  const counts = new Map();
  for (const page of pages) {
    if (!page.viewport?.height) continue;
    const keys = new Set(extractPdfTextLayout(page.items, { viewport: page.viewport }).lines
      .map(line => edgeKey(line, page.viewport)).filter(Boolean));
    for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= 2).map(([key]) => key));
}
function ancillaryLayout(items, viewport, rules = [], repeated = new Set()) {
  const layout = extractPdfTextLayout(items, { viewport });
  const headers = [], glossary = [];
  if (!viewport?.height || !viewport?.width) return { layout, headers, glossary };
  for (const line of layout.lines) {
    if (repeated.has(edgeKey(line, viewport)) || (line.y < viewport.height * .045 && /^\d{1,4}$/.test(line.text.trim()))) {
      headers.push({ xMin: line.xMin - 2, xMax: line.xMax + 2, yMin: line.y - 2, yMax: line.y + 2 });
    }
  }
  const heading = /^(?:(?:\d+(?:\.\d+)*|[A-Z])\.?\s+)?(?:list of (?:abbreviations|symbols)|abbreviations|nomenclature|glossary|symbols and abbreviations|术语表|缩略语表|缩写表|符号表)\s*[:：]?$/i;
  const row = /^(?:[A-Z0-9][A-Z0-9/()+\-]{0,19}[:：]?\s+\S|[^\s:：]{1,20}[:：]\s*\S)/;
  for (const title of layout.lines.filter(line => heading.test(line.text.trim()))) {
    const columnLeft = layout.twoColumn && title.xMax < viewport.width / 2;
    const columnRight = layout.twoColumn && title.xMin > viewport.width / 2;
    const xMin = columnRight ? viewport.width / 2 : 0;
    const xMax = columnLeft ? viewport.width / 2 : viewport.width;
    const candidates = layout.lines.filter(line => line.y < title.y && line.xMin >= xMin && line.xMax <= xMax)
      .sort((a, b) => b.y - a.y);
    const selected = [title];
    let previous = title, rows = 0;
    const sizes = items.filter(item => item.transform && Math.abs(item.transform[5] - title.y) < 5).map(item => Math.abs(item.height || item.transform[3]));
    const size = Math.max(5, ...sizes);
    const bottomRule = rules.filter(rule => rule.y < title.y && rule.width > (xMax - xMin) * .55
      && rule.x <= title.xMin && rule.x + rule.width >= title.xMax).sort((a,b) => b.y - a.y)[0];
    for (const line of candidates) {
      if (bottomRule && line.y < bottomRule.y) break;
      if (previous.y - line.y > size * 2.7 || (!row.test(line.text) && (!bottomRule || rows === 0))) break;
      if (row.test(line.text)) rows++;
      selected.push(line); previous = line;
    }
    if (rows < 2) continue;
    glossary.push({ xMin: Math.min(...selected.map(line => line.xMin)) - 2, xMax: Math.max(...selected.map(line => line.xMax)) + 2,
      yMin: Math.min(...selected.map(line => line.y)) - 2, yMax: title.y + 2 });
  }
  return { layout, headers, glossary };
}
function addAncillarySettings(container, plugin, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  new Setting(container).setName(zh ? '跳过 PDF 页眉页脚' : 'Skip PDF headers and footers')
    .setDesc(zh ? '默认开启。抽查少量页面，排除边缘重复的作者、期刊信息和页码，不改动 PDF。' : 'On by default. Samples a few pages to omit recurring author/journal information at page edges and page numbers without changing the PDF.')
    .addToggle(toggle => toggle.setValue(plugin.settings.pdfSkipHeaders !== false).onChange(async value => {
      plugin.settings.pdfSkipHeaders = value; await plugin.saveSettings();
    }));
  new Setting(container).setName(zh ? '正文朗读时包含 PDF 术语表' : 'Include PDF glossary in body reading')
    .setDesc(zh ? '默认关闭。仅排除有明确标题和表格排列的术语表；不确定的文字保留。可在 PDF 工具栏中单独朗读整篇 PDF 的术语表或脚注；仅选中文字时不自动过滤。' : 'Off by default. Omits confidently identified glossary tables; uncertain text is retained. The PDF toolbar can read the whole PDF\'s glossary or footnotes separately. Selection-only reading is not filtered.')
    .addToggle(toggle => toggle.setValue(plugin.settings.pdfIncludeGlossary === true).onChange(async value => {
      plugin.settings.pdfIncludeGlossary = value; await plugin.saveSettings();
    }));
}
module.exports = { recurringEdges, ancillaryLayout, inside, textOf, addAncillarySettings };
