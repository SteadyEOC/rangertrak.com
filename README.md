# rangertrak.com

![PageSpeed Performance 100](https://img.shields.io/badge/Performance-100-4A7A2A)
![Accessibility 100](https://img.shields.io/badge/Accessibility-100-4A7A2A)
![Best Practices 100](https://img.shields.io/badge/Best_Practices-100-4A7A2A)
![SEO 100](https://img.shields.io/badge/SEO-100-4A7A2A)

The public front door for RangerTrak, served at **<https://rangertrak.com>**: what the app is,
a plain-language Field Guide, setup and practice pages, the *Field Notes* blog, a press kit,
and a feedback form that doesn't need a GitHub account.

This is **not** the app. The PWA that scribes actually use is
[`SteadyEOC/RangerTrak`](https://github.com/SteadyEOC/RangerTrak), a separate open-source
repo served at **rangertrak.org**. Nothing here is imported by it or ships with it.

## How it's built

Hand-written HTML and CSS with no framework and no build step. Every URL is a real file
in `public/`, and every internal link is relative, so the site works the same opened straight
from disk as it does deployed.

It is hosted as a **Cloudflare Worker with static assets**:

- **`public/`**: served as it is. `_redirects` maps `/` and the extensionless addresses
  (`/press`, `/blog/08-shift-change`) to their files as 200 rewrites. `_headers` sets the
  security headers, including a strict Content-Security-Policy (no inline script or style).
- **`worker.js`** (about 30 lines): runs only for requests that match no file. It 301s
  wrong-case or trailing-slash URLs to the lowercase path, sends any unlisted `/go/<name>`
  outreach link to the home page (302), and serves `404.html` for everything else. It has
  no secrets and no binding except `ASSETS`, so a compromise here can't reach the app.
  Keep every file name in `public/` lowercase; that's what makes the lowercasing safe.
- **`wrangler.jsonc`**: binds the apex `rangertrak.com` only. `www` stays a Cloudflare Page
  Rule redirect to the apex. Making it a Worker custom domain would serve the site from two
  origins, the same failure that once broke `www.rangertrak.org`. The comments in the file
  explain each setting.

**Deploy:** push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) runs `npm ci`,
minifies `styles.css` with esbuild in the runner only (the commented source stays in git),
runs `wrangler deploy`, and then runs `tools/check-site.js` against the live hostname. That
check fails the build if the apex redirects instead of serving the site, if any page or
`_redirects` line is missing, if `www` points anywhere but the apex, if the Field Guide's
"last updated" date doesn't match its last commit, or if a page breaks the CSP.

Repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

**Feedback form:** `feedback.html` posts cross-origin to the app's `/api/feedback`, which
allowlists this origin (`FEEDBACK_ALLOWED_ORIGINS` in the app repo's `worker/index.js`). If
that allowlist loses `https://rangertrak.com`, the form quietly falls back to a pre-filled
GitHub issue link. The fallback is also what you'll see on `file://` and `localhost`, and
that's expected.

## Layout

| Path | What it is |
| --- | --- |
| `public/` | The site: pages, `blog/`, `press/` kit, `assets/` (CSS, small scripts), `feed.xml`, `sitemap.xml` |
| `worker.js`, `wrangler.jsonc` | The Worker and its config (above) |
| `tools/` | Node scripts: deploy check, CSP test, responsive images, app screenshots, analytics |
| `design/` | Sources for heroes, infographics and the share card. Not served. |
| `CHANGELOG.md` | What shipped |

## Working on it

```sh
npm ci                                   # wrangler, esbuild
npm start                                # wrangler dev, if you want it over HTTP
node tools/check-site.js                 # same check CI runs (DEPLOY_CHECK_ORIGIN to retarget)
node tools/csp-test.mjs [origin]         # load every page in headless Edge, report CSP violations
node tools/responsive-images.mjs         # make 480/800 px copies and srcset for big images
```

Or just open `public/index.html` in a browser.

When you add a page or blog post, also add its `_redirects` line, `sitemap.xml` entry and (for
posts) `feed.xml` item. `check-site.js` catches a missing redirect. If you change the
`<noscript>` style block in the page headers, update its hash in `_headers`; `check-site.js`
prints the right one.

The capture and test scripts drive headless Edge with a throwaway profile under the
git-ignored `.tmp/` folder (`tools/temp-profile.mjs`), and they delete it on exit.

`public/field-guide.html` is a hand-edited retelling of `FIELD-GUIDE.md` in the app repo.
Nothing keeps the two in sync, so update this one when the app's guide changes. Its header
comment has the details.

## Releases

Every push deploys, so versions mark milestones (a post goes live, a new page, a hosting
change) rather than deploys. Note user-visible changes under `## [Unreleased]` in
`CHANGELOG.md` as they land. To cut a release, rename that section to the version and date,
bump `version` in `package.json`, commit as `chore(release): x.y.z`, then
`git tag -a vx.y.z -m "..."` and `git push --follow-tags`.


## License

Code (`worker.js`, the site's JS and CSS, `tools/`, `design/` scripts): **MIT**, see
[`LICENSE`](LICENSE). Words and images: **CC BY 4.0**, see
[`LICENSE-CONTENT.md`](LICENSE-CONTENT.md), which also lists what it does not cover (the
exercise photos and third-party material). The app at rangertrak.org is a separate project
under AGPL-3.0-or-later.
