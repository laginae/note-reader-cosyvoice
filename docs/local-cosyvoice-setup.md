# Local CosyVoice Setup

This plugin does not bundle CosyVoice or a voice model. It calls a local PowerShell wrapper script. The wrapper is responsible for sending text to your local CosyVoice runtime and writing a WAV file.

## Required Wrapper Contract

The configured PowerShell script must accept:

```powershell
cosyvoice-wrapper.ps1 -InputPath <text-file> -OutputPath <wav-file> -Speed <number>
```

The script must:

- Read UTF-8 text from `InputPath`.
- Generate speech with your local CosyVoice runtime.
- Write a valid WAV file to `OutputPath`.
- Exit with code `0` on success.
- Print or throw a clear error on failure.

The plugin passes `Speed` to the wrapper. Your wrapper or local service may use it directly, ignore it, or map it to model-specific speed controls.

## Recommended File Location

The plugin does not auto-detect this path because community review tools warn on identity-related environment variable reads. A recommended location is:

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

You can use any path. Configure it in `Settings -> Note Reader CosyVoice -> CosyVoice script`.

## Install CosyVoice Locally

CosyVoice changes over time, so follow the official project for current model and runtime details:

- CosyVoice repository: `https://github.com/FunAudioLLM/CosyVoice`
- Official install guide: `https://github.com/FunAudioLLM/CosyVoice#install`
- Official FastAPI runtime: `https://github.com/FunAudioLLM/CosyVoice/tree/main/runtime/python/fastapi`

A typical Linux or WSL2 setup follows this shape:

```bash
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive

conda create -n cosyvoice -y python=3.10
conda activate cosyvoice
pip install -r requirements.txt
```

Then download a pretrained model following the upstream README. For service deployment, the upstream project includes a FastAPI runtime under `runtime/python/fastapi`.

## Wrapper Option A: Local HTTP Service

If your CosyVoice runtime exposes a local HTTP endpoint that returns WAV bytes, copy:

```text
scripts/cosyvoice-wrapper.http.example.ps1
```

to:

```text
%LOCALAPPDATA%\note-reader-cosyvoice\cosyvoice-wrapper.ps1
```

Then edit the `$url` in the script, or set:

```powershell
$env:COSYVOICE_TTS_URL = 'http://127.0.0.1:8765/tts'
```

The example sends JSON:

```json
{
  "text": "text to synthesize",
  "speed": 1.25
}
```

and expects the endpoint response body to be WAV bytes. If your service uses a different route, request shape, or response format, adapt the script.

## Wrapper Option B: Official FastAPI Runtime

The upstream CosyVoice FastAPI client currently uses routes such as:

```text
http://<host>:<port>/inference_sft
http://<host>:<port>/inference_zero_shot
http://<host>:<port>/inference_cross_lingual
http://<host>:<port>/inference_instruct
```

If you use the official runtime directly, your wrapper can either:

- Call the official Python client from PowerShell and pass `--tts_wav <OutputPath>`.
- Implement the same HTTP request in PowerShell and save the returned audio.
- Add your own small local adapter endpoint, such as `/tts`, that accepts `text` and `speed` and returns WAV bytes.

For Obsidian use, the adapter endpoint is usually the cleanest option because the plugin only needs one stable wrapper contract.

## Quick Wrapper Test

Before using the plugin, test the wrapper from PowerShell:

```powershell
$dir = "$env:TEMP\note-reader-cosyvoice-test"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$input = Join-Path $dir 'input.txt'
$output = Join-Path $dir 'output.wav'
Set-Content -LiteralPath $input -Encoding UTF8 -Value 'This is a local CosyVoice test.'

& "$env:LOCALAPPDATA\note-reader-cosyvoice\cosyvoice-wrapper.ps1" `
  -InputPath $input `
  -OutputPath $output `
  -Speed 1

Get-Item -LiteralPath $output
```

The output file should exist and be larger than a WAV header.

## Troubleshooting

- `script not found`: Check the path in the plugin settings.
- `invalid WAV file`: The wrapper did not write usable WAV bytes to `OutputPath`.
- Synthesis is slow on the first run: local model startup and first inference can be slower than later requests.
- Speed buttons have no effect: your wrapper or local service is ignoring the `Speed` parameter.
