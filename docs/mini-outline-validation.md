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

## Local Narrow-Width and Scrollbar Checks

Unreleased refinement after desktop 1.5.1 / mobile 0.6.1, checked on 2026-11-01:

- Lowered the configurable width floor to 180 pixels without changing the responsive defaults or existing saved widths. Below 240 actual pixels, desktop top/bottom actions move into Options. Touch headers and options wrap instead of shrinking hit targets.
- Desktop core, export and loader checks plus 591 Node tests passed. Mobile passed 287 Node tests and the 40-file compatibility check. Tests verify normalization, the settings slider, 180-pixel persistence and actual-width layout changes without replacing rows, reading files or starting speech.
- Both editions passed isolated Chromium checks at 1280x900, 390x844, 320x568, 768x1024 and 1024x768. Tested 180, 200, 230, 260, 420 and 600 pixels on both sides, narrow split panes, touch targets, visible Close and usable options.
- The browser's default hidden-scrollbar launch argument was removed for a second pass. Desktop idle/hover screenshots visibly hide/reveal the scrollbar; measured list size and heading geometry stay unchanged. Wheel scrolling, keyboard focus, mouse-click focus, touch/pen transitions, high-contrast mode and mobile native scrollbar behavior passed.
- The local desktop program files were backed up, copied and hash-verified; the saved settings file was unchanged. The running reading session was not reloaded or interrupted. Source changes are synchronized across desktop and mobile; no new GitHub release is part of this check.
- All fixtures are public invented examples. No speech service was called, and no private note, credential or diagnostic screenshot was published. Physical mobile-device acceptance remains pending.

## Heading Actions Without Row Buttons

Unreleased refinement after desktop 1.6.1 / mobile 0.7.1, checked on 2026-11-02:

- Removed heading-row ellipsis buttons and their reserved space, including on the current reading row. Heading context menus and Shift+F10/the context-menu key retain both reading scopes and full-title expansion. Top Outline options provides the same actions with an explicit target-section caption for touch and keyboard access.
- Desktop core, export and loader checks plus 616 Node tests passed. Mobile passed 311 Node tests and the 43-file compatibility check. New coverage includes unknown/empty targets, selected versus reading sections, touch navigation without speech, keyboard focus restoration, hidden-title expansion, duplicate-click suppression and cancellation after source changes or closing/reopening the same directory.
- The shared UI passed isolated Chromium desktop and simulated-touch checks at a 180-pixel directory width. Heading-row buttons are absent, options do not overflow horizontally, and touch action targets remain 44 by 44 pixels. Opening the directory or options does not start speech. Screenshots were inspected using invented public headings.
- Desktop/mobile source, tests, directory styles and documentation are synchronized. UTF-8 and diff checks passed. No new startup scan, observer or timer was added; unchanged playback ticks still do not rebuild rows.
- The local desktop program files were backed up, copied and hash-verified; the settings file was unchanged. The running plugin was not reloaded or its reading session interrupted. Re-enable the plugin or restart Obsidian to load the updated program.
- No GitHub push or release was made. No private document or key was read or sent to a provider. Physical mobile-device acceptance remains pending.

## Adaptive Controls and Conservative Bracket Speech

Further local refinement after desktop 1.6.1 / mobile 0.7.1, checked on 2026-11-02:

