"""One-time missing Sentinel strip cache. Not called by Build Terrain Region."""
import json
import argparse
import math
from pathlib import Path
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds, Window

URL = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/T/GL/2023/9/S2A_31TGL_20230926_0_L2A/TCI.tif'
OUT = Path(__file__).resolve().parents[2] / 'tools/terrain/alps/build/source-cache/31TGL_20230926_west_strip.tif'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbox', type=float, nargs=4, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    args = parser.parse_args()
    bbox = args.bbox or [6.41, 45.74, 6.45, 45.96]
    if not all(math.isfinite(v) for v in bbox) or not (bbox[0] < bbox[2] and bbox[1] < bbox[3]):
        parser.error('Expected finite west < east and south < north')
    if args.bbox:
        OUT = OUT.with_name('31TGL_20230926_window_' + '_'.join(f'{v:.5f}' for v in bbox) + '.tif')
    if OUT.is_file():
        print('REUSED', OUT)
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
            with rasterio.open(URL) as source:
                bounds = transform_bounds('EPSG:4326', source.crs, *bbox)
                window = from_bounds(*bounds, source.transform).round_offsets().round_lengths()
                window = Window(window.col_off-2, window.row_off-2, window.width+4, window.height+4)
                # Other cached scenes may cover the part beyond this COG footprint.
                window = window.intersection(Window(0, 0, source.width, source.height))
                pixels = source.read(window=window)
                profile = source.profile.copy()
                profile.update(width=pixels.shape[2], height=pixels.shape[1], transform=source.window_transform(window), compress='deflate')
                temporary = OUT.with_suffix('.part.tif')
                with rasterio.open(temporary, 'w', **profile) as target:
                    target.write(pixels)
                temporary.replace(OUT)
        OUT.with_suffix('.json').write_text(json.dumps({'source':URL,'bbox':bbox,'method':'COG HTTP range window, native 10m pixels'},indent=2))
        print('CACHED', OUT, OUT.stat().st_size)
