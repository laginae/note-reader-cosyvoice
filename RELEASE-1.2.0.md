# Cozy Read Aloud 1.2.0

## Smoother PDF and Formula Reading

- PDF selections, the reading view, and audio export now prefer complete sentences instead of breaking at visual line wraps. Sentences exceeding synthesis limits may still be split.
- Improve smart-mode filtering of multi-line equations and complex inline absolute-value constraints, including PDFs whose text layer exposes a shared font. Preserve surrounding prose and short variables.
- Read recognized simple formulas with spoken operators, including equals, plus, minus, comparisons, and absolute values. Chinese and English readings follow nearby prose, with the configured language as a fallback.
- Normalize common Greek letters, styled mathematical letters, and supported subscripts so short formulas sound more consistent across voices.
- Keep transformed speech aligned with the original PDF highlight source, including formulas next to words hyphenated across lines. Source documents are not modified.

Explicit formula-skip settings and the option to disable omission notices remain respected. These changes improve supported expressions; unusual PDF layouts and unsupported formulas can still require manual selection or skipping.

## Update

Update through Obsidian Community plugins, then reload the plugin or restart Obsidian after finishing the current reading session. Manual installations should replace `main.js`, `manifest.json`, and `styles.css` while preserving `data.json`.

No credentials, privacy routing settings, ZDR requirements, or saved preferences are changed by this update. Release tests use generic examples; private documents, diagnostic recordings, and API keys are not included.

Validation: 450 automated tests passed, together with the core, plugin export, and Obsidian loader checks.
