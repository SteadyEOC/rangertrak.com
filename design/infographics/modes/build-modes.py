"""Build the RangerTrak "modes" graphics from shared parts, and render each to a 2x PNG.

    python design/infographics/modes/build-modes.py

One SVG per mode, same header, background and figures, so the set reads as one family.
Every mode shows only what the app really does (checked against the app's Guide text,
guide-content.ts, 2026-09-27). Rendering uses headless Edge, like the site's other captures.

Text size: the site shows these about 736 px wide (0.61 of the 1200 drawing), so nothing is
smaller than 20 here, about 12 px on the page (John, 2026-10-21: the old 12.5-15 read as ~8 px).
That is why there is no Key panel and no tab row: the labels and numbered steps carry them.
"""
import os
import shutil
import subprocess
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
TMP_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".tmp"))  # git-ignored, not %TEMP%

NAVY, BLUE, ORANGE, SLATE, RED, GREEN = "#12263F", "#0B5FA8", "#F0700A", "#41556B", "#C8352E", "#2E8B57"
WIFI = "#0B8FA8"
SMALL, LABEL = 20, 22  # the smallest text, and names under figures

# John's "2 + 1" framing (2026-09-27): two ways to set up a device, plus one optional extra.
# Not three modes: field phones and RangerView both run on top of the command post.
MODES = [
    ("basic", "The command post",
     "The full app: voice radio in, one laptop, no Internet"),
    ("phones", "Plus field phones",
     "Rangers' phones file reports; rangers send them in"),
    ("wifi", "RangerView",
     "Optional: a small, private mini-website for the command post"),
]

DEFS = f"""  <defs>
    <symbol id="person" viewBox="0 0 40 60">
      <circle cx="20" cy="12" r="10" />
      <path d="M2 58 C2 34 8 26 20 26 C32 26 38 34 38 58 Z" />
    </symbol>
    <symbol id="radio" viewBox="0 0 16 34">
      <rect x="10" y="0" width="3" height="12" rx="1.5" />
      <rect x="2" y="10" width="12" height="24" rx="3" />
      <rect x="5" y="14" width="6" height="5" rx="1" fill="#EAF1F8" />
    </symbol>
    <symbol id="phone" viewBox="0 0 20 34">
      <rect x="1" y="1" width="18" height="32" rx="3.5" />
      <rect x="3.5" y="5" width="13" height="22" rx="1" fill="#EAF1F8" />
      <g stroke="#9AA8B6" stroke-width="1.6"><line x1="5.5" y1="9" x2="14.5" y2="9" /><line x1="5.5" y1="13" x2="12.5" y2="13" /><line x1="5.5" y1="17" x2="14" y2="17" /><line x1="5.5" y1="21" x2="11" y2="21" /></g>
    </symbol>
    <symbol id="tree" viewBox="0 0 40 60">
      <path d="M20 2 L36 30 L28 30 L38 46 L2 46 L12 30 L4 30 Z" fill="#3E7D4F" />
      <rect x="17" y="46" width="6" height="12" fill="#6B4B2A" />
    </symbol>
    <symbol id="wifi" viewBox="0 0 40 30">
      <g fill="none" stroke-width="4" stroke-linecap="round">
        <path d="M4 12 C14 2 26 2 36 12" /><path d="M10 18 C16 12 24 12 30 18" />
      </g>
      <circle cx="20" cy="25" r="3.5" stroke="none" />
    </symbol>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="{NAVY}" flood-opacity="0.18" />
    </filter>
  </defs>"""

