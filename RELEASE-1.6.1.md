# Cozy Read Aloud 1.6.1

## Concise Formula Reading

- Short variable accents now share natural names: `\widehat q` and `\hat q` read as "q hat"; `\widetilde{x}` reads as "x tilde"; `\ddot{x}` reads as "x double dot".
- Added short prime, double-prime, superscript-star and explicit-transpose names, including ASCII/Unicode prime marks and `x^{\prime}`, `q^{\ast}`, `A^{\top}`. Simple vectors read as "vector x"; Chinese formula speech uses Chinese vector/transpose labels.
- Preserve label/index order: `\widehat{q}_t` reads as "q hat t" and `\bar{x}_{i,j}` as "x bar i j". Fraction grouping and numerator/denominator order remain intact.
- Do not infer estimates, derivatives or optimality from symbols. Ordinary `A^T` remains a power rather than an assumed transpose.

These changes apply to concise style only. Existing verbose structural speech, explicit skip settings and smart-mode length, nesting, matrix, fraction and function-ratio safeguards remain in place. Unsupported notation is not guessed. Markdown, HTML and recognized PDF formulas use the same short-label rules; reliable PDF prime/superscript text and positions retain their original source mapping. This is not OCR or general accent-layout reconstruction.

Automated tests use public notation and synthetic PDF/HTML examples only. No personal text, PDFs, settings or credentials are included. Restart the reading session to prepare new audio; previously generated audio is not rewritten.
