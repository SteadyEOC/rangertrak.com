"""Style exploration: one RangerTrak scene ("radio in, map out") in four visual languages.

Writes one SVG per style next to this file. render.ps1 turns them into 1200x675 PNGs.
Nothing here deploys: design/ sits outside public/. The chosen style's final set gets
copied into public/press/ once approved.
"""
import os
from pathlib import Path

HERE = Path(__file__).parent
# Fonts the SVG links to (OFL: Lora, Bricolage Grotesque, Instrument Sans/Serif, JetBrains Mono
# and others). Set CANVAS_FONTS to a file:/// folder URL that holds them; default ./fonts/.
FONTS = os.environ.get('CANVAS_FONTS', (Path(__file__).parent / 'fonts').as_uri() + '/')
W, H = 1200, 675

NAVY, ORANGE, BLUE, GROUND = '#12263F', '#F0700A', '#0B5FA8', '#EDF1F5'


def fonts(*names):
    rules = []
    for fam, file in names:
        rules.append(f"@font-face{{font-family:'{fam}';src:url('{FONTS}{file}')}}")
    return '\n'.join(rules)


def mark(x, y, s, pin, signal):
    """RangerTrak's mark (pin with antenna + two signal arcs), from the site favicon, 32-unit grid."""
    k = s / 32
    return f'''<g transform="translate({x},{y}) scale({k})">
  <path fill="{pin}" fill-rule="evenodd" d="M 11.5 29 L 6.26 21.84 A 6.5 6.5 0 1 1 16.74 21.84 Z M 10.4 12.6 L 12.6 12.6 L 12.6 24.2 L 10.4 24.2 Z"/>
  <g fill="none" stroke="{signal}" stroke-width="3" stroke-linecap="round">
    <path d="M 21.89 5 A 12 12 0 0 1 20.69 18.71"/><path d="M 26.22 2.5 A 17 17 0 0 1 24.52 21.93"/>
  </g></g>'''


def arcs(cx, cy, r0, n, step, color, width, start=-40, end=40, dash=None):
    """Concentric signal arcs opening to the right of (cx, cy)."""
    import math
    out = []
    for i in range(n):
        r = r0 + i * step
        a0, a1 = math.radians(start), math.radians(end)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        d = f' stroke-dasharray="{dash}"' if dash else ''
        out.append(f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}" fill="none" '
                   f'stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d} opacity="{1 - i * 0.18:.2f}"/>')
    return '\n'.join(out)


def minimap(x, y, w, h, bg, road, pins, trail, water=None):
    """The app's map screen in miniature: roads, a trail between one team's reports, pins."""
    px = lambda fx: x + fx * w
    py = lambda fy: y + fy * h
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>']
    if water:
        s.append(f'<path d="M{px(0)},{py(.72)} C{px(.25)},{py(.62)} {px(.4)},{py(.95)} {px(.62)},{py(1)} L{px(0)},{py(1)} Z" fill="{water}"/>')
    for d in [f'M{px(0)},{py(.35)} L{px(1)},{py(.28)}', f'M{px(.3)},{py(0)} L{px(.42)},{py(1)}',
              f'M{px(.6)},{py(0)} C{px(.66)},{py(.4)} {px(.8)},{py(.6)} {px(1)},{py(.7)}']:
        s.append(f'<path d="{d}" stroke="{road}" stroke-width="3" fill="none"/>')
    s.append(f'<polyline points="{px(.14)},{py(.62)} {px(.3)},{py(.5)} {px(.47)},{py(.42)} {px(.62)},{py(.24)}" '
             f'fill="none" stroke="{trail}" stroke-width="2.5" stroke-dasharray="5 4"/>')
    for (fx, fy, c) in pins:
        cx, cy = px(fx), py(fy)
        s.append(f'<path d="M{cx},{cy} l-7,-10 a8.6,8.6 0 1 1 14,0 z" fill="{c}" stroke="#fff" stroke-width="1.5"/>'
                 f'<circle cx="{cx}" cy="{cy - 15}" r="3" fill="#fff"/>')
    return '\n'.join(s)


PINS = [(.62, .24, '#F0700A'), (.3, .5, '#0B5FA8'), (.8, .62, '#2E8B57'), (.18, .3, '#C0392B')]


