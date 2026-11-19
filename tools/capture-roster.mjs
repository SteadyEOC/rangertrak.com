// Captures the roster-import screens for Field Notes Part 7 from the live app, in a fresh
// headless Edge profile (no visible window), with made-up people only.
// Usage: node tools/capture-roster.mjs <out-dir>
// Written 2026-10-16. Inputs: drafts/roster-post/Fernhollow volunteers 2026-10-01.csv, then
// ...2026-10-15.csv (one person gone, one phone changed, one new), so the second import shows
// the "no longer in this layer" question.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const OUT = path.resolve(process.argv[2] || 'roster-shots')
fs.mkdirSync(OUT, { recursive: true })
const HERE = path.resolve('drafts/roster-post')
const FILE1 = path.join(HERE, 'Fernhollow volunteers 2026-10-01.csv')
const FILE2 = path.join(HERE, 'Fernhollow volunteers 2026-10-15.csv')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// A fresh port each run: Edge's child processes can outlive edge.kill() and keep an old port.
const PORT = 9400 + Math.floor(Math.random() * 500)
const profile = makeProfile('rt-roster-')
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// The profile is ~480 MB (one was left in roster-shots/ on 10-16); it must go even on a crash or
// Ctrl+C. Same cleanup as render-hero.mjs: kill the Edge tree, then retry the delete.
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
const send = (method, params = {}) => { const m = ++id; ws.send(JSON.stringify({ id: m, method, params }))
  return new Promise((resolve) => pending.set(m, resolve)) }
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value
const rectOf = (sel) => evaluate(`(() => { const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect();
  return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } })()`)
async function shot(file, rect, pad = 8) {
  if (!rect || !rect.width) { console.log('SKIPPED', file); return }
  const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + pad * 2, height: rect.height + pad * 2, scale: 1 }
  const r = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
  console.log('wrote', file, Math.round(clip.width), 'x', Math.round(clip.height))
}
const DIALOG = `document.querySelector('mat-dialog-container, .mat-mdc-dialog-container')`
// After Add to roster: the newest dialog or snack bar on the page (the import dialog may still be closing).
const RESULT = `[...document.querySelectorAll('mat-dialog-container, .mat-mdc-dialog-container, mat-snack-bar-container')].filter((e) => /Imported/.test(e.innerText)).at(-1)`
const dialogText = () => evaluate(`${DIALOG}?.innerText`)
const clickButton = (re, scope = 'document') => evaluate(`(() => { const b = [...${scope}.querySelectorAll('button')]
  .find((x) => ${re}.test(x.textContent.trim()) && !x.disabled); if (!b) return false; b.click(); return true })()`)
async function pickFile(file) {
  const doc = await send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#importRosterFile' })
  await send('DOM.setFileInputFiles', { nodeId, files: [file] })
  await sleep(3000)
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
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1700, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: 'https://rangertrak.org/rangers' })
  await sleep(7000)
  console.log('version:', await evaluate(`(document.body.innerText.match(/0\\.99\\.\\d+-alpha/) || [])[0]`))

  // The Import, export & print panel, before anything is loaded.
  const panel = `document.querySelector('rangertrak-io-panel')`
  await shot('01-empty-state.png', await rectOf(`document.querySelector('.rangers__empty-state')`))
  await evaluate(`${panel}?.scrollIntoView({ block: 'center' })`); await sleep(800)
  await shot('01-panel-empty.png', await rectOf(panel))

  // First import: column guess, then preview, then the result.
  await pickFile(FILE1)
  console.log('MAPPING:\n' + await dialogText())
  await shot('02-mapping.png', await rectOf(DIALOG), 0)
  await clickButton('/^Continue$/'); await sleep(1500)
  console.log('PREVIEW:\n' + await dialogText())
  await shot('03-preview.png', await rectOf(DIALOG), 0)
  await clickButton('/^Add to roster$/'); await sleep(2500)
  console.log('AFTER ADD:\n' + await evaluate(`${RESULT}?.innerText`))
  await shot('04-result.png', await rectOf(RESULT), 0)
  await clickButton('/^(OK|Close|Done)$/'); await sleep(1200)
  await evaluate(`scrollTo(0, 0)`); await sleep(500)
  const grid = `document.querySelector('ag-grid-angular, .ag-root-wrapper')`
  await shot('05-roster-grid.png', await rectOf(grid))

  // Second import: a newer copy of the same list.
  await pickFile(FILE2)
  console.log('MAPPING 2:\n' + await dialogText())
  await clickButton('/^Continue$/'); await sleep(1500)
  console.log('PREVIEW 2:\n' + await dialogText())
  await shot('06-preview-newer.png', await rectOf(DIALOG), 0)
  await clickButton('/^Add to roster$/'); await sleep(2500)
  console.log('AFTER ADD 2:\n' + await evaluate(`${RESULT}?.innerText`))
  await shot('07-result-newer.png', await rectOf(RESULT), 0)
  await clickButton('/^(OK|Close|Done)$/'); await sleep(1200)

  // The panel again, opened (it starts collapsed), now with the layer listed.
  await evaluate(`(${panel})?.querySelector('mat-expansion-panel-header, .mat-expansion-panel-header')?.click()`); await sleep(1500)
  await evaluate(`${panel}?.scrollIntoView({ block: 'start' })`); await sleep(800)
  console.log('PANEL AFTER:\n' + await evaluate(`${panel}?.innerText`))
  await shot('08-panel-after.png', await rectOf(panel))
  const layers = `[...document.querySelectorAll('mat-card')].filter((e) => /Layers on this device/.test(e.innerText)).sort((a, b) => a.innerText.length - b.innerText.length)[0]`
  await shot('09-layers-card.png', await rectOf(layers))
} catch (e) {
  console.error(e)
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
