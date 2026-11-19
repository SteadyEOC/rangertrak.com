// Capture RangerTrak's header status strip and its mission-info/readiness panel from the live
// Kept as tools/capture-app.mjs (2026-09-27). Usage: node tools/capture-app.mjs <out-dir>
// app, in a fresh headless Edge profile with the Grand Canyon demo loaded (fictional data only).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9333
const profile = makeProfile('rt-capture-')
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// Delete the profile (~480 MB) even on a crash or Ctrl+C: kill the Edge tree, then retry.
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
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
function send(method, params = {}) {
  const msgId = ++id
  ws.send(JSON.stringify({ id: msgId, method, params }))
  return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }))
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r.result?.value
}
async function shot(file, rect, pad = 8) {
  const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2, height: rect.height + pad * 2, scale: 1 }
  const r = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file, Math.round(clip.width), 'x', Math.round(clip.height))
}
const rectOf = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return null; const r = e.getBoundingClientRect();
  return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } })()`)

try {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page') } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result || {}); pending.delete(m.id) }
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true })
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: 'https://rangertrak.org/' })
  await sleep(6000)

  const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')]
    .find((x) => /Load Demo Data/i.test(x.textContent)); if (!b) return false; b.click(); return true })()`)
  console.log('Load Demo Data clicked:', clicked)
  await sleep(6000)
  // Any confirm button in a Material dialog.
  await evaluate(`(() => { const b = [...document.querySelectorAll('mat-dialog-container button, .mat-mdc-dialog-container button')]
    .find((x) => /load|yes|ok|continue|replace/i.test(x.textContent)); if (b) b.click() })()`)
  await sleep(5000)

  console.log('mission:', await evaluate(`document.querySelector('.status-cluster')?.innerText`))
  const header = await rectOf('.header')
  await shot('strip-header.png', header, 0)
  const cluster = await rectOf('.status-cluster')
  await shot('strip-cluster.png', cluster, 10)

  // The navbar plus the strip under it, full width: where the bar lives in the app.
  const top = await rectOf('.header')
  await shot('strip-with-navbar.png', { x: 0, y: 0, width: 1280, height: top.y + top.height + 6 }, 0)

  // Open the panel the way a mouse user does: hover the strip.
  const cx = cluster.x + cluster.width / 2, cy = cluster.y + cluster.height / 2
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy })
  await sleep(1500)
  const panel = await rectOf('.rt-mission-info-panel')
  console.log('panel rect:', JSON.stringify(panel))
  console.log('panel text:', await evaluate(`document.querySelector('.rt-mission-info-panel')?.innerText`))
  if (panel && panel.width > 0) {
    const both = { x: Math.min(panel.x, cluster.x), y: cluster.y,
      width: Math.max(panel.x + panel.width, cluster.x + cluster.width) - Math.min(panel.x, cluster.x),
      height: panel.y + panel.height - cluster.y }
    await shot('strip-panel.png', both, 12)
  }
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
