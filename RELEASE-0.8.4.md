# 0.8.4 - PDF body, glossary and footnote reading

- PDF footnote settings: body only (default), footnotes after body, original order, or footnotes only.
- Detect small bottom-page numbered notes independently in both columns, including first-page correspondence and publication blocks.
- Skip recurring PDF headers, footers and page numbers by default; an optional setting retains them.
- Omit confidently identified glossary tables from body reading by default, with a setting to include them.
- PDF toolbar scopes can read the whole PDF's glossary or footnotes separately without changing global settings. Button hints follow the selected scope and language.
- Clear messages when no glossary or footnotes can be reliably identified.
- Keep progressive playback, full-PDF audio export and highlight mapping aligned with PDF filtering. Selection-only reading and export preserve the selected text.

Detection runs locally and does not modify the PDF or make extra speech API requests. Uncertain content is retained; detection depends on PDF layout and requires extractable text. Existing settings and credentials are preserved.

Validation: 221 automated tests, plus core, export and plugin-loader checks. No online speech requests were made during verification.
