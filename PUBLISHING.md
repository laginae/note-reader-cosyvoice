# Publishing

This repository is published in the Obsidian Community directory as
`note-reader-cosyvoice`. Only the initial version needs a directory submission;
later versions are discovered from GitHub releases.

## Before Publishing

- Confirm the version is updated in both `manifest.json` and `versions.json`.
- Run `npm test`; it rebuilds the root `main.js` and runs the complete test suite.
- Confirm the local CosyVoice wrapper path in the README is only an example and not a personal path.
- Confirm `data.json`, API keys, temporary audio, logs, and local test files are not tracked or packaged.
- Confirm the release assets are built from the tested commit and contain only `main.js`, `manifest.json`, and `styles.css`.

## GitHub Release

Create a GitHub release whose tag exactly matches `manifest.json`:

```text
0.8.2
```

Attach these files as binary assets:

- `main.js`
- `manifest.json`
- `styles.css`

## Verified Build Provenance

The `Verify and attest release assets` GitHub Actions workflow runs after a
release is published. It installs locked dependencies, rebuilds the plugin,
runs the tests, and compares SHA-256 hashes of all three release assets against
that build. It issues GitHub artifact attestations only if every file matches.
It never overwrites release assets or moves release tags.

For an existing release, run this workflow manually from the Actions tab on
the default branch. The version comes from `manifest.json`; all build inputs
must match that version's tag. A backfill attestation identifies the workflow
commit that reproduced the build, not a workflow run at the original tag.
No personal files, speech-service credentials, or local diagnostic data are
needed by the workflow. Do not add them as workflow secrets or artifacts.

If GitHub CLI creates a release using a workflow's `GITHUB_TOKEN`, GitHub may
not trigger another workflow from that event. Run the provenance workflow
manually in that case. A failed workflow must be investigated, never bypassed
by signing the downloaded binaries without rebuilding them.

Verify a downloaded asset with GitHub CLI:

```text
gh attestation verify main.js --repo laginae/note-reader-cosyvoice
gh attestation verify manifest.json --repo laginae/note-reader-cosyvoice
gh attestation verify styles.css --repo laginae/note-reader-cosyvoice
```

An attestation verifies build provenance, not absence of bugs or approval by
the Obsidian Community directory. Request a directory review separately.

## Obsidian Community Directory Update

Do not submit this repository as a new plugin again. After the commit and matching
GitHub release are public, the Community directory checks for the new version
automatically. If an update is not reflected yet:

1. Go to `https://community.obsidian.md`.
2. Sign in with your Obsidian account.
3. Open the existing `note-reader-cosyvoice` entry.
4. Open the `...` menu and select `Check for new releases`.

Obsidian reads `manifest.json` and `README.md` from the default branch, and downloads install assets from the GitHub release tag matching the manifest version.
