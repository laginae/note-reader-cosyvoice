# 0.6.0 - Installed system speech

- Added a separate local speech engine using installed Windows SAPI or macOS `say` voices. Existing engine selections, consent choices and credentials are preserved.
- Added detected voice selection, refresh and a public-text preview, with separate Windows/macOS voice preferences. No automatic voice downloads or online fallback.
- Added bilingual optional voice-download instructions and Microsoft/Apple help links. Narrator-only natural voices and Siri-only voices are not guaranteed to be callable.
- Kept the existing playback controls, first-segment audio parts, volume, playback speed, progress seeking and confirmed scoped audio export. Native audio is validated as mono 16-bit PCM WAV (16 kHz Windows, 24 kHz macOS); exports retain normal synthesis pace.
- Added an independent accessible reading-text view with optional subtle segment/sentence highlighting, focus-preserving progress updates, progressive PDF appends and optional following that suspends on manual scrolling.
- Renamed the entry to Reading view. The panel button and command toggle the view; its back button returns to the original attached note without stopping audio. Loading can be canceled by closing the view.
- Markdown reading views render the original headings, lists, emphasis, formulas and tables with Obsidian's native renderer and theme fonts. Text is selectable; playback updates preserve DOM, focus and selection. Images/embeds do not automatically load, and executable code-block processors are not run in this view.
- Added temporary source-block marking to original Markdown editor/live-preview and reading panes, without editing the note or selecting text. Exact source matches and verified Windows sentence timing permit editor sentence marks; reading mode uses source blocks. Edits, uncertain mapping and stop remove source marks. Other document formats retain separate-view marks.
- Added an explicitly confirmed Windows Narrator launch from complete reading text. Installed Narrator natural voices are used through Narrator, not direct plugin synthesis; plugin playback controls and audio export do not control it.
- Collected Windows ordinary system voice boundaries during the existing synthesis, without extra requests. Invalid timing falls back to segment highlighting; other current adapters retain segment-level highlighting.
- Stops cancel the session's native synthesis processes, including prefetched parts. Child process errors do not expose text, raw process output or local paths.
- Local installed offline voices keep synthesis on the device; voice downloads, OS telemetry, third-party voice engines, saved exports and vault sync have separate privacy boundaries.

Validation: Windows voice detection and fixed public-text WAV synthesis checked on Windows. Automated tests cover command construction, catalogs, cancellation, malformed audio, settings and engine dispatch. macOS integration needs a real-Mac validation; only command/parser behavior is covered here. No paid API requests are used by these tests.
