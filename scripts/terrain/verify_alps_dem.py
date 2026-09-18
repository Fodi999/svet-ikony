"""Offline GLB integrity, surface elevation and tile-edge audit."""
import hashlib
import json
import struct
import os
import io
from pathlib import Path
import numpy as np
from PIL import Image
from region_plan import DEFAULT, validate_plan, region_for_cell

root=Path(os.environ.get('ALPS_VERIFY_ROOT', Path(__file__).resolve().parents[2]/'tools/terrain/alps/build'))
levels=[]
for lod in range(3):
    manifest=json.loads((root/f'L{lod}/manifest.json').read_text())
    plan=validate_plan({'regions':manifest.get('regions',DEFAULT['regions'])})
    count_x,count_y=plan['countX'],plan['countY'];west=plan['bounds']['minLon'];north=plan['bounds']['maxLat']
    assert manifest['region']=='alps' and manifest['grid']['lod']==lod
    assert manifest['grid']['countX']==count_x and manifest['grid']['countY']==count_y
    assert len(manifest['tiles'])==count_x*count_y
    assert manifest['bounds']==plan['bounds']
    assert manifest['total_glb_bytes']==sum(t['file_size_bytes'] for t in manifest['tiles'])
    assert {(t['x'],t['y']) for t in manifest['tiles']}=={(x,y) for x in range(count_x) for y in range(count_y)}
    assert manifest['nativeDem']=={'width':count_x*252+1,'height':count_y*180+1,'south':plan['bounds']['minLat'],'west':west,'stepDegrees':1/3600}
    tiles={};textures={}
    for tile in manifest['tiles']:
        x,y=tile['x'],tile['y']
        region,rx,ry=region_for_cell(plan,x,count_y-1-y)
        assert tile['region_name']==region['name']
        assert tile['region_tile_id']==f"{region['name']}_L{lod}_{rx}_{ry}"
        assert tile['lod']==lod and tile['tile_id']==f'l{lod}_{x}_{y}'
        assert tile['skirt_depth_m']==1000
        assert tile['vertex_resolution']==[[17,16],[64,61],[253,181]][lod]
        assert tile['file']==f'{x}_{y}.glb'
        assert np.allclose([tile['min_lon'],tile['max_lon'],tile['min_lat'],tile['max_lat']],
                           [west+x*.07,west+(x+1)*.07,north-(y+1)*.05,north-y*.05],rtol=0,atol=1e-9)
        expected={direction:f'l{lod}_{xx}_{yy}' for direction,xx,yy in (
            ('west',x-1,y),('east',x+1,y),('north',x,y-1),('south',x,y+1)) if 0<=xx<count_x and 0<=yy<count_y}
        assert tile.get('neighbors')==expected, f"Invalid neighbors: {tile['tile_id']}"
        data=(root/f'L{lod}'/tile['file']).read_bytes()
        assert struct.unpack_from('<III',data)==(0x46546c67,2,len(data))
        assert hashlib.sha256(data).hexdigest()==tile['sha256']
        assert len(data)==tile['file_size_bytes']
        size=struct.unpack_from('<I',data,12)[0]
        gltf=json.loads(data[20:20+size])
        assert gltf['asset']['version']=='2.0'
        assert struct.unpack_from('<I',data,16)[0]==0x4e4f534a
        assert struct.unpack_from('<II',data,20+size)==(len(data)-28-size,0x004e4942)
        assert all('uri' not in b for b in gltf['buffers'])
        for a in gltf['accessors']:
            v=gltf['bufferViews'][a['bufferView']]
            dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
            count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
            offset=v.get('byteOffset',0)+a.get('byteOffset',0)
            assert offset+count*np.dtype(dtype).itemsize<=v.get('byteOffset',0)+v['byteLength']
            values=np.frombuffer(data,dtype=dtype,count=count,offset=28+size+offset)
            assert np.isfinite(values).all(), f"Invalid vertices: {tile['tile_id']}"
        assert gltf.get('images'), 'Missing texture'
        for img in gltf['images']:
            assert 'uri' not in img, 'Terrain textures must be embedded'
            v=gltf['bufferViews'][img['bufferView']]; offset=28+size+v.get('byteOffset',0)
            with Image.open(io.BytesIO(data[offset:offset+v['byteLength']])) as texture:
                assert list(texture.size)==tile['texture_resolution']['color']
                texture.load()
                textures[x,y]=np.asarray(texture).astype(int)
        for mesh in gltf['meshes']:
            for primitive in mesh['primitives']:
                a=gltf['accessors'][primitive['indices']];v=gltf['bufferViews'][a['bufferView']]
                indices=np.frombuffer(data,dtype={5123:'<u2',5125:'<u4'}[a['componentType']],count=a['count'],offset=28+size+v.get('byteOffset',0)+a.get('byteOffset',0))
                assert indices.max()<gltf['accessors'][primitive['attributes']['POSITION']]['count']
        accessor=gltf['accessors'][0];view=gltf['bufferViews'][accessor['bufferView']]
        p=np.frombuffer(data,dtype='<f4',count=accessor['count']*3,offset=28+size+view.get('byteOffset',0)).reshape(-1,3)
        nx,ny=tile['vertex_resolution'];surface=p[:nx*ny].astype(float)
        angles=np.hypot(surface[:,0],surface[:,2])/63.71
        height=(surface[:,1]-63.71*(np.cos(angles)-1))*100000
        assert abs(height.max()-tile['height_max'])<0.01
        assert abs(height.min()-tile['height_min'])<0.01
        tiles[tile['x'],tile['y']]=(surface.reshape(ny,nx,3),height.reshape(ny,nx))
    gap=0
    for (x,y),(p,h) in tiles.items():
        if (x+1,y) in tiles:gap=max(gap,float(np.max(np.linalg.norm(p[:,-1]-tiles[x+1,y][0][:,0],axis=1)))*100000)
        if (x,y+1) in tiles:gap=max(gap,float(np.max(np.linalg.norm(p[0]-tiles[x,y+1][0][-1],axis=1)))*100000)
    assert gap<0.01
    color_gap=0
    for (x,y),pixels in textures.items():
        region=region_for_cell(plan,x,count_y-1-y)[0]['name']
        if (x+1,y) in textures and region_for_cell(plan,x+1,count_y-1-y)[0]['name']!=region:
            color_gap=max(color_gap,int(np.max(abs(pixels[:,-1]-textures[x+1,y][:,0]))))
        if (x,y+1) in textures and region_for_cell(plan,x,count_y-2-y)[0]['name']!=region:
            color_gap=max(color_gap,int(np.max(abs(pixels[-1]-textures[x,y+1][0]))))
    assert color_gap<=3, f'Satellite discontinuity at region edge: {color_gap}'
    levels.append(tiles)
    print(json.dumps({'lod':lod,'tiles':len(tiles),'maximumSameLodEdgeGapMeters':gap,'maximumTextureEdgeDifference8bit':color_gap}))
for low,high in [(0,1),(1,2),(0,2)]:
    worst=0
    for key,(_,a) in levels[low].items():
        b=levels[high][key][1]
        for ca,cb in [(a[0],b[0]),(a[-1],b[-1]),(a[:,0],b[:,0]),(a[:,-1],b[:,-1])]:
            delta=np.max(abs(np.interp(np.linspace(0,1,len(cb)),np.linspace(0,1,len(ca)),ca)-cb))
            worst=max(worst,float(delta))
    assert worst<1000
    print(json.dumps({'transition':[low,high],'maximumBoundaryHeightDifferenceMeters':worst,'skirtDepthMeters':1000}))
heights=np.fromfile(root/'L2/heights.bin',dtype='<f4')
assert heights.size==(count_y*180+1)*(count_x*252+1) and np.isfinite(heights).all()
print(json.dumps({'ok':True,'lods':[0,1,2],'tiles':count_x*count_y*3,'bounds':plan['bounds'],'textures':'embedded and decoded','neighbors':'verified'}))
