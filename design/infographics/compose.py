"""Compose the Bright Angel search map: sidebar radio log + real-terrain map + close-up insets.

    python build_map.py   # terrain raster (map-base.png)
    python compose.py     # bright-angel-search.svg
    .\\render_one.ps1 bright-angel-search.svg 1600 1300 -Scale 2
"""
import os
import json
import math
from pathlib import Path

import numpy as np

from build_map import COLS, ROWS, OSM, contour_paths, to_px

HERE = Path(__file__).parent
# Fonts the SVG links to (OFL: Lora, Bricolage Grotesque, Instrument Sans/Serif, JetBrains Mono
# and others). Set CANVAS_FONTS to a file:/// folder URL that holds them; default ./fonts/.
SK = os.environ.get('CANVAS_FONTS', (Path(__file__).parent / 'fonts').as_uri() + '/')
W, H = 1600, 1300
K = H / ROWS                      # map scale: DEM px -> canvas px
X0 = W - COLS * K                 # map's left edge on the canvas
SIDEBAR = X0

INK = '#3B2A1C'
PAPER = '#F2E7CF'
RED = '#7E2418'                   # title and section bars, like the reference
NAVY = '#12263F'
ORANGE = '#F0700A'
TEAM = {'cp': NAVY, 'west': '#B3261E', 'east': '#D9771E', 'below': '#1F5FA8', 'med': '#2E7D4F', 'liaison': '#6B4C9A'}


def P(lat, lon):
    x, y = to_px(lat, lon)
    return X0 + x * K, y * K


def C(x, y):
    """DEM px -> canvas."""
    return X0 + x * K, y * K


def d_of(pts):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)


def dist_m(a, b):
    (la1, lo1), (la2, lo2) = a, b
    dy = (la2 - la1) * 111_200
    dx = (lo2 - lo1) * 111_320 * math.cos(math.radians(la1))
    return math.hypot(dx, dy)


# ---------------------------------------------------------------- data from OSM
def osm_ways(name):
    return [[(p['lat'], p['lon']) for p in e['geometry']] for e in OSM['elements']
            if e['type'] == 'way' and e.get('tags', {}).get('name') == name]


def osm_ways_tag(key, vals):
    return [[(p['lat'], p['lon']) for p in e['geometry']] for e in OSM['elements']
            if e['type'] == 'way' and e.get('tags', {}).get(key) in vals]


# ---- places: the app's own GC table (sample-data.service.ts, 0.96.3), all from OSM
TRAILHEAD = (36.0573, -112.1436)
CP = (36.0524, -112.1437)          # Backcountry Information Center
KOLB = (36.0580, -112.1426)
VERKAMPS = (36.0576, -112.1357)
MUSEUM = (36.0653, -112.1176)
YAVAPAI = (36.0660, -112.1169)
MATHER = (36.0617, -112.1090)
TRAILVIEW = (36.0620, -112.1468)
MARICOPA = (36.0704, -112.1483)
POWELL = (36.0729, -112.1520)
HOPI = (36.0745, -112.1549)
TUNNEL1 = (36.0580, -112.1465)
TUNNEL2 = (36.0593, -112.1430)
MILE15 = (36.0604, -112.1393)
MILE3 = (36.0657, -112.1362)


def rim_nodes(lat_lo, lat_hi, lon_lo, lon_hi):
    return [(la, lo) for n in ('Rim Trail', 'West Rim Trail') for w in osm_ways(n) for la, lo in w
            if lat_lo <= la <= lat_hi and lon_lo <= lo <= lon_hi]


def binned(nodes, axis, lo, hi, bins):
    """One median point per bin along `axis`, so parallel sidewalks don't zig-zag the route."""
    edges = np.linspace(lo, hi, bins + 1)
    out = []
    for a_, b_ in zip(edges, edges[1:]):
        sel = [p for p in nodes if a_ <= p[axis] < b_]
        if sel:
            out.append((float(np.median([p[0] for p in sel])), float(np.median([p[1] for p in sel]))))
    return out


def rim_route(lon_from, lon_to, lat_max, bins):
    """Rim Trail between two longitudes (for the east side, which runs west to east)."""
    return binned(rim_nodes(36.0, lat_max, min(lon_from, lon_to), max(lon_from, lon_to)), 1,
                  min(lon_from, lon_to), max(lon_from, lon_to), bins)


def bright_angel_from_trailhead(metres):
    """The Bright Angel Trail from the trailhead down, as far as `metres` along it."""
    best = None
    for w in osm_ways('Bright Angel Trail'):
        for seq in (w, w[::-1]):
            if dist_m(seq[0], TRAILHEAD) < 120:
                best = seq if best is None or len(seq) > len(best) else best
    out, run = [best[0]], 0
    for a, b in zip(best, best[1:]):
        run += dist_m(a, b)
        out.append(b)
        if run > metres:
            break
    return out


def along(pts, metres):
    run = 0
    for a, b in zip(pts, pts[1:]):
        run += dist_m(a, b)
        if run >= metres:
            return b
    return pts[-1]


def trail_to(target, max_m=9000):
    """Bright Angel Trail from the trailhead to the trail point nearest `target`."""
    pts = bright_angel_from_trailhead(max_m)
    i = min(range(len(pts)), key=lambda k: dist_m(pts[k], target))
    return pts[:i + 1] + [target]


