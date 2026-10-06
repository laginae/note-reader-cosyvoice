# 0.9.3 - More reliable Markdown and PDF highlighting

- Markdown highlights follow the current audio part without changing logical segment numbers. Reading view can mark verified list items separately.
- Notes use a single pale highlight background. An optional side marker is available under Playback and interface.
- Cached Markdown source mappings reduce repeated work; editing a note clears stale highlights and shows one notice per reading session.
- PDF highlights follow audio parts, or reliable sentence cues when available. Full-segment anchors prevent repeated short phrases from selecting unrelated text.
- Cross-page PDF segments can highlight verified content on loaded pages while another page is still loading. Locate follows the active part's page.
- Cached PDF layouts reduce repeated geometry work. Highlight matching uses the reading session's text-processing settings.
- Fixed missing PDF highlights on pages containing zero-width formula accents. These characters remain part of source matching without producing empty highlight rectangles.
- Updated English and Chinese documentation. No additional speech requests are needed for these improvements.

## Verification

- Build, core, export and Obsidian loader tests passed; 301 module tests passed.
- The reported PDF layout was reproduced locally using Obsidian's bundled PDF renderer; five consecutive test segments rendered highlights after the fix.
- Existing HTML and web highlighting regression tests passed. This release does not change the HTML highlighting algorithm.

Highlights remain conservative for uncertain source mappings and do not imply word-level timing for engines without reliable alignment data.
