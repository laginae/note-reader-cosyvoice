# 0.8.1

- Add reading-toolbar shortcuts: Space pauses/resumes; Left/Right Arrow seeks five seconds using the existing cross-part playback controls.
- Keep shortcuts focus-scoped in live preview and editing mode. Markdown reading mode also accepts them in the original reading pane while the toolbar is open.
- Preserve native keyboard controls for inputs, sliders and menus; ignore composition and modified key combinations.
- Show localized shortcut hints on pause/resume and seek buttons without duplicate tooltips.
- Retain captured selection positions when playback buttons focus the toolbar, and remove reading-pane listeners when the toolbar closes.

No new online requests or permissions are introduced. Re-enable the plugin or restart Obsidian after updating so the new code takes effect.
