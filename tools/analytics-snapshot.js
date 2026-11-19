#!/usr/bin/env node
// Pulls daily analytics for rangertrak.com and rangertrak.org from Cloudflare's GraphQL
// Analytics API and merges them into CSV files OUTSIDE this repo, so the history outlives
// Cloudflare's own retention window. Visitor numbers are never committed (this repo is public).
//
//   node tools/analytics-snapshot.js            # last 30 days (safe to re-run: rows for the
//   node tools/analytics-snapshot.js 90         # pulled dates are replaced, not duplicated)
//
// Needs a Cloudflare **Account API token** (not a User API token) with Account Analytics
// Read, from the CF_ANALYTICS_TOKEN environment variable or ANALYTICS_DIR/.token, and the
// account ID from CF_ACCOUNT_ID or ANALYTICS_DIR/.account. Writes:
//   ANALYTICS_DIR/web-daily.csv     date,host,path,referrer,country,pageviews,visits,sample_interval
//   ANALYTICS_DIR/worker-daily.csv  date,script,status,requests,errors,subrequests
//   ANALYTICS_DIR/go-daily.csv      date,path,status,kind,hits   (kind: person, bot or check)
//
// rangertrak.org counts first visits only: repeat visits load from the service worker's
// cached copy, which carries no beacon (see ../HANDOFF-blog-session.md, 2026-09-25).

const fs = require('fs')
const path = require('path')

const ANALYTICS_DIR = path.resolve(__dirname, '..', '..', 'rangertrak-InternalDocs', 'Analytics')
const HOSTS = ['rangertrak.com', 'rangertrak.org']
const API = 'https://api.cloudflare.com/client/v4'

function token() {
  if (process.env.CF_ANALYTICS_TOKEN) return process.env.CF_ANALYTICS_TOKEN.trim()
  const file = path.join(ANALYTICS_DIR, '.token')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  console.error(`No token. Set CF_ANALYTICS_TOKEN or write it to ${file}`)
  process.exit(2)
}

async function cf(tok, url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok || json.errors?.length) {
    throw new Error(`${url} -> ${res.status}: ${JSON.stringify(json.errors || json)}`)
  }
  return json
}

const iso = (d) => d.toISOString().slice(0, 10)

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function readCsv(file) {
  if (!fs.existsSync(file)) return []
  const [, ...lines] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  return lines
}

// Keep stored rows for dates outside the pulled range; replace the rest with fresh ones.
function merge(file, header, freshRows, start, end) {
  const kept = readCsv(file).filter((line) => {
    const date = line.slice(0, 10)
    return date < start || date > end
  })
  const all = [...kept, ...freshRows.map((r) => r.map(csvCell).join(','))].sort()
  fs.writeFileSync(file, [header, ...all].join('\n') + '\n')
  return all.length
}

