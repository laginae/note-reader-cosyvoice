param(
  [Parameter(Mandatory = $true)]
  [string] $InputPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath,

  [double] $Speed = 1.0
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Input file not found: $InputPath"
}

$text = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($text)) {
  throw 'Input text is empty.'
}

$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path -LiteralPath $outputDir)) {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

# Change this URL to match your local CosyVoice HTTP service.
# The endpoint is expected to return WAV bytes directly.
$url = if ($env:COSYVOICE_TTS_URL) { $env:COSYVOICE_TTS_URL } else { 'http://127.0.0.1:8765/tts' }

$payload = @{
  text = $text
  speed = $Speed
} | ConvertTo-Json -Depth 4

Invoke-WebRequest `
  -Uri $url `
  -Method POST `
  -ContentType 'application/json; charset=utf-8' `
  -Body $payload `
  -OutFile $OutputPath

$file = Get-Item -LiteralPath $OutputPath
if ($file.Length -le 44) {
  throw "The local CosyVoice service returned an invalid WAV file: $($file.Length) bytes."
}
