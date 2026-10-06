# 0.9.1 - Rapid start and clearer navigation

- Add optional Rapid quick start: an eligible complete opening sentence of 5-19 non-whitespace characters can play before the normal 40-character stage and remainder. Standard remains the default. Number-only headings are excluded; existing requests and export chunking are preserved.
- Fix toolbar progress seeking within the current segment restarting at its beginning. Preserve the selected slider value until commit and discard pending selections when the reading session changes.
- Explain progress behavior in hover hints: within-segment seeking uses the selected position; cross-segment navigation starts at the target segment beginning and may require synthesis.
- Show separate target synthesis, existing-request wait, and audio-loading states in the toolbar and sidebar.
- Let navigation interrupt obsolete audio-file loading and release the old source when it eventually arrives. Reuse cached and in-flight synthesis without increasing prefetch or issuing duplicate requests.
- Protect navigation status from obsolete preparation work. Update documentation and regression tests.

Provider synthesis latency can still vary. This release does not claim measured online latency improvements or change online privacy consent.
