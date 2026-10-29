# Local OCR for scanned PDFs and images

Local OCR is an **optional desktop feature**, off by default. It recognizes printed Chinese and English text in scanned PDFs, PNG, JPEG and WebP images. It does not describe photographs, interpret charts, or reconstruct mathematical meaning.

## Install and use

1. Download **cozy-ocr-helper-windows-x64.zip** from the [1.4.0 release assets](https://github.com/laginae/note-reader-cosyvoice/releases/tag/1.4.0). Only Windows x64 is packaged and validated in this release. The source has a cross-platform foundation, but macOS/Linux packages and plugin integration are not yet validated or listed as supported. The helper is separate from the normal three plugin files and is not installed by Obsidian's plugin updater.
2. Keep the entire extracted helper directory together. In **Academic reading → Local OCR**, set **OCR helper executable** to its `CozyOcr.exe` path and enable **Scanned PDF and image reading**. Alternatively place the complete helper directory at `<plugin-directory>/ocr-helper/`.
3. Open a PDF or supported image. Run **Recognize PDF or image text (local OCR)** from the command palette, or use **Recognize text and read (OCR)** in its file context menu. Reading an open image also opens this OCR window.
4. Choose a page range (initially page 1, at most 10 pages per job) and press **Recognize**. Existing PDF text is preferred when available; turn this option off for broken text layers or scans with only a selectable header. Use clockwise rotation if a scan is sideways or upside down.
5. Review and edit the text before using **Read page**, **Read selected text**, or **Read all results**. Playback uses the currently configured voice and its existing processing consent. The normal pause, speed and stop controls remain available.

## macOS / Linux: untested source builds

The .NET helper and SimdPaddleOCR have a cross-platform foundation, so macOS/Linux portability is plausible at source level. **This project has not validated builds, Obsidian integration or recognition on either platform.** The Windows x64 package cannot run directly on macOS/Linux, and upstream platform support is not proof of this plugin's end-to-end compatibility.

Advanced users may build `ocr-helper/CozyOcr.csproj` with the .NET 10 SDK for the actual OS and processor: `osx-arm64` for Apple Silicon, `osx-x64` for Intel Macs, or `linux-x64` / `linux-arm64` for Linux. Keep the complete published directory. First verify startup, recognition, cancellation and plugin invocation with a public, non-sensitive single-page sample. These targets are build directions, not tested compatibility or performance claims.

Report problems through [GitHub Issues](https://github.com/laginae/note-reader-cosyvoice/issues), including OS/version, CPU architecture, Obsidian/plugin versions, build command, sanitized errors and a minimal public example. Remove usernames, private paths, document content, API keys and credentials before posting. Do not attach private PDFs or raw configuration files. Successful independent tests are also welcome, but one device's result does not establish universal support.

## Models and resource use

- **Small** is the default, prioritizing printed Chinese/English prose quality.
- **Tiny** prioritizes speed. It can miss small or dense English text.
- No OCR process, model, worker or model download is started at plugin activation. The helper starts on the first page requiring OCR and is reused only within that recognition job.
- Pages are processed sequentially, on CPU with four recognition workers. Each raster is capped at 4 million pixels and 2400 pixels on the longest side. PDF size is capped at 100 MB; image size at 20 MB and 25 megapixels before decoding; recognized output at 200,000 characters.
- Per-page helper timeout is two minutes; overall recognition timeout is five minutes. Cancel, modal close, disabling OCR or plugin unload terminates active OCR. The helper exits after recognition completes, releasing its model memory rather than retaining a large idle cache.

The earlier local synthetic benchmark observed roughly 434 MB peak process memory for Tiny and 601 MB for Small. These are not guarantees or mobile measurements; actual use depends on the document and runtime. OCR can use substantial memory **while running**, even though it does not load during ordinary plugin startup.

## Privacy and limitations

OCR runs locally. RGB pixels travel to the selected local executable over a pipe. There is no OCR server, API key, image upload or automatic cloud fallback. Only run a helper obtained from a trusted source: configuring a local executable authorizes running it on your computer.

The plugin does not change the source PDF/image, add a hidden text layer, save OCR text to settings, or retain a disk OCR cache. Temporary page canvases and the helper are released after use; results stay in the dialog until it is closed or cleared. If you read with an **online voice**, the selected recognized text is sent to that voice service under the existing consent and privacy policy. This is not an offline guarantee for online synthesis. Existing audio cache preferences still apply to generated speech.

Recognition is not perfect. Low-confidence line counts are review hints, not calibrated accuracy probabilities. Existing PDF layout and formula filtering are applied where possible, but OCR lacks the original font/LaTeX structure: formulas, handwriting, tables, unusual columns, header/footer separation and footnotes need manual review. The helper deliberately does not flip individual text lines by 180 degrees, because that damaged upright formula lines in testing. Rotate the whole page manually when needed.

OCR results are read from the preview. Original-image/PDF word highlighting, scanned-page outlines, searchable-PDF export, OCR audio export, and saved OCR reading positions are **not provided by this initial implementation**. Native text-PDF workflows are unchanged. Mobile and web editions do not use this desktop executable.

## Build the optional helper

Use .NET 10 SDK and the committed dependency lock file. No Python, GPU or OCR cloud account is required. Example for Windows x64:

```powershell
dotnet publish ocr-helper/CozyOcr.csproj -c Release -r win-x64 --self-contained true -o dist/ocr-helper-win-x64 -p:RestoreLockedMode=true
```

The output is self-contained; end users do not need the .NET SDK. Distribute the **whole folder**, not just the executable. Include the helper notice, upstream licenses and .NET license/third-party notices. See [helper notices](../ocr-helper/THIRD-PARTY-NOTICES.md). A self-contained helper adds a separate download and should remain an optional release asset, not a dependency of ordinary speech playback.
