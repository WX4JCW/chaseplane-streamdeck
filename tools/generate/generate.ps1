<#
.SYNOPSIS
    Regenerate the SimDeck camera folders from ChasePlane's live views.

.DESCRIPTION
    Runs the three generator steps in order and stops at the first failure:
      1. plan.mjs   - reads ChasePlane's views (ChasePlane must be running)
      2. render.py  - draws key and folder images and previews (tools\generate\out)
      3. write.cjs  - backs up the profile, then writes the folders into SimDeck
    Stream Deck must be quit (from the tray) before step 3; the script waits for that.

.PARAMETER DryRun
    Plan and render, then show what would be written without writing anything.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\generate\generate.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\generate\generate.ps1 -DryRun
#>
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

function Step($label, [scriptblock]$run) {
    Write-Host "`n== $label" -ForegroundColor Cyan
    & $run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Stopped: $label failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Step "1/3 Plan from ChasePlane" { node tools/generate/plan.mjs }
Step "2/3 Render images" { python tools/generate/render.py }

if ($DryRun) {
    Step "3/3 Write (dry run)" { node tools/generate/write.cjs --dry-run }
    Write-Host "`nDry run only. Previews: tools\generate\out\preview_*.png" -ForegroundColor Yellow
    exit 0
}

if (Get-Process -Name "StreamDeck" -ErrorAction SilentlyContinue) {
    Write-Host "`nStream Deck is running. Quit it from the tray icon (right-click, Quit)..." -ForegroundColor Yellow
    while (Get-Process -Name "StreamDeck" -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2 }
    Write-Host "Stream Deck closed." -ForegroundColor Green
}

Step "3/3 Write to SimDeck" { node tools/generate/write.cjs }
Write-Host "`nDone. Start Stream Deck again to see the folders." -ForegroundColor Green
