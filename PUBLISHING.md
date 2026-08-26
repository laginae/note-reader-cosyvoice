# Publishing

This repository is published in the Obsidian Community directory as
`note-reader-cosyvoice`. Only the initial version needs a directory submission;
later versions are discovered from GitHub releases.

## Before Publishing

- Confirm the version is updated in both `manifest.json` and `versions.json`.
- Run the syntax and test checks documented in the repository.
- Confirm the local CosyVoice wrapper path in the README is only an example and not a personal path.
- Confirm `data.json`, API keys, temporary audio, logs, and local test files are not tracked or packaged.

## GitHub Release

Create a GitHub release whose tag exactly matches `manifest.json`:

```text
0.2.4
```

Attach these files as binary assets:

- `main.js`
- `manifest.json`
- `styles.css`

## Obsidian Community Directory Update

Do not submit this repository as a new plugin again. After the commit and matching
GitHub release are public, the Community directory checks for the new version
automatically. If an update is not reflected yet:

1. Go to `https://community.obsidian.md`.
2. Sign in with your Obsidian account.
3. Open the existing `note-reader-cosyvoice` entry.
4. Open the `...` menu and select `Check for new releases`.

Obsidian reads `manifest.json` and `README.md` from the default branch, and downloads install assets from the GitHub release tag matching the manifest version.