BACKGROUND = """  <rect width="1200" height="600" fill="#F4F1E8" />
  <g fill="none" stroke="#E4DCC6" stroke-width="2">
    <path d="M-20 470 C150 430 260 520 420 480 S700 380 880 420 S1100 500 1220 460" />
    <path d="M-20 400 C140 360 260 450 420 410 S700 310 880 350 S1100 430 1220 390" />
    <path d="M-20 330 C130 290 260 380 420 340 S700 240 880 280 S1100 360 1220 320" />
    <path d="M-20 260 C120 220 260 310 420 270 S700 170 880 210 S1100 290 1220 250" />
  </g>
  <path d="M40 560 C200 520 300 420 330 330 S380 170 470 90" fill="none" stroke="#F2D58A" stroke-width="10" stroke-linecap="round" />
  <path d="M40 560 C200 520 300 420 330 330 S380 170 470 90" fill="none" stroke="#FFF6D8" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" />
  <g>
    <use href="#tree" x="36" y="84" width="34" height="52" />
    <use href="#tree" x="190" y="60" width="30" height="46" />
    <use href="#tree" x="240" y="520" width="30" height="46" />
  </g>"""

NO_INTERNET = f"""  <g transform="translate(560 22)">
    <path d="M40 70 C10 70 6 36 34 34 C38 10 76 6 86 28 C100 14 130 22 128 46 C150 48 150 70 128 70 Z"
      fill="#FFFFFF" stroke="#9AA8B6" stroke-width="3" stroke-dasharray="6 5" />
    <line x1="30" y1="12" x2="136" y2="78" stroke="{RED}" stroke-width="6" stroke-linecap="round" />
    <text x="80" y="102" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{SLATE}">No Internet needed</text>
    <text x="80" y="126" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">(map area saved ahead)</text>
  </g>"""


def team(x, y, name, where, colour=BLUE, device="radio"):
    dev = (f'<use href="#radio" x="36" y="16" width="14" height="30" fill="{NAVY}" />' if device == "radio"
           else f'<use href="#phone" x="34" y="18" width="16" height="28" fill="{NAVY}" />')
    return f"""    <g transform="translate({x} {y})">
      <use href="#person" width="40" height="60" fill="{colour}" />
      {dev}
      <text x="20" y="86" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">{name}</text>
      <text x="20" y="108" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">{where}</text>
    </g>"""


def voice(paths):
    lines = "\n".join(f'    <path d="{d}" />' for d in paths)
    return f"""  <g stroke="{ORANGE}" stroke-width="3.5" stroke-dasharray="12 8" fill="none" stroke-linecap="round">
{lines}
  </g>"""


def command_post(extra_on_screen=""):
    return f"""  <g transform="translate(480 210)">
    <rect x="-10" y="-40" width="330" height="262" rx="16" fill="#FFFFFF" stroke="{NAVY}" stroke-width="2.5" filter="url(#soft)" />
    <text x="155" y="-10" text-anchor="middle" font-size="{LABEL}" font-weight="800" fill="{NAVY}">Comms</text>
    <use href="#person" x="14" y="46" width="52" height="78" fill="{NAVY}" />
    <use href="#radio" x="6" y="70" width="14" height="30" fill="{ORANGE}" />
    <text x="40" y="152" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">Scribe</text>
    <g transform="translate(96 20)">
      <rect x="0" y="0" width="200" height="126" rx="8" fill="{NAVY}" />
      <rect x="8" y="8" width="184" height="110" rx="3" fill="#E9F0E4" />
      <g fill="none" stroke="#C9D7C0" stroke-width="1.5">
        <path d="M8 90 C60 70 110 104 192 70" /><path d="M8 60 C60 40 110 74 192 40" />
      </g>
      <path d="M30 108 C60 92 80 60 110 40" fill="none" stroke="{ORANGE}" stroke-width="2" stroke-dasharray="4 3" />
      <circle cx="46" cy="96" r="6" fill="{RED}" stroke="#FFF" stroke-width="2" />
      <circle cx="86" cy="62" r="6" fill="{BLUE}" stroke="#FFF" stroke-width="2" />
      <circle cx="140" cy="46" r="6" fill="{BLUE}" stroke="#FFF" stroke-width="2" />
      <rect x="120" y="80" width="64" height="30" rx="3" fill="#FFFFFF" stroke="#BCC9D6" />
      <g stroke="#BCC9D6" stroke-width="2"><line x1="125" y1="88" x2="178" y2="88" /><line x1="125" y1="95" x2="170" y2="95" /><line x1="125" y1="102" x2="176" y2="102" /></g>
{extra_on_screen}
      <path d="M-14 126 L214 126 L200 140 L0 140 Z" fill="{SLATE}" />
      <text x="100" y="166" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">RangerTrak</text>
      <text x="100" y="190" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">map + Radio Log</text>
    </g>
  </g>"""


