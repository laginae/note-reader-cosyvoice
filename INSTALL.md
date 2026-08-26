# Installation

## Install From ZIP

1. Unzip `note-reader-cosyvoice-0.3.1-install.zip`.
2. Copy the `note-reader-cosyvoice` folder into your vault:

```text
<your-vault>/.obsidian/plugins/note-reader-cosyvoice
```

3. In Obsidian, open `Settings -> Community plugins`.
4. Turn off Restricted mode if required.
5. Enable `Note and PDF Voice Reader`.
6. Run `Open voice reader controls` from the command palette, or click the ribbon icon.

## Choose Speech Engine

Open `Settings -> Note and PDF Voice Reader` and choose `Speech engine`.

- `Local CosyVoice` is the default and uses your configured PowerShell wrapper.
- `Microsoft Edge online voice` calls the configured `edge-tts` command-line tool and sends text to Microsoft Edge TTS after explicit consent. Its default voice is UK English male `en-GB-RyanNeural`.
- `Microsoft Azure Speech` sends text by HTTPS to your selected Azure Speech cloud and region after separate explicit consent. Its default voice is UK English male `en-GB-RyanNeural`.
- `OpenRouter TTS` sends text to OpenRouter and an eligible upstream TTS provider after separate explicit consent. Its default model and voice are `hexgrad/kokoro-82m` and UK English male `bm_george`.

