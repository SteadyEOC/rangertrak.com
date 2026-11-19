// Captures Part 9's five shots from the live app with the Vashon demo loaded, in a fresh headless Edge
// profile (no visible window), made-up data only, at 2x:
//   09-summary-whole.png   Current summary on Whole log (toolbar, header with the journal stamp, totals, chart)
//   09-aar-notes.png       AAR notes page, two incident notes with area, owner and recommendation filled
//   09-ics214-suggest.png  Export ICS-214 dialog with the journal suggestions opened, none ticked
//   09-journal.png         Log > Journal tab ("Journal intact: N entries")
//   09-what-to-clear.png   Radio Log > Delete radio log entries and messages > What to clear (then Cancel)
// Usage: node tools/capture-part9-shots.mjs <out-dir>   (written 2026-10-29, from capture-beta-shots.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'part9-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-part9-')
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// Same cleanup as capture-beta-shots.mjs: kill the Edge tree and any Edge naming this profile, then delete it.
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
const clickButton = (re, scope = 'document') => evaluate(`(() => { const b = [...${scope}.querySelectorAll('button, a')]
  .find((x) => ${re}.test(x.textContent.trim()) && !x.disabled); if (!b) return false; b.click(); return true })()`)
const boxOf = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null
  const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } })()`)
async function shot(file, clip, inset = 0) {
  if (!clip) { console.error('no box for', file); return }
  // A dialog's box includes the rounded corners, where the page behind shows through.
  clip = { x: clip.x + inset, y: clip.y, width: clip.width - 2 * inset, height: clip.height }
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true })
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file, Math.round(clip.width * 2), 'x', Math.round(clip.height * 2))
}
// In-app navigation through the Angular router, so nothing reloads.
const go = async (route) => { await evaluate(`(() => { const a = document.createElement('a'); a.setAttribute('href', '${route}')
  history.pushState({}, '', '${route}'); dispatchEvent(new PopStateEvent('popstate')) })()`); await sleep(2500) }
// One note or line through the AAR/214 dialog.
async function addNote(kind, text) {
  await clickButton('/AAR\\/214/'); await sleep(1200)
  await evaluate(`[...document.querySelectorAll('mat-dialog-container mat-button-toggle button')].find((b) => b.textContent.trim() === '${kind}')?.click()`)
  await sleep(500)
  await evaluate(`(() => { const t = document.querySelector('mat-dialog-container textarea'); t.focus(); t.value = ${JSON.stringify(text)}
    t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(400)
  await evaluate(`document.querySelector('[data-testid=aar-note-save]')?.click()`); await sleep(1000)
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
  await send('Browser.setDownloadBehavior', { behavior: 'deny' })
  await send('Emulation.setDeviceMetricsOverride', { width: 1286, height: 900, deviceScaleFactor: 2, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('rt-view', 'full');
    localStorage.setItem('rt-view-source', 'user') } catch {}` })
  await send('Page.navigate', { url: 'https://rangertrak.org/' })
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

  // Made-up debrief material: two incident notes and one 214 line.
  await addNote('Mission', 'Dockton-CERT\'s check-ins drifted to every 40 minutes after dark; nobody noticed for an hour.')
  await addNote('Mission', 'The park shed had no power for the second laptop. Brought an extension cord from home.')
  await addNote('ICS-214', 'Stood down Dockton-CERT and Maury-CERT; all teams accounted for at Command.')

  // 1. Summary, whole log.
  await go('/summary')
  await evaluate(`[...document.querySelectorAll('[data-testid=summary-window] button')].find((b) => /Whole log/.test(b.textContent))?.click()`)
  await sleep(1500)
  const sum = await boxOf('.rt-summary')
  if (sum) await shot('09-summary-whole.png', { ...sum, height: Math.min(sum.height, 560) })
  // Exports go in the journal; downloads are refused, so nothing is written to disk.
  await evaluate(`document.querySelector('[data-testid=summary-export]')?.click()`); await sleep(1500)

  // 2. AAR notes: area, owner, recommendation on the two incident notes.
  await go('/after-action')
  console.log('notes filled:', await evaluate(`(() => {
    const fill = [
      ['Communications', 'Net control', 'Set a check-in timer per team; prompt at 30 minutes.'],
      ['Logistics', 'Equipment lead', 'Add a power strip and a 50 ft cord to the go-kit list.'],
    ]
    const cards = [...document.querySelectorAll('[data-testid=aar-item]')]
    cards.slice(0, 2).forEach((c, i) => {
      const set = (el, v) => { if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
      const fields = [...c.querySelectorAll('mat-form-field')]
      const byLabel = (l) => fields.find((f) => f.querySelector('mat-label')?.textContent.trim() === l)?.querySelector('input, textarea')
      set(byLabel('Area'), fill[i][0]); set(byLabel('Owner'), fill[i][1]); set(byLabel('Recommendation'), fill[i][2])
    })
    return cards.length })()`))
  await sleep(1500)
  const list = await boxOf('[data-testid=aar-list]')
  const bar = await evaluate(`(() => { const e = document.querySelector('mat-button-toggle-group'); const r = e?.getBoundingClientRect()
    return r ? r.y + scrollY : null })()`)
  if (list) { const top = Math.max(0, (bar ?? list.y) - 8); await shot('09-aar-notes.png', { x: list.x - 8, y: top, width: list.width + 16, height: list.y + list.height - top + 8 }) }

  await clickButton('/^download\\s*Export$|^Export$/'); await sleep(1500)

  // 3. Export ICS-214 with the suggestions opened.
  await evaluate(`document.querySelector('[data-testid=aar-214-export]')?.click()`); await sleep(1500)
  await evaluate(`(() => { const d = document.querySelector('mat-dialog-container details'); if (d) d.open = true })()`); await sleep(800)
  await shot('09-ics214-suggest.png', await boxOf('mat-dialog-container .mat-mdc-dialog-surface'), 8)
  await clickButton('/^Cancel$/', `document.querySelector('mat-dialog-container')`); await sleep(1000)

  // 4. Log > Journal.
  await go('/log')
  await evaluate(`[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.trim() === 'Journal')?.click()`); await sleep(1500)
  console.log('journal:', await evaluate(`(document.body.innerText.match(/Journal (intact|broken)[^\\n]*/) || [])[0]`))
  await shot('09-journal.png', await boxOf('mat-tab-group .mat-mdc-tab-body-active') ?? await boxOf('mat-tab-group'))

  // 5. What to clear, from the Radio Log; Cancel, nothing is deleted.
  await go('/radio-log')
  await evaluate(`[...document.querySelectorAll('mat-expansion-panel-header, summary')].filter((h) => /Delete radio log/.test(h.textContent)).forEach((h) => h.click())`)
  await sleep(800)
  console.log('clear opened:', await clickButton('/^delete\\s*Delete radio log entries and messages$|^Delete radio log entries and messages$/i')); await sleep(1500)
  await shot('09-what-to-clear.png', await boxOf('mat-dialog-container .mat-mdc-dialog-surface'), 8)
  await clickButton('/^Cancel$/', `document.querySelector('mat-dialog-container')`)
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