def steps(badges, captions, x0=330):
    b = "\n".join(f'    <g transform="translate({x} {y})"><circle r="17" fill="{c}" /><text y="7">{n}</text></g>'
                  for n, x, y, c in badges)
    caps = "\n".join(f'      <text y="{i * 28}"><tspan font-weight="800" fill="{c}">{n}</tspan>  {t}</text>'
                     for i, (n, c, t) in enumerate(captions))
    return f"""  <g font-size="{SMALL}" font-weight="800" fill="#FFFFFF" text-anchor="middle">
{b}
  </g>
  <g font-size="{SMALL}" fill="{NAVY}">
    <g transform="translate({x0} 500)">
{caps}
    </g>
  </g>"""


def note(lines, y=36):
    """A short standing note, right-aligned in the top corner where the Key used to be."""
    t = "\n".join(f'    <text y="{i * 26}">{line}</text>' for i, line in enumerate(lines))
    return f"""  <g transform="translate(1176 {y})" font-size="{SMALL}" font-style="italic" fill="{SLATE}" text-anchor="end">
{t}
  </g>"""


def header(current):
    title, summary = next((m[1], m[2]) for m in MODES if m[0] == current)
    return f"""  <rect width="1200" height="80" fill="{NAVY}" />
  <g transform="translate(28 14)">
    <svg width="31" height="52" viewBox="0 0 155 260">
      <g fill="none" stroke="#EAF1F8" stroke-linejoin="round">
        <path d="M 52 239 L 18.4 175.8 A 38 38 0 1 1 85.6 175.8 Z" stroke-width="12" />
        <path d="M 52 96 L 52 150" stroke-width="5" stroke-linecap="round" />
      </g>
      <rect x="44" y="142" width="16" height="58" rx="6" fill="#EAF1F8" />
      <circle cx="52" cy="88" r="8" fill="#EAF1F8" />
      <g fill="none" stroke="{ORANGE}" stroke-width="10" stroke-linecap="round">
        <path transform="translate(52,88) scale(0.80) translate(-52,-88)" d="M 74.94 55.23 A 40 40 0 0 1 82.64 113.71" />
        <path transform="translate(52,88) scale(1.30) translate(-52,-88)" d="M 74.94 55.23 A 40 40 0 0 1 82.64 113.71" />
        <path transform="translate(52,88) scale(1.85) translate(-52,-88)" d="M 74.94 55.23 A 40 40 0 0 1 82.64 113.71" />
      </g>
    </svg>
    <text x="44" y="36" font-size="28" font-weight="800" fill="#EAF1F8">RangerTrak<tspan font-size="14" dy="-12">™</tspan></text>
  </g>
  <g transform="translate(300 0)">
    <text x="0" y="36" font-size="30" font-weight="800" fill="#FFFFFF">{title}</text>
    <text x="0" y="64" font-size="{SMALL}" fill="#C9D6E3">{summary}</text>
  </g>"""


