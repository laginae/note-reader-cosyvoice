# Cozy Read Aloud 1.1.4

## Improvements and fixes

- Add context-aware pauses before and after omitted-formula announcements. Avoid duplicate punctuation and keep short-formula reading and disabled announcements unchanged.
- Apply PDF formula filtering to selected-text reading and selected-text audio export. Preserve the full selection rather than silently truncating it.
- Normalize mathematical Unicode letters for speech and keep PDF highlight matching aligned.
- Recognize ordinary-font absolute-value bars inside multi-line PDF formulas so complex fractions are omitted as a complete block.
- Parse bounded remote error responses into safe, predefined diagnostics without displaying echoed document text, credentials, or raw responses. A generic upstream HTTP 400 is not presented as proof of insufficient credit.
- Show concise Edge TTS errors and document helper version checks and HTTP 403 troubleshooting. Updating the plugin does not update a separately installed Edge TTS helper.

Privacy routing and saved settings remain unchanged. No automatic model switching or relaxation of ZDR requirements is introduced.

## Installation

Update Cozy Read Aloud from Obsidian's Community plugins settings, then reload the plugin or restart Obsidian. For manual installation, replace `main.js`, `manifest.json`, and `styles.css` with the attached files; preserve `data.json`.
