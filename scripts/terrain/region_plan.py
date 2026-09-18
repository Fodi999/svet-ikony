"""Local region descriptors on the unchanged MontBlanc tile lattice."""
import json
import math
import re
import sys

DEFAULT = {'regions': [{'name': 'MontBlanc', 'bounds': [6.70, 45.75, 6.98, 45.95]}]}
MAX_CELLS = 256


def lattice_index(value, origin, step):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError('BBox coordinates must be finite numbers')
    index = round((value - origin) / step)
    if abs(value - (origin + index * step)) > 1e-5:
        raise ValueError('BBox must align to the Alps grid: longitude 6.70 + n*0.07, latitude 45.75 + n*0.05')
    return index


def validate_plan(plan):
    regions = plan.get('regions') if isinstance(plan, dict) else None
    if not isinstance(regions, list) or not 1 <= len(regions) <= MAX_CELLS:
        raise ValueError('Invalid region list')
    names, occupied, normalized = set(), set(), []
    for region in regions:
        name = region.get('name') if isinstance(region, dict) else None
        if not isinstance(name, str) or not re.fullmatch(r'[\w -]{1,48}', name) or name != name.strip():
            raise ValueError('Region name: 1-48 letters, numbers, spaces, underscores or hyphens')
        if name.casefold() in names:
            raise ValueError('Duplicate region name: ' + name)
        names.add(name.casefold())
        bounds = region.get('bounds')
        if not isinstance(bounds, (list, tuple)) or len(bounds) != 4:
            raise ValueError('BBox requires west, south, east, north')
        w, s, e, n = [lattice_index(v, origin, step) for v, origin, step in
                      zip(bounds, (6.7, 45.75, 6.7, 45.75), (.07, .05, .07, .05))]
        if w >= e or s >= n:
            raise ValueError('BBox requires west < east and south < north')
        canonical = [round(6.7+w*.07, 8), round(45.75+s*.05, 8),
                     round(6.7+e*.07, 8), round(45.75+n*.05, 8)]
        if not (-180 <= canonical[0] < canonical[2] <= 180 and -90 < canonical[1] < canonical[3] < 90):
            raise ValueError('BBox outside geographic range')
        if (e-w)*(n-s) > MAX_CELLS:
            raise ValueError('Local build limit: 256 cells per LOD')
        cells = {(x, y) for x in range(w, e) for y in range(s, n)}
        if occupied & cells:
            raise ValueError('Region overlaps an existing bbox: ' + name)
        occupied |= cells
        normalized.append({'name': name, 'bounds': canonical})
    if DEFAULT['regions'][0] not in normalized:
        raise ValueError('Original MontBlanc bbox must be retained')
    x0, x1 = min(x for x, _ in occupied), max(x for x, _ in occupied)+1
    y0, y1 = min(y for _, y in occupied), max(y for _, y in occupied)+1
    if (x1-x0)*(y1-y0) != len(occupied):
        raise ValueError('Regions must form one continuous rectangle without gaps')
    if len(occupied) > MAX_CELLS:
        raise ValueError('Local build limit: 256 cells per LOD')
    return {'regions': sorted(normalized, key=lambda r: (r['bounds'][1], r['bounds'][0])),
            'bounds': dict(minLon=round(6.7+x0*.07, 8), minLat=round(45.75+y0*.05, 8),
                           maxLon=round(6.7+x1*.07, 8), maxLat=round(45.75+y1*.05, 8)),
            'countX': x1-x0, 'countY': y1-y0, 'originX': x0, 'originY': y0}


def region_for_cell(plan, col, row):
    lon = 6.7 + (plan['originX'] + col + .5)*.07
    lat = 45.75 + (plan['originY'] + row + .5)*.05
    for region in plan['regions']:
        w, s, e, n = region['bounds']
        if w < lon < e and s < lat < n:
            return region, int(round((lon-w)/.07-.5)), int(round((n-lat)/.05-.5))
    raise ValueError('Unassigned terrain cell')


if __name__ == '__main__':
    try:
        print(json.dumps(validate_plan(json.load(sys.stdin))))
    except (ValueError, TypeError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
