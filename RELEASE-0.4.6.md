# Note and PDF Voice Reader 0.4.6

- Add instant, persistent playback speed and volume controls without resynthesis. Preserve playback speed when loading subsequent segments.
- Add repeatable back/forward five-second buttons within the current segment and clickable progress navigation.
- Show estimated total and remaining playback time, adjusted for playback speed. Progressive PDF estimates cover parsed pages only.
- Translate reader buttons and tooltips according to the selected English/Chinese interface language. Limit long button labels to two lines.
- Improve stop/resume button responsiveness and immediately apply restored playback defaults.
- Reject incomplete MiMo responses instead of silently advancing, and add a configurable conservative segment limit (200 characters by default).
- Shorten excessive near-digital silence at internal joins for standard 16-bit PCM WAV exports. Preserve internal pauses; MP3 exports are unchanged.

Reload the plugin after updating. Existing settings and credentials are preserved. Playback speed and volume do not change exported audio. Timing estimates exclude synthesis/network waits. No extra API requests are made for playback controls or duration estimates.
