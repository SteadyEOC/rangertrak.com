# Renders every *.svg in this folder to a same-named 1200x675 PNG with headless Edge.
# Edge won't screenshot a bare .svg, so each is wrapped inline in a throwaway HTML page
# (inline, not <img>, so the SVG's own @font-face rules still load).
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$here = $PSScriptRoot
. (Join-Path $PSScriptRoot '_edge-run.ps1')
$run = New-EdgeRun
try {
  $prof = $run.Profile
  Get-ChildItem $here -Filter *.svg | ForEach-Object {
    $png = [IO.Path]::ChangeExtension($_.FullName, '.png'); Remove-Item $png -ErrorAction SilentlyContinue
    $html = Join-Path $run.Temp ($_.BaseName + '.render.html')
    "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body style='margin:0;overflow:hidden'>" + (Get-Content $_.FullName -Raw -Encoding UTF8) + "</body></html>" | Set-Content $html -Encoding UTF8
    $url = 'file:///' + ($html -replace '\\', '/')
    & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 "--user-data-dir=$prof" --window-size=1200,675 --virtual-time-budget=4000 "--screenshot=$png" $url 2>$null | Out-Null
    for ($i = 0; $i -lt 40 -and -not (Test-Path $png); $i++) { Start-Sleep -Milliseconds 250 }  # the launcher returns before Edge writes the file
    Start-Sleep -Milliseconds 400
    "rendered $($_.Name): $(Test-Path $png)"
  }
} finally {
  Remove-EdgeRun $run
}

