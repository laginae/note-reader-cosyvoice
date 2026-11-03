# Cozy Read Aloud 1.7.2

## Natural Formula Reading

- Standalone common operators such as `\max`, `\min`, `\lim` and `\sum` receive their usual spoken labels instead of an omission notice. Simple single-argument functions such as `\sin x` and `\ln(x)` are also supported.
- Concise short fractions preserve grouping without reading every bracket: `(x-y)/\bar z` reads as "the difference of x and y, divided by z bar"; `x/(y+z)` reads as "x divided by the sum of y and z". Equivalent supported `\frac` forms follow the same rule.
- Short accents, Greek letters and subscripts retain their labels. `bar` does not assume a variable means an average.
- Verbose structure, explicit skipping and smart-mode complex-formula safeguards are preserved. Original documents and highlight coordinates are not rewritten.

## Processing and Verification

- Reuse fixed symbol tables and patterns and avoid repeated formula normalization; no new document cache, background task or external dependency.
- In an offline Windows/Node synthetic benchmark, 1,000 formula conversions decreased from about 26 ms to 10 ms. Standalone desktop module loading remained approximately 44 ms; this does not measure actual Obsidian startup, API latency or audible first sound.
- Passed 702 module tests plus the core, export and Obsidian-loader suites, including Markdown/HTML source mapping and recognized PDF whole/selection paths.
- Tests and documentation use synthetic examples only. No private documents, account credentials or local backups are included, and no online synthesis was required.

Reload the plugin or restart Obsidian after updating, then start a new reading session. Previously prepared audio is not rewritten. Existing settings and credentials are unchanged.

## 中文摘要

改进常见独立运算符和简短函数的读法；简洁模式将短分式中的“和／差”作为整体朗读，减少重复念括号，同时保留运算顺序。完整模式、主动跳过设置、复杂公式保护及原文高亮保持不变。减少重复解析准备工作，不新增正文缓存或后台任务。更新后重载插件或重启 Obsidian，再开始新的朗读会话。
