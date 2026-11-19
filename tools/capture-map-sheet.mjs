// Captures the printed map sheet (Map > Print map) from the live app with a demo loaded, in a
// fresh headless Edge profile (no visible window), made-up data only. Writes <out-dir>/map-sheet.png
// (Letter landscape's printable area at 1.5x, 1470 x 1088), for public/img/guide/map-sheet-vashon.jpg.
// Usage: node tools/capture-map-sheet.mjs <out-dir> [scenario]   (scenario: vashon by default)
// Written 2026-10-18. How: window.print is made to throw, so Print map leaves its print state in
// place (body class, page CSS, sharp tiles); Page.printToPDF then fires beforeprint and print media.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'map-sheet')
const SCENARIO = process.argv[3] || 'vashon'
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-mapsheet-')
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// Same cleanup as capture-roster.mjs: kill the Edge tree, then retry the delete, even on Ctrl+C.
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  // The tree kill misses processes Edge re-parents (21 left on 10-28): kill any Edge naming this profile.
  try { spawnSync('pwsh', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object CommandLine -like '*${path.basename(profile)}*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`],
    { stdio: 'ignore' }) } catch {}
  for (let i = 0; ; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break }
    catch (e) { if (i === 60) { console.error('could not remove', profile, e.code); break } }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const pending = new Map()
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params }))
  return new Promise((resolve) => pending.set(m, resolve)) }
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value
const clickButton = (re) => evaluate(`(() => { const b = [...document.querySelectorAll('button')]
  .find((x) => ${re}.test(x.textContent.trim()) && !x.disabled); if (!b) return false; b.click(); return true })()`)

try {
  let target
  for (let i = 0; i < 160 && !target; i++) {
    await sleep(250)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page') } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id) }
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true })
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  // Full view, as a user chose it, before the app reads its settings.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('rt-view', 'full');
    localStorage.setItem('rt-view-source', 'user') } catch {}` })
  await send('Page.navigate', { url: 'https://rangertrak.org/' })
  await sleep(7000)
  console.log('version:', await evaluate(`(document.body.innerText.match(/Version \\S+/) || [])[0]`))
  console.log('timezone:', await evaluate(`Intl.DateTimeFormat().resolvedOptions().timeZone`))

  // Load the demo from the Entry page's picker: open the select, pick the scenario's option.
  const label = { 'grand-canyon': 'Grand Canyon', vashon: 'Vashon', 'state-fair': 'State fair', montecito: 'Montecito' }[SCENARIO]
  await evaluate(`document.querySelector('rangertrak-demo-picker mat-select')?.click()`); await sleep(800)
  console.log('picked:', await evaluate(`(() => { const o = [...document.querySelectorAll('mat-option')]
    .find((x) => x.textContent.includes(${JSON.stringify(label)})); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await clickButton('/^(Load|Replace|Yes|OK|Continue)/i'); await sleep(4000)

  await send('Page.navigate', { url: 'https://rangertrak.org/map' })
  await sleep(9000)
  // As the 10-16 sheet: USNG grid, DDM edge ticks, a made-up "Prepared by".
  console.log('settings:', await evaluate(`(() => {
    const grid = [...document.querySelectorAll('label')].find((l) => /USNG \\/ MGRS grid/.test(l.textContent))
    const box = grid?.querySelector('input'); if (box && !box.checked) box.click()
    const ddm = [...document.querySelectorAll('mat-button-toggle button')].find((b) => b.textContent.trim() === 'DDM'); ddm?.click()
    const by = [...document.querySelectorAll('label')].find((l) => /Prepared by/.test(l.textContent))?.querySelector('input')
    if (by) { by.value = 'Morgan Ridgeway'; by.dispatchEvent(new Event('input', { bubbles: true })) }
    return [!!box, !!ddm, !!by] })()`))
  // 0.99.89 prints the page's Full view switch above the map (noted for the code session); hide it here.
  await evaluate(`(() => { const s = document.createElement('style');
    s.textContent = '@media print { rangertrak-view-switch, .cdk-overlay-container { display: none !important } }'; document.head.append(s) })()`)
  await sleep(4000)
  // Letter landscape's printable area (980 x 725 CSS px, as print-map-sheet.js), before Print map lays it out.
  await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 725, deviceScaleFactor: 1.5, mobile: false })
  await sleep(1500)
  await evaluate(`window.print = () => { throw new Error('capture') }`)
  await evaluate(`document.querySelector('[data-testid=printMap]')?.click()`)
  await sleep(20000) // sharp tiles (8 s left OpenTopoMap blank on 10-28)
  console.log('print state:', await evaluate(`document.body.classList.contains('rt-print-map')`))
  console.log('filtered line:', await evaluate(`(document.body.innerText.match(/Filtered:[^\\n]*/) || ['none'])[0]`))
  // Page.printToPDF hangs on live 0.99.58 (here and in print-map-sheet.js), so: print media + a screenshot.
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  await sleep(3000)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, 'map-sheet.png'), Buffer.from(r.data, 'base64'))
  console.log('wrote map-sheet.png')
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
