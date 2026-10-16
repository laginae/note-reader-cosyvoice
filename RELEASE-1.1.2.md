# Cozy Read Aloud 1.1.2

- Improve PDF formula filtering using text-layer glyphs, available font information and page layout. Smart mode skips recognized complex or multiline formulas while retaining short inline variables and simple relations. Uncertain text is preserved; this is not formula OCR.
- Keep PDF extraction and highlighting on the same filtered source. Skipped formula spans are excluded from highlighting, and reliably matched audio parts can highlight only the relevant portion of a text span rather than the entire line.
- Preserve original PDF text when starting from a selection, including ligatures, mathematical characters and wrapped words, to avoid position mismatches after normalization.
- Choose Chinese or English PDF formula-omission notices from nearby prose instead of always using the saved formula-reading language. Formula-only pages retain the saved fallback. Short-formula pronunciation settings are unchanged, and notices can still be disabled under Academic reading.
- Keep the opening quick-start audio plan consistent when progressive PDF prefetch prepares it first. This addresses a scheduling inconsistency; it does not guarantee that every voice provider's occasional repeated speech is resolved.

Validation: 414 automated tests passed, together with local PDF extraction, simulated playback and rendered text-layer checks. Real provider audio was not used to validate this fix. Scanned PDFs without a usable text layer are not supported. The mobile edition is unchanged.

No additional API requests or telemetry are introduced. The release contains plugin code and generic test fixtures only; no private documents or diagnostic captures are included.

After updating, reload the plugin or restart Obsidian and start a new reading session. Existing sessions and already generated audio keep their previous text. For complex-formula skipping while retaining short variables, choose Academic reading > Formula reading > Smart: skip complex formulas.