- Desktop core, export and loader checks plus 629 Node tests passed. Mobile passed 323 Node tests and the 44-file compatibility check. The mobile speech implementation retains its no-lookbehind boundary.
- Header edge actions now use the available row width, rendered button sizes and spacing, not a 240-pixel cutoff. Resolved free space from the Close button's auto margin is excluded. Both arrows remain in the header together or move together into Options; the secondary pair cannot split across flex rows.
- The target-section caption and actions share a compact row with no fixed two-line height. Narrow layouts and touch/mobile use a section-action menu. Tests cover equivalent commands, target preservation, unknown targets, focus transfer/restoration, larger theme buttons and touch-sized controls.
- Public-only Chromium checks covered 1280x900, 390x844, 320x568, 768x1024 and 1024x768, configured directory widths from 180 to 600 pixels, responsive pane limits and larger theme buttons. Desktop section rows measured 26 pixels and touch rows 44 pixels in the fixture; controls did not overflow horizontally. At 600 pixels on the tablet layout, both edge actions shared a 44-pixel-high header. Screenshots were inspected. Opening options/menu or expanding a title made no speech calls.
- Formula tests cover explicit interval prose/membership, ambiguous coordinates/vectors/arguments/commutators, open versus closed endpoints, unary signs, infinity, short literal sets, grouping, both styles and explicit skip settings. PDF math runs and HTML highlighting retain their original source text/coordinates. Context analysis is bounded to 400 characters before and after a formula; no full-document semantic scan or new external service is introduced.
- The desktop bundle grew from 2,982,229 to 3,003,483 bytes (about 0.7 percent). Nine fresh-process samples gave median compilation/initialization times of 21.63/22.21 ms before and 21.42/22.06 ms after. This limited module benchmark shows no obvious regression; it is not full Obsidian startup or physical-device performance acceptance.
- The local desktop program files were backed up, copied and hash-verified; saved settings were unchanged. The running plugin was not reloaded or interrupted. Re-enable it or restart Obsidian to load the new code; start a new reading session to regenerate prepared audio.
- No GitHub push/release was made, and no private text or credential was uploaded. Browser touch simulation is not iPhone/iPad/Android physical-device acceptance; those checks remain pending.

## Concise Brackets and Independent Pause Controls

Unreleased refinement after desktop 1.6.1 / mobile 0.7.1, checked on 2026-11-03:

- Desktop core, export and loader checks plus 644 Node tests passed. Mobile passed 338 Node tests and the 45-file compatibility check. Shared controls and formula helpers are synchronized; mobile's existing no-lookbehind adaptations remain intact.
- Concise style uses neutral member pauses for bounded ambiguous pairs and states simple two-argument function parameters without narrating each bracket. Verbose style retains structure. Whole `(a+b)c` and `(a-b)^2` expressions preserve grouping in natural language; isolated arithmetic groups keep explicit boundaries because PDF extraction can split the following factor into another font run. Smart-mode complex omissions, interval evidence, source maps and explicit skip options remain covered.
- Mini-outline pause/resume calls the existing player, not the chapter-reading action. An optional independent lower-right control is off by default, appears only for an active/paused session and is removed after stop/completion or disabling. Idle/export states cannot start speech. No whole-vault read, new TTS request, background polling or settings reset is introduced; floating-placement listeners are mounted only while that control exists. Changing this UI preference does not invalidate the mobile synthesis configuration.
- Tests cover synchronous mobile resume gestures, both controls sharing a pending-action guard, repeated clicks, stale pointer/session identities, newer sessions superseding pending controls, error recovery, stable button nodes, one floating control across panes, geometry cleanup, visual viewport offsets, safe areas, known bars, positioned hosts and small-viewport outline overlap.
- Isolated Chromium checks used public invented text at 1280x900, 390x844, 320x568, 768x1024 and 1024x768. Desktop directory widths of 180-420 pixels retained a usable pause control and no horizontal overflow. The desktop floating button measured 40 by 40 pixels; touch controls measured at least 44 by 44. Known bottom bars retained a 12-pixel gap. At 320x568 an overlapping open outline hid the floating button while keeping its own pause control; closing the outline restored it without starting or stopping speech. Both entry points updated the same simulated playback state. Screenshots were inspected; this is not real iOS/Android audio or physical-device acceptance.
- Local desktop program files were backed up, copied and SHA256-verified. The saved settings file was unchanged, including credentials and user preferences. The running plugin was not reloaded. Re-enable it or restart Obsidian to load the program; start a new reading session for changed formula pronunciation. Mobile source/build are updated, but no mobile device was installed or tested.
- Bilingual README and control documentation describe this as a development build. No version bump, GitHub push/release or private-text/credential upload was made.

## Configurable Pause-Button Visibility

Local refinement checked on 2026-11-03; GitHub push was deferred at the user's request:

