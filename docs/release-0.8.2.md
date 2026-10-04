# 0.8.2

- Fix HTML and web highlights disappearing in chunks that cross table cells and paragraphs. Speech extraction and highlight matching now share the same structural separators, without modifying the page or painting invented punctuation.
- Recover local HTML and Web viewer Reader-mode highlights after content rerenders, iframe/document replacements, and delayed content updates, even when the playing segment has not changed.
- Restore guest-webpage highlights after same-text rerenders only when the original URL and an exact, unique text match still hold.
- Invalidate PDF highlight caches when middle text-layer spans change or following-page text arrives. Restore missing highlight rectangles without modifying PDF contents or annotations.
- Add regression checks for Markdown playback updates and backward/forward segment changes. Keep unmatched or ambiguous text unmarked rather than guessing its location.
- Preserve other plugins' highlights, native text selections, settings, API credentials, and existing playback controls.

These fixes run locally and add no speech API calls, online permissions, or telemetry. Re-enable the plugin or restart Obsidian after updating so the new code takes effect.
