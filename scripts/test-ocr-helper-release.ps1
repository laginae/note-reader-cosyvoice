param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$folder = Join-Path $PSScriptRoot '../dist/helper-public-fixture'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(1000, 320)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = [System.Drawing.Font]::new('Arial', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$locked = $null
try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $lines = @('Public Library Reading Room', 'The library opens at nine in the morning.', 'Readers can choose books and newspapers.')
    for ($i=0; $i -lt $lines.Length; $i++) {
        $graphics.DrawString($lines[$i], $font, [System.Drawing.Brushes]::Black, 40, (40 + 80*$i))
    }
    $locked = $bitmap.LockBits([System.Drawing.Rectangle]::new(0,0,1000,320), [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    if ($locked.Stride -ne 3000) { throw 'Unexpected public fixture stride' }
    $rgb = [byte[]]::new(1000*320*3)
    [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $rgb, 0, $rgb.Length)
    for ($i=0; $i -lt $rgb.Length; $i+=3) { $r=$rgb[$i]; $rgb[$i]=$rgb[$i+2]; $rgb[$i+2]=$r }
    [System.IO.File]::WriteAllBytes((Join-Path $folder 'public-library.rgb'), $rgb)
    @{provenance='Original generic text authored for this test';cases=@(@{id='public-library';width=1000;height=320})} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $folder 'manifest.json') -Encoding utf8
} finally {
    if ($locked) { $bitmap.UnlockBits($locked) }
    $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
node (Join-Path $PSScriptRoot 'test-ocr-helper.cjs') $Executable $folder --release-smoke
if ($LASTEXITCODE -ne 0) { throw 'Public helper recognition failed' }
