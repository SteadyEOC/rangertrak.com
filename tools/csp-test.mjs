// Load every page in headless InPrivate Edge and report Content-Security-Policy violations,
// enforced or report-only, plus a few behaviour checks on the parts a CSP could break.
// Usage: node tools/csp-test.mjs [origin]   (default https://rangertrak.com; or a wrangler dev URL)
// Run it against the live site too: Cloudflare injects its analytics beacon only there.
// Never a visible window. It does not submit the feedback form (that would file a real issue);
// it makes one GET to the feedback endpoint, which is enough for connect-src to be judged.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { makeProfile, edgeEnv } from './temp-profile.mjs'

const ORIGIN = (process.argv[2] || 'https://rangertrak.com').replace(/\/$/, '')
const pub = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', 'public')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : [])
const pages = walk(pub).map((f) => '/' + path.relative(pub, f).replace(/\\/g, '/')).concat(['/', '/no-such-page'])

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9500 + Math.floor(Math.random() * 400)
const profile = makeProfile('rt-csp-')
const edge = spawn(EDGE, ['--headless=new', '--inprivate', '--disable-sync', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', env: edgeEnv(profile) })
// Each run's profile is ~470 MB; it must go even on a crash or Ctrl+C. Edge's child processes
// hold it open, so kill the whole tree first, then retry the delete while handles close.
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  // The tree kill misses processes Edge re-parents (7 left running on this profile, 2026-11-09):
  // kill any Edge whose command line names this profile, as the capture scripts do.
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
const events = []
const send = (method, params = {}) => new Promise((r) => {
  const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }))
})
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value

let problems = 0
try {
  let t
  for (let i = 0; i < 40 && !t; i++) {
    await sleep(250)
    try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page') } catch {}
  }
  ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id) }
    else if (m.method === 'Log.entryAdded') events.push(m.params.entry.text)
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      events.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
    else if (m.method === 'Runtime.exceptionThrown') events.push('exception: ' + m.params.exceptionDetails.exception?.description)
  })
  await send('Page.enable'); await send('Log.enable'); await send('Runtime.enable')
  // Injected by the debugger, so the page's own CSP does not apply to it.
  await send('Page.addScriptToEvaluateOnNewDocument', { source:
    `document.addEventListener('securitypolicyviolation', e => console.error('CSP ' + e.disposition + ': ' +
      e.effectiveDirective + ' blocked ' + (e.blockedURI || 'inline') + ' at ' + e.sourceFile + ':' + e.lineNumber))` })

  for (const p of pages) {
    events.length = 0
    await send('Page.navigate', { url: ORIGIN + p })
    await sleep(2500)
    const extra = []
    if (p === '/field-guide.html') {
      await evaluate(`document.querySelector('.toc a:last-of-type') && window.scrollTo(0, document.body.scrollHeight)`)
      await sleep(500)
      if (!await evaluate(`!!document.querySelector('.toc a[aria-current]')`)) extra.push('TOC highlight did not run')
      const c = await evaluate(`getComputedStyle(document.querySelector('p.lede--sub')).marginTop`)
      if (!c || !c.startsWith('-')) extra.push(`lede--sub margin-top is ${c}`)
    }
    if (p === '/feedback.html') {
      const r = await evaluate(`fetch('https://rangertrak.org/api/feedback').then(r => 'HTTP ' + r.status, e => 'error ' + e.message)`)
      // From a wrangler dev origin the app refuses the request by CORS (it allowlists
      // rangertrak.com only). That is not a CSP failure; a CSP block shows as a violation.
      if (!r.startsWith('HTTP') && !ORIGIN.includes('localhost')) extra.push(`feedback endpoint fetch: ${r}`)
      if (!await evaluate(`typeof document.getElementById('feedback-form').onsubmit === 'object' && !!document.getElementById('submit-btn')`))
        extra.push('feedback form missing')
    }
    if (p === '/privacy.html') {
      // Canary: a fetch the policy does not allow must be reported, or this test proves nothing.
      events.length = 0
      await evaluate(`fetch('https://example.com/').catch(() => {})`)
      await sleep(500)
      if (!events.some((e) => /CSP .*connect-src blocked https:\/\/example\.com/.test(e))) extra.push('canary: a disallowed fetch was NOT reported - detector broken')
      events.length = 0
    }
    if (p === '/index.html') {
      await evaluate(`document.querySelector('.card-body a[href$=".webp"]').click()`)
      await sleep(400)
      if (!await evaluate(`!!document.querySelector('dialog.lightbox-dialog[open]')`)) extra.push('lightbox did not open')
      if (!await evaluate(`[...document.scripts].some(s => s.src.includes('cloudflareinsights'))`) && ORIGIN.includes('rangertrak.com'))
        extra.push('(note) no Cloudflare beacon on the page')
    }
    const csp = events.filter((e) => /Content.Security.Policy|CSP /i.test(e))
    const other = events.filter((e) => !csp.includes(e) && !/favicon|404 \(Not Found\)|Images loaded lazily|CORS policy|net::ERR_FAILED/.test(e))
    const bad = csp.length + extra.filter((x) => !x.startsWith('(note)')).length
    problems += bad
    console.log(`${bad ? 'FAIL' : 'ok  '}  ${p}`)
    for (const e of [...csp, ...extra, ...other]) console.log(`        ${e}`)
  }
} finally {
  try { ws?.close() } catch {}
  cleanup()
}
console.log(problems ? `\n${problems} problem(s).` : '\nNo CSP violations.')
process.exit(problems ? 1 : 0)
