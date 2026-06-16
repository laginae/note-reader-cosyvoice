# Note Reader CosyVoice

An Obsidian desktop plugin that reads the current note or selected text through a local CosyVoice TTS pipeline.

## Features

- Reads the current note, current selection, or from the current selection start to the end of the note.
- Opens a right-side `CosyVoice Reader` control panel.
- Shows synthesis/playback phase, whole-reading progress, percentage, and text preview.
- Supports pause, resume, stop, and progress dragging while the current audio chunk is playing.
- Provides right-panel speed presets: `1x`, `1.25x`, `1.5x`, and `2x`.
- Uses a local PowerShell wrapper script instead of a cloud TTS service.
- Cleans Markdown before synthesis.
- Provides a settings-page `Restore defaults` button for resetting all plugin settings.
- Handles common LaTeX before synthesis with a configurable `Math reading language` setting:
  - Skips formulas longer than 12 non-space characters.
  - `English` is the default for public releases, for example `$a_b$` -> `a subscript b`.
  - `Chinese` keeps Chinese math words, for example `$a_b$` -> `a 下标 b`.
  - `Skip math` skips short formulas as well as long formulas.
  - Leaves common Greek commands as English names, such as `\alpha` -> `alpha`, `\beta` -> `beta`, and `\pi` -> `pi`.
  - Reads common non-Greek symbols such as `\leq`, `\times`, and `_`.
  - Unwraps style commands such as `\textbf{...}`, `\mathbf{...}`, and `\boldsymbol{...}`.
  - Reads short `\frac{a}{b}` as `a over b` in English mode or `a 分之 b` in Chinese mode.

## Privacy

The plugin is designed for local TTS. It does not send note text to Microsoft, OpenAI, or any remote TTS service. Text is written to a temporary file under the plugin cache and passed to the configured local CosyVoice wrapper.

## Disclosures

- Network use: the plugin itself does not call any remote service. Your configured CosyVoice wrapper may talk to a local service such as `127.0.0.1`.
- Shell execution: the plugin launches the PowerShell wrapper script that you configure in settings. This is required to call a local TTS runtime.
- Direct filesystem access: the plugin writes temporary text and WAV files under this plugin's `cache` folder in the vault, checks that the configured wrapper script exists, and can launch a wrapper stored outside the vault.
- Telemetry: the plugin does not include client-side or server-side telemetry.
- Updates: the plugin does not include a self-update mechanism.

## Requirements

- Obsidian desktop.
- A working local CosyVoice setup.
- A PowerShell wrapper compatible with:

```powershell
cosyvoice-wrapper.ps1 -InputPath <txt> -OutputPath <wav> -Speed <speed>
```

A recommended script path is:

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

For local CosyVoice installation, hardware guidance, OS-specific notes, and wrapper examples, see [Local CosyVoice setup](docs/local-cosyvoice-setup.md).

## Commands

- `Open CosyVoice reader controls`
- `Read current note with CosyVoice`
- `Read selection with CosyVoice`
- `Read from selection with CosyVoice`
- `Pause or resume CosyVoice reading`
- `Stop CosyVoice reading`

## Progress Seeking

The progress bar shows whole-reading progress across all chunks. While audio is playing, the bar can be clicked or dragged. Seeking is limited to the currently loaded audio chunk; dragging outside that chunk is clamped to the nearest point in the current chunk.

## Shared Package Contents

The install package contains only:

- `manifest.json`
- `main.js`
- `styles.css`
- `README.md`
- `INSTALL.md`
- `LICENSE`

It intentionally excludes `data.json`, `cache`, `last-error.log`, and local test files.

## License

MIT.
