// Captures the beta.4 site sweep shots from the live app, headless Edge, fresh profile (no visible window),
// made-up demo data only (Vashon demo), at 2x:
//   <out-dir>/beta2-clue-heading.png   Entry with the clue box open (retake for the new labels, 49ed0c4b)
//   <out-dir>/rr213-entry.png          Entry's ICS-213RR box, one order line filled
//   <out-dir>/ics213rr-filled.pdf      a demo resource request from Messages > Save PDF (render it with pymupdf)
// Usage: node tools/capture-beta4-shots.mjs <out-dir>   (written 2026-11-12, from capture-aar-capability.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-beta4-')
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
    .find((x) => /Vashon/i.test(x.textContent)); o?.click(); return o?.textContent.trim() })()`))
  await sleep(1500)
  await clickButton('/^(Load|Replace|Yes|OK|Continue)/i'); await sleep(6000)
  const timed = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ' timed out') })])
  const setIn = (el, v) => `(() => { const i = ${el}; if (!i) return false; i.focus(); i.value = ${JSON.stringify(v)}
    i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return true })()`
  const box = (sel) => evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect()
    return { x: Math.max(0, r.x + scrollX - 8), y: Math.max(0, r.y + scrollY - 8), width: r.width + 16, height: r.height + 16 } })()`)

  // 1. Entry: the clue box (same crop as capture-beta2-shots.mjs).
  await send('Page.navigate', { url: 'https://rangertrak.org/' }); await sleep(6000)
  console.log('build:', await evaluate(`(document.body.innerText.match(/Version[^\n]*/) || [])[0]`))
  await evaluate(`(() => { const t = document.querySelector('[data-testid=evidence-toggle]'); const i = t.querySelector('input[type=checkbox]') || t
    i.scrollIntoView({ block: 'center' }); i.click() })()`); await sleep(1000)
  await evaluate(`(() => { const set = (ph, v) => { const i = [...document.querySelectorAll('input')].find((x) => x.placeholder === ph); if (!i) return
    i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur() }
    set('e.g. 200', '200'); set('e.g. 45', '120') })()`)
  await evaluate(setIn(`document.querySelector('[data-testid=evidence-heading]')?.querySelector('input') || document.querySelector('input[data-testid=evidence-heading]')`, '45'))
  await sleep(800)
  const clue = await evaluate(`(() => { const t = document.querySelector('[data-testid=evidence-toggle]')
    const h = document.querySelector('[data-testid=evidence-heading]'); if (!t || !h) return null
    const f = h.closest('mat-form-field') || h; f.scrollIntoView({ block: 'center' })
    const a = t.getBoundingClientRect(), c = f.getBoundingClientRect(), form = (t.closest('form, mat-card, main') || document.body).getBoundingClientRect()
    const y0 = Math.min(a.top, c.top) - 12, y1 = Math.max(a.bottom, c.bottom) + 12
    return { x: form.left + scrollX, y: y0 + scrollY, width: form.width, height: y1 - y0 } })()`)
  console.log('clue box:', JSON.stringify(clue))
  if (clue && clue.width > 50) await shot('beta2-clue-heading.png', clue)
  // Close the clue box again so it doesn't sit above the 213RR box.
  await evaluate(`(() => { const t = document.querySelector('[data-testid=evidence-toggle]'); (t.querySelector('input[type=checkbox]') || t).click() })()`); await sleep(800)

  // 2. Entry: the ICS-213RR box with one order line.
  console.log('rr toggle:', await evaluate(`(() => { const t = document.querySelector('[data-testid=rr213-toggle]'); if (!t) return false
    const i = t.querySelector('input[type=checkbox]') || t; i.scrollIntoView({ block: 'center' }); i.click(); return true })()`))
  await sleep(1200)
  const line = `document.querySelectorAll('[data-testid=rr213-line]')[0]`
  console.log('qty/kind/desc:', await evaluate(setIn(`${line}?.querySelector('.enter__rr-qty input')`, '4')),
    await evaluate(setIn(`${line}?.querySelector('.enter__rr-kind input')`, 'Cots')),
    await evaluate(setIn(`${line}?.querySelector('.enter__rr-desc input')`, 'Folding, with blankets, for the warming shelter')))
  await sleep(1000)
  const rr = await evaluate(`(() => { const e = document.querySelector('[data-testid=rr213]'); if (!e) return null
    e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect()
    const d = [...e.querySelectorAll('mat-form-field')].find((f) => /Deliver to/.test(f.querySelector('mat-label')?.textContent || ''))
    const bottom = d ? d.getBoundingClientRect().bottom + 16 : r.bottom + 8
    return { x: Math.max(0, r.x + scrollX - 8), y: Math.max(0, r.y + scrollY - 8), width: r.width + 16, height: bottom - r.y + 8 } })()`)
  console.log('rr box:', JSON.stringify(rr))
  if (rr) await shot('rr213-entry.png', rr)
  // Untick it so nothing is left half-filled (the draft lives only in this throwaway profile anyway).
  await evaluate(`(() => { const t = document.querySelector('[data-testid=rr213-toggle]'); (t.querySelector('input[type=checkbox]') || t).click() })()`)

  // 3. Messages: a demo resource request, Save PDF.
  await send('Page.navigate', { url: 'https://rangertrak.org/messages' }); await sleep(6000)
  await evaluate(`document.querySelector('[data-testid=messages-filter-rr]')?.click()`); await sleep(1200)
  console.log('rr rows:', await evaluate(`[...document.querySelectorAll('[data-testid=messages-rr-row]')].map((r) => r.textContent.trim())`))
  await evaluate(`document.querySelector('[data-testid=messages-rr-row]')?.closest('button')?.click()`); await sleep(1500)
  // Headless Edge drops anchor downloads: keep the blob URL alive and read the PDF bytes from the page.
  await evaluate(`(() => { window.__rtPdf = null; window.__rtBlobs = new Map(); const mk = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { const u = mk(b); window.__rtBlobs.set(u, b); return u }; URL.revokeObjectURL = () => {}
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__rtPdf = { href: this.href, name: this.download }; return } return orig.call(this) } })()`)
  console.log('save pdf:', await clickButton('/^Save PDF$/'))
  let got
  for (let i = 0; i < 40 && !got; i++) { await sleep(500); got = await evaluate(`window.__rtPdf?.name || null`) }
  const b64 = got && await evaluate(`(async () => { const b = new Uint8Array(await window.__rtBlobs.get(window.__rtPdf.href).arrayBuffer())
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000))); return btoa(s) })().catch((e) => 'ERR ' + e)`)
  if (typeof b64 !== 'string' || b64.startsWith('ERR')) console.error('pdf read:', JSON.stringify(b64).slice(0, 300))
  if (typeof b64 === 'string' && !b64.startsWith('ERR')) { fs.writeFileSync(path.join(OUT, 'ics213rr-filled.pdf'), Buffer.from(b64, 'base64')); console.log('wrote ics213rr-filled.pdf from', got) }
  else console.error('no PDF captured')
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
