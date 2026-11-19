"""Storybook trail map of Bright Angel Trail - the chosen infographic direction (John,
2026-09-25, from a storybook-island-map reference). Top-down map, 3/4-view objects, cream
"shoreline" at every rim, the canyon stepping down in rock bands to the Colorado River.

One function per scene; `light` sets the time of day so the five scenes run morning to
night. Geography follows the real South Rim: Trailview Overlook west of Bright Angel
Trailhead, the Village and its lodges east of it, the trail switchbacking down to
Havasupai Gardens on the Tonto Platform, then to the river. Story follows the app's
Grand Canyon demo (Rim1 at Trailview Overlook, "no sign of the hiker").
"""
import os
import math
import random
from pathlib import Path

HERE = Path(__file__).parent
# Fonts the SVG links to (OFL: Lora, Bricolage Grotesque, Instrument Sans/Serif, JetBrains Mono
# and others). Set CANVAS_FONTS to a file:/// folder URL that holds them; default ./fonts/.
FONTS = os.environ.get('CANVAS_FONTS', (Path(__file__).parent / 'fonts').as_uri() + '/')
W, H = 1200, 675
NAVY, ORANGE, BLUE = '#12263F', '#F0700A', '#0B5FA8'
INK = '#2A2622'
CREAM = '#F6E9CC'

# rock bands, top of canyon to bottom
KAIBAB, COCONINO, SUPAI, REDWALL, TONTO, GORGE = '#F1DDB2', '#E9B676', '#D2703F', '#B24A34', '#BFA56C', '#7A3327'
LAND, LAND_EDGE = '#86B35E', '#4F7D3A'
PINE = ['#2F6A3F', '#3F8150', '#57985C']
TRUNK = '#7A4E2C'
RIVER, RIVER_BANK = '#8CC3D6', '#E3C394'


def font_css():
    faces = [('Title', 'BricolageGrotesque-Bold.ttf'), ('Body', 'InstrumentSans-Regular.ttf'),
             ('BodyB', 'InstrumentSans-Bold.ttf'), ('Map', 'InstrumentSerif-Italic.ttf')]
    return ''.join(f"@font-face{{font-family:'{f}';src:url('{FONTS}{file}')}}" for f, file in faces)


# ---------------------------------------------------------------- shape helpers
def smooth(pts):
    """Catmull-Rom through pts, as cubic Bezier segments (no initial M)."""
    d = []
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}')
    return ' '.join(d)


def edge(y, amp, seed, step=60):
    rnd = random.Random(seed)
    return [(x, y + rnd.uniform(-amp, amp)) for x in range(-20, W + 21, step)]


def band_below(pts, fill, stroke=None, sw=0):
    """Fill everything from this edge down to the bottom of the canvas."""
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<path d="M{pts[0][0]},{pts[0][1]:.1f} {smooth(pts)} L{W + 20},{H + 20} L-20,{H + 20} Z" fill="{fill}"{s}/>'


def band_above(pts, fill, stroke=None, sw=0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<path d="M{pts[0][0]},{pts[0][1]:.1f} {smooth(pts)} L{W + 20},-20 L-20,-20 Z" fill="{fill}"{s}/>'


def shift(pts, dy):
    return [(x, y + dy) for x, y in pts]


def pine(x, y, s=1.0, shade=0):
    c = PINE[shade % 3]
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<rect x="-2.5" y="-2" width="5" height="9" fill="{TRUNK}"/>'
            f'<path d="M0,-34 L11,-14 L6,-14 L14,0 L-14,0 L-6,-14 L-11,-14 Z" fill="{c}"/>'
            f'<path d="M0,-34 L11,-14 L6,-14 L14,0 L0,0 Z" fill="#000" opacity=".12"/></g>')


def grove(x, y, n=3, s=1.0, seed=0):
    rnd = random.Random(seed)
    out = [f'<ellipse cx="{x}" cy="{y + 4}" rx="{16 * n * s}" ry="{9 * s}" fill="{LAND_EDGE}" opacity=".35"/>']
    for i in range(n):
        dx = (i - (n - 1) / 2) * 17 * s + rnd.uniform(-3, 3)
        dy = rnd.uniform(-5, 4)
        out.append(pine(round(x + dx, 1), round(y + dy, 1), s * rnd.uniform(.85, 1.1), rnd.randrange(3)))
    return ''.join(out)


