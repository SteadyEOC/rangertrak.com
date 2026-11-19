// Captures the beta.3 post's shots from the live app, headless Edge, fresh profile (no visible window),
// made-up data only, at 2x:
//   <out-dir>/beta3-merge-receipt.png   command post: the merge summary with Send a receipt
//   <out-dir>/beta3-my-reports.png      field phone: My reports with Received and Not sent rows
//   <out-dir>/beta3-map-popup.png       Map: an entry popup showing its Notes (Vashon demo)
//   <out-dir>/beta3-rangerview-guide.png rangertrak.org/view/, the RangerView guide (top of the page)
// One browser plays both devices by flipping localStorage 'fieldMode', as the app's own e2e check does.
// Usage: node tools/capture-beta3-shots.mjs <out-dir> [guide]   (written 2026-11-13, from capture-beta4-shots.mjs)
//   'guide' takes only the RangerView guide shot (added 2026-11-15, after the Board became RangerView).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
const GUIDE_ONLY = process.argv[3] === 'guide'
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-beta3-')
const files = path.join(profile, '_files')
fs.mkdirSync(files)
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  try { spawnSync('pwsh', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object CommandLine -like '*${path.basename(profile)}*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`],
    { stdio: 'ignore' }) } catch {}
  for (let i = 0; ; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break }
    catch (e) { if (i === 60) { console.error('WARNING: could not remove', profile, e.code); break } }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const pending = new Map()
const dialogs = []
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params }))
  return new Promise((resolve) => pending.set(m, resolve)) }
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value
const poll = async (fn, ok, tries = 40) => { let v; for (let i = 0; i < tries; i++) { v = await fn(); if (ok(v)) return v; await sleep(250) } return v }
async function shot(file, clip) {
  if (!clip || clip.width < 20) { console.error('no box for', file); return }
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true })
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file, Math.round(clip.width * 2), 'x', Math.round(clip.height * 2))
}
const box = (expr, pad = 8) => evaluate(`(() => { const e = ${expr}; if (!e) return null
  e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect()
  return { x: Math.max(0, r.x + scrollX - ${pad}), y: Math.max(0, r.y + scrollY - ${pad}), width: r.width + ${2 * pad}, height: r.height + ${2 * pad} } })()`)
const phone = () => send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const desk = () => send('Emulation.setDeviceMetricsOverride', { width: 1286, height: 900, deviceScaleFactor: 2, mobile: false })
async function goto(url, wait = 5000) {
  await send('Page.navigate', { url })
  await poll(() => evaluate(`/Version \\S+/.test(document.body?.innerText || '')`), (v) => v === true, 60)
  await sleep(wait)
}
// Downloads: headless Edge drops anchor downloads, so every page keeps the blob and the name; save() writes it here.
const HOOK = `try { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) } catch {}
  window.__rtBlobs = new Map(); window.__rtDl = []
  const mk = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { const u = mk(b); window.__rtBlobs.set(u, b); return u }; URL.revokeObjectURL = () => {}
  const orig = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__rtDl.push({ href: this.href, name: this.download }); return } return orig.call(this) }`
async function saveDownload(re) {
  const name = await poll(() => evaluate(`(window.__rtDl || []).map((d) => d.name).find((n) => ${re}.test(n)) || null`), (v) => !!v)
  if (!name) return null
  const text = await evaluate(`(async () => { const d = window.__rtDl.find((x) => x.name === ${JSON.stringify(name)})
    return await window.__rtBlobs.get(d.href).text() })()`)
  const file = path.join(files, name)
  fs.writeFileSync(file, text)
  console.log('saved', name)
  return file
}
async function setFile(selector, file) {
  const doc = await send('DOM.getDocument', { depth: -1 })
  const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector })
  if (!node.nodeId) throw new Error('no ' + selector)
  await send('DOM.setFileInputFiles', { files: [file], nodeId: node.nodeId })
}
const typeNotes = (text) => evaluate(`(async () => { const ta = document.querySelector('#enter__What--area'); if (!ta) return false
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)})
  ta.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); return true })()`)
const submit = () => evaluate(`(async () => { document.querySelector('.enter__Submit-button')?.click(); await new Promise((r) => setTimeout(r, 1500)) })()`)
// Same as the app's e2e idbRemoveRaw: delete one key from the app's kv store, never creating the database.
const idbRemove = (key) => evaluate(`new Promise((res) => { const req = indexedDB.open('rangertrak-records')
  req.onupgradeneeded = () => req.transaction.abort()
  req.onerror = () => res(false)
  req.onsuccess = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) { db.close(); return res(false) }
    const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(${JSON.stringify(key)})
    tx.oncomplete = () => { db.close(); res(true) }; tx.onerror = () => { db.close(); res(false) } } })`)
