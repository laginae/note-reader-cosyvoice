# Cozy Read Aloud 1.1.5

- Smart academic reading keeps simple variables, short arithmetic, and simple extrema or rounding expressions, but omits nested min/max and rounding formulas that interrupt prose.
- Full formula reading supports bounded, fully parsed min/max, ceiling/floor, and multiplication between adjacent parenthesized expressions. Unsupported expressions still use the omission policy.
- Formula speech and omission notices follow nearby Chinese or English prose. Formula-only text falls back to the configured language; explicit skip settings remain respected.
- Preserve omission pauses, PDF highlight text consistency, and the option to disable omission announcements.

Update through Obsidian Community plugins, then reload the plugin or restart Obsidian. Manual installations should replace `main.js`, `manifest.json`, and `styles.css` while preserving `data.json`.

No credentials, privacy routing settings, or saved preferences are changed by this update.
