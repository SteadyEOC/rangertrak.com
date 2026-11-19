# Render og-rangertrak.html to public/assets/og-rangertrak.png (1200x630) with headless Edge.
#   pwsh -File design\og\render.ps1 [-Out <png>]
# Uses the throwaway, self-cleaning Edge profile from design\infographics\_edge-run.ps1.
param([string]$Out = (Join-Path $PSScriptRoot '..\..\public\assets\og-rangertrak.png'))
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$html = (Resolve-Path (Join-Path $PSScriptRoot 'og-rangertrak.html')).Path
$png = [IO.Path]::GetFullPath($Out)
Remove-Item $png -ErrorAction SilentlyContinue
. (Join-Path $PSScriptRoot '..\infographics\_edge-run.ps1')
$run = New-EdgeRun
try {
  & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 "--user-data-dir=$($run.Profile)" --window-size=1200,630 --virtual-time-budget=3000 "--screenshot=$png" ('file:///' + ($html -replace '\\', '/')) 2>$null | Out-Null
  for ($i = 0; $i -lt 80 -and -not (Test-Path $png); $i++) { Start-Sleep -Milliseconds 250 }
  Start-Sleep -Milliseconds 500
} finally {
  Remove-EdgeRun $run
}
"rendered ${png}: $(Test-Path $png)"