const sendLabel =() => evaluate(`document.querySelector('[data-testid="send-new-reports"]')?.textContent.trim() ?? null`)

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
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK })

  if (!GUIDE_ONLY) {
  // 1. The phone: two reports sent, a third not sent yet.
  await phone()
  await goto('https://rangertrak.org/', 2000)
  console.log('build:', await evaluate(`(document.body.innerText.match(/Version[^\\n]*/) || [])[0]`))
  await evaluate(`localStorage.setItem('fieldMode', 'true'); localStorage.removeItem('fieldModeReports')`)
  await goto('https://rangertrak.org/')
  for (const t of ['At the Burton trailhead. Three hikers signed out, none back yet.',
    'Checked the north loop to the first junction. No sign of them.']) { await typeNotes(t); await submit() }
  console.log('send label:', await poll(sendLabel, (v) => /Send 2/.test(v || '')))
  await evaluate(`document.querySelector('[data-testid="send-new-reports"]')?.click()`)
  const packet = await saveDownload('/report-packet/')
  if (!packet) throw new Error('no packet')

  // 2. The command post loads the packet: the merge summary offers Send a receipt. The log is emptied
  // first so the packet merges as new reports, as it would on a separate laptop.
  await evaluate(`localStorage.removeItem('fieldMode')`)
  await idbRemove('radioLog')
  await desk()
  await goto('https://rangertrak.org/radio-log')
  await setFile('input[type="file"][accept^="text/plain"]', packet)
  console.log('receipt offered:', await poll(() => evaluate(`!!document.querySelector('[data-testid="merge-summary-receipt"]')`), (v) => v === true))
  await sleep(1000)
  await shot('beta3-merge-receipt.png', await box(`document.querySelector('mat-dialog-container')`, 12))
  await evaluate(`document.querySelector('[data-testid="merge-summary-receipt"]')?.click()`)
  const receipt = await saveDownload('/rangertrak-receipt/')
  await evaluate(`document.querySelector('[data-testid="merge-summary-ok"]')?.click()`)

  // 3. The phone opens the receipt: My reports shows Received twice and Not sent once.
  await evaluate(`localStorage.setItem('fieldMode', 'true')`)
  await phone()
  await goto('https://rangertrak.org/')
  await typeNotes('Heading up the south loop. Back on the hour.'); await submit()
  await evaluate(`document.querySelector('.entry-myreports-placeholder, rangertrak-my-reports')?.scrollIntoView()`)
  const chips = () => evaluate(`[...document.querySelectorAll('[data-testid="my-report-chip"]')].map((c) => c.textContent.trim())`)
  await poll(chips, (v) => Array.isArray(v) && v.length === 3)
  if (receipt) await setFile('[data-testid="receipt-file"]', receipt)
  console.log('chips:', await poll(chips, (v) => Array.isArray(v) && v.filter((c) => /^Received/.test(c)).length === 2))
  await sleep(1000)
  await shot('beta3-my-reports.png', await box(`document.querySelector('[data-testid="my-reports"]')`))

  // 4. Map popup with Notes, on the Vashon demo (field mode off, log cleared by the demo load).
  await evaluate(`localStorage.removeItem('fieldMode'); localStorage.removeItem('fieldModeReports')
    localStorage.setItem('rt-view', 'full'); localStorage.setItem('rt-view-source', 'user')`)
  await idbRemove('radioLog')
  await desk()
  await goto('https://rangertrak.org/')
  await evaluate(`document.querySelector('rangertrak-demo-picker mat-select')?.click()`); await sleep(800)
  console.log('picked:', await evaluate(`(() => { const o = [...document.querySelectorAll('mat-option')]
    .find((x) => /Vashon/i.test(x.textContent)); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(Load|Replace|Yes|OK|Continue)/i.test(x.textContent.trim()) && !x.disabled); b?.click() })()`)
  await sleep(6000)
  await goto('https://rangertrak.org/map', 7000)
  // Open popups one marker at a time until one shows a Notes block.
  // Markers start inside clusters: try the single markers, else click the biggest cluster to zoom in, and repeat.
  const opened = await evaluate(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    let tried = 0
    for (let round = 0; round < 6; round++) {
      const icons = [...document.querySelectorAll('.leaflet-marker-icon')].filter((e) => !e.classList.contains('marker-cluster'))
      for (const icon of icons) {
        tried++; click(icon); await wait(700)
        // A Place marker opens an edit dialog instead of a popup: cancel it and try the next marker.
        const dlg = document.querySelector('mat-dialog-container')
        if (dlg) { [...dlg.querySelectorAll('button')].find((b) => /^Cancel$/.test(b.textContent.trim()))?.click(); await wait(700); continue }
        const p = document.querySelector('.leaflet-popup')
        const t = p?.querySelector('.rt-popup-notes__text')?.textContent || ''
        if (t.split(/\\s+/).length >= 8) return p.textContent.trim().slice(0, 160)
      }
      const clusters = [...document.querySelectorAll('.marker-cluster')]
        .sort((a, b) => (parseInt(b.textContent) || 0) - (parseInt(a.textContent) || 0))
      if (!clusters.length) break
      click(clusters[0]); await wait(1800)
    }
    return 'none of ' + tried })()`)
  console.log('popup:', opened)
  await sleep(1000)
  const pop = await evaluate(`(() => { const p = document.querySelector('.leaflet-popup'); if (!p || document.querySelector('mat-dialog-container')) return null
    const r = p.getBoundingClientRect(); return { x: r.x - 60, y: r.y - 16, width: r.width + 120, height: r.height + 60 } })()`)
  await shot('beta3-map-popup.png', pop)

  }
  // 5. The RangerView guide page (was the Board's, at /board/).
  await desk()
  await send('Page.navigate', { url: 'https://rangertrak.org/view/' }); await sleep(5000)
  // Measure the page's text column (the h1's parent), so the shot isn't cut off on the right.
  const col = await evaluate(`(() => { const h = document.querySelector('h1'); if (!h) return null
    const r = h.parentElement.getBoundingClientRect()
    return { x: Math.max(0, r.x + scrollX - 24), y: 0, width: r.width + 48, height: 730 } })()`)
  await shot('beta3-rangerview-guide.png', col)
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
