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

The bundle grew by 39,159 bytes (about 1.4%). These samples show no meaningful module-load regression, not a guaranteed speed improvement. The directory has no startup document read or whole-vault scan. PDF extraction remains on explicit open and uses the existing cache.

## Remaining Validation

Browser dimensions are not physical-device testing. iPhone/iPad/Android keyboards, rotation, native selection menus, split-screen and theme/plugin combinations still require device checks. Mobile background playback and OCR remain experimental and off by default. PDF heading detection and fine-grained reading-position mapping remain document-dependent.
