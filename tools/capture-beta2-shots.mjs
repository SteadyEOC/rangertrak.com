// Captures the beta.2 post shots from the live app (Vashon demo), headless Edge, made-up data only, 2x:
// fresh headless Edge profile (no visible window), made-up data only, at 2x:
//   <out-dir>/beta2-clue-heading.png  Entry with the clue heading box open
//   <out-dir>/beta2-map-boxes.png    Map page: Show on map + Offline maps boxes
//   <out-dir>/beta2-map.png          the map with Heat map and Latest per ranger on (fullscreen button, filter chip)
// Fullscreen itself isn't captured: headless has no real fullscreen, so the app falls back to filling the window.
// Usage: node tools/capture-beta2-shots.mjs <out-dir>   (written 2026-11-08, from capture-beta-shots.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-beta2-')
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
  const timed = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ' timed out') })])
  const rect = (sel) => evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect()
    return { x: Math.max(0, r.x + scrollX - 8), y: Math.max(0, r.y + scrollY - 8), width: r.width + 16, height: r.height + 16 } })()`)

  // Entry: open the clue heading box (Full view), type a heading.
  console.log('toggle:', await evaluate(`(() => { const t = document.querySelector('[data-testid=evidence-toggle]'); if (!t) return false
    const i = t.matches('input') ? t : t.querySelector('input[type=checkbox]') || t.querySelector('label') || t
    i.scrollIntoView({ block: 'center' }); i.click(); return t.tagName + ' > ' + i.tagName + ' checked=' + i.checked })()`))
  await sleep(1000)
  console.log('heading field:', await evaluate(`(() => { const h = document.querySelector('[data-testid=evidence-heading]'); if (!h) return false
    const i = h.matches('input') ? h : h.querySelector('input'); if (i) { i.focus(); i.value = '45'; i.dispatchEvent(new Event('input', { bubbles: true })) }
    return h.outerHTML.slice(0, 120) })()`))
  await evaluate(`(() => { const set = (ph, v) => { const i = [...document.querySelectorAll('input')].find((x) => x.placeholder === ph); if (!i) return
    i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur() }
    set('e.g. 200', '200'); set('e.g. 45', '120') })()`)
  await sleep(800)
  // The clue box: from the toggle down to the heading field, across the form.
  const clue = await evaluate(`(() => { const t = document.querySelector('[data-testid=evidence-toggle]')
    const h = document.querySelector('[data-testid=evidence-heading]'); if (!t || !h) return null
    const f = h.closest('mat-form-field') || h; f.scrollIntoView({ block: 'center' })
    const a = t.getBoundingClientRect(), c = f.getBoundingClientRect(), form = (t.closest('form, mat-card, main') || document.body).getBoundingClientRect()
    const y0 = Math.min(a.top, c.top) - 12, y1 = Math.max(a.bottom, c.bottom) + 12
    return { x: form.left + scrollX, y: y0 + scrollY, width: form.width, height: y1 - y0 } })()`)
  console.log('clue box:', JSON.stringify(clue))
  if (clue && clue.width > 50) await shot('beta2-clue-heading.png', clue)

  // Map page: every capture has a timeout (headless hung here on Leaflet 1).
  await send('Page.navigate', { url: 'https://rangertrak.org/map' }); await sleep(20000)
  console.log('path:', await evaluate(`location.pathname`))
  const tick = (label) => evaluate(`(() => { const l = [...document.querySelectorAll('mat-checkbox, label')].find((x) => x.textContent.trim().startsWith('${label}'))
    const i = l?.querySelector('input') || l; if (!i) return false; i.click(); return true })()`)
  console.log('heat:', await tick('Heat map'), 'latest:', await tick('Latest per ranger')); await sleep(4000)
  const boxes = await evaluate(`(() => { const r = ['[data-testid=map-show-box]', '[data-testid=map-offline-box]'].map((s) => document.querySelector(s)?.getBoundingClientRect())
    if (!r[0] || !r[1]) return null; const x0 = Math.min(r[0].left, r[1].left) - 8, y0 = Math.min(r[0].top, r[1].top) - 8
    return { x: x0 + scrollX, y: y0 + scrollY, width: Math.max(r[0].right, r[1].right) + 8 - x0, height: Math.max(r[0].bottom, r[1].bottom) + 8 - y0 } })()`)
  console.log('boxes:', JSON.stringify(boxes))
  if (boxes) await timed(shot('beta2-map-boxes.png', boxes), 30000, 'boxes').catch((e) => console.error(e.message))
  await evaluate(`scrollTo(0, 0)`); await sleep(1500)
  const map = await evaluate(`(() => { const m = document.querySelector('.leaflet-container').getBoundingClientRect()
    return { x: m.left + scrollX - 2, y: m.top + scrollY - 60, width: m.width + 4, height: m.height + 64 } })()`)
  console.log('chips:', await evaluate(`[...document.querySelectorAll('mat-chip, .mat-mdc-chip')].map((c) => c.textContent.trim()).join(' | ')`))
  await timed(shot('beta2-map.png', map), 40000, 'map').catch((e) => console.error(e.message))
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
