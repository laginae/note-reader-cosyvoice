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

## Hardware Recommendations

This plugin only controls text preparation and playback. Hardware requirements are determined by your local CosyVoice runtime, model size, and serving method.

- CPU-only: suitable for smoke tests and short clips, but expect slow synthesis.
- NVIDIA GPU: recommended for regular note reading, especially long notes or repeated use.
- GPU memory: use the smallest model that meets your quality needs if VRAM is limited. Larger models and concurrent requests need more VRAM.
- System memory: leave enough RAM for the model runtime, Python environment, and Obsidian running at the same time.
- Storage: model files can be large. Put model caches on a fast local SSD when possible.

Always check the upstream CosyVoice README for current model-specific requirements before publishing a setup guide for others.

## Storage Planning

The plugin does not download model files, but users still need enough local storage for the model runtime. Model sizes change over time, so check the model page's file list before download.

Current public Hugging Face examples, checked in 2026-06:

- [`FunAudioLLM/CosyVoice-300M`](https://huggingface.co/FunAudioLLM/CosyVoice-300M): about `2.5 GB` of model repository files.
- [`FunAudioLLM/CosyVoice2-0.5B`](https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B): about `4.6 GB` of model repository files.
- [`FunAudioLLM/Fun-CosyVoice3-0.5B-2512`](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512): about `9.1 GB` of model repository files.

Use those only as examples, not as fixed requirements. Real disk usage can be higher because of Git LFS pointers, download caches, Conda environments, Python wheels, source checkouts, logs, and multiple model copies.

Practical starting points:

- One small test model: reserve at least `10 GB`.
- One regular-use model plus a Conda or Python environment: reserve `15-25 GB`.
- Multiple models, experimental checkpoints, or both Hugging Face and ModelScope caches: reserve `30-50 GB+`.
- Shared workstation or server with several voices and checkpoints: reserve `50 GB+` and monitor cache growth.

Avoid placing model directories in cloud-sync folders. Large model files can cause slow sync, duplicate storage, partial downloads, or accidental sharing.

## System Recommendations

- Linux: the simplest deployment target for CosyVoice. Use Conda, CUDA, and the upstream runtime directly.
- Windows with NVIDIA GPU: WSL2 is recommended for the CosyVoice runtime. Keep the plugin and PowerShell wrapper on Windows, and let the wrapper call a local HTTP service exposed by WSL2.
- Windows without NVIDIA GPU: use CPU mode only for testing, or run CosyVoice on another machine and point the wrapper to that local-network service.
- macOS: upstream CosyVoice support is more Linux/CUDA-oriented. For reliable use, run CosyVoice on a Linux machine or server and call it through a local or LAN HTTP adapter.

## Model And Runtime Recommendations

- Start with the official CosyVoice examples before wiring the plugin.
- Prefer a local HTTP adapter that accepts text and returns WAV bytes. It keeps the plugin wrapper simple and stable.
- Keep model choice separate from the plugin. You can change models in your CosyVoice service without changing this plugin as long as the wrapper contract remains the same.
- If you expose a LAN service, bind it only to trusted interfaces and avoid exposing it directly to the public internet.

## Using A Different Local TTS Engine

The plugin UI and settings use the CosyVoice name, but the runtime boundary is the wrapper script. You can connect another local TTS engine if the wrapper keeps the same command-line contract:

```powershell
custom-tts-wrapper.ps1 -InputPath <text-file> -OutputPath <wav-file> -Speed <number>
```

The wrapper should:

- Convert the plugin's UTF-8 text input into whatever request format the model needs.
- Save a playable WAV file at `OutputPath`. If the model returns MP3, FLAC, or raw PCM, convert it before returning.
- Map `Speed` to the model's own speed or duration control, or document that speed is ignored.
- Keep voice, speaker, prompt, language, and sampling settings inside the wrapper or local service config.
- Return a non-zero exit code and a clear message if the model server is unavailable or synthesis fails.

Before sharing a wrapper for another model, check:

- License: whether the model permits your intended personal, academic, or commercial use.
- Privacy: whether text stays on the local machine or trusted LAN.
- Language quality: whether the model handles your note language, formulas, punctuation, and mixed Chinese/English text.
- Latency: whether the model can synthesize each chunk quickly enough for interactive reading.
- Stability: whether long requests fail, truncate output, or return unsupported audio formats.

If the engine exposes an HTTP API, the simplest pattern is still a small PowerShell wrapper that sends `{ "text": "...", "speed": 1.25 }` to a local endpoint and writes WAV bytes to `OutputPath`.

## Chunk Limits By Hardware

`Chunk limits` is a comma-separated list of character limits. The first chunks are intentionally smaller so playback can start sooner. After the list is exhausted, the last number is reused for the remaining text.

Smaller chunks:

- Start playback sooner.
- Reduce per-request memory and timeout risk.
- Create more HTTP or model calls.
- Can sound less continuous.

Larger chunks:

- Can improve sentence continuity and reduce request overhead.
- Increase the first-play delay.
- Increase the chance of timeout, truncation, or failed synthesis on weaker hardware.

Suggested starting values:

- CPU-only or low-end GPU: `30,60,90,120,160,200`.
- Mid-range GPU: `40,80,120,160,280,320`.
- Faster GPU or very stable local service: `80,140,220,320,480,640`.
- Remote workstation on a trusted LAN: start with the mid-range values, then increase only if network and synthesis latency are stable.

Tune in small steps. If the first audio arrives too slowly, lower the first two numbers. If later chunks fail, lower the later numbers. If playback is stable but sounds too fragmented, raise the later numbers first.

A typical Linux or WSL2 source setup follows this shape:

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
