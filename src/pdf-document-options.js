'use strict';

// Use the same local resources as Obsidian's PDF viewer, loaded only on demand.
function pdfDocumentOptions(data) {
  return {
    data,
    cMapUrl: '/lib/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/lib/pdfjs/standard_fonts/',
    wasmUrl: '/lib/pdfjs/wasm/',
  };
}

module.exports = { pdfDocumentOptions };