def cottonwood(x, y, r):
    return (f'<rect x="{x - 2}" y="{y}" width="4" height="{r * .9:.1f}" fill="{TRUNK}"/>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="#4E9A4F"/><circle cx="{x + r * .35:.1f}" cy="{y - r * .3:.1f}" r="{r * .55:.1f}" fill="#6DB35E"/>')


def building(x, y, w, h, roof, wall='#F7EEDC', s=1.0):
    """3/4-view building: front wall, pitched roof, windows."""
    win = ''.join(f'<rect x="{x + 6 + i * (w - 12) / 3:.1f}" y="{y - h + 10}" width="6" height="7" fill="{NAVY}" class="win"/>'
                  for i in range(3))
    return (f'<rect x="{x}" y="{y - h}" width="{w}" height="{h}" fill="{wall}" stroke="{INK}" stroke-width="1.5"/>'
            f'<path d="M{x - 4},{y - h} L{x + w / 2},{y - h - 18} L{x + w + 4},{y - h} Z" fill="{roof}" stroke="{INK}" stroke-width="1.5" stroke-linejoin="round"/>'
            f'{win}<rect x="{x + w / 2 - 4}" y="{y - 10}" width="8" height="10" fill="{TRUNK}"/>')


def butte(x, y, w):
    """Wedding-cake butte, three tiers, lit from the left like the reference's mountains."""
    out = []
    for i, (ww, hh, c) in enumerate([(w, 18, REDWALL), (w * .7, 16, SUPAI), (w * .42, 14, COCONINO)]):
        top = y - sum([18, 16, 14][:i + 1])
        out.append(f'<path d="M{x - ww / 2},{top + hh} L{x - ww / 2 + 6},{top} L{x + ww / 2 - 6},{top} L{x + ww / 2},{top + hh} Z" fill="{c}" stroke="{INK}" stroke-width="1.2" stroke-linejoin="round"/>'
                   f'<path d="M{x},{top} L{x + ww / 2 - 6},{top} L{x + ww / 2},{top + hh} L{x},{top + hh} Z" fill="#000" opacity=".16"/>')
    return f'<ellipse cx="{x}" cy="{y + 2}" rx="{w * .6}" ry="6" fill="#000" opacity=".15"/>' + ''.join(out)


def person(x, y, color, hat=True):
    """A small standing figure, 3/4 view, with a handheld radio in the right hand."""
    h = (f'<ellipse cx="{x}" cy="{y - 33}" rx="10" ry="2.6" fill="{INK}"/><path d="M{x - 5},{y - 33} L{x - 4},{y - 41} L{x + 4},{y - 41} L{x + 5},{y - 33} Z" fill="{INK}"/>' if hat else '')
    return (f'<ellipse cx="{x}" cy="{y}" rx="9" ry="3" fill="#000" opacity=".2"/>'
            f'<path d="M{x - 7},{y} L{x - 6},{y - 16} Q{x},{y - 22} {x + 6},{y - 16} L{x + 7},{y} Z" fill="{color}" stroke="{INK}" stroke-width="1.3"/>'
            f'<circle cx="{x}" cy="{y - 27}" r="6" fill="#E8B98F" stroke="{INK}" stroke-width="1.3"/>{h}'
            f'<rect x="{x + 7}" y="{y - 24}" width="5" height="9" rx="1" fill="{NAVY}"/><path d="M{x + 10},{y - 24} V{y - 32}" stroke="{NAVY}" stroke-width="1.6"/>')


def pin(x, y, color=ORANGE, s=1.0):
    return (f'<g transform="translate({x},{y}) scale({s})"><ellipse cy="1" rx="7" ry="2.5" fill="#000" opacity=".25"/>'
            f'<path d="M0,0 l-10,-14 a12.2,12.2 0 1 1 20,0 z" fill="{color}" stroke="{INK}" stroke-width="1.6"/>'
            f'<circle cy="-21" r="4.2" fill="#fff"/></g>')