# ---------------------------------------------------------------- 1. Trailhead (Grand Canyon)
def trailhead():
    cream, sky, far, ochre, rust, deep, cliff, dark = '#F6EAD7', '#F3DCC0', '#C98E7E', '#DE8A4F', '#B8563B', '#8A3C2F', '#5A3727', '#3B261C'
    badges = ''.join(
        f'<g transform="translate({x},628)"><circle r="44" fill="{cream}" stroke="{ORANGE}" stroke-width="5"/>'
        f'<text y="-3" text-anchor="middle" font-size="13" class="lab">{a}</text>'
        f'<text y="14" text-anchor="middle" font-size="13" class="lab">{b}</text></g>'
        for x, a, b in [(470, 'NO', 'INTERNET'), (600, 'ANY', 'GRID'), (730, 'FORMS', '309 · 213')])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>{fonts(('NP', 'NationalPark-Bold.ttf'), ('NPr', 'NationalPark-Regular.ttf'))}
 .sign{{font-family:NP;fill:{cream};letter-spacing:4px}} .lab{{font-family:NP;fill:{dark};letter-spacing:1.5px}}
 .small{{font-family:NPr;fill:{dark}}} .rim{{font-family:NP;fill:{cream};letter-spacing:1.5px}}</style>
<rect width="{W}" height="{H}" fill="{sky}"/>
<circle cx="640" cy="262" r="64" fill="{ORANGE}"/>
<!-- North Rim, flat-topped, far away -->
<path d="M0,300 L170,297 L186,309 L430,305 L446,293 L760,296 L776,310 L1010,304 L1026,292 L1200,296 V675 H0 Z" fill="{far}"/>
<!-- canyon strata, stepping down to the river -->
<path d="M200,350 L330,346 L340,362 L520,358 L528,344 L700,348 L712,364 L880,360 L890,346 L1200,350 V675 H0 V350 Z" fill="{ochre}"/>
<path d="M260,408 L380,404 L392,420 L560,416 L570,402 L720,406 L734,422 L860,418 L872,404 L1200,410 V675 H0 V408 Z" fill="{rust}"/>
<path d="M300,470 L430,466 L442,480 L600,476 L612,462 L760,466 L772,482 L1200,478 V675 H0 V470 Z" fill="{deep}"/>
<path d="M330,532 C470,516 560,548 700,530 C790,518 860,540 930,528" fill="none" stroke="#6E9DB3" stroke-width="6" stroke-linecap="round"/>
<!-- South Rim, near: the overlook (left) and the Village (right) -->
<path d="M0,392 L300,388 L318,420 L332,470 L352,540 L372,675 H0 Z" fill="{cliff}"/>
<path d="M1200,428 L930,432 L914,462 L900,520 L884,600 L872,675 H1200 Z" fill="{cliff}"/>
<rect y="580" width="{W}" height="95" fill="{dark}"/>
<!-- carved sign -->
<rect x="330" y="36" width="540" height="92" rx="10" fill="{dark}"/>
<rect x="342" y="48" width="516" height="68" rx="6" fill="none" stroke="{cream}" stroke-width="2" opacity=".5"/>
<text x="600" y="98" text-anchor="middle" class="sign" font-size="40">RADIO IN · MAP OUT</text>
<!-- Rim 1 at the overlook: campaign hat and handheld -->
<g transform="translate(190,318)">
  <ellipse cx="0" cy="-14" rx="24" ry="5" fill="{dark}"/><path d="M-11,-15 L-8,-31 L0,-26 L8,-31 L11,-15 Z" fill="{dark}"/>
  <circle cx="0" cy="-2" r="12" fill="{dark}"/>
  <path d="M-19,20 Q0,8 19,20 L17,70 L-17,70 Z" fill="{dark}"/>
  <rect x="20" y="8" width="12" height="26" rx="3" fill="{NAVY}"/><rect x="25" y="-12" width="3" height="22" fill="{NAVY}"/>
  <path d="M15,32 L23,24" stroke="{dark}" stroke-width="8" stroke-linecap="round"/>
</g>
{arcs(226, 318, 30, 4, 24, ORANGE, 6, -48, 28)}
<text x="120" y="420" class="rim" font-size="15">RIM 1</text>
<text x="120" y="440" class="rim" font-size="12" opacity=".8">TRAILVIEW OVERLOOK</text>
<!-- the call -->
<g transform="translate(252,160)">
  <rect width="290" height="66" rx="12" fill="#fff" stroke="{dark}" stroke-width="2.5"/>
  <path d="M28,66 L18,86 L50,66 Z" fill="#fff" stroke="{dark}" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="26" y="63" width="26" height="5" fill="#fff"/>
  <text x="145" y="29" text-anchor="middle" class="lab" font-size="17">RIM 1 · TRAILVIEW OVERLOOK</text>
  <text x="145" y="51" text-anchor="middle" class="small" font-size="15">no sign of the hiker, trail clear</text>