- Added **More outline options > Playback button visibility** in both editions. The default follows the header's idle hiding, even during playback or pause; **Visible during reading** restores the optional session-visible behavior. Touch/mobile stays visible. Existing pinned indicators, keyboard focus, open tools/menus, reduced-motion handling and layout space are retained.
- The preference is normalized, persisted and covered by desktop page reset. Changes update existing buttons without reloading headings or starting/stopping speech. Mobile excludes it from the synthesis configuration key. No new timers, listeners, document reads or requests are introduced by this preference.
- Desktop passed core/export/loader checks and 646 Node tests. Mobile passed 340 Node tests and the 45-file compatibility check. Unit coverage includes absent/invalid settings, saving/reopening, stable controls, session preservation and independence from the floating-button preference.
- Public-only Chromium checks verified default idle hiding, hover reveal, hiding after a mouse pause click despite retained focus, keyboard reveal/resume, optional session visibility and idle cleanup. Header/list geometry remained unchanged. Simulated mobile layouts at 320x568, 390x844, 768x1024 and 1024x768 retained visible 44-pixel controls in both modes; touch/pen-to-mouse input switching retained existing behavior. Screenshots were inspected. These checks are not physical iOS/Android acceptance.
- At this step the proposed short-line collapsed entry had not been implemented; the subsequent check below covers it.

## Chapter-Line Collapsed Entry

Unreleased refinement after desktop 1.6.1 / mobile 0.7.1, checked on 2026-11-03:

- Added Auto / Chapter lines / Outline icon under More outline options. Mouse-first Auto uses cached headings for a rail; touch uses a minimum 44-pixel icon target. Real input transitions take priority over secondary touch capability. Empty, unloaded or invalidated data retains an icon without new document reads or PDF analysis.
- Rails show chapter order and depth, not proportional page positions. They are bounded to 24 marks, reduced in short panes; dense lists prefer shallower headings, with the complete outline retained after expansion. A stronger line marks browsing and a separate dot marks reliable reading. Individual tiny marks are not navigation hit targets: the rail is one accessible opener.
- Mouse hover opens after 200 ms; unpinning keeps the panel open while the pointer remains inside, then collapses after 250 ms. Re-entry cancels dismissal. Search, options, section menus and keyboard focus retain the panel; touch unpinning collapses directly. Keyboard activation focuses a heading, Escape restores entry focus, and hovering never starts speech or navigation.
- Startup opening still pins only the active document. Manual collapse can restore the entry for that document, but explicit hiding and Auto coexistence always win. The button preference remains editable during startup opening. Changing files removes old marks and does not analyze the replacement in the background.
- Visible closed rails coalesce position updates over 180 ms using existing data. Hidden and icon-only entries do not track positions. Existing heading/button nodes remain stable during playback ticks; timers/listeners are cancelled on disposal. Deferred viewer failures invalidate the rail instead of interrupting playback. No whole-vault scan, new external service or polling loop was added.
- Desktop passed core/export/loader checks and 658 Node tests. Mobile passed 352 Node tests and the 45-file compatibility check. Shared source, directory CSS, tests and documentation match; mobile UI-only preferences remain excluded from synthesis invalidation. UTF-8 and diff checks passed.
- Public-only Chromium checks covered 1100x800 desktop, a 180-pixel left outline, 390x844 simulated mobile, 820x1180 simulated tablet and a 900x320 dark dense outline. Checked hover/open/leave, search retention, keyboard focus return, touch target sizes, viewport bounds, 300-heading summarization and Floating TOC coexistence. Screenshots were inspected. No speech service was called; these checks do not establish physical iOS/iPadOS/Android behavior.
- Local desktop program files were backed up, copied and SHA256-verified; the settings file was unchanged. The running plugin was not reloaded. Re-enable it or restart Obsidian to load this build. Mobile source/build are updated; no mobile device was installed or tested.
- No version bump, GitHub push/release, private document upload or credential upload was made.

## Color-Only Reading Marks and Floating Stop

Source update after desktop 1.6.1 / mobile 0.7.1, checked on 2026-11-03:

