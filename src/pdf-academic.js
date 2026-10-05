'use strict';
const { academicOptions, numericCell } = require('./academic-speech');

function numericTableRegions(layout, viewport, settings = {}) {
  const mode = academicOptions(settings).academicTableMode;
  if (mode === 'all' || !viewport?.width) return [];
  const regions = [];
  for (const title of layout.lines.filter(line => /^(?:Table\s+(?:\d+|[IVXLCDM]+)\b|表\s*[\d一二三四五六七八九十]+)/i.test(line.text.trim()))) {
    const full = title.xMax - title.xMin > viewport.width * .55;
    const left = title.xMin < viewport.width / 2;
    const candidates = layout.lines.filter(line => line.y < title.y && (full || !layout.twoColumn || (line.xMin < viewport.width/2) === left)).sort((a,b)=>b.y-a.y);
    let started=false, previous=title, rows=0; const selected=[], pending=[];
    for (const line of candidates) {
      if (previous.y-line.y > 30) break;
      const cells=line.text.trim().split(/\s+/), digits=cells.filter(numericCell).length;
      const numeric=digits>=2 && digits/cells.length>=.6;
      if (!started && !numeric) {
        if (pending.length>=3 || line.text.length>120 || /[.!?。]$/.test(line.text)) break;
        pending.push(line); previous=line; continue;
      }
      if (!numeric) break;
      if (!started) { selected.push(...pending); started=true; }
      selected.push(line); rows++; previous=line;
    }
    if (rows < (mode==='skip'?2:8)) continue;
    regions.push({xMin:Math.min(...selected.map(l=>l.xMin))-2,xMax:Math.max(...selected.map(l=>l.xMax))+2,
      yMin:Math.min(...selected.map(l=>l.y))-2,yMax:Math.max(...selected.map(l=>l.y))+2});
  }
  return regions;
}
module.exports={numericTableRegions};
