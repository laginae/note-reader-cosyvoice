# 0.9.0 - Smart quick start and session reading history

- Extend optional 20/40-character sentence-based quick start to any unprepared playback target. Preserve logical segment numbering, reuse in-flight and prepared requests, and keep normal export chunking.
- Add Off, session-only (default), and persistent reading history. Existing persistent opt-in is preserved. Session-only anchors never enter saved settings.
- Save position on file switches without interrupting playback. Reuse active audio for exact resume; regenerated audio starts at the saved segment boundary. Invalid saved locations no longer guess an old chunk number.
- Preserve original HTML punctuation and paragraph boundaries when resolving normalized history anchors, preventing resume from losing its DOM highlight match. Local HTML formula speech can map back to original text nodes when complete-stream conversion agrees; ambiguous and cross-node expressions remain unmarked.
- Add confirmed per-category reset actions and a separate global reset. Preserve credential references, service configuration, language and reading records; never delete exported files.
- Snapshot synthesis configuration for the running session so reset does not change its engine, voice or speed halfway through.
- Update Chinese and English documentation and translate the new primary control labels in all ten interface languages. Some detailed help retains the existing English fallback.

Temporary audio continues to follow the cleanup setting. Persistent history contains local file paths and bounded text anchors; session-only mode keeps them in memory until reload or exit.