# Rim-West runs north-west to Hopi, so bin it by latitude; Rim-East west to east, by longitude
WEST = [TRAILHEAD] + binned(rim_nodes(TRAILHEAD[0], HOPI[0], HOPI[1] - .0005, TRAILHEAD[1]), 0, TRAILHEAD[0], HOPI[0], 26) + [HOPI]
EAST = [KOLB] + rim_route(KOLB[1], MATHER[1], YAVAPAI[0] + .0003, 60) + [MATHER]
BELOW = trail_to(MILE3)


# ---------------------------------------------------------------- the log
# The demo's own reports (minutes before load), as clock times from a 07:30 start.
LOG = [
    ('EARLY MORNING · A HIKER OVERDUE', [
        (1, '07:30', '!CmdPost', 'Command post opens. Net open on primary.', 'cp', CP),
        (2, '07:32', 'IC-Actual', 'Hiker, 19, overdue: down at dawn, one liter.', 'cp', CP),
        (3, '07:40', 'Liaison1', 'With the parents. Red pack, white sun hat.', 'liaison', CP),
    ]),
    ('MORNING · DOWN THE TRAIL AND ALONG THE RIM', [
        (4, '07:48', 'Below1', 'Below-Rim starts down with extra water.', 'below', TRAILHEAD),
        (5, '08:06', 'Rim2', 'Trailview Overlook. No sign.', 'west', TRAILVIEW),
        (6, '08:08', 'Below1 · EVIDENCE', 'White sun hat just past the second tunnel.', 'below', TUNNEL2),
        (7, '08:24', 'Below2', '1.5 Mile: a red pack seen heading down.', 'below', MILE15),
        (8, '08:30', 'Rim3 · URGENT · ICS-213', 'Phoned-in sighting at Yavapai Point.', 'east', YAVAPAI),
        (9, '08:42', 'Rim3', 'A different hiker, by the geology museum.', 'east', MUSEUM),
    ]),
    ('FOUND AT 3 MILE', [
        (10, '08:52', 'Below1 · URGENT · ICS-213', 'Hiker found at 3 Mile. Heat exhaustion.', 'below', MILE3),
        (11, '09:04', 'Rim4', 'Rim-East stands down at Mather Point.', 'east', MATHER),
        (12, '09:06', 'Rim2', 'Rim-West stands down at Hopi Point.', 'west', HOPI),
        (13, '09:10', 'Medic1', 'On scene at 3 Mile. Slow walk-out planned.', 'med', MILE3),
    ]),
    ('WALKING OUT AND HANDING OFF', [
        (14, '11:56', 'Liaison1', 'Parents reunited with the hiker, trailhead.', 'liaison', TRAILHEAD),
        (15, '13:02', '!CmdPost', 'Mission backed up; 309 log printed for handoff.', 'cp', CP),
    ]),
]

# where each spot's markers go: (base angle in degrees, radius) for a fan, else an (dx, dy) nudge
MARKER_LAYOUT = {
    CP: ('fan', -150, 44, 36), TRAILHEAD: ('fan', -70, 38, 44), MILE3: ('fan', -40, 40, 44),
    MUSEUM: ('nudge', -24, 12), YAVAPAI: ('nudge', 4, -18),
}


def wrap(text, n):
    words, lines, cur = text.split(), [], ''
    for w in words:
        if len(cur) + len(w) + 1 > n:
            lines.append(cur)
            cur = w
        else:
            cur = f'{cur} {w}'.strip()
    return lines + [cur]


# ---------------------------------------------------------------- pieces
def fonts():
    faces = [('Slab', 'fonts/AlfaSlabOne-Regular.ttf'), ('Cond', 'fonts/Oswald[wght].ttf'),
             ('Serif', SK + 'Lora-Regular.ttf'), ('SerifI', SK + 'Lora-Italic.ttf'), ('SerifB', SK + 'Lora-Bold.ttf')]
    return ''.join(f"@font-face{{font-family:'{f}';src:url('{u}')}}" for f, u in faces)


def marker(n, x, y, color, r=12.5):
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 2.5}" fill="{PAPER}"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{color}" stroke="{INK}" stroke-width="1.2"/>'
            f'<text x="{x:.1f}" y="{y + 4.6:.1f}" text-anchor="middle" class="num" font-size="{13 if n < 10 else 12}">{n}</text>')


def callout(x, y, lines, anchor='start', size=13):
    """Cream label box, like the reference's white tags."""
    w = max(len(l) for l in lines) * size * .52 + 14
    h = len(lines) * (size + 3) + 9
    x0 = x if anchor == 'start' else x - w
    out = [f'<rect x="{x0:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="2" fill="#FBF6EA" stroke="#8C7A60" stroke-width="1" opacity=".96"/>']
    for i, l in enumerate(lines):
        out.append(f'<text x="{x0 + 7:.1f}" y="{y + 16 + i * (size + 3):.1f}" class="{"lab" if i else "labb"}" font-size="{size}">{l}</text>')
    return ''.join(out)


def compass(x, y, r=46):
    pts_long = [(0, -r), (7, -7), (r, 0), (7, 7), (0, r), (-7, 7), (-r, 0), (-7, -7)]
    out = [f'<g transform="translate({x},{y})">',
           f'<circle r="{r * .62}" fill="none" stroke="{NAVY}" stroke-width="1"/>',
           f'<path d="M{" L".join(f"{a},{b}" for a, b in pts_long)} Z" fill="{NAVY}"/>']
    for ang in range(0, 360, 90):
        out.append(f'<path d="M0,0 L0,{-r} L7,-7 Z" fill="{PAPER}" opacity=".85" transform="rotate({ang})"/>')
    for ang in (45, 135, 225, 315):
        out.append(f'<path d="M0,{-r * .6} L4,-4 L-4,-4 Z" fill="{NAVY}" transform="rotate({ang})"/>')
    for lab, (a, b) in {'N': (0, -r - 8), 'E': (r + 12, 5), 'S': (0, r + 18), 'W': (-r - 12, 5)}.items():
        out.append(f'<text x="{a}" y="{b}" text-anchor="middle" class="serifb" font-size="16" fill="{NAVY}">{lab}</text>')
    out.append('</g>')
    return ''.join(out)


