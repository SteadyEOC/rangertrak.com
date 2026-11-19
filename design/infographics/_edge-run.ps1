# Dot-sourced by render.ps1 and render_one.ps1. A throwaway Edge profile in the repo's git-ignored
# .tmp folder, not %TEMP%: leftover profiles there slowed John's sign-in (2026-11-08).
# Call New-EdgeRun, do the work inside try, and call Remove-EdgeRun in finally.

function New-EdgeRun {
  $root = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.tmp'
  New-Item -ItemType Directory -Force $root | Out-Null
  # A hard kill skips the finally, so a new run clears what is over a day old.
  Get-ChildItem $root -Directory -Filter 'rt-render-*' |
    Where-Object LastWriteTime -lt (Get-Date).AddDays(-1) |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

  $prof = Join-Path $root ("rt-render-" + [DateTime]::Now.Ticks)
  $temp = Join-Path $prof '_temp'
  New-Item -ItemType Directory -Force $temp | Out-Null
  $run = @{ Profile = $prof; Temp = $temp; OldTemp = $env:TEMP; OldTmp = $env:TMP }
  # Edge also writes msedge_* folders to its own %TEMP%; these go when the profile goes.
  $env:TEMP = $temp; $env:TMP = $temp
  return $run
}

function Remove-EdgeRun($run) {
  $env:TEMP = $run.OldTemp; $env:TMP = $run.OldTmp
  # Edge's launcher exits before its children do, so there is no PID of ours to stop. The profile
  # name is unique to this run, so this cannot touch any other Edge.
  $leaf = Split-Path $run.Profile -Leaf
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*$leaf*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  for ($i = 0; $i -lt 40 -and (Test-Path -LiteralPath $run.Profile); $i++) {
    try { Remove-Item -LiteralPath $run.Profile -Recurse -Force -ErrorAction Stop }
    catch { Start-Sleep -Milliseconds 250 }
  }
  if (Test-Path -LiteralPath $run.Profile) { Write-Warning "could not delete temp folder $($run.Profile)" }
}