def printer():
    return f"""  <path d="M800 320 C880 320 950 320 985 320" stroke="{SLATE}" stroke-width="3" fill="none" />
  <g transform="translate(990 252)">
    <rect x="0" y="36" width="120" height="70" rx="10" fill="{SLATE}" />
    <rect x="18" y="0" width="84" height="44" fill="#FFFFFF" stroke="{SLATE}" stroke-width="2.5" />
    <g stroke="#BCC9D6" stroke-width="2"><line x1="28" y1="12" x2="92" y2="12" /><line x1="28" y1="21" x2="84" y2="21" /><line x1="28" y1="30" x2="90" y2="30" /></g>
    <rect x="6" y="86" width="108" height="58" fill="#FFFFFF" stroke="{SLATE}" stroke-width="2.5" />
    <text x="60" y="110" text-anchor="middle" font-size="{SMALL}" font-weight="800" fill="{NAVY}">ICS-213</text>
    <text x="60" y="134" text-anchor="middle" font-size="{SMALL}" font-weight="800" fill="{NAVY}">309</text>
    <text x="60" y="172" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">Printer</text>
    <text x="60" y="196" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">optional</text>
  </g>"""


TEAMS_ALL_RADIO = "\n".join([
    team(120, 100, "Team 1", "on the rim"),
    team(250, 250, "Team 2", "down the trail"),
    team(90, 380, "Medic 1", "at the trailhead", RED),
])
VOICE_ALL = voice(["M178 130 C300 130 400 220 480 280", "M308 280 C380 280 440 290 480 295",
                   "M148 410 C280 410 400 340 480 312"])


def scene_basic():
    return "\n".join([
        NO_INTERNET, TEAMS_ALL_RADIO, VOICE_ALL, command_post(), printer(),
        steps([(1, 415, 230, ORANGE), (2, 516, 240, NAVY), (3, 760, 240, BLUE), (4, 900, 295, SLATE)],
              [(1, ORANGE, "A team calls in by voice radio."),
               (2, NAVY, "The scribe types who, where, when and what."),
               (3, BLUE, "The report lands on the map and in the Radio Log."),
               (4, SLATE, "Print ICS-213 messages and the 309 log as needed.")]),
        note(["One laptop, one log.", "No accounts."]),
    ])


def viewer(x, y, name, role):
    return f"""  <g transform="translate({x} {y})">
    <use href="#person" width="34" height="50" fill="{SLATE}" />
    <use href="#phone" x="30" y="14" width="16" height="28" fill="{NAVY}" />
    <text x="22" y="72" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">{name}</text>
    <text x="22" y="94" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">{role}</text>
  </g>"""


def scene_wifi():
    # The scribe's own laptop usually runs RangerView too (the server's own
    # comments: "even when both happen to run on the same laptop"); a second laptop can.
    server_tag = f"""  <g transform="translate(476 440)">
    <rect width="318" height="36" rx="18" fill="{WIFI}" />
    <text x="159" y="25" text-anchor="middle" font-size="{SMALL}" font-weight="700" fill="#FFFFFF">if RangerView is running</text>
  </g>
  <use href="#wifi" x="806" y="212" width="36" height="27" fill="{WIFI}" stroke="{WIFI}" />"""
    links = f"""  <g stroke="{WIFI}" stroke-width="3.5" stroke-dasharray="2 7" fill="none" stroke-linecap="round">
    <path d="M806 282 C900 262 990 236 1046 238" />
    <path d="M806 302 C900 310 990 334 1046 336" />
    <path d="M806 322 C900 370 990 424 1046 434" />
  </g>"""
    viewers = "\n".join([viewer(1068, 206, "IC", "incident command"),
                         viewer(1068, 304, "Ops", "operations"),
                         viewer(1068, 402, "Liaison", "with the family")])
    anyone = f"""  <g transform="translate(1176 140)" font-size="{SMALL}" font-style="italic" fill="{SLATE}" text-anchor="end">
    <text>… and others with permission</text>
  </g>"""
    return "\n".join([
        NO_INTERNET, TEAMS_ALL_RADIO, VOICE_ALL, command_post(), server_tag, links, viewers, anyone,
        steps([(1, 415, 230, ORANGE), (2, 516, 240, NAVY), (3, 824, 252, WIFI), (4, 960, 236, SLATE)],
              [(1, ORANGE, "Teams call in by voice radio; the scribe logs each report."),
               (2, NAVY, "RangerView runs on this laptop or a second one."),
               (3, WIFI, "It shows the Radio Log and messages, never the roster."),
               (4, SLATE, "People with permission read it on their own phones.")]),
    ])


