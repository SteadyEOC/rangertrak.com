// Captures Part 9's Export changes sample from the live app with the Vashon demo loaded, in a fresh headless
// Edge profile (no visible window), made-up data only, at 2x. On the Rangers grid it edits one phone number,
// deletes one person and adds a walk-up, presses Export changes, takes the CSV the app builds (from its
// blob; nothing is downloaded) and draws it as a spreadsheet:
//   rangertrak-roster-changes.csv   the app's file, as exported
//   09-export-changes.png           that file as a sheet, change column tinted
// Usage: node tools/capture-export-changes.mjs <out-dir>   (written 2026-11-02, from capture-part9-shots.mjs)
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'part9-shots')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-xchg-')
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
    if (m.method === 'Page.javascriptDialogOpening') console.log('DIALOG:', m.params.message); if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true })
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__csv = []; const __o = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (b) => { b.text().then((t) => window.__csv.push(t)); return __o(b) }` })
  await send('Page.reload'); await sleep(6000)
  await evaluate(`document.querySelector('rangertrak-demo-picker mat-select')?.click()`); await sleep(800)
  await evaluate(`[...document.querySelectorAll('mat-option')].find((x) => x.textContent.includes('Vashon'))?.click()`)
  await sleep(1500)
  await clickButton('/^(Load|Replace|Yes|OK|Continue)/i'); await sleep(6000)
  await go('/rangers'); await sleep(2000)
  const rows = () => evaluate(`JSON.stringify([...document.querySelectorAll('.ag-row')].filter(r => r.querySelector('[col-id=fullName]')).map(r => r.getAttribute('row-index') + ' ' + ['callsign','fullName','phone','team','role','note'].map(c => r.querySelector('[col-id='+c+']')?.textContent.trim()).join(' | ')))`)
  const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(250) }
  const mouse = async (x, y, n) => { for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: n }) }
  const cellAt = (rowIdx, col) => evaluate(`(() => { const c = document.querySelector('.ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${col}"]'); if (!c) return null; c.scrollIntoView({block:'center', inline:'center'}); const r = c.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`)
  const editCell = async (rowIdx, col, text) => {
    const b = await cellAt(rowIdx, col); if (!b) { console.log('no cell', rowIdx, col); return }
    await mouse(b.x, b.y, 1); await mouse(b.x, b.y, 2); await sleep(600)
    await evaluate(`document.activeElement?.select?.()`); await send('Input.insertText', { text }); await sleep(200)
    await key('Enter', 'Enter', 13); await sleep(500)
  }
  // Edited: a corrected phone number.
  await editCell(2, 'phone', '206-555-0187')
  // Deleted: one person, selected by checkbox alone.
  await clickButton('/^Clear selection$/'); await sleep(500)
  const delIdx = await evaluate(`[...document.querySelectorAll('.ag-row')].find(r => /Ollie Fogbank/.test(r.textContent))?.getAttribute('row-index')`)
  const cb = await cellAt(delIdx, 'team'); if (cb) await mouse(cb.x, cb.y, 1); await sleep(500)
  const sel = await evaluate(`JSON.stringify([...document.querySelectorAll('.ag-row-selected')].map(r => r.querySelector('[col-id=fullName]')?.textContent.trim()).filter(Boolean))`)
  console.log('selected', sel)
  if (sel === '["Ollie Fogbank"]') { await evaluate(`document.querySelector('[data-testid=rangers-delete-selected]')?.click()`); await sleep(1200) }
  // Added: a walk-up with no call sign.
  console.log('add', await evaluate(`(() => { const b = document.querySelector('button[title^="Add a new Ranger"]'); b?.click(); return !!b })()`)); await sleep(2000)
  const newIdx = await evaluate(`document.querySelector('.ag-cell-inline-editing')?.closest('.ag-row')?.getAttribute('row-index')`)
  console.log('new row', newIdx); await key('Escape', 'Escape', 27)
  for (const [col, v] of [['fullName', 'Dana Whitcomb'], ['phone', '206-555-0142'], ['team', 'Maury-CERT'], ['role', 'Runner'], ['note', 'Walk-up; signed in at the command post 09:40']]) await editCell(newIdx, col, v)
  console.log('after', await rows())
  await evaluate(`[...document.querySelectorAll('mat-expansion-panel-header')].find(h => /Import, export/.test(h.textContent))?.click()`); await sleep(800)
  await clickButton('/Export changes/'); await sleep(2500)
  const csv = await evaluate(`window.__csv.at(-1)`)
  if (csv) fs.writeFileSync(path.join(OUT, 'rangertrak-roster-changes.csv'), csv)
  console.log(csv)
  const cells = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map((l) => { const out = []; let cur = '', q = false
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out })
  await send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 400, deviceScaleFactor: 2, mobile: false })
  await evaluate(`(() => { const rows = ${JSON.stringify(cells)}; const L = 'ABCDEFGHIJ'
    document.open(); document.write('<!doctype html><meta charset=utf-8><body></body>'); document.close()
    document.body.style.cssText = 'margin:0;padding:12px;background:#fff;font:13px Calibri,Segoe UI,Arial,sans-serif;color:#222'
    const tint = { added: '#e3f2e6', edited: '#fff4d6', removed: '#eceff1' }
    let h = '<div style="font:12px Segoe UI;color:#555;margin:0 0 6px 2px">rangertrak-roster-changes-2026-11-02.csv</div><table id=t style="border-collapse:collapse">'
    h += '<tr><th style="background:#f0f0f0;border:1px solid #d4d4d4;width:28px"></th>' + rows[0].map((_, i) => '<th style="background:#f0f0f0;border:1px solid #d4d4d4;font-weight:normal;color:#666;padding:2px 6px">' + L[i] + '</th>').join('') + '</tr>'
    rows.forEach((r, n) => { h += '<tr><td style="background:#f0f0f0;border:1px solid #d4d4d4;color:#666;text-align:center">' + (n + 1) + '</td>' + r.map((v, i) => '<td style="border:1px solid #d4d4d4;padding:3px 8px;white-space:nowrap;' + (n === 0 ? 'font-weight:bold;' : '') + (n && i === 0 ? 'background:' + (tint[v] || '#fff') + ';font-weight:bold;' : '') + (i === 8 ? 'color:#888;font-size:11px;' : '') + '">' + v.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</td>').join('') + '</tr>' })
    document.body.innerHTML = h + '</table>' })()`)
  await sleep(800)
  const t = await boxOf('#t'); if (t) await shot('09-export-changes.png', { x: 0, y: 0, width: t.x + t.width + 12, height: t.y + t.height + 12 })

} catch (e) { console.error(e) } finally { try { ws?.close() } catch {}; cleanup() }