def waves(cx, cy, r0, n, step, color, start=-38, end=38, w=4):
    out = []
    for i in range(n):
        r = r0 + i * step
        a0, a1 = math.radians(start), math.radians(end)
        out.append(f'<path d="M{cx + r * math.cos(a0):.1f},{cy + r * math.sin(a0):.1f} A{r},{r} 0 0 1 {cx + r * math.cos(a1):.1f},{cy + r * math.sin(a1):.1f}" '
                   f'fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" opacity="{1 - i * .2:.2f}"/>')
    return ''.join(out)


def squiggle(x, y, color='#FFFFFF', n=3):
    d = f'M{x},{y} ' + ' '.join(f'q4,-4 8,0 t8,0' for _ in range(n))
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>'


def mark(x, y, s, pin_c, signal):
    k = s / 32
    return (f'<g transform="translate({x},{y}) scale({k})"><path fill="{pin_c}" fill-rule="evenodd" '
            f'd="M 11.5 29 L 6.26 21.84 A 6.5 6.5 0 1 1 16.74 21.84 Z M 10.4 12.6 L 12.6 12.6 L 12.6 24.2 L 10.4 24.2 Z"/>'
            f'<g fill="none" stroke="{signal}" stroke-width="3" stroke-linecap="round"><path d="M 21.89 5 A 12 12 0 0 1 20.69 18.71"/>'
            f'<path d="M 26.22 2.5 A 17 17 0 0 1 24.52 21.93"/></g></g>')


def tag(x, y, text, size=14, cls='bb', pad=12, fill=CREAM, anchor='middle'):
    """A cream label pill, sized from an approximate text width."""
    w = len(text) * size * .56 + pad * 2
    x0 = x - w / 2 if anchor == 'middle' else x
    return (f'<rect x="{x0:.1f}" y="{y - size - 6}" width="{w:.1f}" height="{size + 14}" rx="{(size + 14) / 2}" fill="{fill}" stroke="{INK}" stroke-width="1.8"/>'
            f'<text x="{x0 + w / 2:.1f}" y="{y + 1}" text-anchor="middle" class="{cls}" font-size="{size}">{text}</text>')


# ---------------------------------------------------------------- the map itself
def g(x, c, w):
    return math.exp(-((x - c) / w) ** 2)


def river_y(x):
    return 224 + 9 * math.sin(x / 95) + 5 * math.sin(x / 37)


# side canyons cutting into each rim: (centre x, width, strength). Bright Angel's is the
# deepest on the south side; Bright Angel Canyon continues north across the river.
SOUTH_NOTCHES = [(505, 34, 1.0), (140, 30, .6), (860, 32, .8), (1110, 28, .7)]
NORTH_NOTCHES = [(640, 36, 1.0), (300, 28, .6), (1000, 30, .7)]


def notch(x, notches):
    return sum(s * g(x, c, w) for c, w, s in notches)


def rim_s(x):
    """South Rim edge: Trailview Overlook's promontory juts out, side canyons bite in."""
    return 492 + 8 * math.sin(x / 140 + 1) + 5 * math.sin(x / 61 + 2) - 16 * g(x, 300, 42) + 16 * notch(x, SOUTH_NOTCHES)


def rim_n(x):
    return 114 + 7 * math.sin(x / 150 + 3) + 4 * math.sin(x / 47) - 12 * notch(x, NORTH_NOTCHES)


XS = list(range(-40, W + 41, 20))


def south_band(off, ph):
    """A rock band's top edge: the rim's shape, set back by `off`, reaching further in along side canyons."""
    return [(x, max(rim_s(x) - off + notch(x, SOUTH_NOTCHES) * off * .42 + 3 * math.sin(x / 53 + ph), river_y(x) + 34)) for x in XS]


def north_band(off, ph):
    return [(x, min(rim_n(x) + off - notch(x, NORTH_NOTCHES) * off * .42 + 3 * math.sin(x / 49 + ph), river_y(x) - 24)) for x in XS]


