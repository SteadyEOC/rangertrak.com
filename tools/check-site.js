#!/usr/bin/env node
/**
 * Asserts that rangertrak.com actually serves this site.
 *
 * This exists because of a specific, already-paid-for failure mode: a successful deploy
 * and a working hostname are two different facts. On the app repo a mis-scoped redirect
 * rule made the apex 301 to itself for days while CI stayed green.
 *
 * The equivalent hazard here is sharper. rangertrak.com spent 2026-08-15 to the cutover
 * as a pure Page-Rule redirect to rangertrak.org. A Worker Custom Domain outranks a Page
 * Rule, so if that rule was never deleted the site will look perfect - right up until the
 * custom domain is detached or re-created, at which point the redirect silently returns.
 * Check 1 is what turns that from a silent regression into a red build.
 *
 * Run against somewhere else with DEPLOY_CHECK_ORIGIN=https://staging.example node tools/check-site.js
 */

const { execSync } = require('node:child_process')

const ORIGIN = process.env.DEPLOY_CHECK_ORIGIN || 'https://rangertrak.com'
const WWW = ORIGIN.replace('https://', 'https://www.')

// A phrase from index.html that no redirect target would ever contain. If the site's
// hero copy is rewritten, update this - a check that cannot fail is worse than no check.
const HOME_MARKER = 'made actionable'

let failures = 0

function fail(what, detail) {
  failures++
  console.error(`\n  FAIL  ${what}\n        ${detail}`)
}

function pass(what) {
  console.log(`  ok    ${what}`)
}

async function head(url) {
  return fetch(url, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } })
}

