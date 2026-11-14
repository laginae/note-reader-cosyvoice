# Cozy Read Aloud 1.7.7

- Add **Academic reading > Repeat table headers for each row**, on by default. Disable it to read column headings once at the table opening, followed by row numbers and values.
- Header repetition is independent of Smart / All / Skip policy. Smart mode still skips long numeric tables. Empty cells retain a short placeholder when headings are not repeated, preserving column order and zero values.
- Markdown and simple structured HTML share Core 0.3.1. Merged/nested tables, partial HTML selections and unstructured PDF text do not receive invented headers; selection bounds and source-coordinate safeguards remain in force.
- Preserve the 1.7.6 unchanged-Markdown return-to-reading fix. Pin core commit `f0e6195fdda69e49c1bb54c21c0187eb005b6322`.
- No real online synthesis or personal documents are used for verification. Private prose, PDFs, credentials, installed settings, diagnostics and backups are not release assets.
- Optional Windows OCR helper code is unchanged; the release workflow rebuilds and verifies it with a public invented sample.

Restart/reload the plugin to enable the update. Start a new session after changing table wording; prepared audio is not rewritten. Existing voices, credentials and settings are preserved.

## 中文摘要

新增默认开启的“每行重复表头”。关闭后开头读一次表头，后续逐行读数据；空单元格保留简短占位，智能跳过策略不变。Markdown 和简单 HTML 共用核心库 0.3.1，不强行推断不可靠 PDF、复杂表格或选区外的表头。保留定位修复，不包含私人正文或密钥。
