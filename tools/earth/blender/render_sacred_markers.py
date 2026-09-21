"""Background-only preview renderer. Does not modify the saved asset library."""
import bpy
from pathlib import Path
from mathutils import Vector

out=Path('/Users/dmitrijfomin/Desktop/svet-ikony/tools/earth/blender/previews/sacred-20260921')
scene=bpy.data.scenes['Sacred Markers Studio']
bpy.context.window.scene=scene
previews=[o for o in scene.objects if o.name.startswith('Preview_Marker_')]
cam=scene.camera
def aim(target):cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
def render(name):
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
cam.location=(0,-8,2.7);aim((0,0,.55));cam.data.ortho_scale=4.4
scene.render.resolution_x=1800;scene.render.resolution_y=800
render('lineup')
for obj in previews:
    for other in previews:other.hide_render=other!=obj
    cam.location=(obj.location.x+1.7,-4,1.9);aim((obj.location.x,0,.6));cam.data.ortho_scale=1.55
    scene.render.resolution_x=700;scene.render.resolution_y=900
    render(obj.name.replace('Preview_Marker_','').lower()+'-close')
for obj in previews:
    obj.hide_render=False
    wire=obj.modifiers.new('Topology preview','WIREFRAME');wire.thickness=.0007;wire.use_replace=True
cam.location=(0,-8,2.7);aim((0,0,.55));cam.data.ortho_scale=4.4
scene.render.resolution_x=1800;scene.render.resolution_y=800
render('wireframe')
