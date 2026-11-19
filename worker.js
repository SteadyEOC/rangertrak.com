// Case-insensitive URLs for rangertrak.com (John, 2026-10-05: "all urls should be case
// insensitive"). public/_redirects matches paths exactly and case-sensitively, with no way
// to say "any case", so /Press and /press/ 404'd.
//
// This only runs when a request matches no file and no _redirects line: every real page,
// image and rewrite is served by the assets layer before it gets here, exactly as before.
// For a miss, lowercase the path and drop a trailing slash; if that changes anything, 301
// to it (one hop, and the assets layer then handles it). An unlisted /go/ link goes to the
// home page (below). Otherwise it is a real 404.
// Every file in public/ is lowercase, which is what makes lowercasing safe: keep it so.
//
// Still no secrets and no bindings beyond the site's own files (see wrangler.jsonc).
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    let path = url.pathname.toLowerCase()
    if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '') || '/'
    if (path !== url.pathname) {
      return Response.redirect(`${url.origin}${path}${url.search}`, 301)
    }
    // Ad-hoc outreach links (John, 2026-10-06: "allow anything, and then track"). Any
    // /go/<name> without its own _redirects line goes to the home page, so a link can be
    // made up on the spot in a chat or an email. 302, not 301: browsers don't cache it, so
    // the name can later get a _redirects line pointing somewhere more specific.
    // tools/analytics-snapshot.js counts these and lists any it has no group for.
    // Names only (letters, digits, hyphens): /go/index.html or /go/assets/... still 404.
    if (/^\/go\/[a-z0-9][a-z0-9-]*$/.test(path)) {
      return Response.redirect(`${url.origin}/`, 302)
    }
    // Keep the asset's own headers, so public/_headers (CSP and the rest) covers the 404 too.
    const page = await env.ASSETS.fetch(new URL('/404.html', url.origin))
    const headers = new Headers(page.headers)
    headers.set('content-type', 'text/html; charset=utf-8')
    return new Response(page.body, { status: 404, headers })
  },
}
