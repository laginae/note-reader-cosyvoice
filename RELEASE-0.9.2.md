# 0.9.2 - Reading location and HTML highlighting

- Add Locate current reading to the toolbar and sidebar. Return to the source note, PDF page, local HTML or an already-open Web viewer page without restarting audio.
- Improve HTML matching when displayed formulas differ from speech text, including paragraphs split across inline elements and segments beginning inside tables.
- Require evidence near the beginning of a partial match instead of highlighting only a later caption. Clear obsolete highlights when reading advances and recover after supported page rerenders.
- Use a single pale paragraph background for HTML instead of overlapping darker text highlights. Preserve original content and selection.
- Make the sidebar locate button respond on pointer press, reuse existing reading marks and cached document text, and stop repeatedly scanning an already-loaded unmatched HTML page.
- Add regression coverage for location, rendered formulas, rerenders, cache invalidation and pointer handling.

Verification: the complete test suite passed, including 281 Node subtests. Offline rendered-HTML checks were also performed; this release does not claim live Obsidian UI validation or exact sentence timing for engines without timing metadata. Uncertain matches remain unmarked. No additional TTS requests or changes to privacy consent are introduced.
