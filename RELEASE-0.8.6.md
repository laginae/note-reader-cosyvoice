# 0.8.6 - Organized settings and compact header

- Organize settings into five pages: Speech engine, Playback and interface, Academic reading, Export and storage, and Privacy and help.
- Keep online consent and credentials beside their engine, group PDF content controls with academic reading, and place global reset at the bottom of Privacy and help.
- Preserve the selected category when changing settings or interface language. Switching categories alone does not save or change preferences.
- Replace the large language setting row with a compact, accessible selector beside the title.
- Remove the isolated sticky category bar so scrolling content no longer peeks above or overlaps it. Header and tabs now scroll normally.
- Support wrapped labels and controls in narrow settings panes, with keyboard navigation and localized category names in all ten interface languages.
- Update the English and Chinese README settings descriptions.

Existing settings and credentials are preserved. No changes to speech-service routing or synthesis behavior.

Validation: 235 automated tests, plus core, export and plugin-loader checks. Tests cover all ten languages and six engine branches. Theme-specific visual appearance has not been verified with live Obsidian screenshots. No online speech requests were made during verification.
