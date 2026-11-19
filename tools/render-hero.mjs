// Render a Field Notes hero (a static 1200x630 HTML page in design/heroes/) to PNG, plus the
// 480x300 blog-list thumbnail beside it. Headless InPrivate Edge only: never a visible window.
// Usage: node tools/render-hero.mjs design/heroes/<name>.html public/blog/img/<NN>-hero.png
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const [src, out] = process.argv.slice(2)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9500 + Math.floor(Math.random() * 400)
const profile = makeProfile('rt-hero-')
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// Each run's profile is ~470 MB; it must go even on a crash or Ctrl+C. Edge's child processes
// hold it open, so kill the whole tree first, then retry the delete while handles close.
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  // The tree kill misses processes Edge re-parents (csp-test left 7, 2026-11-09): kill any Edge naming this profile.
  try { spawnSync('pwsh', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object CommandLine -like '*${path.basename(profile)}*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`],
    { stdio: 'ignore' }) } catch {}
  // rmSync's own maxRetries does not retry Edge's EPERM, so wait it out by hand (up to 15 s).
  for (let i = 0; ; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break }
    catch (e) { if (i === 60) { console.error('could not remove', profile, e.code); break } }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  if (fs.existsSync(profile)) console.error('WARNING: temp profile still there:', profile)
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let ws, id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((r) => {
  const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }))
})
try {
  let t
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(250)
    try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page') } catch {}
  }
  ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id) }
  })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: 'file:///' + path.resolve(src).replace(/\\/g, '/') })
  await sleep(1500)
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } })
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'))
  console.log('wrote', out, '(2400x1260)')
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
