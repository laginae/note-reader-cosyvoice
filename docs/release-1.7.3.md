# Cozy Read Aloud 1.7.3

## PDF Outline Recognition

- Use Obsidian's local PDF character maps and font resources to decode PDFs that rely on CID font mappings, including affected Chinese documents. Reading and outline extraction use the same resource options.
- Combine relative font size, heading font identity, numbering and document structure to recognize main headings and same-size subheadings more reliably.
- Join wrapped headings only when column position, spacing and typography agree. A title such as `3 Proof of` followed by `Theorem 2` remains complete; topic headings about a theorem are no longer rejected as theorem statements.
- Preserve supported ordinary-font section headings that contain numbers or verbs. Reject a numeric body continuation only with corroborating language and layout evidence; keep captions, repeated page edges, reference entries and theorem statements out of the inferred outline.
- Prefer existing PDF bookmarks and preserve original text offsets and coordinates for section navigation and reading. Outline detection does not rewrite source documents.
- Share the detection rules with mobile 0.8.3. Processing remains local and on demand, with no new OCR/model dependency or startup document scan.

## Verification and Limits

- Passed 721 automated module tests plus the core, export and Obsidian-loader suites.
- Regression coverage includes Chinese/English headings, wrapped theorem references, plain-font sections, numeric body text, two-column boundaries, cropped-page origins, existing bookmarks, source offsets and resource cleanup.
- Public English/Chinese PDF fixtures and existing-bookmark cases were checked through the extraction paths. Automatic outlines remain heuristic; review inferred titles, levels and destinations for complex layouts.
- Published examples and regression fixtures are synthetic or public. No private document text, credentials, installed settings, diagnostic extracts or local backups are included. No online speech synthesis was needed for this change.

After updating, reload the plugin or restart Obsidian, then reopen or refresh the PDF outline. Existing settings and credentials are unchanged.

## 中文摘要

完善中文 PDF 字体映射资源、主章节和同字号子节识别；修复跨行定理类标题被截断、正常标题被当作定理正文排除的问题。普通字体章节不会仅因包含数字、动词或后面紧接正文而被删除；数字正文需结合语言和版式证据排除。保留已有书签优先、原文坐标及章节起读位置，不新增启动扫描或 OCR 依赖。桌面与移动版同步优化。更新后重启 Obsidian，并重新打开或刷新 PDF 目录；自动识别结果仍建议核对。
