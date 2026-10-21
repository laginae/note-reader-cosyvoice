# Cozy Read Aloud 1.2.8

## PDF Auto-Follow Fixes

- Follow the whole active highlighted range when it fits, rather than checking only its first line. Use the PDF viewer's actual scrolling container and leave room for the overlapping bottom status bar.
- Keep cross-column passages in source reading order. When both highlighted regions cannot fit together, show the starting column first instead of jumping prematurely to the top of the next column.
- Follow the next column or page when the active audio part or a valid sentence highlight moves there. Without a matching cue, do not guess the column transition from elapsed playback time.
- Recheck the visible range after viewport resizing, PDF zoom, text-layer replacement and audio-part changes. Preserve manual-scroll suspension and avoid repeated scrolling during unchanged playback.
- Use the same partial-text rectangles for highlighting and following. A range taller than the viewport starts at its first reading region; it cannot be shown in full at once.

## Verification and Privacy

- Regression tests cover clipped paragraph endings, the status bar, resizing, partial spans, cross-column and cross-page passages, zoom, sentence cues and manual-scroll suspension.
- Tests use artificial public example text. No private PDFs, manuscript prose, screenshots, credentials or diagnostic extracts are included, and no online speech requests are needed for this fix.
