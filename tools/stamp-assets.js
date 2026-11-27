#!/usr/bin/env node
// Adds ?v=<content hash> to every assets/ reference in the HTML under public/ (2026-11-27).
//
// Run by the deploy workflow, in the runner's checkout only, after styles.css is minified and
// before wrangler deploy. public/_headers caches /assets/* for a year as immutable; this is
// what makes that safe, because a changed file gets a new URL. Never commit its output: the
// source pages keep plain links so the site still opens straight from disk.
//
// Matches relative links only ("assets/x" and "../assets/x" in src= and href=). The absolute
// og:image URL is left alone on purpose (see _headers).

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const pub = path.join(__dirname, '..', 'public')
const hashes = new Map()
const hashOf = (name) => {
  if (!hashes.has(name)) {
    const file = path.join(pub, 'assets', name)
    if (!fs.existsSync(file)) throw new Error(`assets/${name} is linked but does not exist`)
    hashes.set(name, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10))
  }
  return hashes.get(name)
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : [])

let pages = 0
let links = 0
for (const file of walk(pub)) {
  const html = fs.readFileSync(file, 'utf8')
  const out = html.replace(/(\s(?:src|href)=")((?:\.\.\/)*assets\/)([^"?#]+)"/g, (_, attr, dir, name) => {
    links++
    return `${attr}${dir}${name}?v=${hashOf(name)}"`
  })
  if (out !== html) { fs.writeFileSync(file, out); pages++ }
}
console.log(`stamp-assets: ${links} links in ${pages} pages, ${hashes.size} files`)
