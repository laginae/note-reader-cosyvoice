# Installation

## Install From ZIP

1. Unzip `note-reader-cosyvoice-0.2.1-install.zip`.
2. Copy the `note-reader-cosyvoice` folder into your vault:

```text
<your-vault>/.obsidian/plugins/note-reader-cosyvoice
```

3. In Obsidian, open `Settings -> Community plugins`.
4. Turn off Restricted mode if required.
5. Enable `Note Reader CosyVoice`.
6. Run `Open CosyVoice reader controls` from the command palette, or click the ribbon icon.

## Choose Speech Engine

Open `Settings -> Note Reader CosyVoice` and choose `Speech engine`.

- `Local CosyVoice` is the default and uses your configured PowerShell wrapper.
- `Microsoft Edge online voice` calls the `edge-tts` command-line tool and sends text to Microsoft Edge TTS.

## Configure Local CosyVoice

Open `Settings -> Note Reader CosyVoice` and set `CosyVoice script` if your wrapper is not at:

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

The wrapper must accept:

```powershell
-InputPath <text-file> -OutputPath <wav-file> -Speed <number>
```

Use `Restore defaults` on the plugin settings page to reset all plugin settings to their default values and save them immediately.

`Restore defaults` clears the script path. Set `CosyVoice script` again before reading.

Use `Math reading language` to choose `English`, `Chinese`, or `Skip math` for short LaTeX formulas. Long formulas are skipped in all modes.

For a local CosyVoice setup guide and PowerShell wrapper examples, see `docs/local-cosyvoice-setup.md` in the source repository.

## Configure Microsoft Edge Online Voice

Install the `edge-tts` CLI and make sure the `edge-tts` command is on PATH before selecting `Microsoft Edge online voice`.

Set `Edge TTS voice` to the desired voice id. The default is:

```text
zh-CN-XiaoxiaoNeural
```

## Usage

- Select text and click `Read selection` to read only the selected text.
- Select a start point and click `Read from selection` to read from that selection start to the end of the active note.
- Click `Read note` to read the active note.
- Use `Pause`, `Resume`, and `Stop` from the right-side control panel.
- Use the right-side `Speed` buttons to select `1x`, `1.25x`, `1.5x`, `2x`, `1.1x`, `1.2x`, `1.3x`, or `1.4x`. The current audio keeps its original speed; later synthesized chunks use the newly saved speed.
- When the control panel is focused, Space pauses or resumes reading. Repeated Left Arrow or Right Arrow presses seek backward or forward in 5-second steps.
- Use the triangle buttons beside the progress bar to jump to the previous or next text chunk.
- The progress bar shows whole-reading progress. It can be clicked or dragged while the current audio chunk is playing; seeking is clamped to the currently loaded chunk.

## Troubleshooting

If reading fails, check:

```text
<your-vault>/.obsidian/plugins/note-reader-cosyvoice/last-error.log
```

For `Local CosyVoice`, also verify the local service:

```text
http://127.0.0.1:8765/health
```

For `Microsoft Edge online voice`, run `edge-tts --help` in PowerShell to confirm the command is installed and visible to Obsidian.

The first synthesis after starting the local model may take longer than later reads.