On Obsidian 1.11.4 or later, Azure and OpenRouter use Obsidian SecretStorage by default. The plugin stores only the selected secret identifier in `data.json`, not the key value. An external one-line key file outside every vault remains available for older Obsidian versions and existing configurations. Obsidian documents SecretStorage as vault-specific local secret storage, not as a guaranteed operating-system keychain integration. See the [official SecretStorage guide](https://docs.obsidian.md/plugins/guides/secret-storage).

## Configure Local CosyVoice

Open `Settings -> Note and PDF Voice Reader` and set `CosyVoice script` if your wrapper is not at:

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

[`edge-tts`](https://github.com/rany2/edge-tts) is a third-party Python package published on [PyPI](https://pypi.org/project/edge-tts/) that calls Microsoft Edge's online text-to-speech service. It is not bundled with this plugin and is not a local voice model.

Recommended command-line-only install:

```powershell
pipx install edge-tts
```

If `pipx` is not installed yet:

```powershell
py -m pip install --user pipx
py -m pipx ensurepath
```

Then open a new PowerShell window and run `pipx install edge-tts`.

Alternative install if you manage Python packages directly:

```powershell
py -m pip install --user edge-tts
```

After installation, open a new PowerShell window and verify that the command is available:

```powershell
edge-tts --help
```

To list available voices:

```powershell
edge-tts --list-voices
```

In the plugin settings, enable `Allow Edge online processing`, set `Edge TTS executable` to the command name or its absolute path, and choose a voice preset or custom voice ID. The default voice is:

```text
en-GB-RyanNeural
```

If Obsidian cannot find `edge-tts`, enter its absolute executable path and fully restart Obsidian. Do not depend on an unrelated application's private virtual environment unless you intentionally trust and maintain it.

Privacy note: Edge mode sends each text chunk to Microsoft Edge TTS. Use `Local CosyVoice` for private or sensitive notes.

## Configure Microsoft Azure Speech

Create a Speech resource in Azure public cloud or Azure China operated by 21Vianet. Prefer the default `Obsidian SecretStorage` option and create or select a secret containing the subscription key. If you select the external key-file fallback, use a plain-text file outside every Obsidian vault, for example:

```text
C:\Users\you\AppData\Local\note-reader-cosyvoice\azure-speech-key.txt
```

Do not sync, commit, or share that file. In the plugin settings:

1. Select `Microsoft Azure Speech`.
2. Enable `Allow Azure online processing`.
3. Select the cloud that owns the Speech resource.
4. Enter the Speech resource region.
5. Select/create the Azure key secret, or enter the absolute path when using the external key-file fallback.
6. Select a common voice preset or enter a custom Azure voice ID.

The selectable presets include Mandarin Chinese female and male voices, Cantonese, Taiwanese Mandarin, common US English voices (`Jenny`, `Guy`, and `Aria`), and common UK English voices (`Sonia` and `Ryan`). Availability depends on the selected Azure region. The endpoint is derived from the selected cloud and validated region rather than accepting a free-form URL. See the official [Azure text-to-speech REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech), [voice list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support), [sovereign cloud endpoints](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/sovereign-clouds), and [privacy documentation](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security).

## Configure OpenRouter TTS

Create a dedicated key in [OpenRouter API Keys](https://openrouter.ai/settings/keys). Set a low spending limit and an expiration date where appropriate. Prefer the default `Obsidian SecretStorage` option and create or select a secret containing the key. If you select the external key-file fallback, use a plain-text file outside every Obsidian vault, for example:

```text
C:\Users\you\AppData\Local\note-reader-cosyvoice\openrouter-api-key.txt
```

Do not sync, commit, or share that file. In the plugin settings:

1. Select `OpenRouter TTS`.
2. Enable `Allow OpenRouter online processing`.
3. Select/create the OpenRouter key secret, or enter the absolute path when using the external key-file fallback.
4. Select a built-in ZDR-compatible model and one of its voices, or enter custom IDs.
5. Keep account-level input/output logging and input/output data sharing disabled.

The consent switch permits online transmission; it does not permit non-ZDR routing. Voice menus follow the selected model because voice IDs are not interchangeable. The two MAI models currently expose all four available voices; Gemini exposes 12 curated multilingual style presets from its 30 listed voices; and Kokoro exposes 12 presets covering Chinese, US English, and UK English female and male voices. MAI cannot safely offer six presets because OpenRouter currently documents only four accepted voice IDs. These catalogs were checked against OpenRouter's speech plus ZDR filter on 2026-08-26.

The key value is never saved in the plugin's `data.json`. Every request enforces `provider.zdr: true` and `provider.data_collection: "deny"`; synthesis fails if no eligible endpoint satisfies those restrictions. Model and voice availability changes over time, so check the live [`speech + ZDR` model API](https://openrouter.ai/api/v1/models?output_modalities=speech&zdr=true) when a preset stops working. See the official [OpenRouter TTS documentation](https://openrouter.ai/docs/guides/overview/multimodal/tts), [data collection documentation](https://openrouter.ai/docs/guides/privacy/data-collection), and [Zero Data Retention documentation](https://openrouter.ai/docs/guides/features/zdr).

Temporary gateway, rate-limit, and network failures are retried up to three total attempts with short bounded delays. Credential, model, voice, privacy-policy, and malformed-request errors are not retried. A final `HTTP 502` means OpenRouter or its upstream provider remained unavailable after those attempts; it does not normally indicate an unsupported character. Short LaTeX absolute-value notation such as `$|Y_{k,h}|$` is converted to spoken text before transmission.

For Edge, Azure, and OpenRouter, `Online chunk limits` defaults to `200,400,800` for both notes and PDFs. `Online synthesis prefetch` defaults to `1`, so the next chunk may be prepared while the current chunk is playing. Prefetch remains capped at one future chunk; set it to `0` for strict on-demand synthesis.

## Temporary Data

Temporary text and audio are stored under the operating system temporary directory rather than inside the vault. Keep `Clean temporary audio` enabled to remove plaintext immediately after synthesis, remove session files after reading, and clear stale plugin-owned files at startup. `Diagnostic logging` is off by default. Use `Clear temporary data` in settings to stop reading and remove current plus legacy plugin temporary data.

## Usage

- Select text and click `Read selection` to read only the selected text.
- Select a start point and click `Read from selection` to read from that selection start to the end of the active note.
- Click `Read file` to read the active Markdown note or searchable PDF.
- PDF text is extracted locally and progressively through Obsidian's built-in PDF.js. Playback can start once the first speech chunk is ready while later pages continue parsing. Scanned or image-only PDFs require OCR first, and complex multi-column reading order depends on the text order embedded in the PDF.
- Use `Pause`, `Resume`, and `Stop` from the right-side control panel.
- Use the right-side `Speed` buttons to select `1x`, `1.25x`, `1.5x`, `2x`, `1.1x`, `1.2x`, `1.3x`, or `1.4x`. The current audio keeps its original speed; later synthesized chunks use the newly saved speed.
- When the control panel is focused, Space pauses or resumes reading. Repeated Left Arrow or Right Arrow presses seek backward or forward in 5-second steps.
- Use the triangle buttons beside the progress bar to jump to the previous or next text chunk.
- The progress bar shows whole-reading progress. It can be clicked or dragged while the current audio chunk is playing; seeking is clamped to the currently loaded chunk.

## Troubleshooting

If reading fails, first check the Obsidian notice and the selected engine's configuration. For a PDF, confirm that it contains selectable text, is not password-protected, and is not damaged. Optional diagnostic logging records only bounded failure metadata in the plugin's operating-system temporary directory; it does not record note or PDF text or process output.

For `Local CosyVoice`, also verify the local service:

```text
http://127.0.0.1:8765/health
```

For `Microsoft Edge online voice`, run `edge-tts --help` in PowerShell to confirm the command is installed and visible to Obsidian.

For `Microsoft Azure Speech`, verify the selected cloud, region, selected SecretStorage entry or external key-file path, resource status, quota, and voice ID.

For `OpenRouter TTS`, verify the selected SecretStorage entry or external key-file path, account balance, model, and voice. An error about no eligible endpoint means that the selected model currently has no provider satisfying the enforced privacy routing policy. A `502` is a temporary bad-gateway response; retry later or select another compatible model if all automatic attempts fail.

The first synthesis after starting the local model may take longer than later reads.
