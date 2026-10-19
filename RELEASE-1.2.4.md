# Cozy Read Aloud 1.2.4

- Smart academic reading now considers grouping and operator complexity, not only formula length. Multi-step fractions, deeply nested calls, long vectors and transposed vectors are omitted as a whole instead of reading every bracket.
- Short variables, simple ratios and established lower/upper-bound intervals remain readable. Concise single-variable function notation uses "of" instead of bracket names.
- PDF formula filtering uses the same structural complexity check. Existing safeguards for unsupported math remain in place; All mode retains supported longer expressions.
- Formula notices retain contextual language and pauses, and can still be disabled. Notes and source documents are not modified.

All 462 automated tests pass, using synthetic examples only. No private document text or credentials are included.
