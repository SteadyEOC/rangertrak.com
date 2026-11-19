// Captures the After Action page with the new Capability element (HSEEP POETE) field, live app, headless
// Edge, fresh profile (no visible window), made-up demo data only, at 2x:
//   <out-dir>/aar-capability.png   one AAR note card with Capability element set
//   <out-dir>/aar-print.png        the printed improvement plan (print media), three notes
// Usage: node tools/capture-aar-capability.mjs <out-dir>   (written 2026-11-09, from capture-map-gc.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'beta-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-aarcap-')
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

  await send('Page.navigate', { url: 'https://rangertrak.org/after-action' }); await sleep(8000)
  console.log('path:', await evaluate(`location.pathname`), 'notes:', await evaluate(`document.querySelectorAll('[data-testid=aar-item]').length`))
  // The demos carry no AAR notes: add three through the AAR/214 button (Mission is the default choice).
  // The first is the one the beta.2 post shows; the print shows all three.
  const NOTES = [
    { text: 'Relief operators at Net Control had not run the net before and missed two check-ins in the first hour.',
      area: 'Communications', cap: 'Training', owner: 'Net manager',
      rec: 'Run a 20-minute practice net for relief operators before the next drill.' },
    { text: 'The staging area laptop ran on battery from 11:00; the generator cord did not reach the table.',
      area: 'Logistics', cap: 'Equipment', owner: 'Equipment lead',
      rec: 'Add a 50 ft outdoor extension cord to the command post kit.' },
    { text: 'Nobody was assigned to brief incoming searchers, so two teams went out without the latest clue.',
      area: 'Staging', cap: 'Organization', owner: 'Team coordinator',
      rec: 'Name a staging briefer on the ICS-203 for every operational period.' },
  ]
  for (const n of [...NOTES].reverse()) {
    await evaluate(`document.querySelector('[data-testid=aar-note]').click()`); await sleep(1500)
    await evaluate(`(() => { const t = document.querySelector('[data-testid=aar-note-text]'); t.focus()
      t.value = ${JSON.stringify(n.text)}; t.dispatchEvent(new Event('input', { bubbles: true })) })()`); await sleep(500)
    await evaluate(`document.querySelector('[data-testid=aar-note-save]').click()`); await sleep(1500)
  }
  await send('Page.navigate', { url: 'https://rangertrak.org/after-action' }); await sleep(6000)
  console.log('notes now:', await evaluate(`document.querySelectorAll('[data-testid=aar-item]').length`))
  const cardSel = (text) => `[...document.querySelectorAll('[data-testid=aar-item]')].find((c) => c.querySelector('[data-testid=aar-item-text]')?.value === ${JSON.stringify(text)})`
  const fill = (text, label, v) => evaluate(`(() => { const c = ${cardSel(text)}; const f = [...(c?.querySelectorAll('mat-form-field') || [])]
    .find((x) => x.querySelector('mat-label')?.textContent.trim() === '${label}'); const i = f?.querySelector('input, textarea'); if (!i) return false
    i.focus(); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true }))
    i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return true })()`)
  for (const n of NOTES) {
    console.log('filled:', await fill(n.text, 'Area', n.area), await fill(n.text, 'Owner', n.owner), await fill(n.text, 'Recommendation', n.rec)); await sleep(800)
    await evaluate(`(() => { const s = ${cardSel(n.text)}.querySelector('[data-testid=aar-item-capability]'); s.scrollIntoView({ block: 'center' }); s.click() })()`); await sleep(800)
    await evaluate(`[...document.querySelectorAll('mat-option')].find((o) => o.textContent.trim() === ${JSON.stringify(n.cap)})?.click()`); await sleep(1200)
  }
  const card = await evaluate(`(() => { const e = ${cardSel(NOTES[0].text)}; e.scrollIntoView({ block: 'center' })
    const r = e.getBoundingClientRect(); return { x: r.x + scrollX - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16 } })()`)
  await shot('aar-capability.png', card)
  // The printed improvement plan: the print stylesheet, as Print would lay it out.
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(1500)
  console.log('print text:', await evaluate(`(document.querySelector('[data-testid=aar-print-table]')?.closest('section, div')?.innerText || 'none').slice(0, 600)`))
  const print = await evaluate(`(() => { const t = document.querySelector('[data-testid=aar-print-table]'); if (!t) return null
    let e = t.parentElement; while (e && e.getBoundingClientRect().height < t.getBoundingClientRect().height + 40) e = e.parentElement
    e = e || t; scrollTo(0, 0); const r = e.getBoundingClientRect()
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } })()`)
  console.log('print clip:', JSON.stringify(print))
  if (print) await shot('aar-print.png', print)
  await send('Emulation.setEmulatedMedia', { media: '' })
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
