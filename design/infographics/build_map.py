"""Bright Angel search map, in the style of a vintage hand-lettered expedition map.

Real terrain (USGS 3DEP via AWS Terrain Tiles) is shaded and contoured here; trails, the
river and roads are OpenStreetMap. The story on top follows RangerTrak's Grand Canyon demo,
with its reports placed at their REAL locations (the demo's own coordinates are approximate).

    python fetch_data.py   # once: terrain + OSM into data/
    python build_map.py    # writes map-base.png (terrain raster) and bright-angel-*.svg
"""
import json
import math
from pathlib import Path

import numpy as np
from matplotlib.colors import LightSource
from scipy.ndimage import gaussian_filter, zoom
from PIL import Image

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from fetch_data import BBOX, Z, tile_xy

HERE = Path(__file__).parent
DATA = HERE / 'data'

DEM = np.load(DATA / 'dem.npy')
ROWS, COLS = DEM.shape
TX0, TY0 = tile_xy(BBOX['north'], BBOX['west'], Z)


def to_px(lat, lon):
    """lat/lon -> pixel in the DEM raster (web mercator, same crop as fetch_data)."""
    x, y = tile_xy(lat, lon, Z)
    return (x - TX0) * 256, (y - TY0) * 256


# ---------------------------------------------------------------- terrain raster
PARCHMENT = np.array([236, 222, 194]) / 255
LOWLAND = np.array([214, 178, 138]) / 255      # the canyon floor, a touch warmer and darker
HIGHLAND = np.array([240, 230, 208]) / 255     # the rims, paler


def terrain_png(path, scale=2):
    dem = gaussian_filter(DEM, 1.0)
    ls = LightSource(azdeg=315, altdeg=42)
    hs = ls.hillshade(dem, vert_exag=1.6, dx=3.8, dy=3.8)
    hs2 = LightSource(azdeg=250, altdeg=55).hillshade(dem, vert_exag=1.2, dx=3.8, dy=3.8)
    shade = .7 * hs + .3 * hs2
    # geology by elevation, from a photo of this view (John's): violet inner gorge, grey-green
    # Tonto, rust Redwall, pink-red Supai/Hermit, cream Coconino, pale Kaibab rim
    stops = [(700, (104, 78, 88)), (950, (112, 86, 92)), (1050, (160, 152, 118)), (1250, (170, 160, 122)),
             (1350, (186, 150, 108)), (1420, (178, 92, 66)), (1550, (184, 96, 70)), (1650, (196, 124, 92)),
             (1900, (200, 132, 100)), (1960, (232, 214, 176)), (2040, (236, 222, 188)), (2300, (232, 224, 194))]
    ev = [e for e, _ in stops]
    geo = np.stack([np.interp(dem, ev, [c[i] for _, c in stops]) for i in range(3)], -1) / 255
    parch = np.array([240, 226, 196]) / 255
    base = .5 * geo + .5 * parch[None, None, :]
    # pinyon-juniper forest on the flat rim: a soft green stipple
    gy, gx = np.gradient(dem, 3.8)
    flat = np.hypot(gx, gy) < .12
    rng = np.random.default_rng(7)
    patch = gaussian_filter(rng.random(dem.shape), 1.6)
    forest = (dem > 2060) & flat & (patch > np.quantile(patch, .45))
    base[forest] = base[forest] * .84 + np.array([118, 142, 92]) / 255 * .16
    # shade: warm sepia shadows leaning slightly violet, cream highlights
    s_ = np.clip(shade, 0, 1) ** 1.1
    shadow = np.array([92, 68, 70]) / 255
    rgb = shadow[None, None, :] * (1 - s_[..., None]) * 1.15 + base * (.28 + .82 * s_[..., None])
    rgb = np.clip(rgb, 0, 1)
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    img = img.resize((COLS * scale, ROWS * scale), Image.LANCZOS)
    img.save(path, optimize=True)


def contour_paths(interval=40, index=200):
    """Contour lines as SVG path strings, in DEM pixel units."""
    dem = gaussian_filter(DEM, 3.0)
    levels = np.arange(math.ceil(dem.min() / interval) * interval, dem.max(), interval)
    fig = plt.figure()
    cs = plt.contour(dem, levels=levels)
    minor, major = [], []
    for lev, segs in zip(cs.levels, cs.allsegs):
        for seg in segs:
            if len(seg) < 12:
                continue
            seg = seg[::2]
            d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in seg)
            (major if lev % index == 0 else minor).append(d)
    plt.close(fig)
    return minor, major


# ---------------------------------------------------------------- OSM vectors
OSM = json.loads((DATA / 'osm.json').read_text(encoding='utf-8'))


def ways(pred):
    out = []
    for e in OSM['elements']:
        if e['type'] == 'way' and pred(e.get('tags', {})):
            out.append([to_px(p['lat'], p['lon']) for p in e['geometry']])
    return out


def path_d(pts):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)


def inside(pts, pad=40):
    return any(-pad < x < COLS + pad and -pad < y < ROWS + pad for x, y in pts)


if __name__ == '__main__':
    terrain_png(HERE / 'map-base.png')
    minor, major = contour_paths()
    river = [w for w in ways(lambda t: t.get('waterway') == 'river') if inside(w)]
    trails = {n: [w for w in ways(lambda t, n=n: t.get('name') == n) if inside(w)]
              for n in ['Bright Angel Trail', 'Plateau Point Trail', 'Tonto Trail', 'Rim Trail', 'West Rim Trail', 'South Kaibab Trail']}
    roads = [w for w in ways(lambda t: t.get('highway') in ('primary', 'secondary', 'tertiary')) if inside(w)]
    S = []
    S.append(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{COLS}" height="{ROWS}" viewBox="0 0 {COLS} {ROWS}">')
    S.append(f'<image href="map-base.png" width="{COLS}" height="{ROWS}"/>')
    S.append('<g fill="none" stroke="#6B4A2E" stroke-linejoin="round">')
    S += [f'<path d="{d}" stroke-width=".6" opacity=".38"/>' for d in minor]
    S += [f'<path d="{d}" stroke-width="1.2" opacity=".55"/>' for d in major]
    S.append('</g>')
    S += [f'<path d="{path_d(w)}" fill="none" stroke="#8A8174" stroke-width="2.2"/>' for w in roads]
    for w in river:
        S.append(f'<path d="{path_d(w)}" fill="none" stroke="#5E88A6" stroke-width="12" stroke-linecap="round" opacity=".9"/>')
        S.append(f'<path d="{path_d(w)}" fill="none" stroke="#9CC2D6" stroke-width="7" stroke-linecap="round"/>')
    for n, ws in trails.items():
        for w in ws:
            S.append(f'<path d="{path_d(w)}" fill="none" stroke="#3B2A1C" stroke-width="{2 if n != "Tonto Trail" else 1.5}" stroke-dasharray="6 4" opacity=".85"/>')
    S.append('</svg>')
    (HERE / 'map-base-test.svg').write_text('\n'.join(S), encoding='utf-8')
    print('dem', DEM.shape, 'contours', len(minor), len(major), 'river', len(river), {k: len(v) for k, v in trails.items()})