def scalebar(x, y):
    km = 1000 * K * (COLS / (5_940))   # px per km on the canvas
    mi = km * 1.609
    out = [f'<g transform="translate({x},{y})">']
    mi = mi / 2      # a half-mile bar fits the corner; the km bar sits under it
    for i in range(4):
        out.append(f'<rect x="{i * mi / 4:.1f}" y="0" width="{mi / 4:.1f}" height="6" fill="{INK if i % 2 == 0 else PAPER}" stroke="{INK}" stroke-width="1"/>')
    for lab, xx in [('0', 0), ('¼', mi / 2), ('½ mile', mi)]:
        out.append(f'<text x="{xx:.1f}" y="-6" text-anchor="middle" class="lab" font-size="12">{lab}</text>')
    out.append(f'<path d="M0,14 H{km:.1f}" stroke="{INK}" stroke-width="1.5"/><path d="M0,10 V18 M{km:.1f},10 V18 M{km / 2:.1f},12 V16" stroke="{INK}" stroke-width="1.5"/>')
    out.append(f'<text x="{km:.1f}" y="32" text-anchor="middle" class="lab" font-size="12">1 km</text><text x="0" y="32" text-anchor="middle" class="lab" font-size="12">0</text>')
    out.append('</g>')
    return ''.join(out)


def inset_frame(cx, cy, r, target, caption, body):
    """Circular close-up with a double ring, a leader line to its place on the map, and a caption ribbon."""
    tx, ty = target
    ang = math.atan2(ty - cy, tx - cx)
    ex, ey = cx + r * math.cos(ang), cy + r * math.sin(ang)
    cid = f'clip{int(cx)}{int(cy)}'
    cw = len(caption) * 6.6 + 26
    return f'''<path d="M{ex:.1f},{ey:.1f} L{tx:.1f},{ty:.1f}" stroke="{INK}" stroke-width="1.6" stroke-dasharray="4 3"/>
<circle cx="{tx:.1f}" cy="{ty:.1f}" r="5" fill="none" stroke="{INK}" stroke-width="1.6"/>
<clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>
<circle cx="{cx}" cy="{cy}" r="{r + 7}" fill="{PAPER}" stroke="{INK}" stroke-width="1.4"/>
<g clip-path="url(#{cid})"><g transform="translate({cx},{cy})">{body}</g></g>
<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{INK}" stroke-width="2.2"/>
<rect x="{cx - cw / 2:.1f}" y="{cy + r - 4}" width="{cw:.1f}" height="24" rx="3" fill="{NAVY}"/>
<text x="{cx}" y="{cy + r + 13}" text-anchor="middle" class="rib" font-size="12.5">{caption}</text>'''


def person_side(x, y, shirt, pack, facing=1, talking=False, hat='#C9A66B'):
    """Side-view searcher: sun hat, daypack, handy-talkie. y is the feet."""
    f = facing
    radio_x = x + 9 * f
    out = [f'<g stroke="{INK}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">',
           # legs and boots
           f'<path d="M{x - 4},{y - 34} L{x - 6},{y - 2} M{x + 4},{y - 34} L{x + 7},{y - 2}" stroke-width="6" stroke="#5A4A3A"/>',
           f'<path d="M{x - 10},{y} h9 M{x + 3},{y} h9" stroke-width="4" stroke="{INK}"/>',
           # pack behind
           f'<rect x="{x - 15 * f - (0 if f > 0 else 12)}" y="{y - 66}" width="12" height="28" rx="4" fill="{pack}"/>',
           # torso
           f'<path d="M{x - 8},{y - 34} L{x - 9},{y - 64} Q{x},{y - 70} {x + 9},{y - 64} L{x + 8},{y - 34} Z" fill="{shirt}"/>',
           # head, hat
           f'<circle cx="{x + 2 * f}" cy="{y - 76}" r="7.5" fill="#E2B48C"/>',
           f'<ellipse cx="{x + 2 * f}" cy="{y - 81}" rx="13" ry="3" fill="{hat}"/><path d="M{x - 5 + 2 * f},{y - 81} Q{x + 2 * f},{y - 92} {x + 9 + 2 * f},{y - 81} Z" fill="{hat}"/>']
    if talking:   # radio raised to the mouth
        out += [f'<path d="M{x + 6 * f},{y - 60} L{x + 12 * f},{y - 70}" stroke-width="5" stroke="{shirt}"/>',
                f'<rect x="{radio_x + (0 if f > 0 else -6)}" y="{y - 84}" width="6" height="14" rx="1.5" fill="{NAVY}"/>',
                f'<path d="M{radio_x + 3 * (1 if f > 0 else -1)},{y - 84} V{y - 96}" stroke-width="1.6"/>']
    else:         # radio clipped to the pack strap
        out += [f'<rect x="{x + 2 * f - 3}" y="{y - 60}" width="6" height="12" rx="1.5" fill="{NAVY}"/>',
                f'<path d="M{x + 2 * f},{y - 60} V{y - 70}" stroke-width="1.4"/>',
                f'<path d="M{x + 9 * f},{y - 60} L{x + 14 * f},{y - 40} L{x + 18 * f},{y - 2}" stroke-width="1.8" fill="none"/>']  # trekking pole
    out.append('</g>')
    return ''.join(out)