TRAILHEAD = (478, round(rim_s(478)))
OVERLOOK = (300, round(rim_s(300)) + 4)
GARDENS = (566, 326)
TRAIL = [TRAILHEAD, (494, 492), (512, 482), (494, 470), (516, 458), (496, 446), (518, 432), (500, 418),
         (522, 402), (512, 386), (534, 370), (548, 350), GARDENS, (596, 304), (616, 288), (604, 274),
         (632, 260), (648, round(river_y(648)) + 12)]


def canyon_map():
    L = [f'<rect width="{W}" height="{H}" fill="{GORGE}"/>']
    # south side: lowest band first, so each band above overlaps the one below it
    tonto_top = [(x, river_y(x) + 38 + 6 * math.sin(x / 70 + 1)) for x in XS]
    L.append(band_below(tonto_top, TONTO, INK, 1.2))
    for off, fill, ph in [(126, REDWALL, 1), (72, SUPAI, 2), (34, COCONINO, 3), (12, KAIBAB, 4)]:
        L.append(band_below(south_band(off, ph), fill, INK, 1.2))
    L.append(band_below([(x, rim_s(x)) for x in XS], LAND, LAND_EDGE, 5))
    # north side, mirrored and compressed by distance
    for off, fill, ph in [(84, REDWALL, 5), (54, SUPAI, 6), (32, COCONINO, 7), (12, KAIBAB, 8)]:
        L.append(band_above(north_band(off, ph), fill, INK, 1.2))
    L.append(band_above([(x, rim_n(x)) for x in XS], LAND, LAND_EDGE, 5))
    # the river, with its sand bank
    river = [(x, river_y(x)) for x in XS]
    rd = f'M{river[0][0]},{river[0][1]:.1f} {smooth(river)}'
    L.append(f'<path d="{rd}" fill="none" stroke="{RIVER_BANK}" stroke-width="38" stroke-linecap="round"/>')
    L.append(f'<path d="{rd}" fill="none" stroke="{RIVER}" stroke-width="24" stroke-linecap="round"/>')
    L += [squiggle(x, river_y(x) + 1) for x in (110, 400, 760, 1050)]
    L.append(f'<g transform="translate(880,{river_y(880):.1f}) rotate(-8)"><rect x="-18" y="-6" width="36" height="12" rx="6" fill="#F5B83D" stroke="{INK}" stroke-width="1.5"/>'
             f'<circle cx="-7" cy="-2" r="3" fill="#C8341E"/><circle cx="6" cy="-2" r="3" fill="{BLUE}"/></g>')
    # buttes standing on the Tonto Platform
    L.append(butte(190, 338, 92))
    L.append(butte(1000, 336, 108))
    L.append(butte(1128, 318, 60))
    # Havasupai Gardens: a green oasis on the Tonto
    gx, gy = GARDENS
    oasis = [(gx - 48, gy + 6), (gx - 22, gy - 16), (gx + 24, gy - 16), (gx + 52, gy + 4), (gx + 16, gy + 20), (gx - 48, gy + 6)]
    L.append(f'<path d="M{oasis[0][0]},{oasis[0][1]} {smooth(oasis)}" fill="#7DB75E" stroke="{LAND_EDGE}" stroke-width="2.5"/>')
    L += [cottonwood(gx + dx, gy + dy, r) for dx, dy, r in [(-28, 2, 8), (-10, -6, 9), (10, 0, 8), (30, -2, 7)]]
    # the trail itself
    td = 'M' + ' L'.join(f'{x},{y}' for x, y in TRAIL)
    L.append(f'<path d="{td}" fill="none" stroke="{INK}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round" opacity=".6"/>')
    L.append(f'<path d="{td}" fill="none" stroke="#FFF6E2" stroke-width="3" stroke-dasharray="7 5" stroke-linejoin="round" stroke-linecap="round"/>')
    # rims: groves and the Village
    for x, y, n, sd in [(650, 84, 3, 1), (770, 92, 4, 2), (910, 84, 3, 3), (1010, 96, 2, 4), (1098, 82, 3, 5),
                        (62, 566, 3, 6), (156, 622, 4, 7), (575, 590, 3, 8), (630, 646, 2, 9), (1122, 566, 3, 10), (1150, 636, 2, 11)]:
        L.append(grove(x, y, n, 1.0, sd))
    L.append(building(690, 566, 70, 32, '#8E3B2B'))          # the big lodge
    L.append(building(772, 556, 38, 26, '#5A3B22'))
    L.append(building(1000, 556, 44, 26, '#5A3B22'))
    L.append(building(1052, 602, 36, 24, '#8E3B2B'))
    # overlook platform with its railing
    ox, oy = OVERLOOK
    L.append(f'<path d="M{ox - 26},{oy + 2} A26,16 0 0 1 {ox + 26},{oy + 2} Z" fill="#D9C8A4" stroke="{INK}" stroke-width="1.5"/>')
    L.append(f'<path d="M{ox - 24},{oy - 2} A24,14 0 0 1 {ox + 24},{oy - 2}" fill="none" stroke="{INK}" stroke-width="1.5" stroke-dasharray="1 4"/>')
    return '\n'.join(L)


