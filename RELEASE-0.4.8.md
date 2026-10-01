# Note and PDF Voice Reader 0.4.8

- Start note and progressive PDF reading with a separately synthesized opening segment: accumulate complete sentences until reaching at least 40 non-whitespace characters, without a fixed sentence count. The configured first character limit still caps this segment. Short documents use all available text. This reduces the amount of text in the first request.
- Continue with the configured chunk-length ramp. Long opening sentences still respect the first character limit.
- Handle decimal numbers and common English abbreviations at opening sentence boundaries. Preserve all readable text and PDF page metadata.
- Update bilingual chunk-setting descriptions to explain the opening segment and request-count tradeoff.

This applies to reading, including reading selections and continuing from a selection. Audio export keeps its existing chunking. Prefetch settings are unchanged. The short opening segment may add a request; actual startup time depends on the speech provider.

Reload the plugin after updating. Existing settings and credentials are preserved. Regression tests passed, including early PDF chunk emission and text-conservation checks. No live paid synthesis was used for validation.
