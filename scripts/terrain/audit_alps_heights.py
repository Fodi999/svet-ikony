import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'tools/terrain/alps'
dem_path = Path.home() / 'My project/Earth_Blender/dem/alps/Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif'
image = Image.open(dem_path)
dem = np.asarray(image)
sx, sy, _ = image.tag_v2[33550]
_, _, _, west, north, _ = image.tag_v2[33922]

def sample(lon, lat):
    x, y = (lon-west)/sx, (north-lat)/sy
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    u, v = x-i, y-j
    return dem[j,i]*(1-u)*(1-v)+dem[j,i+1]*u*(1-v)+dem[j+1,i]*(1-u)*v+dem[j+1,i+1]*u*v

def stats(values, lon, lat):
    k = int(np.argmax(values))
    return dict(zip(['min','median','p95','p99','max'], map(float,np.percentile(values,[0,50,95,99,100]))), maximum={'lon':float(lon.flat[k]),'lat':float(lat.flat[k])}, samples=int(values.size))

x = np.arange(round((6.7-west)/sx),round((6.98-west)/sx)+1)
y = np.arange(round((north-45.95)/sy),round((north-45.75)/sy)+1)
lon,lat = np.meshgrid(west+x*sx,north-y*sy)
report = {'dem':stats(dem[np.ix_(y,x)],lon,lat),'geotiff':{'pixelScale':list(image.tag_v2[33550]),'tiepoint':list(image.tag_v2[33922]),'rasterType':'PixelIsPoint'}}
raws, refs, lons, lats = [],[],[],[]
for path in sorted((root/'raw').glob('tile_*.json')):
    tile = json.loads(path.read_text())
    xx,yy = np.meshgrid(np.linspace(tile['lon_min'],tile['lon_max'],tile['n']),np.linspace(tile['lat_min'],tile['lat_max'],tile['n']))
    raws.extend(np.asarray(tile['grid']).ravel()); refs.extend(sample(xx,yy).ravel()); lons.extend(xx.ravel()); lats.extend(yy.ravel())
raw,ref = np.asarray(raws),np.asarray(refs)
report['raycast'] = stats(raw,np.asarray(lons),np.asarray(lats))
report['comparison'] = {'medianRatio':float(np.median(raw/ref)), 'rmseRawMeters':float(np.sqrt(np.mean((raw-ref)**2))), 'rmseWithoutExaggerationMeters':float(np.sqrt(np.mean((raw/1.6-ref)**2))), 'p99AbsoluteResidualMeters':float(np.percentile(abs(raw/1.6-ref),99)), 'maximumSampleDemMeters':float(ref[raw.argmax()]), 'samplesAboveDemMaximum':int(np.count_nonzero(raw>report['dem']['max']))}
print(json.dumps(report,indent=2))
