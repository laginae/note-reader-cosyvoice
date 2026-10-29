'use strict';

const { loadPdfJs } = require('obsidian');
const { pageRange, rasterSize, imageSize, MAX_TEXT } = require('./ocr-contract');
const { preparePdfSelection } = require('./pdf-selection');

function check(signal) { if (signal.aborted) throw new Error('OCR_CANCELLED'); }
function ocrText(result, settings) {
  const items = result.lines.map(line => {
    const [x, y, right, bottom] = line.box, height = bottom - y;
    return { str: line.text, width: right - x, height, fontName: 'OCR', transform: [height,0,0,height,x,result.height-bottom] };
  });
  return preparePdfSelection({ selectionLayout: [{ items, viewport: result }] }, settings);
}
async function canvasResult(canvas, helper, signal, settings) {
  check(signal);
  const { width, height } = canvas, rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0,0,width,height).data;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]; rgb[j++] = rgba[i+1]; rgb[j++] = rgba[i+2]; }
  try {
    const result = await helper.recognize(rgb, width, height, signal);
    check(signal);
    return { text: ocrText(result, settings), lowConfidence: result.lines.filter(line => line.confidence < .8).length, method: 'ocr' };
  } finally { rgb.fill(0); }
}
async function recognizeFile({ plugin, file, start, end, rotation, preferText, helper, signal, onPage, onStatus, document }) {
  const pdf = file.extension.toLowerCase() === 'pdf';
  const limit = (pdf ? 100 : 20) * 1024 * 1024;
  const stamp = { mtime: file.stat?.mtime, size: file.stat?.size };
  if (!(stamp.size > 0) || stamp.size > limit) throw new Error('OCR_SIZE');
  const fresh = () => {
    check(signal);
    if (file.stat?.mtime !== stamp.mtime || file.stat?.size !== stamp.size || plugin.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('OCR_CHANGED');
  };
  fresh();
  const binary = await plugin.app.vault.readBinary(file); fresh();
  if (binary.byteLength > limit) throw new Error('OCR_SIZE');
  let totalText = 0;
  const emit = result => {
    fresh(); totalText += result.text.length;
    if (totalText > MAX_TEXT) throw new Error('OCR_TEXT');
    onPage(result);
  };
  if (!pdf) {
    imageSize(binary);
    const win = document.defaultView;
    const image = await win.createImageBitmap(new win.Blob([binary]));
    const canvas = document.createElement('canvas');
    try {
      fresh();
      const size = rasterSize(image.width, image.height);
      const swap = rotation === 90 || rotation === 270;
      canvas.width = swap ? size.height : size.width; canvas.height = swap ? size.width : size.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(image, -size.width/2, -size.height/2, size.width, size.height);
      emit({ ...await canvasResult(canvas, helper, signal, plugin.settings), page: 1 });
    } finally { image.close(); canvas.width = canvas.height = 1; }
    return;
  }
  const lib = await loadPdfJs(); fresh();
  const task = lib.getDocument({ data: new Uint8Array(binary), isEvalSupported: false });
  const cancel = () => { void Promise.resolve(task.destroy()).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const pdfDocument = await task.promise; fresh();
    for (const number of pageRange(start, end, pdfDocument.numPages)) {
      onStatus(number);
      const page = await pdfDocument.getPage(number);
      const canvas = document.createElement('canvas');
      let renderTask;
      const cancelRender = () => renderTask?.cancel();
      signal.addEventListener('abort', cancelRender, { once: true });
      try {
        fresh();
        if (preferText) {
          const content = await page.getTextContent(); fresh();
          if (content.items.map(item => item.str || '').join('').replace(/[^\p{L}\p{N}]/gu,'').length >= 80) {
            emit({ page: number, method: 'text', lowConfidence: 0, text: preparePdfSelection({ selectionLayout: [{ items: content.items, viewport: page.getViewport({ scale: 1 }) }] }, plugin.settings) });
            continue;
          }
        }
        const angle = ((page.rotate || 0) + rotation) % 360;
        const base = page.getViewport({ scale: 200/72, rotation: angle });
        const size = rasterSize(base.width, base.height);
        const viewport = page.getViewport({ scale: (200/72) * Math.min(size.width/base.width, size.height/base.height), rotation: angle });
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        renderTask = page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport, background: '#ffffff' });
        await renderTask.promise; fresh();
        emit({ ...await canvasResult(canvas, helper, signal, plugin.settings), page: number });
      } finally {
        signal.removeEventListener('abort', cancelRender);
        canvas.width = canvas.height = 1; page.cleanup();
      }
    }
  } finally { signal.removeEventListener('abort', cancel); await task.destroy(); }
}
module.exports = { recognizeFile, ocrText };
