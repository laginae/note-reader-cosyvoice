# Cozy Read Aloud 1.2.7

## Less Intrusive Formula Reading

- Smart mode omits ratios containing repeated subscripted function calls instead of reading long sequences of parentheses and labels. Simple variables, short relations and simple function calls remain readable.
- Join PDF function-argument fragments from fallback fonts into a single verified math run, so omission applies to the whole expression without swallowing neighbouring prose.
- Full mode with concise wording uses natural single-argument function speech, such as "f sub k of t". Verbose wording and compound arguments retain explicit grouping.
- Preserve omission-notice settings and surrounding prose language. Original PDF highlighting coordinates remain aligned.

## Verification and Privacy

- Regression tests use generic artificial expressions and text, not private documents.
- No private PDFs, manuscript text, credentials or diagnostic extracts are included; no online speech requests were made for these tests.