def map_labels():
    return '\n'.join([
        f'<text x="330" y="{river_y(330) - 18:.0f}" text-anchor="middle" class="map" font-size="17">Colorado River</text>',
        f'<text x="{GARDENS[0] + 60}" y="{GARDENS[1] + 8}" class="map" font-size="16">Havasupai Gardens</text>',
        f'<text x="542" y="428" class="map" font-size="16">Bright Angel Trail</text>',
        f'<text x="{OVERLOOK[0] - 62}" y="{OVERLOOK[1] + 32}" class="map" font-size="16">Trailview Overlook</text>',
        f'<text x="{TRAILHEAD[0] - 10}" y="{TRAILHEAD[1] + 30}" class="map" font-size="15">Trailhead</text>',
        f'<text x="720" y="596" class="map" font-size="16">Grand Canyon Village</text>',
    ])


def compass(x, y):
    return (f'<g transform="translate({x},{y})"><circle r="20" fill="{CREAM}" stroke="{INK}" stroke-width="1.8"/>'
            f'<path d="M0,-16 L5,0 L0,16 L-5,0 Z" fill="{INK}"/><path d="M0,-16 L5,0 L-5,0 Z" fill="{ORANGE}"/>'
            f'<text y="-25" text-anchor="middle" class="bb" font-size="12">N</text></g>')


def light_overlay(light):
    """Time of day as a multiply wash over the whole map (not the labels)."""
    wash = {'morning': ('#FFE3B0', .22), 'midday': (None, 0), 'afternoon': ('#FFC98A', .25),
            'dusk': ('#B86A8A', .42), 'night': ('#1E2A5C', .68)}[light]
    if not wash[0]:
        return ''
    return f'<rect width="{W}" height="{H}" fill="{wash[0]}" opacity="{wash[1]}" style="mix-blend-mode:multiply"/>'


