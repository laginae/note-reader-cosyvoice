'use strict';

const OCR_DEFAULTS = { ocrEnabled: false, ocrExecutable: '', ocrModel: 'small' };
const MAX_PIXELS = 4_000_000;
const MAX_TEXT = 200_000;
const MAX_PAGES = 10;
function isOcrFile(file) { return /^(pdf|png|jpg|jpeg|webp)$/i.test(file?.extension || ''); }
function pageRange(start, end, total) {
  const a = Number(start), b = Number(end);
  if (![a, b, total].every(Number.isInteger) || a < 1 || b < a || b > total || b - a >= MAX_PAGES) throw new Error('OCR_RANGE');
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
function rasterSize(width, height) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('OCR_IMAGE');
  const scale = Math.min(1, 2400 / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
function validateResult(value, width, height) {
  if (value?.version !== 1 || value.width !== width || value.height !== height || !Array.isArray(value.lines) || value.lines.length > 10000) throw new Error('OCR_PROTOCOL');
  let length = 0;
  const lines = value.lines.map(line => {
    const box = line?.box;
    if (typeof line?.text !== 'string' || (length += line.text.length) > MAX_TEXT || !Array.isArray(box) || box.length !== 4
      || !box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] > width || box[3] > height || box[2] <= box[0] || box[3] <= box[1]
      || !Number.isFinite(line.confidence) || line.confidence < 0 || line.confidence > 1) throw new Error('OCR_PROTOCOL');
    return { text: line.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').normalize('NFKC'), box, confidence: line.confidence };
  });
  return { width, height, lines };
}
function imageSize(input) {
  const b = Buffer.from(input);
  let width, height;
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16) === 'IHDR') {
    width = b.readUInt32BE(16); height = b.readUInt32BE(20);
  } else if (b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p++] !== 255) break;
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (p + 2 > b.length) break;
      const len = b.readUInt16BE(p);
      if (len < 2 || p + len > b.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && len >= 8) { height = b.readUInt16BE(p+3); width = b.readUInt16BE(p+5); break; }
      p += len;
    }
  } else if (b.length >= 30 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') {
    const kind = b.toString('ascii',12,16);
    if (kind === 'VP8X') { width = 1 + b.readUIntLE(24,3); height = 1 + b.readUIntLE(27,3); }
    else if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) { width = b.readUInt16LE(26) & 0x3fff; height = b.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L' && b[20] === 0x2f) { const bits = b.readUInt32LE(21); width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff); }
  }
  if (!width || !height || width * height > 25_000_000) throw new Error('OCR_IMAGE');
  return { width, height };
}
module.exports = { OCR_DEFAULTS, MAX_PIXELS, MAX_TEXT, MAX_PAGES, isOcrFile, pageRange, rasterSize, validateResult, imageSize };
