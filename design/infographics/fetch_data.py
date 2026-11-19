"""Fetch real terrain and trail data for the Bright Angel map. Run once; outputs are cached.

Terrain: AWS Terrain Tiles (terrarium encoding). In the US these are USGS 3DEP, public domain.
Trails, river, roads: OpenStreetMap via Overpass (ODbL: credit "© OpenStreetMap contributors").
"""
import io
import json
import math
import subprocess
import urllib.parse
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
DATA = HERE / 'data'
DATA.mkdir(exist_ok=True)

# Hopi Point west, Mather Point east, the Village south, the river north (aspect ~0.92)
BBOX = dict(south=36.0495, north=36.1075, west=-112.1660, east=-112.1000)
Z = 15


def get(url, post=None):
    """curl, not urllib: this machine's Python certificate store is out of date."""
    cmd = ['curl', '-sS', '--fail', '-A', 'rangertrak-infographic/1.0 (RangerTrak@steadyeoc.com)', url]
    if post is not None:
        cmd[1:1] = ['--data-urlencode', f'data@-']
    return subprocess.run(cmd, input=post.encode() if post else None, capture_output=True, check=True).stdout


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch_dem():
    x0, y0 = tile_xy(BBOX['north'], BBOX['west'], Z)
    x1, y1 = tile_xy(BBOX['south'], BBOX['east'], Z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    rows = []
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
            img = Image.open(io.BytesIO(get(url))).convert('RGB')
            a = np.asarray(img).astype(np.float64)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.hstack(row))
    dem = np.vstack(rows)
    # crop to the bbox, in pixels of the stitched mosaic
    px0, py0 = int((x0 - tx0) * 256), int((y0 - ty0) * 256)
    px1, py1 = int((x1 - tx0) * 256), int((y1 - ty0) * 256)
    dem = dem[py0:py1, px0:px1]
    np.save(DATA / 'dem.npy', dem)
    print('dem', dem.shape, 'elev', dem.min().round(), dem.max().round())


def fetch_osm():
    b = f"{BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']}"
    q = f"""[out:json][timeout:60];
(
  way["highway"~"path|footway|track"]["name"]({b});
  way["waterway"="river"]({b});
  way["highway"~"primary|secondary|tertiary|residential|unclassified"]({b});
  node["tourism"~"viewpoint|camp_site|alpine_hut"]({b});
  node["natural"="peak"]({b});
  node["name"~"Havasupai Gardens|Indian Garden|Plateau Point|Phantom Ranch|Yavapai|Trailview|Mather|Hopi|Maricopa|El Tovar|Bright Angel"]({b});
);
out geom;"""
    data = json.loads(get('https://overpass-api.de/api/interpreter', post=q))
    (DATA / 'osm.json').write_text(json.dumps(data), encoding='utf-8')
    names = sorted({e.get('tags', {}).get('name', '') for e in data['elements']} - {''})
    print('osm elements', len(data['elements']))
    print('names:', names)


if __name__ == '__main__':
    fetch_dem()
    fetch_osm()
