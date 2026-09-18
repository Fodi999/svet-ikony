"""Compare old MontBlanc geometry/native DEM against the addon-built extension."""
import argparse
import json
from pathlib import Path
import struct
import numpy as np


def attributes(file):
    data=file.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);start=28+length
    return [data[start+v.get('byteOffset',0):start+v.get('byteOffset',0)+v['byteLength']] for v in doc['bufferViews'][:4]]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--before',type=Path,required=True);args=parser.parse_args()
    after=Path(__file__).resolve().parents[2]/'tools/terrain/alps/build'
    old_manifest=json.loads((args.before/'L2/manifest.json').read_text())
    new_manifest=json.loads((after/'L2/manifest.json').read_text())
    old_dem=np.fromfile(args.before/'L2/heights.bin',dtype='<f4').reshape(old_manifest['grid']['countY']*180+1,old_manifest['grid']['countX']*252+1)
    new_dem=np.fromfile(after/'L2/heights.bin',dtype='<f4').reshape(new_manifest['grid']['countY']*180+1,new_manifest['grid']['countX']*252+1)
    x=round((old_manifest['bounds']['minLon']-new_manifest['bounds']['minLon'])*3600)
    y=round((old_manifest['bounds']['minLat']-new_manifest['bounds']['minLat'])*3600)
    assert np.array_equal(old_dem,new_dem[y:y+old_dem.shape[0],x:x+old_dem.shape[1]]), 'Existing native samples changed'
    report={'oldGeometryUnchanged':True,'oldNativeDEMUnchanged':True,'lods':[]}
    for lod in range(3):
        before=json.loads((args.before/f'L{lod}/manifest.json').read_text())
        current=json.loads((after/f'L{lod}/manifest.json').read_text())
        bounds_key=lambda t:tuple(round(t[k],8) for k in ('min_lon','min_lat','max_lon','max_lat'))
        current_tiles={bounds_key(t):t for t in current['tiles']}
        for previous in before['tiles']:
            tile=current_tiles[bounds_key(previous)]
            for key in ['vertex_resolution','surface_triangles','min_lat','max_lat','min_lon','max_lon','height_min','height_max','geometric_error_m']:
                assert previous[key]==tile[key],(key,previous[key],tile[key])
            assert attributes(args.before/f'L{lod}'/previous['file'])==attributes(after/f'L{lod}'/tile['file']), 'Geometry/normal/UV/index bytes changed'
        report['lods'].append({'lod':lod,'before':len(before['tiles']),'after':len(current['tiles']),'spacingMeters':current['spacingMeters']})
    report['beforeServedBytes']=sum(p.stat().st_size for lod in range(3) for p in (args.before/f'L{lod}').iterdir() if p.is_file())
    report['afterServedBytes']=sum(p.stat().st_size for lod in range(3) for p in (after/f'L{lod}').iterdir() if p.is_file())
    (after/'extension-audit.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
