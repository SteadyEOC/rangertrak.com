// Smaller copies of the site's big pictures, and the srcset/sizes that lets a phone pick one.
// Lighthouse, 2026-10-20: About scored 72 on mobile because its first picture (1600 px wide,
// 440 KB) was drawn 368 px wide; every page with screenshots wasted 100-400 KB the same way.
//
//   node tools/responsive-images.mjs          # write missing or stale copies, update the HTML
//   node tools/responsive-images.mjs --check  # list what would change; exit 1 if anything
//
// Re-run after re-capturing a screenshot: a copy older than its source is remade. For every
// <img> in public/**/*.html whose source is a local JPEG or PNG wider than 560 px and that has
// no srcset yet, it writes NAME-480.ext and NAME-800.ext beside the source (only those narrower
// than it) and adds srcset and sizes. `sizes` follows the layout in assets/styles.css: side notes
// and insets are 15rem beside the text from 66rem up; .shot-grid is two to a row and .photo-pair
// three from 40em up; .photo-duo is always two; everything else is the 46rem reading column. On a
// phone all but .photo-duo are full width.
// The <a href> around a picture (the full-size or press copy) is left alone.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..', 'public')
const WIDTHS = [480, 800]
const MIN_WIDTH = 560
const check = process.argv.includes('--check')

const SIZES = {
  side: '(min-width: 66rem) 15rem, min(calc(100vw - 2.5rem), 46rem)',
  grid: '(min-width: 40em) 23rem, calc(100vw - 2.5rem)',
  trio: '(min-width: 40em) 15rem, calc(100vw - 2.5rem)',
  duo: 'min(calc(50vw - 1.5rem), 23rem)',
  column: 'min(calc(100vw - 2.5rem), 46rem)',
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return htmlFiles(p)
    return d.name.endsWith('.html') ? [p] : []
  })
}

// The class of the <figure> an <img> sits in, or '' when it is not inside one.
function figureClass(html, at) {
  const open = html.lastIndexOf('<figure', at)
  if (open < 0 || html.lastIndexOf('</figure>', at) > open) return ''
  const tag = html.slice(open, html.indexOf('>', open))
  return (tag.match(/class="([^"]*)"/) || [, ''])[1]
}

// Whether `at` is inside a <div class="NAME">: its figures hold no <div>, so no </div> since the
// opening means still inside.
function inside(html, at, name) {
  const open = html.lastIndexOf(`class="${name}"`, at)
  return open >= 0 && html.indexOf('</div>', open) > at
}

function sizesFor(html, at) {
  const cls = figureClass(html, at)
  if (/\b(sidenote|figure-inset)\b/.test(cls)) return SIZES.side
  if (inside(html, at, 'photo-duo')) return SIZES.duo
  if (inside(html, at, 'photo-pair')) return SIZES.trio
  if (inside(html, at, 'shot-grid') && !/\bshot-grid__wide\b/.test(cls)) return SIZES.grid
  return SIZES.column
}

const variantName = (src, w) => src.replace(/(\.\w+)$/, `-${w}$1`)

async function ensureVariant(file, w) {
  const out = variantName(file, w)
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs) return false
  if (check) return true
  const img = sharp(file).resize({ width: w })
  await (file.endsWith('.png') ? img.png({ compressionLevel: 9, palette: true }) : img.jpeg({ quality: 80, mozjpeg: true })).toFile(out)
  return true
}

let changes = 0
for (const page of htmlFiles(ROOT)) {
  let html = fs.readFileSync(page, 'utf8')
  const edits = []
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0]
    const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1]
    if (!src || /^(https?:|data:)/.test(src) || !/\.(jpe?g|png)$/i.test(src)) continue
    // A page may show a made copy (NAME-800.jpg) as its src; never copy a copy (NAME-800-480.jpg, 11-17).
    if (/-(480|800)\.(jpe?g|png)$/i.test(src)) continue
    const file = path.resolve(path.dirname(page), src)
    if (!fs.existsSync(file)) continue
    const { width } = await sharp(file).metadata()
    if (width <= MIN_WIDTH) continue
    const widths = WIDTHS.filter(w => w < width)
    for (const w of widths) if (await ensureVariant(file, w)) { changes++; console.log(`  copy  ${path.relative(ROOT, variantName(file, w))}`) }
    // Copies are checked first, so a re-captured picture that already has its srcset gets fresh copies (10-28).
    if (/\ssrcset=/.test(tag)) continue
    const sizes = sizesFor(html, m.index)
    const srcset = [...widths.map(w => `${variantName(src, w)} ${w}w`), `${src} ${width}w`].join(', ')
    edits.push({ at: m.index, tag, next: tag.replace(/\ssrc="[^"]+"/, s => `${s} srcset="${srcset}" sizes="${sizes}"`) })
  }
  if (!edits.length) continue
  changes += edits.length
  console.log(`  html  ${path.relative(ROOT, page)}: ${edits.length} picture(s)`)
  if (check) continue
  for (const e of edits.reverse()) html = html.slice(0, e.at) + e.next + html.slice(e.at + e.tag.length)
  fs.writeFileSync(page, html)
}
console.log(changes ? `${changes} change(s)${check ? ' needed' : ' made'}.` : 'Nothing to do.')
if (check && changes) process.exit(1)