def scene_phones():
    tower = f"""  <g transform="translate(600 16)">
    <path d="M30 96 L44 20 L58 96" fill="none" stroke="{SLATE}" stroke-width="4" stroke-linejoin="round" />
    <path d="M36 66 L52 66 M39 46 L49 46" stroke="{SLATE}" stroke-width="3" />
    <circle cx="44" cy="18" r="5" fill="{GREEN}" />
    <g fill="none" stroke="{GREEN}" stroke-width="3" stroke-linecap="round">
      <path d="M58 6 C66 12 66 24 58 30" /><path d="M66 0 C78 10 78 26 66 36" />
      <path d="M30 6 C22 12 22 24 30 30" /><path d="M22 0 C10 10 10 26 22 36" />
    </g>
    <text x="92" y="40" font-size="{SMALL}" font-weight="700" fill="{SLATE}">Intermittent cell signal,</text>
    <text x="92" y="64" font-size="{SMALL}" font-weight="700" fill="{SLATE}">when available</text>
  </g>"""
    field_phone = f"""  <g transform="translate(250 250)">
    <use href="#person" width="40" height="60" fill="{BLUE}" />
    <use href="#radio" x="36" y="16" width="14" height="30" fill="{NAVY}" />
    <use href="#phone" x="-12" y="18" width="16" height="28" fill="{NAVY}" />
    <text x="20" y="86" text-anchor="middle" font-size="{LABEL}" font-weight="700" fill="{NAVY}">Team 2</text>
    <text x="20" y="108" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">radio + phone</text>
    <g transform="translate(-214 4)">
      <rect width="186" height="58" rx="6" fill="#FFFFFF" stroke="#BCC9D6" stroke-width="1.5" />
      <text x="12" y="24" font-size="{SMALL}" fill="{NAVY}">Reports saved</text>
      <text x="12" y="48" font-size="{SMALL}" fill="{NAVY}">on the phone</text>
      <text x="156" y="38" font-size="24" font-weight="700" fill="{GREEN}">✓</text>
    </g>
  </g>"""
    packet = f"""  <g stroke="{GREEN}" stroke-width="3.5" stroke-dasharray="1 8" fill="none" stroke-linecap="round">
    <path d="M242 264 C300 190 500 150 612 106" />
    <path d="M676 108 C690 140 700 180 706 214" />
  </g>
  <g transform="translate(356 96)">
    <rect width="224" height="36" rx="18" fill="#FFFFFF" stroke="{GREEN}" stroke-width="2" />
    <text x="112" y="25" text-anchor="middle" font-size="{SMALL}" font-weight="700" fill="{GREEN}">📦 Send my reports</text>
    <text x="112" y="58" text-anchor="middle" font-size="{SMALL}" fill="{SLATE}">email · message · AirDrop</text>
  </g>"""
    close_by = f"""  <g stroke="{GREEN}" stroke-width="3.5" stroke-dasharray="1 8" fill="none" stroke-linecap="round">
    <path d="M236 300 C196 340 196 404 290 412 C370 418 430 412 470 404" />
  </g>
  <text x="360" y="450" text-anchor="middle" font-size="{SMALL}" font-weight="600" fill="{GREEN}">AirDrop / Nearby Share,</text>
  <text x="360" y="474" text-anchor="middle" font-size="{SMALL}" font-weight="600" fill="{GREEN}">close by</text>"""
    teams = "\n".join([team(120, 100, "Team 1", "on the rim"),
                       team(90, 380, "Medic 1", "at the trailhead", RED)])
    radio = VOICE_ALL
    merged = f"""      <g transform="translate(66 14)">
        <rect width="120" height="32" rx="4" fill="#FFFFFF" stroke="{GREEN}" stroke-width="1.5" />
        <text x="60" y="23" text-anchor="middle" font-size="{SMALL}" font-weight="700" fill="{GREEN}">📦 merged</text>
      </g>"""
    side = f"""  <g transform="translate(866 200)" font-size="{SMALL}" fill="{NAVY}">
    <rect width="310" height="200" rx="10" fill="#FFFFFF" stroke="#BCC9D6" stroke-width="2" />
    <text x="18" y="34" font-weight="800">At comms</text>
    <text x="18" y="66">The packet comes by email,</text>
    <text x="18" y="92">message, AirDrop, Nearby</text>
    <text x="18" y="118">Share or USB stick. Load</text>
    <text x="18" y="144">Report Packet merges it and</text>
    <text x="18" y="170">skips reports it already has.</text>
  </g>"""
    return "\n".join([
        tower, teams, radio, field_phone, packet, close_by, command_post(merged), side,
        steps([(1, 226, 222, BLUE), (2, 330, 114, GREEN), (3, 516, 240, NAVY), (4, 415, 230, ORANGE)],
              [(1, BLUE, "A ranger files reports on their phone; they save offline."),
               (2, GREEN, "When they can, they tap Send my reports."),
               (3, NAVY, "Comms loads the Report Packet; repeats are skipped."),
               (4, ORANGE, "No receipt comes back: urgent news goes by voice radio.")], x0=560),
        note(["Install the app", "before heading out."], y=140),
    ])


