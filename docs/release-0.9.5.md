# 0.9.5 - Short formula recognition

## Fixed

- Read `z_{\mathrm d}`, `z_{\mathrm{d}}` and `z_\mathrm{d}` as `z sub d`.
- Ignore ordinary font directives before checking complexity, including roman, bold, italic, sans-serif and monospace formatting.
- Normalize redundant groups around single atoms and ignore TeX spacing and display-style directives.
- Preserve short fractions, accents, Greek subscripts and squared/cubed exponents with font wrappers.
- Do not wrap structural commands following a script marker as if they were standalone Greek symbols.

## Boundaries

Explicit skip mode still skips all formulas. Unknown commands, malformed groups, large expressions, sums, integrals and matrices remain conservatively omitted. This is not a general LaTeX parser and does not infer mathematical meaning from arbitrary notation.

The fix applies where the document provides LaTeX text. It does not add OCR or recover formula structure from PDF pixels. Mobile receives the same normalization through core v0.2.1.
