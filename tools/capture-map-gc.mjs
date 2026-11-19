// Re-takes the Grand Canyon Map page shots (about, Part 2, press) from the live app, headless Edge,
// fresh profile (no visible window), made-up demo data only, at 2x:
//   <out-dir>/map-gc.png        the map and the offline-save lines under it (about, Part 2)
//   <out-dir>/map-gc-page.png   the whole Map page (press copy)
// Usage: node tools/capture-map-gc.mjs <out-dir>   (written 2026-11-09, from capture-beta2-shots.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-mapgc-')
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
    .find((x) => /Grand Canyon/i.test(x.textContent)); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await clickButton('/^(Load|Replace|Yes|OK|Continue)/i'); await sleep(6000)
  const timed = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ' timed out') })])

  await send('Page.navigate', { url: 'https://rangertrak.org/map' }); await sleep(20000)
  console.log('path:', await evaluate(`location.pathname`))
  console.log('ticked:', await evaluate(`[...document.querySelectorAll('mat-checkbox')].map((c) => (c.querySelector('input')?.checked ? '[x] ' : '[ ] ') + c.textContent.trim()).join(' | ')`))
  await evaluate(`scrollTo(0, 0)`); await sleep(1500)
  // From the map's top to the bottom of the offline box (the save button and its tile/MB lines).
  const clip = await evaluate(`(() => { const m = document.querySelector('.leaflet-container').getBoundingClientRect()
    const o = document.querySelector('[data-testid=map-offline-box]')?.getBoundingClientRect()
    const bottom = o ? o.bottom + 8 : m.bottom + 4
    return { x: m.left + scrollX - 2, y: m.top + scrollY - 2, width: m.width + 4, height: bottom - m.top + 2 } })()`)
  console.log('clip:', JSON.stringify(clip))
  await timed(shot('map-gc.png', clip), 40000, 'map').catch((e) => console.error(e.message))
  const page = await evaluate(`(() => { const d = document.documentElement; return { x: 0, y: 0, width: d.clientWidth, height: Math.min(d.scrollHeight, 2400) } })()`)
  await timed(shot('map-gc-page.png', page), 40000, 'page').catch((e) => console.error(e.message))
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