async function main() {
  console.log(`Checking ${ORIGIN}\n`)

  // 1. The apex serves the site, and is NOT redirecting.
  try {
    const res = await head(`${ORIGIN}/`)
    if (res.status >= 300 && res.status < 400) {
      fail(
        'apex serves the site',
        `${ORIGIN}/ answered ${res.status} -> ${res.headers.get('location')}\n` +
        `        The old .com -> .org redirect is still in force. Dashboard -> rangertrak.com\n` +
        `        -> Rules -> Page Rules: delete the "rangertrak.com/*" forwarding rule.`
      )
    } else if (!res.ok) {
      fail('apex serves the site', `${ORIGIN}/ answered ${res.status}`)
    } else {
      const body = await res.text()
      if (!body.includes(HOME_MARKER)) {
        fail('apex serves THIS site', `200, but the body has no "${HOME_MARKER}" - wrong Worker?`)
      } else {
        pass('apex serves this site, no redirect')
      }
    }
  } catch (err) {
    fail('apex reachable', String(err))
  }

  // 2. Every page is really there, AND is served directly rather than redirected to.
  // Extensions are deliberate: these are the real URLs the site's own links use, and
  // html_handling "none" plus the "/" rewrite in public/_redirects means all of them
  // should be plain 200s.
  //
  // `redirect: 'manual'` is the whole point of this check. On 2026-09-01 html_handling was
  // briefly switched to "auto-trailing-slash" to fix "/" 404ing, which silently made every
  // one of the site's 27 internal links 307 to an extensionless URL. This check passed
  // anyway, because fetch follows redirects by default and the hop still ends in a 200.
  // A 3xx here is now a failure in its own right.
  const pages = [
    '/', '/index.html', '/about.html', '/devices.html', '/practice.html', '/field-guide.html', '/feedback.html', '/privacy.html',
    '/blog.html', '/feed.xml', '/press.html',
    '/blog/01-the-paper-log-without-the-paper.html',
    '/blog/02-hot-warm-cold.html',
    '/blog/03-however-they-read-it-out.html',
    '/blog/04-radio-log-to-ics-309-and-213.html',
    '/blog/05-more-than-one-laptop.html',
    '/blog/06-whats-missing-and-who-decides.html',
    '/blog/07-your-roster-is-already-in-a-spreadsheet.html',
    '/blog/08-shift-change.html',
    '/blog/beta-what-changed-since-the-alpha.html',
    '/blog/09-after-the-mission.html',
    '/blog/beta-2-whats-new.html',
    '/blog/hseep-improvement-plan.html',
    '/blog/beta-3-whats-new.html',
  ]
  // The same pages without ".html" (200 rewrites in public/_redirects, 2026-10-02): people
  // type /press. A page missing its rewrite line fails here.
  for (const p of pages.filter((p) => p.endsWith('.html') && p !== '/index.html')) {
    pages.push(p.slice(0, -'.html'.length))
  }
  for (const path of pages) {
    try {
      // A page added by this very deploy can 404 for a few seconds after the upload (seen
      // 2026-09-26 with privacy.html: 404 in CI, 200 a minute later). Retry a 404 for up to
      // ~30 s before calling it missing. Any other status is reported at once.
      let res = await head(`${ORIGIN}${path}`)
      for (let tries = 0; res.status === 404 && tries < 6; tries++) {
        await new Promise((r) => setTimeout(r, 5000))
        res = await head(`${ORIGIN}${path}`)
      }
      if (res.status >= 300 && res.status < 400) {
        fail(
          `GET ${path} is served directly`,
          `answered ${res.status} -> ${res.headers.get('location')}
` +
          `        Internal links must not redirect. Check html_handling in wrangler.jsonc.`
        )
      } else if (!res.ok) {
        fail(`GET ${path}`, `answered ${res.status}`)
      } else {
        pass(`GET ${path} -> ${res.status}`)
      }
    } catch (err) {
      fail(`GET ${path}`, String(err))
    }
  }

  // 2b. URLs are case-insensitive and ignore a trailing slash (worker.js, 2026-10-05: /press/
  // and /Press both 404'd). A sample of forms, each expected to 301 straight to its page.
  const variants = [
    ['/press/', '/press'], ['/Press', '/press'], ['/PRESS/', '/press'],
    ['/Field-Guide', '/field-guide'], ['/Blog/', '/blog'], ['/Press.html', '/press.html'],
    ['/Blog/03-However-They-Read-It-Out/', '/blog/03-however-they-read-it-out'],
  ]
  for (const [from, to] of variants) {
    try {
      // Same ~30 s 404 retry as the pages above: right after a deploy the new worker.js
      // is not yet live everywhere (2026-10-05: 4 of these 404'd in CI, all 301 a minute later).
      let res = await head(`${ORIGIN}${from}`)
      for (let tries = 0; res.status === 404 && tries < 6; tries++) {
        await new Promise((r) => setTimeout(r, 5000))
        res = await head(`${ORIGIN}${from}`)
      }
      const location = res.headers.get('location') || ''
      if (res.status === 301 && (location === to || location === `${ORIGIN}${to}`)) {
        pass(`${from} -> ${to}`)
      } else {
        fail(`${from} redirects`, `answered ${res.status} -> ${location || '(none)'}, expected 301 -> ${to}`)
      }
    } catch (err) {
      fail(`${from} reachable`, String(err))
    }
  }

  // 2c. Any /go/<name> without a _redirects line goes to the home page (worker.js,
  //     2026-10-06), so outreach links can be made up on the spot. A 302, not a 301.
  try {
    let res = await head(`${ORIGIN}/go/check-site-probe`)
    for (let tries = 0; res.status === 404 && tries < 6; tries++) {
      await new Promise((r) => setTimeout(r, 5000))
      res = await head(`${ORIGIN}/go/check-site-probe`)
    }
    const location = res.headers.get('location') || ''
    if (res.status === 302 && (location === '/' || location === `${ORIGIN}/`)) {
      pass('/go/<any name> -> /')
    } else {
      fail('/go/<any name> redirects', `answered ${res.status} -> ${location || '(none)'}, expected 302 -> /`)
    }
  } catch (err) {
    fail('/go/<any name> reachable', String(err))
  }

  // 3. www must redirect to the .com apex - not to .org, and not serve the site itself.
  //    Two origins serving one site is the bug that cost the app repo real mission data.
  try {
    const res = await head(`${WWW}/`)
    const location = res.headers.get('location') || ''
    if (res.status < 300 || res.status >= 400) {
      fail('www redirects', `${WWW}/ answered ${res.status}, expected a 301. It must never serve the site.`)
    } else if (!location.startsWith(ORIGIN)) {
      fail('www redirects to the apex', `got ${location}, expected ${ORIGIN}/ - repoint the www Page Rule.`)
    } else {
      pass(`www -> ${location}`)
    }
  } catch (err) {
    fail('www reachable', String(err))
  }

  // 4. The field guide's "last updated" stamp still tells the truth.
  //
  // That page is written to be printed or saved and read with no connection, and it claims
  // to be kept in sync with the copy that ships inside the app - two hand-maintained copies
  // that will drift. A hand-typed date drifts exactly like the content does, so it is
  // asserted here against the file's own last commit rather than trusted.
  try {
    // Retried, not single-shot: a deploy just finished seconds ago, and Workers static
    // assets propagate across edge PoPs asynchronously. Observed directly on the first
    // real run of this check - the home-page marker check above (which runs first, closer
    // to the upload) passed, while this one landed on a PoP that hadn't yet picked up the
    // new field-guide.html and saw the page from before this feature existed. Only retries
    // the "tag missing entirely" case, which is what that lag looks like; a tag that is
    // present but WRONG is a real stale-date bug and fails on the first look, no retry.
    let body = ''
    let published
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await fetch(`${ORIGIN}/field-guide.html?cache-bust=${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
      })
      body = await res.text()
      published = (body.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1]
      if (published || attempt === 5) { break }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    // Needs full history: actions/checkout defaults to a shallow clone, where `git log`
    // for one path can come back empty and turn this check into a silent no-op.
    let committed = ''
    try {
      committed = execSync('git log -1 --format=%cs -- public/field-guide.html', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch (err) {
      committed = ''
    }

    if (!published) {
      fail('field guide is dated', 'no <time datetime="..."> found on the deployed page')
    } else if (!committed) {
      fail(
        'field guide date is checkable',
        'could not read the last commit date for public/field-guide.html. In CI that ' +
        'means the checkout was shallow - set fetch-depth: 0 on actions/checkout.'
      )
    } else if (published !== committed) {
      fail(
        'field guide date matches its content',
        `the page says ${published}, but it was last changed ${committed}. ` +
        `Update the <time> element in public/field-guide.html to ${committed}.`
      )
    } else {
      pass(`field guide dated ${published}, matching its last commit`)
    }
  } catch (err) {
    fail('field guide date', String(err))
  }

  // 5. Every page still fits the Content-Security-Policy in public/_headers (2026-10-05).
  //
  // The policy refuses inline scripts, style="" attributes and on*= handlers, and allows a
  // <style> block only by its hash (the shared <noscript> nav fallback). A new page or post
  // that adds any of these would render broken in the browser with nothing failing here, so
  // the source files are scanned, and the deployed header is compared with the file.
  try {
    const fs = require('node:fs')
    const path = require('node:path')
    const crypto = require('node:crypto')
    const pub = path.join(__dirname, '..', 'public')
    const headers = fs.readFileSync(path.join(pub, '_headers'), 'utf8')
    const policy = (headers.match(/^\s*Content-Security-Policy(?:-Report-Only)?:\s*(.+)$/m) || [])[1]
    if (!policy) {
      fail('CSP is set', 'no Content-Security-Policy line in public/_headers')
    } else {
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : [])
      const problems = []
      for (const file of walk(pub)) {
        const html = fs.readFileSync(file, 'utf8')
        const name = path.relative(pub, file)
        if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push(`${name}: inline <script> (move it to assets/)`)
        if (/<[a-z][^>]*\sstyle="/i.test(html)) problems.push(`${name}: style="" attribute (use a class)`)
        if (/<[a-z][^>]*\son[a-z]+="/i.test(html)) problems.push(`${name}: on*="" handler (use addEventListener)`)
        for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/gi)) {
          const hash = `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`
          if (!policy.includes(hash)) problems.push(`${name}: <style> block not in the policy; add ${hash} to style-src`)
        }
      }
      if (problems.length) fail('pages fit the CSP', problems.join('\n        '))
      else pass('every page fits the CSP (no inline script, style attribute or unlisted <style>)')

      // Retried: a deploy that changes _headers reaches edge PoPs unevenly, as in check 4.
      let live
      for (let attempt = 1; attempt <= 6; attempt++) {
        const res = await fetch(`${ORIGIN}/?cache-bust=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } })
        live = res.headers.get('content-security-policy') || res.headers.get('content-security-policy-report-only')
        if (live === policy.trim() || attempt === 6) { break }
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
      if (live !== policy.trim()) {
        fail('deployed CSP matches public/_headers', `live: ${live || '(none)'}`)
      } else {
        pass('deployed CSP matches public/_headers')
      }
    }
  } catch (err) {
    fail('CSP', String(err))
  }

  console.log('')
  if (failures) {
    console.error(`${failures} check(s) failed.\n`)
    process.exit(1)
  }
  console.log('All checks passed.\n')
}

main()
