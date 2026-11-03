# Short Formula Speech and Processing Cost

Validation for desktop version 1.7.2: 2026-11-03.

## Behavior

- Concise short fractions name a whole sum or difference without reading each bracket.
- Slash and supported `\frac`, `\dfrac` and `\tfrac` forms preserve numerator and denominator order.
- Simple subscripts, Greek letters, overbars and short accents retain their labels; `bar` does not imply an average.
- Verbose speech, explicit skipping and smart-mode complexity gates are unchanged. Ambiguous products, unknown commands and unsupported nested structures are not guessed.
- Markdown, HTML and reliably recognized PDF math use the shared speech path. PDF font/layout recognition is still required; this does not reconstruct every visual fraction.
- Original document text and highlighting coordinates are preserved. Start a new reading session after loading the updated plugin; prepared audio is not rewritten.

## Measurements

Windows, Node.js 24.15.0; fixed synthetic inputs, no network calls, notes or account access. Median of nine warmed text-processing samples, after three warm-up runs. Baseline is the local build immediately before this change, including the preceding common-operator improvement, not an older published version.

| Workload | Before | After |
| --- | ---: | ---: |
| 1,000 short formula conversions | 26.068 ms | 9.782 ms |
| 25,840-character text with 500 formulas | 16.013 ms | 8.169 ms |
| 61,000-character ordinary text | 0.016 ms | 0.016 ms |

The bundled desktop module was measured separately in nine fresh Node processes with a warm filesystem cache and a stub Obsidian API:

| Module measurement | Before | After |
| --- | ---: | ---: |
| Compilation median | 21.705 ms | 21.700 ms |
| Initialization median | 21.743 ms | 21.948 ms |
| Bundle bytes | 3,050,507 | 3,060,101 |

Formula processing reuses fixed symbol tables and compiled patterns and avoids a second normalization pass. There is no new document cache, background task, runtime dependency or startup file scan. Module loading is essentially unchanged in this measurement, not proven faster; these numbers exclude actual Obsidian activation, PDF extraction, network synthesis and audible first sound. The formula workload also produces shorter speech after the change, so this measures the complete before/after path, not an isolated micro-optimization.

Reproduce from the repository root:

```sh
npm test
node scripts/benchmark-math.cjs
node scripts/benchmark-startup.cjs
```

The math benchmark accepts an optional path to another compatible `academic-speech.js` for an A/B check. Timings vary by machine and runtime; no absolute timing threshold is enforced in tests.

## Verification

- Desktop: 702 module tests, plus the core, export and Obsidian-loader suites.
- Mobile: 394 tests and the mobile compatibility check, run on Windows rather than phone hardware.
- A local differential check compared 1,349 synthetic expressions in 16,188 language/style/policy combinations. The existing complexity classifications, verbose speech and explicit skip behavior were unchanged; differences were confined to concise fraction speech.
- No online synthesis or real mobile-device playback was used for this check. These results do not establish lower API latency or improved overall application startup time.