def scaled(svg, x, y, s):
    return f'<g transform="translate({x},{y}) scale({s})">{svg}</g>'


def team_inset_body():
    b = []
    # canyon backdrop: sky, far rim, red ledges stepping down, the trail ledge they stand on
    b.append('<rect x="-130" y="-130" width="260" height="260" fill="#DCE6EA"/>')
    b.append('<path d="M-130,-46 L-80,-50 L-60,-42 L-10,-46 L20,-58 L60,-52 L90,-56 L130,-50 V130 H-130 Z" fill="#B9848A"/>')
    for yy, c in [(-34, '#C06A4E'), (-14, '#B4553C'), (6, '#C98663'), (24, '#B96B50')]:
        b.append(f'<path d="M-130,{yy} Q-60,{yy - 6} 0,{yy + 2} T130,{yy - 4} V130 H-130 Z" fill="{c}"/>')
        b.append(f'<path d="M-130,{yy} Q-60,{yy - 6} 0,{yy + 2} T130,{yy - 4}" stroke="{INK}" stroke-width=".8" fill="none" opacity=".5"/>')
    b.append(f'<path d="M-130,58 Q-40,48 40,54 T130,50 V130 H-130 Z" fill="#D8BE92" stroke="{INK}" stroke-width="1.3"/>')
    b.append(f'<path d="M-110,76 Q-20,68 60,74" stroke="#B89A6C" stroke-width="3" fill="none" stroke-dasharray="6 5"/>')
    b.append(f'<path d="M70,56 C64,30 84,18 94,34 C108,20 120,40 110,56 Z" fill="#4E6B3C" stroke="{INK}" stroke-width="1.2"/>')
    # two searchers, bigger: one on the handy-talkie, one with a trekking pole
    b.append(scaled(person_side(0, 0, '#1F5FA8', '#6B5B3E', 1, talking=True), -34, 66, 1.3))
    b.append(scaled(person_side(0, 0, '#3A7A4E', '#8A3B2B', -1, talking=False, hat='#A8835A'), 30, 68, 1.3))
    for i in range(3):
        r = 10 + i * 9
        cx, cy = -18, -54
        b.append(f'<path d="M{cx + r * .5:.1f},{cy - r * .86:.1f} A{r},{r} 0 0 1 {cx + r:.1f},{cy:.1f}" stroke="{ORANGE}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="{1 - i * .25}"/>')
    return ''.join(b)


def canopy(x, y, w, color, sign):
    sw = len(sign) * 5.9 + 10
    return (f'<path d="M{x - w / 2},{y} L{x - w / 2 + 8},{y - 16} L{x + w / 2 - 8},{y - 16} L{x + w / 2},{y} Z" fill="{color}" stroke="{INK}" stroke-width="1.4" stroke-linejoin="round"/>'
            f'<path d="M{x - w / 2 + 3},{y} V{y + 64} M{x + w / 2 - 3},{y} V{y + 64}" stroke="{INK}" stroke-width="2.2"/>'
            f'<text x="{x}" y="{y - 3.5}" text-anchor="middle" class="sign" font-size="9" fill="#FBF3E2" style="fill:#FBF3E2">{sign}</text>')