</g>
<!-- command post: pop-up canopy at the Village -->
<g transform="translate(900,0)">
  <text x="130" y="238" text-anchor="middle" class="lab" font-size="15">COMMAND POST</text>
  <text x="130" y="256" text-anchor="middle" class="small" font-size="13">Grand Canyon Village</text>
  <path d="M10,300 L40,270 L220,270 L250,300 Z" fill="{ORANGE}"/><path d="M10,300 H250 V308 H10 Z" fill="{rust}"/>
  <path d="M22,308 V432 M238,308 V432" stroke="{dark}" stroke-width="5"/>
  <rect x="40" y="398" width="180" height="9" fill="{dark}"/><path d="M60,407 V432 M200,407 V432" stroke="{dark}" stroke-width="4"/>
  <rect x="62" y="322" width="136" height="80" rx="5" fill="{NAVY}"/>
  {minimap(69, 329, 122, 66, '#F1E7D6', '#FFFFFF', PINS, NAVY)}
</g>
{badges}
{mark(40, 610, 40, cream, ORANGE)}
<text x="88" y="640" class="sign" font-size="18" letter-spacing="2">RANGERTRAK.COM</text>
</svg>'''


# ---------------------------------------------------------------- 2. Net Control
def net_control():
    bg, grid, topo, line, dim = '#0D1C2E', '#132840', '#1C3656', '#DCE7F2', '#7F97B2'
    import math
    contours = ''.join(
        f'<ellipse cx="230" cy="470" rx="{60 + i * 34}" ry="{28 + i * 17}" fill="none" stroke="{topo}" stroke-width="1.4" transform="rotate(-12 230 470)"/>'
        for i in range(9))
    grid_lines = ''.join(f'<path d="M{x},0 V{H}" stroke="{grid}"/>' for x in range(0, W, 40)) + \
                 ''.join(f'<path d="M0,{y} H{W}" stroke="{grid}"/>' for y in range(0, H, 40))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>{fonts(('Mono', 'JetBrainsMono-Regular.ttf'), ('MonoB', 'JetBrainsMono-Bold.ttf'), ('Sans', 'InstrumentSans-Bold.ttf'))}
 .m{{font-family:Mono;fill:{dim};letter-spacing:1.5px}} .mb{{font-family:MonoB;fill:{ORANGE};letter-spacing:3px}}
 .t{{font-family:Sans;fill:#fff}} .w{{font-family:Mono;fill:{line}}}</style>
<rect width="{W}" height="{H}" fill="{bg}"/>{grid_lines}{contours}
<text x="60" y="70" class="mb" font-size="14">RANGERTRAK / FIG. 02</text>
<text x="60" y="122" class="t" font-size="50">Radio in. Map out.</text>
<text x="60" y="152" class="m" font-size="15">no Internet at the table · none needed</text>
<!-- field team -->
<g transform="translate(200,420)" stroke="{line}" stroke-width="2.5" fill="none">
  <circle cx="0" cy="-58" r="14"/><path d="M0,-44 V10 M-22,-20 L0,-32 L20,-18 M0,10 L-16,52 M0,10 L16,52"/>
  <rect x="20" y="-34" width="12" height="24" rx="2"/><path d="M26,-34 V-54"/>
</g>
<text x="130" y="505" class="m" font-size="13">RIM 1 · TRAILVIEW OVERLOOK</text>
<text x="130" y="524" class="m" font-size="13" fill="{ORANGE}">× no cell signal on the rim</text>
{arcs(232, 364, 26, 4, 22, ORANGE, 3, -55, 25)}
<!-- transmission -->
<path d="M340,350 C470,300 560,300 690,330" fill="none" stroke="{ORANGE}" stroke-width="2" stroke-dasharray="3 7"/>
<g transform="translate(370,212)">
  <rect width="300" height="70" fill="{bg}" stroke="{dim}" stroke-width="1.2"/>
  <text x="14" y="28" class="w" font-size="15">"RIM 1, TRAILVIEW OVERLOOK.</text>
  <text x="14" y="52" class="w" font-size="15"> NO SIGN OF THE HIKER."</text>
</g>
<text x="372" y="205" class="m" font-size="12">VOICE</text>
<!-- the four questions -->
<g transform="translate(700,196)">
 {''.join(f'<g transform="translate({i * 108},0)"><rect width="96" height="34" fill="none" stroke="{ORANGE}" stroke-width="1.5"/><text x="48" y="22" text-anchor="middle" class="mb" font-size="13" letter-spacing="2">{q}</text></g>' for i, q in enumerate(['WHO', 'WHERE', 'WHEN', 'WHAT']))}
</g>
<path d="M902,236 V262" stroke="{ORANGE}" stroke-width="1.5"/><path d="M896,256 L902,264 L908,256" fill="none" stroke="{ORANGE}" stroke-width="1.5"/>
<!-- laptop -->
<g transform="translate(730,272)">
  <rect width="344" height="212" rx="8" fill="none" stroke="{line}" stroke-width="2.5"/>
  {minimap(12, 12, 320, 188, '#10263F', '#23426A', PINS, ORANGE)}
  <path d="M-30,212 H374 L352,236 H-8 Z" fill="none" stroke="{line}" stroke-width="2.5" stroke-linejoin="round"/>
</g>
<text x="730" y="528" class="m" font-size="13">SCRIBE · GRAND CANYON VILLAGE</text>
<!-- spec line -->
<g transform="translate(60,600)" class="m" font-size="14">
 {''.join(f'<g transform="translate({x},0)"><rect y="-11" width="10" height="10" fill="{ORANGE}"/><text x="20" y="0" class="w" font-size="14">{t}</text></g>' for x, t in [(0, 'works with no Internet'), (300, 'any coordinate format'), (590, 'prints 309 &amp; ICS-213')])}
</g>
{mark(1060, 578, 34, line, ORANGE)}
<text x="1140" y="645" text-anchor="end" class="m" font-size="12">rangertrak.com</text>
</svg>'''


