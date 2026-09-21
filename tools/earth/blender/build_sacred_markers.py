"""Run in the audited sacred-markers scene. Reuses its authored base and twist.

Creates a separate scene and exports selected meshes only. Original scene stays intact.
"""
import bpy
import math
import json
import shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/dmitrijfomin/Desktop/svet-ikony')
OUT = ROOT / 'tools/earth/export/sacred-markers'
PREVIEW = ROOT / 'tools/earth/blender/previews/sacred-20260921'
for directory in (OUT, PREVIEW, ROOT / 'public/markers/sacred'):
    directory.mkdir(parents=True, exist_ok=True)
SOURCE = {part: bpy.data.objects['Marker_King_' + part] for part in ('Base', 'Rings', 'Body', 'Collar', 'Crown')}
assert not bpy.data.collections.get('Sacred_Markers'), 'Already built; inspect before rebuilding'
scene = bpy.data.scenes.new('Sacred Markers Studio')
bpy.context.window.scene = scene
collection = bpy.data.collections.new('Sacred_Markers')
scene.collection.children.link(collection)
lod_collection = bpy.data.collections.new('Sacred_Marker_LODs')
scene.collection.children.link(lod_collection)
studio = bpy.data.collections.new('Sacred_Preview')
scene.collection.children.link(studio)
ivory = bpy.data.materials['Marble_White'].copy()
ivory.name = 'MI_Sacred_Ivory'
bsdf = next(n for n in ivory.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Roughness'].default_value = .38
bsdf.inputs['Metallic'].default_value = .03
bsdf.inputs['Specular IOR Level'].default_value = .32
texture = next(n for n in ivory.node_tree.nodes if n.type == 'TEX_IMAGE')
texture.image.pack()
selected = ivory.copy()
selected.name = 'MI_Sacred_Selected'
selected.use_fake_user = True
s = next(n for n in selected.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
s.inputs['Emission Color'].default_value = (.22, .14, .035, 1)
s.inputs['Emission Strength'].default_value = .10
gold = bpy.data.materials.new('MI_Sacred_Accent')
gold.use_nodes = True
g = next(n for n in gold.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
g.inputs['Base Color'].default_value = (.63, .40, .13, 1)
g.inputs['Metallic'].default_value = .65
g.inputs['Roughness'].default_value = .34

def own(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(ivory)
    return obj

def reuse(part, scale_z=1):
    obj = SOURCE[part].copy()
    obj.data = obj.data.copy()
    own(obj)
    for vertex in obj.data.vertices:
        vertex.co.z *= scale_z
    return obj

def lathe(profile, sides=16):
    vertices = [(r*math.cos(i*2*math.pi/sides), r*math.sin(i*2*math.pi/sides), z) for r,z in profile for i in range(sides)]
    faces = [tuple(reversed(range(sides)))]
    for j in range(len(profile)-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range((len(profile)-1)*sides,len(profile)*sides)))
    mesh=bpy.data.meshes.new('Sacred turned detail');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('Detail',mesh);own(obj)
    return obj

def sphere(radius,z):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=radius,location=(0,0,z))
    obj=own(bpy.context.object)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def box(location,dimensions,angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    obj=own(bpy.context.object);obj.scale=dimensions;obj.rotation_euler.y=angle
    return obj

def cross(z):
    return [box((0,0,z),(.033,.045,.22)),box((0,0,z+.018),(.145,.045,.030)),box((0,0,z+.075),(.09,.045,.025)),box((0,0,z-.060),(.09,.045,.024),.30)]

def horse():
    # Broad cheeks, muzzle, arched mane and two ears; no tiny mane strands.
    profile=[(-.13,.57),(.15,.57),(.19,.78),(.16,1.03),(.065,1.20),(-.02,1.27),(-.04,1.14),(-.12,1.12),(-.27,.93),(-.25,.855),(-.17,.88),(-.08,1.00),(-.045,.94),(-.10,.77)]
    vertices=[(x,y,z) for y in (-.068,.068) for x,z in profile]
    n=len(profile);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('Knight silhouette');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('Knight head',mesh);own(obj)
    return obj

ratios={'Saint':1.,'Church':1.05,'Icon':1.05,'Knight':1.10,'Monastery':1.15,'Major':1.25}
models=[]
for name,height in ratios.items():
    parts=[reuse('Base'),reuse('Rings'),reuse('Body',.74 if name=='Knight' else 1),reuse('Collar',.74 if name=='Knight' else 1)]
    if name=='Saint':
        parts += [lathe([(.085,.80),(.085,.845),(.058,.86)]),sphere(.105,.947)]
    elif name=='Church':
        parts += [reuse('Crown')]
    elif name=='Icon':
        parts += [lathe([(.065,.80),(.065,.85)]),lathe([(.01,.85),(.125,1.005),(.001,1.17)],sides=4)]
    elif name=='Knight':
        parts += [horse()]
    elif name=='Monastery':
        parts += [lathe([(.055,.80),(.055,.94)])]
        bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,major_radius=.135,minor_radius=.019,location=(0,0,1.025),rotation=(math.pi/2,0,0))
        parts += [own(bpy.context.object),box((0,0,1.02),(.025,.035,.23)),box((0,0,1.02),(.30,.035,.025))]+cross(1.24)
    else:
        parts += [reuse('Crown'),lathe([(.095,.94),(.11,1.02),(.105,1.13),(.07,1.15),(.07,1.19)]),sphere(.06,1.25)]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.join()
    obj=bpy.context.object;obj.name='Marker_'+name
    maxz=max(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices:v.co.z*=height/maxz
    obj.location=(0,0,0);obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
    # UVs must survive glTF; procedural shader nodes are deliberately avoided.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    models.append(obj)

report=[]
for obj in models:
    for level in range(3):
        lod=obj.copy();lod.data=obj.data.copy();lod_collection.objects.link(lod);lod.name=obj.name+'_LOD'+str(level)
        bpy.ops.object.select_all(action='DESELECT');lod.select_set(True);bpy.context.view_layer.objects.active=lod
        if level<2:
            bevel=lod.modifiers.new('Small edge bevel','BEVEL');bevel.width=.0025;bevel.segments=2 if level==0 else 1;bevel.limit_method='ANGLE'
            bpy.ops.object.modifier_apply(modifier=bevel.name)
        else:
            dec=lod.modifiers.new('Silhouette preserving reduction','DECIMATE');dec.ratio=.62
            bpy.ops.object.modifier_apply(modifier=dec.name)
        lod.data.calc_loop_triangles()
        file=OUT/(obj.name.replace('Marker_','marker-').lower()+'-lod'+str(level)+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=85,export_yup=True)
        if level==1:
            default=OUT/(obj.name.replace('Marker_','marker-').lower()+'.glb')
            shutil.copy2(file,default);shutil.copy2(default,ROOT/'public/markers/sacred'/default.name)
        coords=[v.co for v in lod.data.vertices]
        report.append({'name':lod.name,'triangles':len(lod.data.loop_triangles),'bytes':file.stat().st_size,'zMin':min(v.z for v in coords),'zMax':max(v.z for v in coords),'location':list(lod.location),'rotation':list(lod.rotation_euler),'scale':list(lod.scale)})
        lod.hide_render=True;lod.hide_set(True)
    obj.hide_render=True;obj.hide_set(True)
    # Linked preview copies preserve export masters at zero transforms.
    preview=obj.copy();preview.data=bpy.data.objects[obj.name+'_LOD0'].data;studio.objects.link(preview)
    preview.name='Preview_'+obj.name;preview.hide_render=False;preview.hide_set(False);preview.location.x=(models.index(obj)-2.5)*.66

world=bpy.data.worlds.new('Sacred studio world');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.10,.12,.16,1);bg.inputs[1].default_value=.35;scene.world=world
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-3,-4,5),650,4),('Fill',(3,-2,3),400,3),('Rim',(0,3,4),750,3)]:
    data=bpy.data.lights.new('Sacred_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    light=bpy.data.objects.new('Sacred_'+name,data);studio.objects.link(light);light.location=loc;aim(light,(0,0,.5))
camdata=bpy.data.cameras.new('Sacred camera');cam=bpy.data.objects.new('Sacred camera',camdata);studio.objects.link(cam);cam.location=(2.5,-9,3.1);aim(cam,(0,0,.55));camdata.type='ORTHO';camdata.ortho_scale=4.7;scene.camera=cam
scene.render.resolution_x=1800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.render.filepath=str(PREVIEW/'lineup.png')
scene.view_settings.view_transform='AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else scene.view_settings.view_transform
(OUT/'audit.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/earth/blender/sacred-markers-set.blend'))
print(json.dumps(report))
