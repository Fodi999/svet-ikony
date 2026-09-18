"""Offline Copernicus PixelIsPoint terrain. Existing flat L1 bundle is retained."""
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio
from rasterio.warp import transform as project_coordinates
from rasterio.windows import Window
from region_plan import DEFAULT, validate_plan, region_for_cell
from native_dem import load_native_dem

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('legacy_alps', HERE / 'generate-alps.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
SOURCE = Path.home() / 'My project/Earth_Blender'
OUT = Path(legacy.OUT_DIR)


def crop_pixels(sources, west, south, east, north, width, height):
    lon,lat=np.meshgrid(np.linspace(west,east,width),np.linspace(north,south,height))
    pixels=np.zeros((3,height,width),dtype='uint8');covered=np.zeros((height,width),dtype=bool)
    for source in sources:
        if source is None:continue
        xx,yy=project_coordinates('EPSG:4326',source.crs,lon.ravel(),lat.ravel())
        xx=np.asarray(xx).reshape(height,width);yy=np.asarray(yy).reshape(height,width)
        b=source.bounds
        valid=(xx>=b.left)&(xx<=b.right)&(yy>=b.bottom)&(yy<=b.top)
        take=valid&~covered
        if take.any():
            # Exact geographic samples avoid per-tile warp approximation at seams.
            col,row=(~source.transform)*(xx[take],yy[take])
            col=np.clip(col-.5,0,source.width-1);row=np.clip(row-.5,0,source.height-1)
            i=np.minimum(np.floor(col).astype(int),source.width-2)
            j=np.minimum(np.floor(row).astype(int),source.height-2)
            u,v=col-i,row-j
            left,top,right,bottom=int(i.min()),int(j.min()),int(i.max())+2,int(j.max())+2
            data=source.read(indexes=[1,2,3],window=Window(left,top,right-left,bottom-top)).astype(float)
            i-=left;j-=top
            values=(data[:,j,i]*(1-u)*(1-v)+data[:,j,i+1]*u*(1-v)
                    +data[:,j+1,i]*(1-u)*v+data[:,j+1,i+1]*u*v)
            pixels[:,take]=np.clip(np.rint(values),0,255).astype('uint8');covered|=valid
    if not covered.all():raise ValueError('Sentinel geographic coverage gap')
    return pixels


def interpolate(a, x, y):
    i = np.minimum(np.floor(x).astype(int), a.shape[1]-2)
    j = np.minimum(np.floor(y).astype(int), a.shape[0]-2)
    u, v = x-i, y-j
    # Match the GLB triangle diagonal, including collision/error calculations.
    return np.where(u+v <= 1, a[j,i]*(1-u-v)+a[j,i+1]*u+a[j+1,i]*v,
                    a[j+1,i+1]*(u+v-1)+a[j,i+1]*(1-v)+a[j+1,i]*(1-u))


def mesh_for(grid, lons, lats, skirt):
    ny, nx = grid.shape
    p = [legacy.terrain_point(float(lat),float(lon),float(grid[j,i]))
         for j,lat in enumerate(lats) for i,lon in enumerate(lons)]
    pp = np.array(p).reshape(ny,nx,3)
    normals = np.cross(np.gradient(pp,axis=1),np.gradient(pp,axis=0))
    normals /= np.linalg.norm(normals,axis=2,keepdims=True)
    normals = list(map(tuple,normals.reshape(-1,3)))
    uv = [(i/(nx-1),1-j/(ny-1)) for j in range(ny) for i in range(nx)]
    indices = []
    for j in range(ny-1):
        for i in range(nx-1):
            a=j*nx+i
            indices.extend([a,a+1,a+nx,a+1,a+nx+1,a+nx])
    surface = len(indices)//3
    edge = list(range(nx))+[j*nx+nx-1 for j in range(1,ny)]+list(range(ny*nx-2,(ny-1)*nx-1,-1))+[j*nx for j in range(ny-2,0,-1)]
    for k,a in enumerate(edge):
        b=edge[(k+1)%len(edge)]
        offset=len(p)
        p.extend([(p[a][0],p[a][1]-skirt/legacy.METERS_PER_UNIT,p[a][2]),(p[b][0],p[b][1]-skirt/legacy.METERS_PER_UNIT,p[b][2])])
        uv.extend([uv[a],uv[b]]); normals.extend([normals[a],normals[b]])
        indices.extend([a,offset,b,b,offset,offset+1])
    return dict(positions=p,normals=normals,uvs=uv,indices=indices,surface_triangles=surface)


def main(output_dir=None, plan=None):
    output_dir = Path(output_dir) if output_dir else OUT
    if plan is None and (OUT/'region-request.json').is_file():plan=json.loads((OUT/'region-request.json').read_text())
    plan=validate_plan(plan or DEFAULT)
    count_x,count_y=plan['countX'],plan['countY']
    bounds=plan['bounds']; west_bound=bounds['minLon']
    path=SOURCE/'dem/alps/Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif'
    dem_paths=[path,*sorted((OUT/'source-cache').glob('Copernicus*_DEM.tif'))]
    native,height_sources=load_native_dem(dem_paths,bounds,count_x*252+1,count_y*180+1)
    # Pixel centers on all levels use exactly the same regional endpoints.
    texture_path=Path(os.environ.get('ALPS_TCI_PATH',str(SOURCE/'satellite/alps/TCI.tif')))
    source=rasterio.open(texture_path)
    extra_path=OUT/'source-cache/31TGL_20230926_west_strip.tif'
    supplement_paths = ([extra_path] if extra_path.is_file() else []) + sorted((OUT/'source-cache').glob('31TGL_20230926_window_*.tif'))
    supplements = [rasterio.open(path) for path in supplement_paths]
    records=[]
    old=json.loads((OUT/'manifest.json').read_text())
    for lod,(nx,ny) in enumerate([(16,15),(63,60),(252,180)]):
        folder=output_dir/f'L{lod}';folder.mkdir(parents=True,exist_ok=True)
        tiles=[]
        for row in range(count_y):
            for col in range(count_x):
                tile_native=native[row*180:(row+1)*180+1,col*252:(col+1)*252+1]
                xx,yy=np.meshgrid(np.linspace(0,252,nx+1),np.linspace(0,180,ny+1))
                grid=interpolate(tile_native,xx,yy)
                ex,ey=np.meshgrid(np.linspace(0,nx,253),np.linspace(0,ny,181))
                error=float(np.max(abs(interpolate(grid,ex,ey)-tile_native)))
                local_col=col+plan['originX']
                local_row=row+plan['originY']
                lons=np.linspace(6.7+local_col*.07,6.7+(local_col+1)*.07,nx+1)
                lats=np.linspace(45.75+local_row*.05,45.75+(local_row+1)*.05,ny+1)
                tile_id=f'l{lod}_{col}_{count_y-1-row}'
                mesh=mesh_for(grid,lons,lats,1000)
                tw,th=[(129,129),(257,257),(545,557)][lod]
                pixels=crop_pixels([source,*supplements],float(lons[0]),float(lats[0]),float(lons[-1]),float(lats[-1]),tw,th)
                if np.count_nonzero(pixels)==0: raise ValueError('Empty Sentinel tile')
                crop=Image.fromarray(pixels.transpose(1,2,0))
                buf=io.BytesIO();crop.save(buf,format='PNG')
                glb=legacy.build_glb(mesh,buf.getvalue(),tile_id,texture_mime='image/png')
                filename=f'{col}_{count_y-1-row}.glb';(folder/filename).write_bytes(glb)
                t=dict(tile_id=tile_id,lod=lod,x=col,y=count_y-1-row,file=filename,file_size_bytes=len(glb),sha256=hashlib.sha256(glb).hexdigest(),min_lon=float(lons[0]),max_lon=float(lons[-1]),min_lat=float(lats[0]),max_lat=float(lats[-1]),center_lon=float((lons[0]+lons[-1])/2),center_lat=float((lats[0]+lats[-1])/2),world_position=[0,0,0],world_scale=[1,1,1],height_min=float(grid.min()),height_max=float(grid.max()),vertex_resolution=[nx+1,ny+1],triangles=len(mesh['indices'])//3,surface_triangles=mesh['surface_triangles'],texture_resolution={'color':list(crop.size)},geometric_error_m=error,skirt_depth_m=1000)
                tiles.append(t)
                region,rx,ry=region_for_cell(plan,col,row)
                t['region_name']=region['name']
                t['region_tile_id']=f"{region['name']}_L{lod}_{rx}_{ry}"
        for t in tiles:
            t['neighbors'] = {direction: f'l{lod}_{x}_{y}' for direction, x, y in (
                ('west', t['x']-1, t['y']), ('east', t['x']+1, t['y']),
                ('north', t['x'], t['y']-1), ('south', t['x'], t['y']+1)
            ) if 0 <= x < count_x and 0 <= y < count_y}
        m={**old,'grid':{**old['grid'],'lod':lod},'tiles':sorted(tiles,key=lambda t:(t['y'],t['x'])),'total_glb_bytes':sum(t['file_size_bytes'] for t in tiles),'heightSource':str(path),'heightExaggeration':1,'textureSource':{'path':str(texture_path),'nativeMeters':10,'limitedDetail':False,'date':'2023-09-26'},'spacingMeters':[math.radians(.07/nx)*6371000*math.cos(math.radians(45.85)),math.radians(.05/ny)*6371000]}
        m['grid']['countX']=count_x
        m['grid']['countY']=count_y
        m['bounds']=plan['bounds']
        m['regions']=plan['regions']
        m['heightSources']=height_sources
        m['nativeDem']={'width':count_x*252+1,'height':count_y*180+1,'south':bounds['minLat'],'west':west_bound,'stepDegrees':1/3600}
        if supplement_paths:m['textureSource']['supplements']=[str(path) for path in supplement_paths]
        (folder/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
        records.append({'lod':lod,'tiles':len(tiles),'spacing':m['spacingMeters'],'min':min(t['height_min'] for t in tiles),'max':max(t['height_max'] for t in tiles),'maximumGeometricError':max(t['geometric_error_m'] for t in tiles),'surfaceTriangles':sum(t['surface_triangles'] for t in tiles)})
    # Shared native surface for collision, independent of streamed GPU tile readiness.
    (output_dir/'L2'/'heights.bin').write_bytes(native.astype('<f4').tobytes())
    (output_dir/'dem-build-report.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps(records,indent=2))
    source.close()
    for supplement in supplements:supplement.close()


if __name__=='__main__':
    main()
