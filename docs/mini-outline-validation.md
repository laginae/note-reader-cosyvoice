# Mini Outline Validation

Date: 2026-11-01. Desktop 1.5.0; mobile 0.6.0. All fixtures are invented public examples. No speech API requests were made for this feature.

## Automated Checks

- Desktop: core, export and Obsidian-loader checks passed; 543 Node tests passed.
- Mobile: 240 Node tests passed; mobile boundary check passed for 39 files. No desktop-only runtime imports were added.
- New coverage: no file load at directory startup; Floating TOC coexistence without third-party writes; fold/search/pin state; title navigation versus section playback; export guards; stale files; late asynchronous loads; stable controls during audio updates; bounded initial rendering; keyboard/close behavior; Markdown, duplicate HTML headings and cached PDF adapters.
- Isolated Chromium layout checks passed at 1280x900, 390x844, 320x568, 768x1024 and 1024x768 for both editions. Checked viewport bounds, independent list scrolling, wrapped titles, search, pinned navigation, repeated toolbar toggling and toolbar-height changes.

## Local Obsidian Check

The desktop plugin was reloaded in Obsidian using a temporary public note. Four headings were detected, navigation reached a later section in a long note, and section-only versus continuing ranges were distinct. The speech entry point was stubbed for range inspection, so no provider received text. Existing settings were unchanged. Floating TOC remained enabled; Auto hid Cozy's edge entry while explicit access worked. The temporary note was removed and the previous pane restored.

## Startup Scope

Nine fresh Node processes per build, warm OS file cache; measured bundled module compilation and initialization only. This is not a measurement of full Obsidian startup, document parsing or synthesis latency.

| Build | Bundle bytes | Compile median | Initialize median |
| --- | ---: | ---: | ---: |
| Desktop 1.4.0 | 2,875,019 | 20.63 ms | 22.02 ms |
| Desktop 1.5.0 | 2,914,178 | 20.69 ms | 21.79 ms |

The bundle grew by 39,159 bytes (about 1.4%). These samples show no meaningful module-load regression, not a guaranteed speed improvement. With automatic opening off (the default), the directory has no startup document read or whole-vault scan. PDF extraction occurs when the outline is opened and uses the existing cache. The opt-in startup behavior added below was not part of this historical module-load benchmark.

## Remaining Validation

Browser dimensions are not physical-device testing. iPhone/iPad/Android keyboards, rotation, native selection menus, split-screen and theme/plugin combinations still require device checks. Mobile background playback and OCR remain experimental and off by default. PDF heading detection and fine-grained reading-position mapping remain document-dependent.

## UI Refinement Checks

Local refinement after the releases above, checked on 2026-11-01:

- Desktop: core, export and loader checks plus 550 Node tests passed. Mobile: 247 Node tests and the 39-file mobile boundary check passed.
- Added checks for grouped settings, preserved hidden shortcut choices, optional background normalization, collapsed search/options, clearing hidden filters, toolbar insertion/removal/visibility/size changes, left/right placement and ignored bars from other panes. No document loads occur during toolbar layout tests.
- Both editions passed isolated Chromium checks at the five sizes above. Search, options, pin, repeated open/close, independent scrolling, toolbar resizing and viewport bounds were checked. Desktop transparent backgrounds were inspected in light and dark themes; touch layouts retained a solid background.
- The local desktop installation was backed up, replaced and reloaded while idle. The document-edge button had an 8-pixel gap below the visible Editing Toolbar. Real Obsidian setting components rendered the two new groups and the exact new button description. Existing preference values and Floating TOC's enabled state were unchanged; the new transparent preference defaults to false.
- The refined desktop bundle is 2,920,204 bytes, 6,026 bytes larger than 1.5.0. Nine fresh-process module-load samples gave medians of 20.47 ms compilation and 21.61 ms initialization. This is the same limited benchmark scope described above, not full-app startup or real-device performance acceptance.
- No speech service was called. Test fixtures contain only invented public examples. Physical mobile validation remains pending; this local check does not itself publish a release.

