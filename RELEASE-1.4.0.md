# 1.4.0 - Optional local OCR

- Read printed Chinese and English text from scanned PDFs and PNG/JPEG/WebP images. Review or edit recognized text before reading a page, selection or the full result.
- OCR is off by default. The separate Cozy OCR helper starts only for manual recognition; normal plugin startup does not load OCR models.
- Prefer native PDF text when available, choose a bounded page range (up to 10 pages), and rotate sideways scans manually. Recognition can be cancelled and releases the helper after use.
- Use Small for prose quality or Tiny for speed. Existing speech settings and online-processing consent still apply.

## Optional Windows helper

Download `cozy-ocr-helper-windows-x64.zip` below, extract the complete directory and configure its executable in Academic reading > Local OCR. Alternatively place the complete contents under the plugin's `ocr-helper/` directory. The helper is built and attested separately by GitHub Actions; it is not installed by Obsidian's normal plugin updater. End users do not need Python or a .NET SDK.

Only Windows x64 is packaged and validated. macOS/Linux source builds are theoretically feasible, but packages and end-to-end integration have not been tested by this project. Advanced users must build for their own platform and validate with public samples. Report bugs in [GitHub Issues](https://github.com/laginae/note-reader-cosyvoice/issues) with system/CPU details and sanitized diagnostics; do not upload private text, PDFs, keys or raw settings. The Windows package is not a macOS/Linux installer. OCR can use hundreds of MB while active. Formulas, tables, handwriting and complex layouts require review. Source-image highlighting, OCR outlines, searchable PDF creation, OCR audio export and saved OCR reading positions are not included.

## Privacy and validation

OCR keeps images on the device and does not read speech credentials. Online voices still send the recognized text selected for reading under existing consent. No private documents, personal text, API keys or captured provider responses are included. Automated tests and public synthetic fixtures were used; no new paid speech test was performed.

See the [English guide](https://github.com/laginae/note-reader-cosyvoice/blob/main/docs/local-ocr.md) or [中文说明](https://github.com/laginae/note-reader-cosyvoice/blob/main/docs/local-ocr.zh-CN.md).