async function main() {
  const days = Number(process.argv[2]) || 30
  const tok = token()
  fs.mkdirSync(ANALYTICS_DIR, { recursive: true })

  // An Account API token (which this is, not a User API token) can't be relied on to list
  // accounts, so the account ID comes from CF_ACCOUNT_ID or ANALYTICS_DIR/.account.
  const accountFile = path.join(ANALYTICS_DIR, '.account')
  const account = (process.env.CF_ACCOUNT_ID ||
    (fs.existsSync(accountFile) ? fs.readFileSync(accountFile, 'utf8') : '')).trim()
  if (!account) throw new Error(`No account ID. Set CF_ACCOUNT_ID or write it to ${accountFile}`)

  // One query per day. Over a long range with page, referrer and country all broken out,
  // Cloudflare samples the data (seen 2026-09-26: a 30-day pull came back at 1 in 10, so
  // each real visit read as "10"). A single day stays unsampled at this traffic. The
  // sample interval is stored too, so any sampling that does happen shows in the data.
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  const vars = { start: iso(start), end: iso(end) }

  const query = `query ($account: string!, $day: Date!, $hosts: [string!]) {
    viewer { accounts(filter: { accountTag: $account }) {
      web: rumPageloadEventsAdaptiveGroups(
        limit: 10000,
        filter: { date: $day, requestHost_in: $hosts }
      ) {
        count
        sum { visits }
        avg { sampleInterval }
        dimensions { date requestHost requestPath refererHost countryName }
      }
      worker: workersInvocationsAdaptive(
        limit: 10000,
        filter: { date: $day }
      ) {
        sum { requests errors subrequests }
        dimensions { date scriptName status }
      }
    } }
  }`

  const web = []
  const worker = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = iso(new Date(t))
    const json = await cf(tok, `${API}/graphql`, { query, variables: { account, day, hosts: HOSTS } })
    const acct = json.data.viewer.accounts[0]
    for (const g of acct.web) {
      const d = g.dimensions
      web.push([d.date, d.requestHost, d.requestPath, d.refererHost || '(direct)', d.countryName,
        g.count, g.sum.visits, g.avg.sampleInterval])
    }
    for (const g of acct.worker) {
      const d = g.dimensions
      worker.push([d.date, d.scriptName, d.status, g.sum.requests, g.sum.errors, g.sum.subrequests])
    }
  }

  // Outreach short links (/go/<channel> in public/_redirects), from the zone's own request
  // logs: the beacon above never sees them, since a 301 has no page. The free plan has no
  // referrer here, but it does have the user agent, which separates people from link-preview
  // bots (Facebook fetches each link when a post is written and again when an admin reviews
  // it) and from our own curl checks.
  const zones = await cf(tok, `${API}/zones?name=rangertrak.com&account.id=${account}`)
  const zone = zones.result[0].id
  const goQuery = `query ($zone: string!, $day: Date!) {
    viewer { zones(filter: { zoneTag: $zone }) {
      httpRequestsAdaptiveGroups(limit: 1000,
        filter: { date: $day, clientRequestPath_like: "/go/%" }) {
        count
        dimensions { date clientRequestPath edgeResponseStatus userAgent }
      }
    } }
  }`
  const kindOf = (ua) =>
    /curl|wget|python|node-fetch|undici/i.test(ua) ? 'check'
      : /bot|crawl|spider|externalhit|facebookcatalog|preview|slurp|embedly|whatsapp|telegram|discord|skype/i.test(ua) ? 'bot'
        : 'person'
  const goCounts = {}
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = iso(new Date(t))
    const json = await cf(tok, `${API}/graphql`, { query: goQuery, variables: { zone, day } })
    for (const g of json.data.viewer.zones[0].httpRequestsAdaptiveGroups) {
      const d = g.dimensions
      const key = [d.date, d.clientRequestPath, d.edgeResponseStatus, kindOf(d.userAgent || '')].join('|')
      goCounts[key] = (goCounts[key] || 0) + g.count
    }
  }
  const go = Object.entries(goCounts).map(([k, n]) => [...k.split('|'), n])

  const webFile = path.join(ANALYTICS_DIR, 'web-daily.csv')
  const workerFile = path.join(ANALYTICS_DIR, 'worker-daily.csv')
  const nWeb = merge(webFile, 'date,host,path,referrer,country,pageviews,visits,sample_interval', web, vars.start, vars.end)
  const nWorker = merge(workerFile, 'date,script,status,requests,errors,subrequests', worker, vars.start, vars.end)
  merge(path.join(ANALYTICS_DIR, 'go-daily.csv'), 'date,path,status,kind,hits', go, vars.start, vars.end)

  // A short readout: visits per site per day, and the top referrers, over the pulled range.
  const byDay = {}
  const refs = {}
  for (const [date, host, , ref, , , visits] of web) {
    byDay[date] ??= {}
    byDay[date][host] = (byDay[date][host] || 0) + visits
    if (ref !== '(direct)' && !HOSTS.includes(ref)) refs[ref] = (refs[ref] || 0) + visits
  }
  console.log(`Pulled ${vars.start} to ${vars.end}. Stored rows: web ${nWeb}, worker ${nWorker}.`)
  console.log('\nVisits per day      .com   .org')
  for (const date of Object.keys(byDay).sort()) {
    const r = byDay[date]
    console.log(`  ${date}   ${String(r['rangertrak.com'] || 0).padStart(5)}  ${String(r['rangertrak.org'] || 0).padStart(5)}`)
  }
  const top = Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log('\nTop referrers (visits):')
  for (const [ref, n] of top) console.log(`  ${String(n).padStart(5)}  ${ref}`)
  if (!top.length) console.log('  (none besides direct)')

  // Short links: people vs bots vs our own checks, over the pulled range. A 404 is a link
  // hit before its _redirects line existed.
  const goSum = {}
  for (const [, p, status, kind, n] of go) {
    goSum[p] ??= { person: 0, bot: 0, check: 0, notFound: 0 }
    if (status === '404') goSum[p].notFound += n
    else goSum[p][kind] += n
  }
  // Since 2026-10-06 any /go/<name> works (worker.js sends unlisted ones home), so links get
  // made up on the spot. Which group each was for lives in ANALYTICS_DIR/go-labels.csv
  // (path,group,noted), outside the repo. Links with a _redirects line are documented in
  // rangertrak-InternalDocs/Outreach - Facebook ham groups.md instead.
  const listed = new Set()
  const redirects = path.join(__dirname, '..', 'public', '_redirects')
  for (const line of fs.readFileSync(redirects, 'utf8').split('\n')) {
    const m = line.match(/^(\/go\/\S+)/)
    if (m) listed.add(m[1])
  }
  const labels = {}
  const labelFile = path.join(ANALYTICS_DIR, 'go-labels.csv')
  if (!fs.existsSync(labelFile)) fs.writeFileSync(labelFile, 'path,group,noted\n')
  for (const line of fs.readFileSync(labelFile, 'utf8').split('\n').slice(1)) {
    const [p, ...rest] = line.split(',')
    if (p) labels[p.trim()] = rest.slice(0, -1).join(',').replace(/^"|"$/g, '').trim()
  }
  const ad = (p) => /^\/go\/[a-z0-9][a-z0-9-]*$/.test(p) && !listed.has(p)

  console.log('\nShort links        people   bots  checks  404s  group')
  for (const p of Object.keys(goSum).sort()) {
    const s = goSum[p]
    const group = labels[p] || (listed.has(p) ? '(in _redirects)' : ad(p) ? '?' : '')
    console.log(`  ${p.padEnd(18)} ${String(s.person).padStart(5)}  ${String(s.bot).padStart(5)}  ${String(s.check).padStart(6)}  ${String(s.notFound).padStart(4)}  ${group}`)
  }
  if (!Object.keys(goSum).length) console.log('  (no hits)')
  const unknown = Object.keys(goSum).filter((p) => ad(p) && !labels[p] && goSum[p].person > 0)
  if (unknown.length) {
    console.log(`\nAsk John which group these were for, then add them to ${labelFile}:`)
    for (const p of unknown) console.log(`  ${p}  (${goSum[p].person} people)`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