def build(mode, scene):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 680" width="1200" height="680" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">
  <!-- Generated by build-modes.py. Edit that, not this file. -->
{DEFS}
  <g transform="translate(0 80)">
{BACKGROUND}
{scene}
  </g>
{header(mode)}
</svg>
"""
    path = os.path.join(HERE, f"{mode}-mode.svg")
    open(path, "w", encoding="utf-8").write(svg)
    png = os.path.join(HERE, f"{mode}-mode.png")
    # A throwaway profile, never John's own. Kill the whole Edge tree and delete the profile on
    # every exit, or the profiles (~470 MB each) and orphaned Edge processes pile up.
    os.makedirs(TMP_ROOT, exist_ok=True)
    for name in os.listdir(TMP_ROOT):  # left by a hard kill; a day old means nothing is using it
        old = os.path.join(TMP_ROOT, name)
        if name.startswith("rt-modes-") and time.time() - os.path.getmtime(old) > 86400:
            shutil.rmtree(old, ignore_errors=True)
    profile = tempfile.mkdtemp(prefix="rt-modes-", dir=TMP_ROOT)
    edge_temp = os.path.join(profile, "_temp")  # Edge's own temp files go when the profile goes
    os.makedirs(edge_temp)
    edge = subprocess.Popen([EDGE, "--headless=new", "--inprivate", "--disable-sync", "--disable-gpu",
                             "--hide-scrollbars", f"--user-data-dir={profile}",
                             "--force-device-scale-factor=2", "--window-size=1200,680",
                             f"--screenshot={png}", "file:///" + path.replace("\\", "/")],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={**os.environ, "TEMP": edge_temp, "TMP": edge_temp})
    try:
        edge.wait(timeout=60)
    finally:
        subprocess.run(["taskkill", "/pid", str(edge.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                shutil.rmtree(profile)
                break
            except FileNotFoundError:
                break
            except OSError:
                time.sleep(0.25)
        else:
            print("could not remove", profile)
    print("wrote", os.path.basename(path), os.path.basename(png))


if __name__ == "__main__":
    build("basic", scene_basic())
    build("phones", scene_phones())
    build("wifi", scene_wifi())
