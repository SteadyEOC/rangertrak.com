# Changelog — rangertrak.com

What changed on the site, by release. The app has its own changelog in the app repo; this one
covers only rangertrak.com — pages, blog, graphics, hosting.

Every push to `main` deploys, so a version here marks a milestone rather than a deploy. Each
one is a git tag (`v0.6.0` and so on) on the last commit of that milestone. Versions 0.1.0 to
0.6.0 were written up and tagged after the fact, on 2026-10-06, from the commit history.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- 2026-11-27: howsmy.site check items (A 93). Canonical link on every page (its og:url);
  shorter home search description (148 characters); JSON-LD on the home page (Organization,
  WebSite, WebApplication); `robots.txt` naming the sitemap; `/.well-known/security.txt`
  (GitHub private vulnerability reporting, expires 2027-11-27); `Permissions-Policy` header.
  `/assets/*` now cached for a year (immutable) and `/img/*` for a week: the deploy runs the new
  `tools/stamp-assets.js`, which adds `?v=<hash>` to asset links in the deployed HTML only.
  `check-site.js` checks all of these, and allows `application/ld+json` blocks.

- 2026-11-16: design-review pass (John). The site now says **Easy menus / Full menus**, as the
  app does (field guide, `full-view.html`, about, home, press; URL kept, dated posts unchanged).
  New share card `og-rangertrak.png` with the home H1 line, from a source in `design/og/`
  (`render.ps1`); every page's og:image:alt matches. Home hero: release note cut to two lines,
  "Take the tour" button dropped. Field guide: three opening boxes merged into one "Before you
  start" box. About: the map side picture dropped (the Bright Angel map covers it); the roster
  picture moved beside "Before the mission". `check-site.js` home marker is now "made actionable".

## [0.7.0] — 2026-11-08 — Beta and beta 2; Parts 8 and 9

