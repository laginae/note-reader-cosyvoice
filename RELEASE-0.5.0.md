# 0.5.0 - Web viewer reading

- Read loaded HTTP/HTTPS articles in Obsidian's desktop Web viewer, selected text only, or from the selected position onward. Both browser and Reader views are supported.
- Extract article content locally with bundled Mozilla Readability; use exact DOM range offsets for selections, including repeated phrases.
- Export web audio in the same three scopes, with mandatory character/request/save-path confirmation. Reuse kept segments for merge-only retries as before.
- Do not collect page text in the background, crawl other links, access cookies/browser storage, or save web URLs/content/positions in reading history. Online engines keep their existing consent and privacy controls.
- Reject stale snapshots after navigation, reload or closure. Prevent overlapping export actions and cancel pending preparation when a newer action or Stop supersedes it.
- Preserve existing Markdown, PDF and local HTML reading, playback controls, bounded prefetch and audio export.
- Handle segment navigation immediately while an earlier synthesis is pending, instead of waiting for that obsolete result. Reuse cached and in-flight audio without increasing automatic prefetch; ignore late results from skipped segments and prevent stale playback after navigation.

Web page support covers loaded visible text only, not external Chrome/Edge tabs, unloaded infinite-scroll content, nested frames, shadow DOM or image-only text. Web viewer internals were checked against Obsidian 1.13.7; this is not a stable public Web viewer plugin API. Website browsing itself still makes network requests. No live paid TTS requests were made during automated tests.