## Two-Line Heading Refinement

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 557 Node tests passed. Mobile: 254 Node tests and the 40-file mobile boundary check passed.
- Added display-only Markdown heading cleanup, preserved literal code/currency/escaped markers, cleaned-title search, a two-line default, per-heading full-title expansion, both reading scopes in one menu, stale-menu guards and menu cleanup. Source titles and navigation offsets are unchanged.
- Both editions passed isolated Chromium checks at the five sizes above, including two-line clipping, full-heading expansion/collapse, stable row geometry on hover, keyboard menu access, both reading scopes and closing an unpinned panel. Desktop transparent light/dark appearances and solid touch layouts were inspected; touch actions remain at least 44 pixels.
- The installed desktop build passed an Obsidian native-menu check using a temporary DOM fixture with invented public headings. Display cleanup, two-line clipping, full-title expansion/collapse, both reading scopes and the simpler return-arrow icon were verified. Speech was stubbed; no note was created and no provider request was sent. The temporary DOM fixture was removed afterwards.
- The local installation was backed up, replaced and reloaded while idle. Bundle/style hashes match the checked build. Existing settings and Floating TOC's enabled state were unchanged.
- The bundle is 2,925,065 bytes, 4,861 bytes above the preceding UI refinement. Nine fresh-process samples gave medians of 21.29 ms compilation and 22.06 ms initialization, within the limited module-load scope above. This does not establish full-app or real-device startup performance.
- Physical mobile validation remains pending. No private document, credential or local test artifact is included in these changes, and no new release was published as part of this local refinement.

## Close Controls and Optional Double-Click

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 562 Node tests passed. Mobile: 259 Node tests and the 40-file compatibility check passed.
- Desktop mouse layouts hide the top Close icon and retain a Close action inside Options. Touch/mobile and narrow layouts keep the top Close icon. Unpinning immediately closes the panel; Escape and the outline toggle remain usable.
- The new preference is off by default. Tests cover immediate single-click navigation with the outline kept open when enabled, one read-from-section start for a native double-click, waiting for pending navigation, duplicate-start suppression, export guards, cancelling queued starts after close/document/heading changes, and retaining non-playing touch/keyboard behavior.
- Both editions passed isolated Chromium checks at 1280x900, 390x844, 320x568, 768x1024 and 1024x768. The checks used actual mouse double-clicks, verified one navigation and one read action, desktop Close inside Options, visible touch Close controls of at least 44 pixels, unpin dismissal and Escape. Light/dark desktop and phone screenshots were inspected using invented public headings.
- The local desktop installation was backed up and reloaded while idle. All three installed files match the checked build; existing settings and Floating TOC's enabled state are unchanged. The new double-click preference remains false.
- No speech API was called. Physical mobile verification is still pending. No private content or credentials were added, and no GitHub push or release was made for this refinement.

## Adjustable Outline Width

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 564 Node tests passed. Mobile: 261 Node tests and the 40-file compatibility check passed.
- Added a 260-600 pixel slider, visible numeric value and reset icon. Tests verify bounded/normalized values, immediate layout updates without replacing rows or loading text, responsive defaults after reset, persistence across reopening, playback-page reset ownership and unchanged mobile speech configuration.
- Both editions passed the five Chromium viewport checks above with 260, 420 and 600 pixel settings on both sides. Actual panel widths stayed within the document pane without horizontal content overflow. A 285-pixel split pane also limited a larger saved width correctly; resetting restored 300/340-pixel responsive defaults. Existing close, double-click, title expansion and menu checks still passed.
- The local desktop files were backed up, installed and hash-verified. Reloading while idle preserved every existing setting and Floating TOC's enabled state; the new width preference uses the responsive default. No speech API was called and no private content was added. Physical mobile testing and GitHub publication are not part of this local check.

## Heading Line Limits and Settings Order

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 567 Node tests passed. Mobile: 264 Node tests and the 40-file compatibility check passed.
- Added one, two, three and four title lines, defaulting to two. Tests cover validation, persistence, updating existing rows without reading files or starting speech, preservation of full accessible labels and explicitly expanded titles, and playback-page reset ownership.
- Both actual settings-page entry points render Reading shortcuts before Mini outline. The main directory controls are button visibility, width and heading lines; the five secondary preferences are under a closed More outline options group. Tests verify saved secondary choices survive folding/reopening and mobile speech configuration is unchanged.
- Both editions passed all five Chromium viewports above for one through four lines, including measured line heights, full-title expansion across preference changes and the existing width, menu and gesture checks. Public one-line and four-line desktop screenshots were visually inspected.
- The local desktop build was backed up and reloaded while idle; existing settings and Floating TOC state were preserved and the new preference defaults to two lines. Installed artifacts match the checked build. No speech API, private document upload or GitHub publication was involved. Physical mobile testing remains pending.

## Optional Startup Opening

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 576 Node tests passed. Mobile: 273 Node tests and the 40-file compatibility check passed.
- Automatic opening defaults to off. Tests cover waiting for workspace restoration, only loading the actual active document, ignoring a saved background reading source, tab/file changes during the startup delay, export deferral, disposal, manual dismissal, failed loads without retry loops, reuse of an in-flight load, and opening again on a new plugin lifecycle. No automatic action starts speech, changes the document position or takes keyboard focus.
- Enabling the option hides the edge button and its settings row without overwriting the saved button mode. Disabling it restores that mode. Settings tests and mobile playback configuration checks passed; Floating TOC is not modified.
- Both editions passed isolated Chromium checks at 1280x900, 390x844, 320x568, 768x1024 and 1024x768. With the reading toolbar hidden, the outline opened automatically in a pinned state, stayed within the viewport and avoided the visible Editing Toolbar. Unpinning kept it closed through subsequent updates, and manual access remained available. Desktop and phone screenshots were inspected using public fixtures.
- The local desktop build was backed up, installed and reloaded while idle. All three installed artifacts match the checked build. Existing settings and Floating TOC's enabled state were preserved; automatic opening remains off until explicitly enabled by the user.
- No private document was used as a test fixture and no speech API was called. No GitHub push or release was made. Physical mobile validation remains pending; an active PDF can still require initial outline analysis when automatic opening is enabled.