- The collapsed reading mark now changes only to the theme accent color. It has no separate dot, no extra thickness and no length or spacing change. Browsing remains a darker neutral line; reading takes priority on the same line. Pause retains the mapped position. Forced-colors mode uses the system highlight color.
- The optional floating player adds a square Stop button above Pause/resume. Show stop button defaults on beneath the existing opt-in floating-control setting. Desktop hover or keyboard focus reveals it, leaving the pause anchor unchanged; the shared pointer area includes the gap and hides after a 250 ms leave delay. Mouse-click focus alone does not pin it open. Touch retains two 44-pixel targets. Insufficient space hides only the additional Stop control.
- Both actions reuse existing player methods. Stop can interrupt pending pause/resume or synthesis, but repeated clicks and stale pointer sessions are rejected. Disabling the new UI preference does not restart mobile synthesis. No new background polling, startup document parsing or speech request is introduced.
- Desktop core/export/loader checks and 668 Node tests passed. Mobile passed 362 Node tests and the 45-file compatibility check. The public fixtures cover pending operations, stale sessions, keyboard access, hover-gap retention, mouse/touch transitions, settings persistence, error recovery, overlap avoidance and disposal.
- The shared UI passed isolated Chromium checks at 1100x800 and touch-simulated 320x568, 390x844, 820x1180 and 1180x820. Pause retained its exact bounds on reveal and click; touch controls cleared the simulated bottom bar by 12 pixels. Checked dark styling, reduced motion, forced colors and the final color-only rail. Public-example screenshots were inspected. These are not physical iOS/iPadOS/Android tests; device acceptance remains pending.
- Local desktop program files were backed up, copied and hash-verified without replacing settings. With explicit permission, the paused session was ended and the plugin reloaded; the new stop control and preferences were verified in the running app. No mobile device was installed or tested.
- These source changes include the earlier pending outline/control and concise-bracket refinements above. Version metadata remains unchanged; this source push does not create a new GitHub Release. Publication excludes private document text, credentials, installed settings, local backups, screenshots and diagnostic logs. No speech provider was called for this update.

## Desktop 1.7.0 and Mobile 0.8.0

Release validation on 2026-11-03, including the previously source-only refinements above:

- Renamed the main setting to Floating playback controls and placed Show stop reading button in a native, initially collapsed More floating control options group. The parent remains opt-in and the child remains on by default. Parent off hides and folds the group without clearing the child preference. Folding alone does not save settings, synchronize controls or start speech.
- An open pinned outline now follows the newly active document across file and tab switches, including replacement of the old pane. Manual close/unpin prevents further automatic following. Unsupported active views do not trigger loading of a remembered background source. Inactive file changes remain lazy; only activation can open a new pinned target. Per-file search/folding state is retained in the existing bounded memory cache.
- Existing cancellation checks reject old loads after rapid switches or dismissal. A failed followed load remains open for manual retry rather than repeatedly loading or disappearing. Focus, reading state, Floating TOC coexistence, startup opt-in and lazy PDF analysis remain unchanged; no new polling or whole-vault scan is introduced.
- Desktop passed core/export/loader checks and 676 Node tests. Mobile passed 370 Node tests and the 45-file compatibility check. Added regressions cover same-pane replacement, separate tabs, pane removal, unsupported views, background files, failed loads, rapid switching, manual close/unpin and preference preservation.
- Public-only Chromium checks verified native summary keyboard access, default folding, parent off/on and saved child choices, Chinese/English settings and 320/390/820-pixel layouts. Actual shared outline code was exercised at 1100x800 and simulated 390x844/820x1180 mobile layouts: switching retained the pin and updated headings without playback or focus changes; manual close/unpin prevented reopening. Screenshots were inspected. No private document or speech provider was used.
- These browser checks are not physical iPhone/iPad/Android acceptance. Mobile background playback remains experimental; optional OCR and Realtime retain their existing experimental and opt-in boundaries. Publication is limited to audited public source, documentation and build assets, excluding settings, credentials, private text, screenshots and local diagnostic files.