# ---------------------------------------------------------------- 3. Signal Poster
def signal_poster():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>{fonts(('Big', 'BigShoulders-Bold.ttf'), ('Sans', 'InstrumentSans-Regular.ttf'), ('SansB', 'InstrumentSans-Bold.ttf'))}
 .big{{font-family:Big}} .s{{font-family:Sans;fill:{NAVY}}} .sb{{font-family:SansB;fill:{NAVY}}}</style>
<rect width="{W}" height="{H}" fill="{GROUND}"/>
<rect width="470" height="{H}" fill="{NAVY}"/>
<text x="56" y="168" class="big" font-size="124" fill="#fff">RADIO</text>
<text x="56" y="284" class="big" font-size="124" fill="#fff">IN.</text>
<text x="56" y="400" class="big" font-size="124" fill="{ORANGE}">MAP</text>
<text x="56" y="516" class="big" font-size="124" fill="{ORANGE}">OUT.</text>
<text x="60" y="590" font-family="Sans" font-size="20" fill="#C9D6E3">No Internet at the command post?</text>
<text x="60" y="618" font-family="Sans" font-size="20" fill="#C9D6E3">RangerTrak doesn't need it.</text>
<!-- three steps -->
{''.join(step for step in [
    f'''<g transform="translate(540,{y})"><text class="big" font-size="96" fill="{ORANGE}" y="78">{n}</text>
      <g transform="translate(100,6)">{icon}</g>
      <text x="220" y="36" class="sb" font-size="28">{t1}</text><text x="220" y="68" class="s" font-size="20">{t2}</text></g>'''
    for y, n, icon, t1, t2 in [
        (70, '1', f'<rect x="22" y="14" width="34" height="62" rx="6" fill="{NAVY}"/><rect x="42" y="-8" width="5" height="26" fill="{NAVY}"/><rect x="28" y="24" width="22" height="14" fill="{GROUND}"/>' + arcs(64, 30, 16, 3, 13, ORANGE, 5, -50, 40),
         'The team radios in', '“Rim 1, Trailview Overlook. No sign.”'),
        (265, '2', f'<rect x="4" y="12" width="84" height="54" rx="5" fill="{NAVY}"/><path d="M-6,70 H98 L90,80 H2 Z" fill="{NAVY}"/>' + ''.join(f'<rect x="14" y="{22 + i * 11}" width="{60 - i * 12}" height="5" fill="{ORANGE if i == 0 else "#5B7A99"}"/>' for i in range(4)),
         'The scribe types it', 'Who, where, when, what. Any grid format.'),
        (460, '3', f'<path d="M46,80 l-24,-34 a30,30 0 1 1 48,0 z" fill="{ORANGE}"/><circle cx="46" cy="30" r="11" fill="{GROUND}"/>',
         'RangerTrak maps it', 'Live map, radio log, 309 &amp; 213.'),
    ]])}
