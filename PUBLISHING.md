# Publishing

This repository is prepared for public GitHub publishing and Obsidian Community Plugin submission.

## Before Publishing

- Replace `author` in `manifest.json` with your GitHub username, organization, or preferred public name.
- Review `LICENSE`. The current draft uses MIT.
- Confirm the `id` is unique in the Obsidian Community Plugins directory.
- Confirm the local CosyVoice wrapper path in the README is only an example and not a personal path.

## GitHub Release

Create a GitHub release whose tag exactly matches `manifest.json`:

```text
0.1.9
```

Attach these files as binary assets:

- `main.js`
- `manifest.json`
- `styles.css`

## Obsidian Community Directory

After the GitHub repository and release exist:

1. Go to `https://community.obsidian.md`.
2. Sign in with your Obsidian account.
3. Link the GitHub account that owns this repository.
4. Select `Plugins`, then `New plugin`.
5. Submit the GitHub repository URL.

Obsidian reads `manifest.json` and `README.md` from the default branch, and downloads install assets from the GitHub release tag matching the manifest version.
