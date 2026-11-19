# Render one SVG to PNG at a given size with headless Edge.
#   .\render_one.ps1 bright-angel-radio.svg 1600 1300 [-Scale 2]
# The SVG is wrapped inline in an HTML page written NEXT TO it, so relative hrefs
# (map-base.png, fonts/) resolve; the wrapper is deleted afterwards.
param([string]$Svg, [int]$Width, [int]$Height, [double]$Scale = 1)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$svgPath = (Resolve-Path $Svg).Path
$dir = Split-Path $svgPath
$base = [IO.Path]::GetFileNameWithoutExtension($svgPath)
$png = Join-Path $dir "$base.png"
$html = Join-Path $dir "_$base.render.html"
Remove-Item $png -ErrorAction SilentlyContinue
"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body style='margin:0;overflow:hidden'>" + (Get-Content $svgPath -Raw -Encoding UTF8) + "</body></html>" | Set-Content $html -Encoding UTF8
. (Join-Path $PSScriptRoot '_edge-run.ps1')
$run = New-EdgeRun
try {
  $prof = $run.Profile
  & $edge --headless=new --disable-gpu --hide-scrollbars "--force-device-scale-factor=$Scale" "--user-data-dir=$prof" "--window-size=$Width,$Height" --virtual-time-budget=6000 "--screenshot=$png" ('file:///' + ($html -replace '\\', '/')) 2>$null | Out-Null
  for ($i = 0; $i -lt 80 -and -not (Test-Path $png); $i++) { Start-Sleep -Milliseconds 250 }
  Start-Sleep -Milliseconds 500
} finally {
  Remove-Item $html -ErrorAction SilentlyContinue
  Remove-EdgeRun $run
}
"rendered $base.png: $(Test-Path $png)"
