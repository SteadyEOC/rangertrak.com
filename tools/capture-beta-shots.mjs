// Captures the beta post's two Entry-page shots from the live app with the Vashon demo loaded, in a
// fresh headless Edge profile (no visible window), made-up data only, at 2x:
//   <out-dir>/beta-full-view.png  the top of Entry in Full view (switch, demo bar, a plum-edged field)
//   <out-dir>/aar-214-box.png     the AAR/214 dialog with an ICS-214 line typed in
// Usage: node tools/capture-beta-shots.mjs <out-dir>   (written 2026-10-28, from capture-map-sheet.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-beta-')
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
async function shot(file, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true })
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file, Math.round(clip.width * 2), 'x', Math.round(clip.height * 2))
}

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1286, height: 900, deviceScaleFactor: 2, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('rt-view', 'full');
    localStorage.setItem('rt-view-source', 'user') } catch {}` })
  await send('Page.navigate', { url: 'https://rangertrak.org/' })
  // Wait for the footer's version (a fixed 7 s wasn't always enough), then let the page settle.
  let version
  for (let i = 0; i < 60 && !version; i++) {
    await sleep(500)
    version = await evaluate(`(document.body?.innerText.match(/Version \\S+/) || [])[0]`)
  }
  console.log('version:', version)
  if (!version) throw new Error('app did not load')
  await sleep(2000)

  await evaluate(`document.querySelector('rangertrak-demo-picker mat-select')?.click()`); await sleep(800)
  console.log('picked:', await evaluate(`(() => { const o = [...document.querySelectorAll('mat-option')]
    .find((x) => x.textContent.includes('Vashon')); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await clickButton('/^(Load|Replace|Yes|OK|Continue)/i'); await sleep(6000)
  await evaluate(`scrollTo(0, 0)`); await sleep(500)
  // From just above the page heading (below the top nav bar) down, as the 10-26 shot.
  const top = await evaluate(`(() => { const h = [...document.querySelectorAll('h1, h2')].find((e) => /Radio Log Entry/.test(e.textContent))
    return Math.max(0, Math.round((h?.getBoundingClientRect().top || 4) + scrollY - 4)) })()`)
  console.log('strip top:', top)
  await shot('beta-full-view.png', { x: 0, y: top, width: 1286, height: 337 })

  // The AAR/214 dialog, set to an ICS-214 line, with the same made-up line as the 10-26 shot.
  console.log('opened:', await clickButton('/AAR\\/214/')); await sleep(1500)
  console.log('choices:', await evaluate(`[...document.querySelectorAll('mat-dialog-container mat-button-toggle')].map((t) => t.textContent.trim()).join(' | ')`))
  await evaluate(`[...document.querySelectorAll('mat-dialog-container mat-button-toggle button')].find((b) => /214/.test(b.textContent))?.click()`)
  await sleep(800)
  await evaluate(`(() => { const t = document.querySelector('mat-dialog-container textarea'); if (!t) return
    t.focus(); t.value = 'Shift change: relieved as net scribe by Ivy Loudhailer. Briefed on open Urgent at the park shed.'
    t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(800)
  const box = await evaluate(`(() => { const e = document.querySelector('mat-dialog-container .mat-mdc-dialog-surface, mat-dialog-container');
    const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } })()`)
  await shot('aar-214-box.png', box)
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
