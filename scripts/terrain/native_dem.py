"""Join cached PixelIsPoint DEMs without resampling their native lattice."""
import numpy as np
from PIL import Image


def load_native_dem(paths, bounds, width, height):
    step = 1 / 3600
    if not np.isclose((bounds['maxLon']-bounds['minLon'])/step, width-1) or not np.isclose((bounds['maxLat']-bounds['minLat'])/step, height-1):
        raise ValueError('Target must use the native one-arcsecond lattice')
    mosaic = np.full((height, width), np.nan, dtype=float)
    used = []
    for path in paths:
        with Image.open(path) as image:
            sx, sy, _ = image.tag_v2[33550]
            ix, iy, _, west, north, _ = image.tag_v2[33922]
            keys = image.tag_v2[34735]
            if not any(keys[i:i+4] == (1025, 0, 1, 2) for i in range(4, len(keys), 4)):
                raise ValueError(f'Expected PixelIsPoint: {path}')
            if not any(keys[i:i+4] == (2048, 0, 1, 4326) for i in range(4, len(keys), 4)):
                raise ValueError(f'Expected EPSG:4326: {path}')
            if abs(sx-step) > 1e-12 or abs(sy-step) > 1e-12 or ix != 0 or iy != 0:
                raise ValueError(f'Incompatible native DEM lattice: {path}')
            x = (west-bounds['minLon'])/step
            y = (bounds['maxLat']-north)/step
            if abs(x-round(x)) > 1e-6 or abs(y-round(y)) > 1e-6:
                raise ValueError(f'DEM is not aligned to the shared pixel centers: {path}')
            x, y = round(x), round(y)
            left, top = max(0, x), max(0, y)
            right, bottom = min(width, x+image.width), min(height, y+image.height)
            if left >= right or top >= bottom:
                continue
            values = np.asarray(image)[top-y:bottom-y, left-x:right-x].astype(float)
            if not np.isfinite(values).all() or (values <= -1000).any():
                raise ValueError(f'Invalid DEM/nodata samples: {path}')
            target = mosaic[top:bottom, left:right]
            existing = np.isfinite(target)
            if not np.array_equal(target[existing], values[existing]):
                raise ValueError(f'Conflicting native DEM overlap: {path}')
            target[:] = values
            used.append(str(path))
    if not np.isfinite(mosaic).all():
        raise ValueError('Missing LOCAL DEM coverage for bbox; previous build retained. No downloads attempted.')
    return mosaic[::-1].copy(), used