def frame(title, subtitle, time_label, body, light='midday', badges=()):
    chips = ''
    x = 250
    for b in badges:
        w = len(b) * 14 * .56 + 24
        chips += tag(x + w / 2, 648, b, 14)
        x += w + 12
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>{font_css()}
 .t{{font-family:Title;fill:{INK}}} .b{{font-family:Body;fill:{INK}}} .bb{{font-family:BodyB;fill:{INK}}}
 .map{{font-family:Map;fill:{INK};stroke:{CREAM};stroke-width:3.5px;paint-order:stroke;stroke-linejoin:round}}</style>
{canyon_map()}
{light_overlay(light)}
{map_labels()}
{body}
<!-- title plaque on the North Rim -->
<rect x="26" y="20" width="560" height="84" rx="14" fill="{CREAM}" stroke="{INK}" stroke-width="2.5"/>
<text x="48" y="68" class="t" font-size="42">{title}</text>
<text x="50" y="92" class="bb" font-size="13" letter-spacing="2.5">{subtitle}</text>
{tag(1100, 44, time_label, 15)}
{compass(1150, 150)}
<!-- brand + feature chips on the South Rim -->
<rect x="22" y="626" width="206" height="38" rx="19" fill="{CREAM}" stroke="{INK}" stroke-width="1.8"/>
{mark(34, 630, 30, INK, ORANGE)}
<text x="70" y="652" class="bb" font-size="16">rangertrak.com</text>
{chips}
</svg>'''


# ---------------------------------------------------------------- scene 2: radio in, map out
def scene_radio():
    cp = (905, 600)
    body = []
    # Rim1's route: checked in at the trailhead, then moved west to the overlook (the demo's own reports)
    body.append(f'<path d="M{TRAILHEAD[0]},{TRAILHEAD[1] + 4} C430,512 360,512 {OVERLOOK[0] + 10},{OVERLOOK[1] + 6}" fill="none" stroke="{ORANGE}" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>')
    body.append(f'<circle cx="{TRAILHEAD[0]}" cy="{TRAILHEAD[1] + 4}" r="5" fill="{ORANGE}" stroke="{INK}" stroke-width="1.4"/>')
    ox, oy = OVERLOOK
    body.append(person(ox - 14, oy + 2, '#2F6A3F'))
    body.append(waves(ox - 4, oy - 28, 16, 4, 14, ORANGE, -82, -12))
    # the call, in a speech bubble over the canyon
    bx, by = 36, 360
    tip = (ox - 18, oy - 44)
    body.append(f'<path d="M{bx + 196},{by + 58} L{tip[0]},{tip[1]} L{bx + 230},{by + 58} Z" fill="{CREAM}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>')
    body.append(f'<rect x="{bx}" y="{by}" width="300" height="62" rx="12" fill="{CREAM}" stroke="{INK}" stroke-width="2.2"/>')
    body.append(f'<rect x="{bx + 198}" y="{by + 55}" width="30" height="5" fill="{CREAM}"/>')
    body.append(f'<text x="{bx + 16}" y="{by + 26}" class="bb" font-size="16">“Rim 1, Trailview Overlook.</text>')
    body.append(f'<text x="{bx + 16}" y="{by + 48}" class="b" font-size="16">No sign of the hiker.”</text>')
    # the command post and its laptop
    body.append(f'<path d="M{cp[0] - 44},{cp[1] - 44} L{cp[0] - 32},{cp[1] - 58} L{cp[0] + 32},{cp[1] - 58} L{cp[0] + 44},{cp[1] - 44} Z" fill="{ORANGE}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>')
    body.append(f'<path d="M{cp[0] - 38},{cp[1] - 44} V{cp[1]} M{cp[0] + 38},{cp[1] - 44} V{cp[1]}" stroke="{INK}" stroke-width="3"/>')
    body.append(f'<rect x="{cp[0] - 30}" y="{cp[1] - 18}" width="60" height="5" fill="{INK}"/>')
    body.append(f'<rect x="{cp[0] - 13}" y="{cp[1] - 34}" width="26" height="16" rx="2" fill="{NAVY}"/><rect x="{cp[0] - 10}" y="{cp[1] - 31}" width="20" height="10" fill="#9FD2E6"/>')
    body.append(person(cp[0] + 20, cp[1] - 2, BLUE, hat=False))
    body.append(tag(cp[0], cp[1] - 72, 'Command Post', 14))
    # radio path from the overlook to the command post
    body.append(f'<path d="M{OVERLOOK[0] + 40},{OVERLOOK[1] + 22} C520,560 740,530 {cp[0] - 50},{cp[1] - 30}" fill="none" stroke="{ORANGE}" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round"/>')
    # RangerTrak drops the pin where the report says
    body.append(pin(ox + 22, oy - 2, ORANGE, 1.2))
    body.append(tag(ox + 104, oy - 8, 'Rim1 · 10:44', 13))
    return frame('Radio in. Map out.', 'BRIGHT ANGEL TRAIL · NO INTERNET NEEDED', '☀ 10:44', ''.join(body), 'midday',
                 ['Works with no Internet', 'Any grid', '309 &amp; 213'])


if __name__ == '__main__':
    (HERE / 'storybook-2-radio.svg').write_text(scene_radio(), encoding='utf-8')
    print('wrote storybook-2-radio.svg')