## Hover Controls and Document Edges

Further local refinement on 2026-11-01, without a version change:

- Desktop: core, export and loader checks plus 587 Node tests passed. Mobile: 283 Node tests and the 40-file compatibility check passed.
- Desktop mouse controls reveal on directory hover or keyboard focus, while a pinned idle directory retains its subdued pin. Search, expanded options and the active section menu keep controls visible. Tests cover menu cleanup, unchanged toolbar geometry, mouse focus not preventing idle hiding, keyboard reachability and reduced-motion behavior. Touch/mobile and narrow layouts retain visible controls.
- Added document top/bottom navigation, in the desktop header and touch Options. Unit tests cover Markdown source/preview endpoints, HTML-owned scrolling without markup/selection changes, last-page PDF targeting with cropped/rotated coordinates, the native PDF link fallback, changed documents, dismissal and cancelling queued double-click reading. Desktop navigation pauses auto-follow, not speech playback.
- Both editions passed isolated Chromium checks at 1280x900, 390x844, 320x568, 768x1024 and 1024x768. Checked real pointer entry/exit, keyboard Tab access, both edge-button actions, mobile controls of at least 44 pixels and no overflow in the 320-pixel layout. Desktop idle/hover and narrow touch screenshots were inspected. Tests use invented public examples and do not call speech providers.
- The local desktop installation was backed up, replaced and reloaded while idle. Existing settings and Floating TOC's enabled state were preserved. Obsidian supports the new selectors; the new navigation adapter is loaded. Installed artifacts match the checked build.
- No GitHub push or release was made. Physical-device mobile validation, uncommon PDF viewing modes and third-party theme combinations remain outside this automated check.

## Mixed-Input Header Correction

Follow-up correction on 2026-11-01, without a version change:

- Reproduced an idle header remaining visible in a desktop runtime reporting a primary fine pointer with hover support and an additional coarse pointer. The previous secondary-touch capability exclusion disabled auto-hiding even during mouse use. Hover, keyboard focus and open-menu exceptions were not responsible.
- Removed that exclusion. Mouse-first desktops now auto-hide regardless of secondary touch capability; actual touch or pen input keeps controls available until mouse input resumes. Input-type transitions are memory-only and do not scan files, re-render headings or request speech. Pointer listeners are removed on disposal.
- Desktop: core, export and loader checks plus 590 Node tests passed. Mobile: 286 Node tests and the 40-file compatibility check passed. New tests cover capability versus actual input, touch/pen/mouse transitions, unknown input events, stable rows, preserved pin state and listener cleanup.
- Both editions passed the five Chromium viewports listed above, including touch/pen-to-mouse transitions in the desktop layout, keyboard/menu exceptions, reduced motion, startup opening and touch controls staying visible.
- After backing up and reloading the local desktop build while idle, the native runtime still reported both pointer capabilities. With no hover, keyboard focus, expanded controls or open menu, pin opacity was 0.75, search/options opacity was 0 and hidden controls had no pointer hit target. Original settings and Floating TOC state were preserved; installed artifacts match the checked build.
- Diagnostics returned UI state only, not document content or headings. No speech service, GitHub push or new release was involved. Physical mobile validation remains pending.


## Release Candidate Verification

Desktop 1.5.1 and mobile 0.6.1, checked on 2026-11-01:

- Rebuilt both release candidates. Desktop core, export and Obsidian-loader checks plus 590 Node tests passed. Mobile passed 286 Node tests and the 40-file compatibility check.
- Re-ran both editions at 1280x900, 390x844, 320x568, 768x1024 and 1024x768 in isolated Chromium. Startup opening, one-to-four title lines, width limits, top/bottom actions, hover/keyboard visibility, hybrid input transitions and touch controls passed. Idle/hover desktop and narrow touch screenshots were inspected using public headings.
- Preserved the historical checks above rather than relabeling them as new physical-device tests. iPhone/iPad/Android validation remains pending; background playback and OCR remain experimental and off by default.
- Version metadata and bilingual documentation describe the same feature set. No speech service was called for these checks; private documents, settings, credentials, screenshots and local diagnostic logs are excluded from the release files.