<path d="M540,238 H1150 M540,433 H1150" stroke="#C5D0DB" stroke-width="1.5"/>
{mark(1070, 606, 32, NAVY, ORANGE)}
<text x="1060" y="632" text-anchor="end" class="sb" font-size="18">rangertrak.com</text>
</svg>'''


# ---------------------------------------------------------------- 4. Field Notebook
def field_notebook():
    paper, rule, ink, red = '#FBF3C9', '#D9CF9C', '#23303D', '#C8341E'
    rules = ''.join(f'<path d="M0,{y} H{W}" stroke="{rule}" stroke-width="1"/>' for y in range(95, H, 32))
    wob = 'stroke-linecap="round" stroke-linejoin="round"'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>{fonts(('Hand', 'NothingYouCouldDo-Regular.ttf'), ('Mono', 'DMMono-Regular.ttf'))}
 .h{{font-family:Hand;fill:{ink}}} .r{{font-family:Hand;fill:{red}}} .m{{font-family:Mono;fill:#7A6E3A;letter-spacing:1px}}</style>
<rect width="{W}" height="{H}" fill="{paper}"/>{rules}
<path d="M86,0 V{H}" stroke="{red}" stroke-width="1.5" opacity=".55"/>
<text x="108" y="72" class="h" font-size="46">radio in → map out</text>
<text x="1140" y="60" text-anchor="end" class="m" font-size="13">GRAND CANYON · OP PERIOD 2</text>
<!-- field team, sketched -->
<g transform="translate(210,370)" stroke="{ink}" stroke-width="3" fill="none" {wob}>
  <path d="M-60,70 Q-20,20 20,50 T100,40"/>
  <circle cx="0" cy="-40" r="15"/><path d="M1,-25 Q-2,5 0,22 M-20,-6 Q-4,-14 18,-12 M0,22 L-13,58 M0,22 L12,58"/>
  <path d="M18,-24 h11 v24 h-11 z M24,-24 v-18"/>
</g>
<text x="130" y="480" class="h" font-size="24">Rim 1 out on the South Rim</text>
<text x="130" y="508" class="r" font-size="20">(no bars!)</text>
{arcs(240, 330, 22, 3, 18, red, 3, -60, 20)}
<!-- the call, as written down -->
<g transform="translate(380,170)">
  <text class="h" font-size="26">"Rim 1 — Trailview Overlook,</text>
  <text y="34" class="h" font-size="26">  no sign of the hiker"</text>
  <path d="M-8,52 C60,60 200,48 330,56" stroke="{red}" stroke-width="2.5" fill="none" {wob}/>
</g>
<path d="M420,300 C520,350 600,360 700,330" stroke="{ink}" stroke-width="2.5" fill="none" {wob} stroke-dasharray="2 9"/>
<path d="M690,320 L704,331 L688,340" stroke="{ink}" stroke-width="2.5" fill="none" {wob}/>
<!-- laptop sketch -->
<g transform="translate(730,250)" stroke="{ink}" stroke-width="3" fill="none" {wob}>
  <path d="M2,0 L332,4 L328,200 L-2,196 Z"/>
  <path d="M-36,200 L366,204 L340,232 L-12,228 Z"/>
</g>
{minimap(748, 266, 296, 170, '#FFFDF0', '#E4D9A6', PINS, red)}
<text x="760" y="528" class="h" font-size="24">RangerTrak plots it. No Internet.</text>
<!-- margin notes -->
<g class="h" font-size="22">
  <text x="108" y="590">✓ any grid — MGRS, UTM, lat/long</text>
  <text x="520" y="590">✓ quiet teams turn red</text>
  <text x="860" y="590">✓ prints 309 &amp; 213</text>
</g>
{mark(108, 610, 34, ink, red)}
<text x="150" y="642" class="m" font-size="14">rangertrak.com</text>
</svg>'''


for name, fn in [('A-trailhead', trailhead), ('B-net-control', net_control),
                 ('C-signal-poster', signal_poster), ('D-field-notebook', field_notebook)]:
    (HERE / f'style-{name}.svg').write_text(fn(), encoding='utf-8')
    print('wrote', name)