def cp_inset_body():
    b = []
    b.append('<rect x="-140" y="-140" width="280" height="280" fill="#E4ECEE"/>')
    for tx, s in [(-104, 1), (-82, 1.25), (78, 1.2), (102, 1)]:
        b.append(f'<path d="M{tx},-34 C{tx - 15 * s},-38 {tx - 13 * s},{-66 * s} {tx},{-70 * s} C{tx + 13 * s},{-66 * s} {tx + 15 * s},-38 {tx},-34 Z" fill="#5E7A48" stroke="{INK}" stroke-width="1"/>')
    b.append(f'<path d="M-140,-34 H140 V140 H-140 Z" fill="#D9C79F"/><path d="M-140,-34 H140" stroke="{INK}" stroke-width="1"/>')
    # three stations under pop-up canopies
    b.append(canopy(-64, -46, 60, '#B3261E', 'COMMAND'))
    b.append(canopy(0, -46, 60, '#D9771E', 'OPS'))
    b.append(canopy(64, -46, 60, NAVY, 'COMMS'))
    # command: map board and the IC
    b.append(f'<rect x="-86" y="-24" width="24" height="18" fill="#F4EAD2" stroke="{INK}" stroke-width="1.1"/><path d="M-83,-19 q6,-3 10,3 t9,1" stroke="#B3261E" stroke-width="1.3" fill="none"/>')
    b.append(scaled(person_side(0, 0, '#6B5B3E', '#6B5B3E', -1, hat='#8A7050'), -52, 18, .72))
    # ops: section chief
    b.append(scaled(person_side(0, 0, '#3A7A4E', '#6B5B3E', 1, hat='#C9A66B'), 0, 18, .72))
    # comms: table with the RangerTrak laptop and a printer feeding out a 309
    b.append(f'<rect x="40" y="-6" width="50" height="4" fill="{INK}"/><path d="M44,-2 V18 M86,-2 V18" stroke="{INK}" stroke-width="1.8"/>')
    b.append(f'<path d="M42,-6 L45,-22 L64,-22 L66,-6 Z" fill="{NAVY}" stroke="{INK}" stroke-width="1"/><rect x="47" y="-20" width="15" height="11" fill="#E9DDBF"/>')
    b.append(f'<circle cx="51" cy="-14" r="1.6" fill="#B3261E"/><circle cx="56" cy="-12" r="1.6" fill="#1F5FA8"/><circle cx="58" cy="-17" r="1.6" fill="{ORANGE}"/>')
    b.append(f'<rect x="70" y="-15" width="18" height="9" rx="1.5" fill="#CFC8BA" stroke="{INK}" stroke-width="1"/><path d="M73,-15 V-27 H85 V-15" fill="#FFFFFF" stroke="{INK}" stroke-width="1"/><path d="M75,-23 h8 M75,-20 h8" stroke="{INK}" stroke-width=".7"/>')
    b.append(f'<rect x="52" y="-12" width="14" height="6" rx="1" fill="{INK}"/><circle cx="62" cy="-9" r="1.4" fill="{ORANGE}"/>')
    b.append(scaled(person_side(0, 0, '#1F5FA8', '#1F5FA8', -1, hat='#DDBF8A'), 72, 18, .72))
    # antenna: a mast lashed to the COMMS canopy, ground-plane radials, coax down to the base radio
    b.append(f'<path d="M50,-40 V-84" stroke="{INK}" stroke-width="2.6"/>')
    b.append(f'<path d="M50,-84 V-96" stroke="{INK}" stroke-width="1.6"/><path d="M50,-84 L38,-76 M50,-84 L62,-76 M50,-84 L44,-74 M50,-84 L56,-74" stroke="{INK}" stroke-width="1.4" stroke-linecap="round"/>')
    b.append(f'<path d="M50,-40 C52,-30 58,-24 56,-10" stroke="{INK}" stroke-width="1.2" fill="none"/>')
    for i in range(3):
        r = 7 + i * 6
        b.append(f'<path d="M{50 + r * .5:.1f},{-97 - r * .86:.1f} A{r},{r} 0 0 1 {50 + r:.1f},-97" stroke="{ORANGE}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="{1 - i * .25}"/>')
        b.append(f'<path d="M{50 - r * .5:.1f},{-97 - r * .86:.1f} A{r},{r} 0 0 0 {50 - r:.1f},-97" stroke="{ORANGE}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="{1 - i * .25}"/>')
    # no Internet: a crossed-out WiFi symbol
    b.append('<g transform="translate(-22,-86)">'
             + ''.join(f'<path d="M{-r * .72:.1f},{-r * .7:.1f} A{r},{r} 0 0 1 {r * .72:.1f},{-r * .7:.1f}" stroke="{NAVY}" stroke-width="2.4" fill="none" stroke-linecap="round"/>' for r in (7, 13, 19))
             + f'<circle cy="0" r="2.4" fill="{NAVY}"/><circle cy="-7" r="17" fill="none" stroke="#B3261E" stroke-width="2.6"/><path d="M-12,5 L12,-19" stroke="#B3261E" stroke-width="2.6"/>'
             + f'<text y="21" text-anchor="middle" class="sign" font-size="8">NO INTERNET</text></g>')
    # the generator in front, its cord running to the comms table
    b.append(f'<rect x="-22" y="40" width="44" height="28" rx="4" fill="#C8341E" stroke="{INK}" stroke-width="1.4"/><rect x="-16" y="45" width="32" height="12" fill="{INK}"/>')
    b.append(f'<text x="0" y="54.5" text-anchor="middle" class="sign" font-size="8" fill="#F2E7CF">GEN</text><circle cx="-14" cy="66" r="3" fill="{INK}"/><circle cx="14" cy="66" r="3" fill="{INK}"/>')
    b.append(f'<path d="M22,54 C44,56 50,34 60,22 S70,4 66,-2" stroke="{INK}" stroke-width="1.5" fill="none"/>')
    # no grid power
    b.append(f'<g transform="translate(-72,52)"><path d="M0,-22 V20 M-10,-17 H10" stroke="#7A6A56" stroke-width="2.6"/><circle r="15" fill="none" stroke="#B3261E" stroke-width="2.6"/><path d="M-10.6,10.6 L10.6,-10.6" stroke="#B3261E" stroke-width="2.6"/></g>')
    return ''.join(b)


def handoff_inset_body():
    b = ['<rect x="-90" y="-90" width="180" height="180" fill="#EFE4CB"/>']
    def laptop(x, y, screen):
        return (f'<path d="M{x - 20},{y} L{x - 16},{y - 26} L{x + 16},{y - 26} L{x + 20},{y} Z" fill="{NAVY}" stroke="{INK}" stroke-width="1.2"/>'
                f'<rect x="{x - 13}" y="{y - 23}" width="26" height="19" fill="{screen}"/>'
                f'<path d="M{x - 26},{y} H{x + 26} L{x + 22},{y + 5} H{x - 22} Z" fill="#8A8F99" stroke="{INK}" stroke-width="1.2"/>')
    b.append(laptop(-40, -8, '#E9DDBF'))
    b.append('<circle cx="-46" cy="-22" r="2" fill="#B3261E"/><circle cx="-38" cy="-18" r="2" fill="#1F5FA8"/><circle cx="-34" cy="-24" r="2" fill="#F0700A"/>')
    b.append(laptop(40, -8, '#CFE0EA'))
    # the backup file, locked with its optional passphrase, travelling between them
    b.append(f'<path d="M-12,-38 h16 l6,6 v22 h-22 Z" fill="#FFFFFF" stroke="{INK}" stroke-width="1.3"/><path d="M4,-38 v6 h6" fill="none" stroke="{INK}" stroke-width="1.3"/>')
    b.append(f'<rect x="-7" y="-24" width="12" height="9" rx="1.5" fill="{ORANGE}"/><path d="M-4,-24 v-3 a4,4 0 0 1 8,0 v3" fill="none" stroke="{ORANGE}" stroke-width="1.8"/>')
    b.append(f'<path d="M-18,-50 C-6,-60 6,-60 18,-50" stroke="{INK}" stroke-width="1.6" fill="none"/><path d="M13,-54 L19,-49 L12,-47" stroke="{INK}" stroke-width="1.6" fill="none"/>')
    # the printed 309
    b.append(f'<g transform="translate(0,30) rotate(-4)"><rect x="-22" y="-14" width="44" height="34" fill="#FFFFFF" stroke="{INK}" stroke-width="1.2"/>'
             f'<text x="0" y="-3" text-anchor="middle" class="sign" font-size="8.5">309</text>'
             + ''.join(f'<path d="M-16,{4 + i * 5} h32" stroke="#8C7A60" stroke-width=".9"/>' for i in range(3)) + '</g>')
    return ''.join(b)


