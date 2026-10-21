# Cozy Read Aloud 1.2.6

## PDF formula text

- Recognize a specific multi-script encoding signature in damaged embedded math fonts. Recover known operators in short expressions without globally replacing legitimate multilingual text.
- In smart mode, group complex displayed equations with their limits, fractions and equation numbers into a single formula notice. Omit uncertain symbols instead of guessing their meaning.
- Reuse verified font evidence within the same loaded PDF and retain original text coordinates for highlighting.

## PDF context menu

- Add **Read aloud from here** to PDF text context menus. With a selection, also offer **Read selected text**.
- Prefer the selection start; otherwise locate the clicked word and try to start at the sentence beginning within the same column. Reject an unverified starting point instead of falling back to the page start.
- Preserve built-in PDF and PDF++ menu actions. Use the existing **Reading context menu** switch under **Playback and interface**.

## Verification and privacy

- Regression coverage includes font encoding, multilingual text, highlight mapping, selection scope, two-column sentence alignment, stale menus, overlay hit testing and cleanup.
- Tests use generic fixtures. No private PDFs, manuscript text, credentials or local diagnostic extracts are included in this release.