### Added
- 2026-11-08: **RangerTrak Beta 2: What's New** (`blog/beta-2-whats-new.html`), release notes for
  app 1.0.0-beta.2, with three new shots from live beta.2 (Map page on Leaflet 2, the Show on map
  and Offline maps boxes, Entry's clue heading) captured headless by `tools/capture-beta2-shots.mjs`.
- 2026-11-02: Field Notes Part 9, *After the Mission*.
- 2026-10-28: **RangerTrak Beta: What Changed Since the Alpha**, release notes for 1.0.0-beta.1.
- 2026-10-28: a **Host it yourself** card on About (the release web zip, rangertrak.org/self-hosting).
- 2026-10-27: the RangerTrak Tour as the suggested first step everywhere: nav, footer, home,
  field guide, and each post's Try it naming its module. `/go/tour`.
- 2026-10-21: Field Notes Part 8, *Shift Change*; setup diagrams with readable text.

### Changed
- 2026-11-08: home release status names beta 2; the field guide adds clue headings, the map's
  fullscreen button, the version on every printout, the Board kit's steps and Help search.
- 2026-11-07: Mission summary is now the **RangerTrak SitRep** and trails are **Ranger paths**
  (about, field guide, press); new Radio Log, Rangers, readiness-panel, SitRep and map-sheet shots.
  wrangler 4.158.0, `compatibility_date` 2026-11-01; Lighthouse 100 on the main pages.
- 2026-10-28: home release status "In beta".
- 2026-10-27: Places, not locations, for the feature; "prints the ICS-309, 213 and 214".
- 2026-10-26: the in-app Guide is now **Help** across the site.
- 2026-10-20: caught up with app 0.99.65-0.99.72; coordinate formats follow the app.

### Added (before 2026-10-21)
- 2026-10-20: a **Full view** page (`full-view.html`) for the app's extras, matching the app's
  new Simple view / Full view (E-207, ADR D-62). It explains the two views and holds the cards
  for every control on the app's advanced list: Setup files, layers, statuses and places,
  tactical calls, every location format, attachments, evidence location, ICS-213, the
  alternative map, map layers, the printed map sheet, field phones, Report Packets, the Board
  and device encryption.

### Changed (before 2026-10-21)
- 2026-10-20: **What it does** now covers only the everyday workflow a new install shows in
  Simple view, with notes pointing to Full view. New "It stays put" card (E-212: the app and its
  data survive closing the browser and updates; the iPhone/iPad Home Screen caveat).
- 2026-10-18: brought in step with app 0.99.56-alpha. Privacy has a "Photos, video and audio"
  section, and its Board line now gives the optional password and local-network-only rule.
  About has a new attachments card and updated Field phones, Report Packets, Board, Demo
  missions, Back up and Device encryption cards. Home and the field guide are updated to match.

## [0.6.0] — 2026-10-05 — Part 3 live; hardened and fast

### Added
- Field Notes Part 3, *However They Read It Out*, published 10-05 (it was due 10-03).
- Page URLs are case-insensitive and ignore a trailing slash.
- Content-Security-Policy: report-only first, then enforced.
- PageSpeed 100s: badges in the README and a short note on About.

### Changed
- Mode diagrams are WebP with `srcset` (600w); card images are sized to their cards; CSS is
  minified at deploy.
- `charset` comes first in `<head>`; security headers added; HSTS is now one year (set in the
  Cloudflare dashboard).

### Fixed
- `www` URLs keep their path. The Page Rule had been dropping it, which broke `/press`.
- The URL-variant checks retry 404s while a deploy propagates.

## [0.5.0] — 2026-10-02 — Colour, heroes, and the drill photo

### Added
- Coloured cards: the paper card is drawn as an ICS-309 form; the RangerTrak card uses the
  app's colours; setup cards have coloured title bars; About's groups use the app's status
  colours.
- Home page: *Paper or RangerTrak? Both.* cards. The map and legibility lead, and paper stays
  the backup.
- Hero images for Parts 1–3, which also serve as `og:image`. Blog-list thumbnails are cut from
  them.
- Vashon ACS drill photo on the press page, with consent from everyone in it and ID badges
  blurred.
- Extensionless page URLs (`/press` serves `press.html`).

### Changed
- Privacy policy says the same things in 630 words instead of 1,540. Address lookups go
  straight to Nominatim and never through us.
- About and the privacy page kept in step with app 0.99.1–0.99.11: the printed map sheet, the
  map layers card, Mission page autosave, Waymarked Trails and Esri satellite.

## [0.4.0] — 2026-09-29 — The alpha: About tour and Part 2

### Added
- Field Notes Part 2, *Hot, Warm, Cold*, published with the alpha on 09-29.
- *What it does* (`about.html`): features as a grouped tour for new users, with AAR and
  handoff cards. The home page is now short.
- Setup-mode diagrams (basic, command-post WiFi, field phones), also on the press page with
  thumbnails.
- Lightbox for images; a back-to-top button like the app's.
- `/go/` short links for outreach channels, and an analytics snapshot that counts their hits,
  people separately from bots.

### Changed
- Better readability throughout. AAR (after-action review) is spelled out at first use on each
  page.
- Field guide covers one copy per browser, one tab, and two missions at once.
- The logo pulses continuously again.

### Fixed
- The top nav collapses into a menu button below about 640px.

## [0.3.0] — 2026-09-26 — Identity, press, and privacy

### Added
- RangerTrak's own mark, with the app's animated mark in every page header; social cards.
- Screenshots on the front door; a press page with full-size originals.
- Two-column layout: a reading column and a narrower right rail.
- The Bright Angel search map (Grand Canyon demo).
- Privacy policy page, linked from every footer. Every footer also says what is and isn't
  counted.
- Release-status box on the home page (alpha Sept 29, beta late October, 1.0 November).
- `favicon.ico`, `apple-touch-icon`, a sitemap, and redirects for `/feed` and `/blog/`.

### Changed
- Field guide summarises the in-app Help instead of copying it.
- Every post opens by saying what RangerTrak is. Bylines carry the call sign KE7KDQ, linked
  to QRZ.
- Grand Canyon is the default demo. The docs now say plainly that the built-in map has no
  street detail and that demo missions bring their own.
- Docs cover passphrase-encrypted mission backups and opt-in device encryption (app 0.96.6).

### Fixed
- The feedback form was posting to a URL that doesn't exist.

## [0.2.0] — 2026-09-15 — Field Notes blog

### Added
- The Field Notes blog, with an RSS feed and Part 1. Parts 2–7 drafted.

### Changed
- Branding moved off eoc.online and onto SteadyEOC, with links pointing at
  SteadyEOC/RangerTrak.

## [0.1.0] — 2026-09-01 — Split out from the app repo

### Added
- The rangertrak.com front door as its own repo, served as static assets by a Cloudflare
  Worker.
- Field guide, with a floating table of contents and a "last updated" stamp that CI checks
  against the guide's own git history.
- CI deploys on push to `main`, then checks that the hostname really serves this site.

### Fixed
- Front-door serving (`_redirects`, `html_handling`), the Worker's name, and wrangler 4 in
  CI.

[Unreleased]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/SteadyEOC/RangerTrak.com/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/SteadyEOC/RangerTrak.com/releases/tag/v0.1.0