# ---------------------------------------------------------------- assemble
def build():
    minor, major = contour_paths()
    S = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'''<style>{fonts()}
 .num{{font-family:Cond;font-weight:600;fill:#fff}} .lab{{font-family:Cond;font-weight:400;fill:{INK}}} .labb{{font-family:Cond;font-weight:600;fill:{INK}}}
 .serifi{{font-family:SerifI;fill:{INK}}} .serifb{{font-family:SerifB}} .sign{{font-family:Cond;font-weight:600;fill:{INK};letter-spacing:.5px}}
 .rib{{font-family:Cond;font-weight:600;fill:#F2E7CF;letter-spacing:1.2px}} .bar{{font-family:Cond;font-weight:600;fill:#FBF3E2;letter-spacing:1.2px}}
 .place{{font-family:SerifI;fill:{INK};stroke:#F4EBD6;stroke-width:3.5px;paint-order:stroke;stroke-linejoin:round}}
 .region{{font-family:SerifB;fill:#5A3E28;letter-spacing:7px;opacity:.85}}</style>''',
         '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .35  0 0 0 0 .22  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>',
         f'<rect width="{W}" height="{H}" fill="{PAPER}"/>',
         # ---- map
         f'<image href="map-base.png" x="{X0:.1f}" y="0" width="{COLS * K:.1f}" height="{H}"/>',
         '<g fill="none" stroke="#5E3F26" stroke-linejoin="round">']
    tr = lambda d: d  # contours are in DEM px; transform via a group
    S.append(f'<g transform="translate({X0:.1f},0) scale({K:.5f})">')
    S += [f'<path d="{d}" stroke-width=".8" opacity=".32"/>' for d in minor]
    S += [f'<path d="{d}" stroke-width="1.6" opacity=".5"/>' for d in major]
    S.append('</g></g>')
    # roads, river, trails (canvas coords)
    for w in osm_ways_tag('highway', ('primary', 'secondary', 'tertiary')):
        S.append(f'<path d="{d_of([P(*p) for p in w])}" fill="none" stroke="#8A7F70" stroke-width="1.6" opacity=".8"/>')
    river = [w for w in osm_ways_tag('waterway', ('river',))][0]
    rp = [P(*p) for p in river]
    rp = [p for p in rp if -80 < p[1] < 420 and X0 - 60 < p[0] < W + 60]
    S.append(f'<path d="{d_of(rp)}" fill="none" stroke="#4E7896" stroke-width="10" stroke-linecap="round"/>')
    S.append(f'<path d="{d_of(rp)}" fill="none" stroke="#9BC1D6" stroke-width="6" stroke-linecap="round"/>')
    ltr = rp if rp[0][0] < rp[-1][0] else rp[::-1]
    S.append(f'<path id="river" d="{d_of(ltr)}" fill="none" stroke="none"/>')
    for name, sw in [('Bright Angel Trail', 1.8), ('Plateau Point Trail', 1.6), ('Tonto Trail', 1.2), ('Rim Trail', 1.3), ('West Rim Trail', 1.3)]:
        for w in osm_ways(name):
            S.append(f'<path d="{d_of([P(*p) for p in w])}" fill="none" stroke="{INK}" stroke-width="{sw}" stroke-dasharray="5 3.5" opacity=".75"/>')
    # region and place names
    # straight label along the river's straightest visible stretch (a textPath kinks at the corners)
    seg = [p for p in ltr if 1000 < p[0] < 1300]
    (ax, ay), (bx, by) = seg[0], seg[-1]
    ang = math.degrees(math.atan2(by - ay, bx - ax))
    mx, my = (ax + bx) / 2, (ay + by) / 2
    S.append(f'<text x="{mx:.1f}" y="{my:.1f}" dy="-11" text-anchor="middle" class="place" font-size="17" letter-spacing="1" transform="rotate({ang:.1f} {mx:.1f} {my:.1f})">Colorado River</text>')
    S.append(f'<text x="1010" y="505" class="region" font-size="20" transform="rotate(-8 1010 505)">TONTO PLATFORM</text>')
    S.append(f'<text x="1108" y="1250" class="region" font-size="20" letter-spacing="5">SOUTH RIM</text>')
    for txt, (la, lo), dx, dy, sz in [('Havasupai Gardens', (36.0789, -112.1266), 12, 18, 15), ('Plateau Point', (36.0933, -112.1161), 12, 5, 15),
                                      ('Hopi Point', (36.0745, -112.1549), -92, 6, 14), ('Maricopa Point', (36.0704, -112.1483), 8, -8, 14),
                                      ('Mather Point', (36.0617, -112.1090), -122, 2, 14), ('Dana Butte', (36.0914, -112.1504), 10, 4, 14),
                                      ('Garden Creek', (36.0700, -112.1330), 0, 0, 13), ('Grand Canyon Village', (36.0555, -112.1340), 150, 18, 15)]:
        x, y = P(la, lo)
        S.append(f'<text x="{x + dx:.1f}" y="{y + dy:.1f}" class="place" font-size="{sz}">{txt}</text>')
    # team routes, drawn with a paper-coloured casing; Medical follows Below-Rim down, dashed on top
    for key, pts, dash, w in [('west', WEST, '', 3.6), ('east', EAST, '', 3.6), ('below', BELOW, '', 4.2),
                              ('liaison', [CP, TRAILHEAD], '3 4', 2.6), ('med', [TRAILHEAD] + BELOW[1:], '6 5', 2.2)]:
        d = d_of([P(*p) for p in pts])
        if key != 'med':
            S.append(f'<path d="{d}" fill="none" stroke="#FBF3E2" stroke-width="{w + 3}" stroke-linecap="round" stroke-linejoin="round"/>')
        S.append(f'<path d="{d}" fill="none" stroke="{TEAM[key]}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"{f" stroke-dasharray={chr(34)}{dash}{chr(34)}" if dash else ""}/>')
    # command post symbol
    cx, cy = P(*CP)
    S.append(f'<path d="M{cx - 11},{cy + 6} L{cx},{cy - 10} L{cx + 11},{cy + 6} Z" fill="{NAVY}" stroke="#FBF3E2" stroke-width="1.5"/>')
    # numbered markers: shared spots fan out along short leaders
    spots = {}
    for _, entries in LOG:
        for n, t, who, what, key, where in entries:
            spots.setdefault(where, []).append((n, key))
    for where, items in spots.items():
        x, y = P(*where)
        lay = MARKER_LAYOUT.get(where)
        for i, (n, key) in enumerate(items):
            if lay and lay[0] == 'fan':
                ang, rad = math.radians(lay[1] + i * lay[3]), lay[2]
                mx, my = x + rad * math.cos(ang), y + rad * math.sin(ang)
                S.append(f'<path d="M{x:.1f},{y:.1f} L{mx:.1f},{my:.1f}" stroke="{INK}" stroke-width="1.2"/>')
            elif lay:
                mx, my = x + lay[1], y + lay[2]
            else:
                mx, my = x, y - 16
            S.append(marker(n, mx, my, TEAM[key]))
        S.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{INK}"/>')
    # callouts where the story turns
    m3x, m3y = P(*MILE3)
    S.append(callout(m3x + 58, m3y - 70, ['3 Mile Resthouse', 'Hiker found: heat exhaustion']))
    t2x, t2y = P(*TUNNEL2)
    S.append(f'<path d="M{t2x - 118:.1f},{t2y - 118:.1f} L{t2x - 4:.1f},{t2y - 4:.1f}" stroke="{INK}" stroke-width="1" stroke-dasharray="3 3"/>')
    S.append(callout(t2x - 118, t2y - 150, ['Second tunnel', 'White sun hat found'], 'end'))
    yx, yy = P(*YAVAPAI)
    S.append(callout(yx + 20, yy - 62, ['Yavapai Point', 'Sighting: a different hiker']))
    S.append(callout(cx + 14, cy - 100, ['Command Post', 'Generator, no Internet']))
    # close-ups
    S.append(inset_frame(560, 1150, 118, (cx - 6, cy), 'COMMAND POST · GENERATOR, NO INTERNET', cp_inset_body()))
    S.append(inset_frame(582, 548, 112, (m3x - 4, m3y), 'BELOW-RIM TEAM · HANDY-TALKIES, NO CELL', team_inset_body()))
    S.append(inset_frame(1034, 1198, 64, (cx + 8, cy + 2), 'HANDOFF · BACKUP FILE + 309 LOG', handoff_inset_body()))
    note = ['Every numbered report was radioed in', 'and logged on one laptop at the', 'command post, on generator power,',
            'with no Internet. RangerTrak mapped', 'each one as it came in.']
    nx, ny = 428, 206
    S.append(f'<rect x="{nx}" y="{ny}" width="298" height="{len(note) * 20 + 22}" fill="#FBF6EA" stroke="{INK}" stroke-width="1.2" opacity=".95"/>')
    S.append(f'<rect x="{nx + 4}" y="{ny + 4}" width="290" height="{len(note) * 20 + 14}" fill="none" stroke="{INK}" stroke-width=".6"/>')
    for i, line in enumerate(note):
        S.append(f'<text x="{nx + 14}" y="{ny + 26 + i * 20}" class="serifi" font-size="14.5">{line}</text>')
    S.append(compass(1522, 470))
    lx, ly, lw, lh = 1300, 1040, 282, 244
    S.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" fill="#FBF6EA" stroke="{INK}" stroke-width="1.4" opacity=".97"/>')
    S.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="24" fill="{NAVY}"/><text x="{lx + 10}" y="{ly + 17}" class="bar" font-size="13">LEGEND</text>')
    for i, (key, lab) in enumerate([('below', 'Below-Rim team'), ('med', 'Medical team'), ('west', 'Rim-West team'), ('east', 'Rim-East team'), ('liaison', 'Liaison, with the parents')]):
        ex, ey = lx + 14 + (i % 2) * 136, ly + 48 + (i // 2) * 22
        S.append(f'<path d="M{ex},{ey - 4} h24" stroke="{TEAM[key]}" stroke-width="3.6" stroke-linecap="round"/><text x="{ex + 31}" y="{ey}" class="lab" font-size="13">{lab}</text>')
    ey = ly + 120
    S.append(f'<path d="M{lx + 14},{ey - 4} h24" stroke="{INK}" stroke-width="1.6" stroke-dasharray="5 3.5"/><text x="{lx + 45}" y="{ey}" class="lab" font-size="13">Trail</text>')
    S.append(f'<path d="M{lx + 157},{ey + 2} L{lx + 166},{ey - 11} L{lx + 175},{ey + 2} Z" fill="{NAVY}"/><text x="{lx + 181}" y="{ey}" class="lab" font-size="13">Command post</text>')
    S.append(marker(5, lx + 26, ey + 22, NAVY, 9) + f'<text x="{lx + 45}" y="{ey + 26}" class="lab" font-size="13">Report, numbered as in the radio log</text>')
    S.append(scalebar(lx + 20, ly + 198))
    # map frame
    S.append(f'<rect x="{X0 + 6:.1f}" y="6" width="{COLS * K - 12:.1f}" height="{H - 12}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
    S.append(f'<rect x="{X0 + 11:.1f}" y="11" width="{COLS * K - 22:.1f}" height="{H - 22}" fill="none" stroke="{INK}" stroke-width=".7"/>')
    # ---- sidebar
    L = []
    L.append(f'<rect width="{SIDEBAR:.1f}" height="{H}" fill="{PAPER}"/>')
    L.append(f'<path d="M{SIDEBAR - 2:.1f},0 V{H}" stroke="{INK}" stroke-width="2"/>')
    L.append(f'<text x="{SIDEBAR / 2:.1f}" y="46" text-anchor="middle" class="labb" font-size="15" letter-spacing="4" fill="{NAVY}">RANGERTRAK FIELD MAP</text>')
    L.append(f'<text x="{SIDEBAR / 2:.1f}" y="100" text-anchor="middle" font-family="Slab" font-size="43" fill="{RED}">BRIGHT ANGEL</text>')
    L.append(f'<text x="{SIDEBAR / 2:.1f}" y="146" text-anchor="middle" font-family="Slab" font-size="43" fill="{RED}">SEARCH</text>')
    L.append(f'<path d="M24,172 H78 M{SIDEBAR - 78:.1f},172 H{SIDEBAR - 24:.1f}" stroke="{NAVY}" stroke-width="1.5"/>')
    L.append(f'<text x="{SIDEBAR / 2:.1f}" y="177" text-anchor="middle" class="labb" font-size="15" fill="{NAVY}">Grand Canyon · an overdue hiker</text>')
    # the radio log: the sidebar's only job now, so it gets room to breathe
    top, bottom = 214, H - 76
    wrapw = 48
    base = 0
    for head, entries in LOG:
        base += 38
        for *_, what, key, where in [(e[0], e[1], e[2], e[3], e[4], e[5]) for e in entries]:
            base += 24 + 19 * len(wrap(what, wrapw))
    n_entries = sum(len(e) for _, e in LOG)
    gap = max(6, (bottom - top - base) / (n_entries + len(LOG)))
    y = top
    for head, entries in LOG:
        L.append(f'<rect x="20" y="{y:.1f}" width="{SIDEBAR - 40:.1f}" height="26" fill="{RED}"/>')
        L.append(f'<text x="30" y="{y + 18.5:.1f}" class="bar" font-size="14">{head}</text>')
        y += 38 + gap * .6
        for n, t, who, what, key, where in entries:
            L.append(marker(n, 37, y + 5, TEAM[key], 12))
            L.append(f'<text x="60" y="{y + 4:.1f}" class="labb" font-size="15.5">{t}  {who}</text>')
            for j, line in enumerate(wrap(what, wrapw)):
                L.append(f'<text x="60" y="{y + 24 + j * 19:.1f}" class="lab" font-size="15">{line}</text>')
            y += 24 + 19 * len(wrap(what, wrapw)) + gap
        y += gap * .4
    # footer
    fy = H - 44
    L.append(f'<g transform="translate(22,{fy - 20}) scale(1.05)"><path fill="{INK}" fill-rule="evenodd" d="M 11.5 29 L 6.26 21.84 A 6.5 6.5 0 1 1 16.74 21.84 Z M 10.4 12.6 L 12.6 12.6 L 12.6 24.2 L 10.4 24.2 Z"/>'
             f'<g fill="none" stroke="{ORANGE}" stroke-width="3" stroke-linecap="round"><path d="M 21.89 5 A 12 12 0 0 1 20.69 18.71"/><path d="M 26.22 2.5 A 17 17 0 0 1 24.52 21.93"/></g></g>')
    L.append(f'<text x="60" y="{fy + 2}" class="labb" font-size="17" fill="{NAVY}">rangertrak.com</text>')
    L.append(f'<text x="22" y="{H - 22}" class="lab" font-size="10" fill="#6B5A48">Terrain: USGS 3DEP. Trails: © OpenStreetMap contributors.</text>')
    L.append(f'<text x="22" y="{H - 9}" class="lab" font-size="10" fill="#6B5A48">People and events: RangerTrak’s fictional Grand Canyon demo.</text>')
    S += L
    S.append(f'<rect width="{W}" height="{H}" filter="url(#paper)" pointer-events="none"/>')
    S.append('</svg>')
    (HERE / 'bright-angel-search.svg').write_text('\n'.join(S), encoding='utf-8')
    print('ok; sidebar content ends at y =', y)


if __name__ == '__main__':
    build()
