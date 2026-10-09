# Cozy Read Aloud 1.1.1

- Improve Markdown following to consider the complete highlighted range, not only its first line. Reading previews combine marked blocks, leave edge space and account for overlapping recognized sticky toolbars. Ranges taller than the viewport align at the beginning; no playback-percentage position guessing is used.

- Rename the outline-only control to Outline auto-follow. Reflect manual and search suspension immediately in its label and pressed state, without moving the document or changing playback.

- Add synchronized Auto-follow controls beside Locate in the native toolbar and sidebar. Locate remains a one-time action; Auto-follow persists by document type and is off by default.
- Use an up/down arrow icon and group sidebar follow/locate actions together at the right. Paused following uses a neutral color, not warning yellow.
- Ordinary clicks and control activation no longer pause following; scrolling gestures and scrollbar dragging still do. Explicit PDF following can position the current passage while audio is paused.
- Add optional PDF following based on reliable current audio-part matches. Already visible text stays still; trusted unloaded page targets can be brought into view before text-layer refinement. Zoom is unchanged. Highlighting must be enabled.
- Manual browsing pauses following. The control shows a paused state; click it to resume rather than automatically pulling the reader back.
- Keep existing Markdown and HTML/web follow settings. PDF has its own Follow PDF reading setting under Playback and interface.
- No additional synthesis requests, document uploads or telemetry. Complex or unmatched PDF text remains stationary; scanning without a text layer is not supported.

Validation covers simulated DOM geometry, input handling, repeated updates and existing playback regressions; real Obsidian/PDF rendering still needs device testing. The mobile edition is unchanged.
