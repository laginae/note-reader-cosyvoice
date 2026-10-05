# 0.8.5 - Academic reading and multilingual settings

- Add a dedicated Academic reading settings section for formulas, tables and PDF ancillary content.
- Smart defaults skip complex LaTeX formulas and long numeric tables while retaining small tables and text-heavy glossaries. Omission announcements can be disabled.
- Add concise `sub` and `bar` notation, retain an explicit subscript style, and correct Chinese fraction order.
- Merge adjacent numbered citations: `[2][4]` becomes "references 2 and 4" in English prose or "文献2和4" in Chinese prose.
- Apply conservative caption-based numeric-table filtering to PDFs; uncertain content is retained. This is not a universal PDF equation detector.
- Preserve HTML selection data and subsequent paragraph highlighting when whole-document table filtering is enabled.
- Add German, French, Russian, Korean, Japanese, Spanish, Italian and Portuguese translations for core settings and playback controls, plus linked quick-start READMEs. Some advanced help and secondary dialogs remain in English. Interface language does not change the speech voice; formula conversion currently supports English and Chinese.

Processing is local and original documents are not modified. Existing settings and credentials are preserved. Online engines still require consent, and OpenRouter ZDR routing remains enforced.

Validation: 230 automated tests, plus core, export and plugin-loader checks. No online speech requests were made during verification.
