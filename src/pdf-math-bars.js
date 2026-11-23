'use strict';

const styled = /[\u{1d400}-\u{1d7ff}]/u;
const atom = c => styled.test(c) && /^[A-Za-z\u0391-\u03c9]$/u.test(c.normalize('NFKC'));
const series = v => Array.isArray(v) || ArrayBuffer.isView(v);

function rectangle(points) {
  if (points.length !== 4 || !points.flat().every(Number.isFinite)) return null;
  const xs = [...new Set(points.map(p => p[0]))], ys = [...new Set(points.map(p => p[1]))];
  if (xs.length !== 2 || ys.length !== 2 || new Set(points.map(p => p.join(','))).size !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const [x,y] = points[i], next = points[(i+1)%4];
    if (x !== next[0] && y !== next[1]) return null;
  }
  return [Math.min(...xs), Math.min(...ys), Math.abs(xs[1]-xs[0]), Math.abs(ys[1]-ys[0])];
}

function filledRectangle(args, next, ops) {
  const [a,b] = args || [];
  const fill = op => op != null && (op === ops.fill || op === ops.eoFill);
  if (typeof a === 'number') {
    // Newer PDF.js packs path operations and their operands in one array.
    const p = b?.[0];
    if (!fill(a) || b?.length !== 1 || !series(p) || p.length !== 13
      || p[0] !== 0 || p[3] !== 1 || p[6] !== 1 || p[9] !== 1 || (p[12] !== 3 && p[12] !== 4)) return null;
    return rectangle([[p[1],p[2]],[p[4],p[5]],[p[7],p[8]],[p[10],p[11]]]);
  }
  if (!fill(next) || !series(a) || !series(b)) return null;
  if (a.length === 1 && a[0] === ops.rectangle && b.length === 4) {
    const [x,y,w,h] = b;
    return [Math.min(x,x+w),Math.min(y,y+h),Math.abs(w),Math.abs(h)];
  }
  if (a.length !== 5 || b.length !== 8 || a[0] !== ops.moveTo || a[1] !== ops.lineTo
    || a[2] !== ops.lineTo || a[3] !== ops.lineTo || a[4] !== ops.closePath) return null;
  return rectangle([[b[0],b[1]],[b[2],b[3]],[b[4],b[5]],[b[6],b[7]]]);
}

function pdfBarOffsets(items, list, ops) {
  const marks = new Map();
  if (!list?.fnArray || !ops || !items.some(i => styled.test(i.str))) return marks;
  const bars = new Map(), above = new Map(), widths = new Map(), candidates = [];
  const insert = (map,y,v) => { const k=Math.floor(y/8); if (!map.has(k)) map.set(k,[]); map.get(k).push(v); };
  const nearby = (map,lo,hi,visit) => {
    for (let k=Math.floor(lo/8); k<=Math.floor(hi/8); k++) for (const v of map.get(k)||[]) if (visit(v)) return true;
    return false;
  };
  let transform = [1,1,0,0], nested = 0;
  const stack = [];
  for (let i=0; i<list.fnArray.length; i++) {
    const op=list.fnArray[i], args=list.argsArray[i];
    if (op===ops.paintFormXObjectBegin || op===ops.beginGroup || op===ops.beginAnnotation) { nested++; continue; }
    if (op===ops.paintFormXObjectEnd || op===ops.endGroup || op===ops.endAnnotation) { nested=Math.max(0,nested-1); continue; }
    if (nested) continue;
    if (op===ops.save) stack.push(transform);
    else if (op===ops.restore) transform=stack.pop() || null;
    else if (op===ops.transform && transform) {
      const [sx,sy,tx,ty]=transform, [a,b,c,d,e,f]=args;
      transform=(!b && !c && a>0 && d>0) ? [sx*a,sy*d,tx+sx*e,ty+sy*f] : null;
    } else if (op===ops.constructPath && transform) {
      const rect=filledRectangle(args,list.fnArray[i+1],ops);
      if (!rect) continue;
      const [sx,sy,tx,ty]=transform, [left,bottom,w,h]=rect;
      const x=left*sx+tx, y=bottom*sy+ty, width=w*sx, thickness=h*sy;
      if (Number.isFinite(x+y+width+thickness) && width>0 && thickness>0 && width>=thickness*4) insert(bars,y,{x,y,width,thickness});
    }
  }
  if (!bars.size) return marks;
  for (const item of items) {
    const t=item.transform, s=item.str?.trim();
    if (!s || !t || t[1] || t[2] || !(item.width>0) || !(item.height>0) || item.height>200) continue;
    const x=t[4], y=t[5], h=item.height, w=item.width;
    if (s.length<24 && (styled.test(s) || /^[a-zA-Z0-9]$/.test(s))) insert(above,y,{x,y,w,h});
    if (!styled.test(s)) continue;
    const chars=[...s], first=chars[0], last=chars.at(-1), pad=item.str.indexOf(s);
    const key=c=>(item.fontName||'')+':'+c;
    if (chars.length===1 && atom(first)) {
      widths.set(key(first),w/h);
      candidates.push({item,c:first,idx:pad,side:'solo',x,y,h,w,key:key(first)});
    } else {
      if (atom(first) && /^[\s=+\-−<>≤≥\u0d45-\u0d52]/u.test(s.slice(first.length)))
        candidates.push({item,c:first,idx:pad,side:'left',x,y,h,w,key:key(first)});
      if (atom(last) && /[\s=+\-−<>≤≥\u0d45-\u0d52]$/u.test(s.slice(0,-last.length)))
        candidates.push({item,c:last,idx:pad+s.length-last.length,side:'right',x,y,h,w,key:key(last)});
    }
  }
  for (const v of candidates) {
    // Never estimate the position of a letter inside a compound text span.
    // At a span edge require the measured width of the same glyph and font.
    const w=v.side==='solo'?v.w:widths.get(v.key)*v.h;
    if (!(w>=v.h*.24 && w<=v.h*1.15)) continue;
    const x=v.side==='right'?v.x+v.w-w:v.x, lo=v.y+v.h*.65, hi=v.y+v.h*1.1;
    nearby(bars,lo,hi,b=>{
      if (b.y<lo || b.y>hi || b.thickness>v.h*.14 || Math.abs(b.width-w)>w*.25
        || Math.abs(b.x-x)>v.h*.14 || Math.abs(b.x+b.width-x-w)>v.h*.14) return false;
      // A second math atom above a short rule is evidence for a fraction.
      if (nearby(above,b.y,b.y+v.h*1.25,a=>a.y>b.y && a.y<b.y+v.h*1.25 && a.x<x+w*.8 && a.x+a.w>x+w*.2)) return false;
      if (!marks.has(v.item)) marks.set(v.item,[]);
      marks.get(v.item).push(v.idx); return true;
    });
  }
  return marks;
}

module.exports = { pdfBarOffsets };
