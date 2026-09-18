"""Prepare only the new Blender scene patch from local inputs, not web LOD bundles."""
from pathlib import Path
import numpy as np
from PIL import Image
import rasterio
from generate_alps_dem import crop_pixels

ROOT=Path(__file__).resolve().parents[2]/'tools/terrain/alps/build'
SOURCE=Path.home()/'My project/Earth_Blender/dem/alps/Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif'


def main():
    out=ROOT/'blender-prepared';out.mkdir(exist_ok=True)
    with Image.open(SOURCE) as im:
        sx,sy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922]
        a=np.asarray(im)
        x0,x1=[round((v-west)/sx) for v in (6.42,6.70)]
        y0,y1=[round((north-v)/sy) for v in (45.95,45.75)]
        native=a[y0:y1+1,x0:x1+1][::-1].astype(float)
    grid=native;ny,nx=grid.shape
    lon,lat=np.meshgrid(np.linspace(6.42,6.70,nx),np.linspace(45.75,45.95,ny))
    la,lo=np.radians(lat),np.radians(lon);radius=2*(1+grid/6371000)
    # Blender Z-up basis of the existing Earth, calibrated to geography.ts on export.
    positions=np.stack([radius*np.cos(la)*np.cos(lo),radius*np.cos(la)*np.sin(lo),radius*np.sin(la)],axis=-1)
    center=positions[ny//2,nx//2].copy()
    indices=np.arange(nx*ny).reshape(ny,nx)[:-1,:-1].reshape(-1)
    faces=np.concatenate([np.stack([indices,indices+1,indices+nx],axis=1),np.stack([indices+1,indices+nx+1,indices+nx],axis=1)])
    uv=np.stack([(lon-6.42)/.28,(lat-45.75)/.20],axis=-1)
    np.savez(out/'Alps_West_01.npz',positions=(positions-center).reshape(-1,3).astype('f4'),center=center,faces=faces,uv=uv.reshape(-1,2))
    sources=[Path('/Users/dmitrijfomin/Desktop/CodexWorkspace/Sentinel2_32TLR_20230926_TCI.tif'),ROOT/'source-cache/31TGL_20230926_west_strip.tif']
    with rasterio.open(sources[0]) as primary, rasterio.open(sources[1]) as extra:
        pixels=crop_pixels([primary,extra],6.42,45.75,6.70,45.95,2049,2049)
    Image.fromarray(pixels.transpose(1,2,0)).save(out/'Alps_West_01.png')
    print(out)


if __name__=='__main__':main()
