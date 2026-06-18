# Note Reader CosyVoice

[中文说明](README.zh-CN.md)

An Obsidian desktop plugin that reads the current note or selected text through either a local CosyVoice TTS pipeline or an explicitly selected Microsoft Edge online voice mode.

## Screenshots

Reader control panel:

![CosyVoice Reader control panel](docs/images/reader-controls.png)

Plugin settings. The script path shown here is a redacted example:

![Note Reader CosyVoice settings](docs/images/plugin-settings.png)

## Features

- Reads the current note, current selection, or from the current selection start to the end of the note.
- Opens a right-side `CosyVoice Reader` control panel.
- Shows synthesis/playback phase, whole-reading progress, percentage, and text preview.
- Supports pause, resume, stop, Space to pause or resume in the control panel, repeated Left/Right Arrow 5-second seeking, previous/next chunk buttons, and progress dragging while the current audio chunk is playing.
- Provides right-panel speed presets: `1x`, `1.25x`, `1.5x`, `2x`, `1.1x`, `1.2x`, `1.3x`, and `1.4x`.
- Lets you choose `Local CosyVoice` or `Microsoft Edge online voice` in settings. Local CosyVoice is the default.
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

By default, the plugin uses local TTS. In `Local CosyVoice` mode, it does not send note text to Microsoft, OpenAI, or any remote TTS service. Text is written to a temporary file under the plugin cache and passed to the configured local CosyVoice wrapper.

If you select `Microsoft Edge online voice`, the plugin calls the `edge-tts` command-line tool and sends the chunk text to Microsoft Edge TTS. Use this mode only for notes whose text you are comfortable processing through that online service.

## Disclosures

- Network use: `Local CosyVoice` mode does not call a remote service directly. Your configured CosyVoice wrapper may talk to a local service such as `127.0.0.1`. `Microsoft Edge online voice` mode calls Microsoft Edge TTS through `edge-tts`.
- Shell execution: the plugin launches the PowerShell wrapper script in local mode, or the `edge-tts` command in Edge mode.
- Direct filesystem access: the plugin writes temporary text and audio files under this plugin's `cache` folder in the vault, checks the configured wrapper script in local mode, and can launch a wrapper stored outside the vault.
- Telemetry: the plugin does not include client-side or server-side telemetry.
- Updates: the plugin does not include a self-update mechanism.

## Requirements

- Obsidian desktop.
- For `Local CosyVoice`: a working local CosyVoice setup and a PowerShell wrapper compatible with:

```powershell
cosyvoice-wrapper.ps1 -InputPath <txt> -OutputPath <wav> -Speed <speed>
```

A recommended script path is:

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

For local CosyVoice installation, hardware guidance, OS-specific notes, and wrapper examples, see [Local CosyVoice setup](docs/local-cosyvoice-setup.md).

For `Microsoft Edge online voice`: install the `edge-tts` CLI and make sure the `edge-tts` command is on PATH. The plugin calls it with `--file`, `--write-media`, `--voice`, and `--rate`.

## Model Storage, Other TTS Engines, And Chunk Limits

This plugin does not download models. Plan storage for the local TTS runtime before installing a voice model:

- Current CosyVoice model repositories are often several GB each. As of 2026-06, public Hugging Face examples range from about `2.5 GB` for a 300M model to about `9 GB` for a 0.5B CosyVoice3 model.
- Reserve more than the raw model size. A practical starting point is `10-20 GB` for one model and `30 GB+` if you keep multiple models, source checkouts, Conda environments, and caches.
- Put model files and caches on a local SSD when possible. Avoid syncing model folders through cloud-drive clients.

The configured script can call another local TTS engine instead of CosyVoice if it follows the same wrapper contract: read UTF-8 text from `-InputPath`, write a valid WAV file to `-OutputPath`, accept `-Speed`, and exit non-zero with a clear error on failure. Check the other model's license, language coverage, audio format, speed controls, startup latency, and whether it sends text outside your machine or trusted local network.

`Microsoft Edge online voice` mode is separate from the local wrapper contract. It writes MP3 files with `edge-tts` and uses the `Edge TTS voice` setting, for example `zh-CN-XiaoxiaoNeural`.

Use `Chunk limits` to balance startup latency and synthesis stability:

- CPU-only or low-end GPU: start with `30,60,90,120,160,200`.
- Mid-range GPU: use the default `40,80,120,160,280,320`.
- Faster GPU or low-latency local service: try `80,140,220,320,480,640`.
- If synthesis times out, fails, or the first audio takes too long, lower the numbers. If speech sounds too fragmented and your model is stable, raise them gradually.

## Commands

- `Open CosyVoice reader controls`
- `Read current note with CosyVoice`
- `Read selection with CosyVoice`
- `Read from selection with CosyVoice`
- `Pause or resume CosyVoice reading`
- `Stop CosyVoice reading`

## Keyboard And Progress Seeking

When the `CosyVoice Reader` control panel is focused, Space pauses or resumes reading, and Left Arrow or Right Arrow seek backward or forward in 5-second steps while audio is available.

The triangle buttons beside the progress bar jump to the previous text chunk or the next text chunk. Already synthesized chunks are reused when possible; otherwise the target chunk is synthesized before playback.

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
