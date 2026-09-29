# Note and PDF Voice Reader 0.4.7

- Add a separate current-segment time slider. Preview the target time while dragging and seek on release, preserving playback or pause state. Stale sliders cannot seek a newly loaded segment.
- Use a subtle 2px neutral track. Hide the moving thumb until hover, dragging, or keyboard focus; retain the full interaction area and touch accessibility.
- Separate overall segment navigation from within-segment seeking and group playback controls in a compact bilingual layout.
- Allow five-second buttons and arrow keys to cross segment boundaries using actual audio durations. Repeated requests accumulate, and paused seeking remains paused.
- Reuse prepared segments. Seeking into unprepared segments may require synthesis and consume API quota. Progressive PDFs can seek within parsed content only.
- Preserve Chinese Markdown line boundaries during speech cleanup instead of joining subsequent headings to preceding text. This fixes a text-cleaning issue, not a guarantee of verbatim provider speech output.

Reload the plugin after updating. Existing settings and credentials are preserved. Playback controls do not change exported audio. This release was regression-tested; live paid TTS calls and full in-Obsidian visual validation were not performed.
