// Capture full-page screenshots of the live app (rangertrak.org) for the site, posts and press
// page, in a fresh InPrivate Edge profile, headless unless OFFSCREEN=1 (headless Edge renders no frames on the
// Map page, so captures there hang). InPrivate + --disable-sync: a visible Edge on a new profile
// otherwise signs itself in to the Windows Microsoft account and starts syncing (seen 2026-09-30).
// The Grand Canyon demo is loaded: fictional data only.
// Usage: node tools/capture-screens.mjs <out-dir> [page ...]
// Pages: entry, radio-log, map, rangers, messages, mission (default: all). Writes <page>.png at 2x.
// Companion to tools/capture-app.mjs, which crops the header strip and readiness panel.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = process.argv[2]
const ONLY = process.argv.slice(3)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500) // never attach to a stale run's Edge
const W = 1400, H = 1000
fs.mkdirSync(OUT, { recursive: true })
const profile = makeProfile('rt-capture-')
// Headless by default. OFFSCREEN=1 opens a real (off-screen) window instead, which the Map
// page needs - but that window CAN TAKE KEYBOARD FOCUS: on 2026-09-30 John's typing went into
// it and out to Bing as a search. Only use OFFSCREEN=1 when John says he isn't typing.
const MODE = process.env.OFFSCREEN === '1' ? ['--window-position=-4000,0'] : ['--headless=new']
const edge = spawn(EDGE, ['--inprivate', '--disable-sync', ...MODE, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
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
  // A page that never settles (e.g. an animating map) must not stall the whole run.
  return new Promise((resolve) => {
    const t = setTimeout(() => { pending.delete(msgId); console.log('timeout:', method); resolve({}) }, 30000)
    pending.set(msgId, { resolve: (v) => { clearTimeout(t); resolve(v) } })
  })
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r.result?.value
}
async function shot(file, height = H) {
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true,
    clip: { x: 0, y: 0, width: W, height, scale: 1 } })
  if (!r.data) return console.log('no image for', file)
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file)
}
const clickText = (sel, re) => evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})]
  .find((x) => ${re}.test(x.textContent)); if (!b) return false; b.click(); return true })()`)
// In-app navigation keeps the SPA (and its loaded demo) without a reload.
const go = (route) => evaluate(`(() => { const a = [...document.querySelectorAll('a[href]')]
  .find((x) => x.getAttribute('href') === '/${route}' || x.getAttribute('href') === '${route}');
  if (a) { a.click(); return 'link' } history.pushState({}, '', '/${route}');
  dispatchEvent(new PopStateEvent('popstate')); return 'pushState' })()`)

// Entry: From and To both set to tactical calls (E-165), so the shot shows the new To station box. Demo calls: Command Post, Rim Team 1, ...
async function typeInto(sel, text) {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return;
    e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(900)
}
async function entrySetup() {
  await typeInto('#enter__To-input', 'Command')
  await clickText('mat-option', /^\s*Command Post\s*$/)
  await sleep(600)
  await typeInto('#enter__Callsign-input', 'Below Rim')
  await clickText('mat-option', /^\s*Below Rim Team\s*$/)
  await sleep(600)
  await evaluate('document.activeElement?.blur()')
  await sleep(1500)
}

const PAGES = {
  entry: { route: '', wait: 4000 },
  'radio-log': { route: 'radio-log', wait: 4000 },
  map: { route: 'map', wait: 12000 },
  rangers: { route: 'rangers', wait: 5000 },
  messages: { route: 'messages', wait: 4000 },
  mission: { route: 'mission', wait: 4000 },
}

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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })
  // Still frames: stops the map's trail-flow animation, which otherwise keeps a capture waiting.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  // Full view, as a user chose it, before the app reads its settings.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('rt-view', 'full');
    localStorage.setItem('rt-view-source', 'user') } catch {}` })
  await send('Page.navigate', { url: 'https://rangertrak.org/' })
  await sleep(7000)
  // The Entry page's demo picker (0.99.x; "Load Demo Data" before that).
  await evaluate(`document.querySelector('rangertrak-demo-picker mat-select')?.click()`)
  await sleep(800)
  console.log('picked:', await evaluate(`(() => { const o = [...document.querySelectorAll('mat-option')]
    .find((x) => x.textContent.includes('Grand Canyon')); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await clickText('button', /^\s*(Load|Replace|Yes|OK|Continue)/i)
  await sleep(5000)
  console.log('version:', await evaluate(`(document.body.innerText.match(/0\\.99\\.\\d+-alpha/) || [])[0]`))

  for (const [name, p] of Object.entries(PAGES)) {
    if (ONLY.length && !ONLY.includes(name)) continue
    console.log(name, 'via', await go(p.route))
    await sleep(p.wait)
    await evaluate('scrollTo(0, 0)')
    if (name === 'entry') await entrySetup()
    if (name === 'map') {
      await clickText('button', /Zoom to Extent/i)
      for (let i = 0; i < 40; i++) {
        await sleep(1000)
        if (await evaluate(`!document.querySelector('.leaflet-tile:not(.leaflet-tile-loaded)')`) && i > 15) break
      }
      // Off-screen, Edge throttles animation frames, so Leaflet's tile fade-in never finishes and
      // the base map stays gray. Show loaded tiles at full opacity.
      await evaluate(`(() => { const st = document.createElement('style'); st.textContent =
        '.leaflet-tile-loaded { opacity: 1 !important } .leaflet-tile { transition: none !important }';
        document.head.appendChild(st) })()`)
      await sleep(4000)
    }
    await shot(`${name}.png`)
  }
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
