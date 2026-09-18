"""Local heightmap-1.0 spike in Cesium's geographic TMS scheme, not old GLB grid."""
import hashlib
import json
import math
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OLD=ROOT/'tools/terrain/alps/build'
OUT=ROOT/'tools/terrain/cesium/build'
BBOX=(6.7,45.75,6.98,46.0)
MAX_LEVEL=13

def tile_bounds(level,x,y):
    size=180/(1<<level)
    return (-180+x*size,90-(y+1)*size,-180+(x+1)*size,90-y*size)

def tile_range(level):
    size=180/(1<<level)
    w,s,e,n=BBOX
    return (math.floor((w+180)/size),math.floor((90-n)/size),math.ceil((e+180)/size)-1,math.ceil((90-s)/size)-1)

def main():
    metadata=json.loads((OLD/'L2/manifest.json').read_text())
    dem=metadata['nativeDem']
    source=OLD/'L2/heights.bin'
    grid=np.fromfile(source,dtype='<f4').reshape(dem['height'],dem['width'])
    def available(level,x,y):
        if level==0:return 0<=x<2 and y==0
        if level>MAX_LEVEL:return False
        a,b,c,d=tile_range(level)
        return a<=x<=c and b<=y<=d
    def sample(lon,lat):
        xx=np.clip((lon-dem['west'])/dem['stepDegrees'],0,dem['width']-1)
        yy=np.clip((lat-dem['south'])/dem['stepDegrees'],0,dem['height']-1)
        i=np.minimum(xx.astype(int),dem['width']-2);j=np.minimum(yy.astype(int),dem['height']-2)
        u,v=xx-i,yy-j
        heights=grid[j,i]*(1-u)*(1-v)+grid[j,i+1]*u*(1-v)+grid[j+1,i]*(1-u)*v+grid[j+1,i+1]*u*v
        w,s,e,n=BBOX
        blend=np.clip(np.minimum.reduce([lon-w,e-lon,lat-s,n-lat])/.02,0,1)
        return heights*blend*blend*(3-2*blend)
    records=[];ranges=[]
    terrain=OUT/'alps-heightmap'
    for level in range(MAX_LEVEL+1):
        a,b,c,d=(0,0,1,0) if level==0 else tile_range(level)
        ny=1<<level
        ranges.append([{'startX':a,'startY':ny-1-d,'endX':c,'endY':ny-1-b}])
        for x in range(a,c+1):
            folder=terrain/str(level)/str(x);folder.mkdir(parents=True,exist_ok=True)
            for y in range(b,d+1):
                w,s,e,n=tile_bounds(level,x,y)
                lon,lat=np.meshgrid(np.linspace(w,e,65),np.linspace(n,s,65))
                heights=sample(lon,lat)
                if not np.isfinite(heights).all():raise ValueError('Invalid terrain height')
                mask=sum(bit for dx,dy,bit in [(0,1,1),(1,1,2),(0,0,4),(1,0,8)] if available(level+1,x*2+dx,y*2+dy))
                data=np.rint((heights+1000)*5).astype('<u2').tobytes()+bytes([mask,0])
                filename=f'{level}/{x}/{ny-1-y}.terrain';(terrain/filename).write_bytes(data)
                records.append({'level':level,'x':x,'y':y,'bbox':[w,s,e,n],'parent':None if level==0 else [level-1,x//2,y//2],
                    'children':[[level+1,x*2+dx,y*2+dy] for dx,dy in [(0,0),(1,0),(0,1),(1,1)] if available(level+1,x*2+dx,y*2+dy)],
                    'file':filename,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    (terrain/'layer.json').write_text(json.dumps({'tilejson':'2.1.0','format':'heightmap-1.0','version':'1.0.0','scheme':'tms',
        'projection':'EPSG:4326','tiles':['{z}/{x}/{y}.terrain'],'maxzoom':MAX_LEVEL,'available':ranges,
        'attribution':'Copernicus DEM GLO-30; locally resampled / edge blended'}))
    (terrain/'audit.json').write_text(json.dumps({'bbox':BBOX,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'verticalDatum':'Source orthometric heights retained for prototype; ellipsoid conversion NOT VERIFIED',
        'edgeBlendDegrees':.02,'tiles':records},indent=2))
    with rasterio.open(metadata['textureSource']['path']) as texture:
        for level in range(7,MAX_LEVEL+1):
            a,b,c,d=tile_range(level)
            for x in range(a,c+1):
                folder=OUT/'sentinel'/str(level)/str(x);folder.mkdir(parents=True,exist_ok=True)
                for y in range(b,d+1):
                    bounds=tile_bounds(level,x,y)
                    pixels=np.zeros((4,256,256),dtype=np.uint8)
                    for band in range(3):
                        reproject(rasterio.band(texture,band+1),pixels[band],src_transform=texture.transform,src_crs=texture.crs,
                            dst_transform=from_bounds(*bounds,256,256),dst_crs='EPSG:4326',resampling=Resampling.bilinear)
                    w,s,e,n=bounds
                    lon,lat=np.meshgrid(np.linspace(w+(e-w)/512,e-(e-w)/512,256),np.linspace(n-(n-s)/512,s+(n-s)/512,256))
                    pixels[3]=(((lon>=BBOX[0])&(lon<=BBOX[2])&(lat>=BBOX[1])&(lat<=BBOX[3]))*255).astype(np.uint8)
                    Image.fromarray(pixels.transpose(1,2,0)).save(folder/f'{y}.png')
    print(json.dumps({'heightmapTiles':len(records),'terrainBytes':sum(t['bytes'] for t in records),'bbox':BBOX,'maxLevel':MAX_LEVEL}))

if __name__=='__main__':main()
