"""Local Earth export workflow. Never saves the blend or contacts production."""
bl_info = {
    'name': 'SVET IKONY - EARTH', 'author': 'SVET IKONY',
    'version': (1, 3, 0), 'blender': (5, 2, 0),
    'location': 'View3D > Sidebar > Earth', 'category': 'Import-Export',
}

import json
import os
from pathlib import Path
import subprocess
import tempfile
import webbrowser
from urllib.parse import urlparse

import bpy
from bpy.props import StringProperty, EnumProperty, FloatProperty

_terrain_process = None
_terrain_log = None
_terrain_status = 'Ready'


def terrain_poll():
    global _terrain_process, _terrain_status
    if _terrain_process is None:
        return None
    code = _terrain_process.poll()
    if code is not None:
        _terrain_status = 'Success / PASS' if code == 0 else 'Failed - see log'
        _terrain_process = None
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()
    return 0.5 if _terrain_process is not None else None


class EARTH_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __name__
    project: StringProperty(name='Project', subtype='DIR_PATH', default='/Users/dmitrijfomin/Desktop/svet-ikony')
    node: StringProperty(name='Node.js', subtype='FILE_PATH', default='/opt/homebrew/bin/node')
    preview: StringProperty(name='Local preview', default='http://localhost:3000/pravoslavna-istoriya')
    terrain_python: StringProperty(name='Terrain Python', subtype='FILE_PATH', default='/Users/dmitrijfomin/Desktop/CodexWorkspace/.alps-venv/bin/python')
    terrain_region: EnumProperty(name='Region', items=[('alps', 'Alps', 'Local DEM/Sentinel Alps region')], default='alps')

    def draw(self, context):
        for field in ('project', 'node', 'preview', 'terrain_python'):
            self.layout.prop(self, field)


def settings(context):
    return context.preferences.addons[__name__].preferences


def scene_regions(context):
    root = context.scene.collection.children.get('Terrain_Regions')
    alps = root.children.get('Alps') if root else None
    regions = [{'name': c.name, 'bounds': list(c['terrain_bounds'])}
               for c in alps.children if 'terrain_bounds' in c] if alps else []
    return regions or [{'name': 'MontBlanc', 'bounds': [6.70, 45.75, 6.98, 45.95]}]


def checked_plan(context, regions):
    prefs = settings(context)
    project = Path(bpy.path.abspath(prefs.project)).resolve()
    result = subprocess.run(
        [bpy.path.abspath(prefs.terrain_python), '-B', str(project / 'scripts/terrain/region_plan.py')],
        input=json.dumps({'regions': regions}), capture_output=True, text=True, cwd=project, timeout=10,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip()[-1000:] or 'Invalid terrain region plan')
    return json.loads(result.stdout)


class EARTH_OT_terrain_add(bpy.types.Operator):
    bl_idname = 'earth_local.terrain_add'
    bl_label = 'Add Terrain Region'
    bl_description = 'Add a local Alps region descriptor; Build creates terrain from cached DEM/Sentinel'
    bl_options = {'REGISTER', 'UNDO'}

    region_name: StringProperty(name='Name', default='Alps_New_01', maxlen=48)
    west: FloatProperty(name='West longitude', default=6.42, precision=5, min=-180, max=180)
    east: FloatProperty(name='East longitude', default=6.98, precision=5, min=-180, max=180)
    south: FloatProperty(name='South latitude', default=45.55, precision=5, min=-90, max=90)
    north: FloatProperty(name='North latitude', default=45.75, precision=5, min=-90, max=90)

    @classmethod
    def poll(cls, context):
        return _terrain_process is None

    def invoke(self, context, event):
        regions = scene_regions(context)
        self.west = min(r['bounds'][0] for r in regions)
        self.east = max(r['bounds'][2] for r in regions)
        self.north = min(r['bounds'][1] for r in regions)
        self.south = self.north - .20
        return context.window_manager.invoke_props_dialog(self, width=420)

    def draw(self, context):
        self.layout.prop(self, 'region_name')
        for field in ('west', 'east', 'south', 'north'):
            self.layout.prop(self, field)

    def execute(self, context):
        global _terrain_status
        created = []
        linked = []
        try:
            name = self.region_name.strip()
            if bpy.data.collections.get(name) is not None or name in ('Terrain_Regions', 'Alps'):
                raise ValueError('Collection name already exists or is reserved: ' + name)
            regions = scene_regions(context)
            plan = checked_plan(context, [*regions, {'name': name, 'bounds': [self.west, self.south, self.east, self.north]}])

            def ensure(parent, collection_name):
                collection = bpy.data.collections.get(collection_name)
                if collection is None:
                    collection = bpy.data.collections.new(collection_name)
                    created.append(collection)
                if parent.children.get(collection_name) is None:
                    parent.children.link(collection)
                    linked.append((parent, collection))
                return collection

            root = ensure(context.scene.collection, 'Terrain_Regions')
            alps = ensure(root, 'Alps')
            # Retain the implicit original region when starting from an older scene.
            for region in plan['regions']:
                collection = ensure(alps, region['name'])
                if 'terrain_bounds' not in collection:
                    collection['terrain_bounds'] = region['bounds']
                    collection['terrain_region'] = 'alps'
            _terrain_status = 'Region added - build pending'
            self.report({'INFO'}, f"Added {name}; {plan['countX']} x {plan['countY']} tiles per LOD. Build pending.")
            return {'FINISHED'}
        except Exception as error:
            for parent, collection in reversed(linked):
                parent.children.unlink(collection)
            for collection in reversed(created):
                bpy.data.collections.remove(collection)
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


def output_path(context):
    return Path(bpy.path.abspath(settings(context).project)) / 'tools/earth/export/earth.glb'


def validate(context, file):
    prefs = settings(context)
    project = Path(bpy.path.abspath(prefs.project))
    result = subprocess.run(
        [bpy.path.abspath(prefs.node), str(project / 'scripts/earth/publish.mjs'),
         '--dry-run', '--json', '--file', str(file)],
        cwd=project, capture_output=True, text=True, timeout=60,
    )
    try:
        report = json.loads(result.stdout)
    except ValueError:
        raise RuntimeError(result.stderr[-500:] or 'Invalid validator response')
    if result.returncode or not report.get('ok'):
        raise RuntimeError(report.get('error', 'Validation failed'))
    return report


class EARTH_OT_export(bpy.types.Operator):
    bl_idname = 'earth_local.export'
    bl_label = 'Export Earth'
    bl_description = 'Export Earth hierarchy, validate and atomically replace local preview GLB'

    def execute(self, context):
        selected = list(context.selected_objects)
        active = context.view_layer.objects.active
        temporary = None
        try:
            if context.mode != 'OBJECT':
                raise RuntimeError('Switch to Object Mode before export')
            earth = context.scene.objects.get('Earth')
            if earth is None:
                raise RuntimeError('Scene needs an Earth object with orientation metadata')
            objects = [earth, *earth.children_recursive]
            if any(o.name not in context.view_layer.objects or o.hide_get() or o.hide_select for o in objects):
                raise RuntimeError('Earth hierarchy must be visible and selectable in this view layer')
            target = output_path(context)
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(suffix='.glb', dir=target.parent)
            os.close(fd)
            temporary = Path(name)
            for ob in selected:
                ob.select_set(False)
            for ob in objects:
                ob.select_set(True)
            context.view_layer.objects.active = earth
            result = bpy.ops.export_scene.gltf(
                filepath=str(temporary), export_format='GLB', use_selection=True, export_extras=True,
                export_animations=False, export_yup=True,
                export_draco_mesh_compression_enable=False,
            )
            if 'FINISHED' not in result:
                raise RuntimeError('Export cancelled')
            validate(context, temporary)
            os.replace(temporary, target)
            self.report({'INFO'}, 'Earth exported and validated locally')
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            for ob in context.selected_objects:
                ob.select_set(False)
            for ob in selected:
                ob.select_set(True)
            context.view_layer.objects.active = active


class EARTH_OT_validate(bpy.types.Operator):
    bl_idname = 'earth_local.validate'
    bl_label = 'Validate Earth'
    bl_description = 'Run existing GLB validator locally, without network calls'

    def execute(self, context):
        try:
            report = validate(context, output_path(context))
            self.report({'INFO'}, 'PASS: %s bytes, SHA256 %s' % (report['size'], report['sha256'][:12]))
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


class EARTH_OT_preview(bpy.types.Operator):
    bl_idname = 'earth_local.preview'
    bl_label = 'Preview Earth'
    bl_description = 'Open local site; run npm run earth:preview in the project first'

    def execute(self, context):
        try:
            url = settings(context).preview
            parsed = urlparse(url)
            if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1') or parsed.username or parsed.password:
                raise RuntimeError('Preview must use an HTTP localhost URL')
            validate(context, output_path(context))
            if not webbrowser.open(url):
                raise RuntimeError('Could not open browser')
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


class EARTH_OT_publish(bpy.types.Operator):
    bl_idname = 'earth_local.publish'
    bl_label = 'Publish Earth'
    bl_description = 'Unavailable in LOCAL ONLY mode; no production writes are permitted'

    @classmethod
    def poll(cls, context):
        cls.poll_message_set('LOCAL ONLY: production publishing is disabled')
        return False

    def execute(self, context):
        return {'CANCELLED'}


class TerrainTask:
    @classmethod
    def poll(cls, context):
        return _terrain_process is None

    def execute(self, context):
        global _terrain_process, _terrain_log, _terrain_status
        try:
            prefs = settings(context)
            project = Path(bpy.path.abspath(prefs.project)).resolve()
            python = Path(bpy.path.abspath(prefs.terrain_python))
            script = project / 'scripts/terrain/local_region.py'
            if not python.is_file() or not script.is_file():
                raise RuntimeError('Check Terrain Python and Project paths in addon Preferences')
            output = project / 'tools/terrain/alps/build'
            output.mkdir(parents=True, exist_ok=True)
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONUNBUFFERED='1')
            command = [str(python), '-B', str(script), self.action, '--region', prefs.terrain_region]
            if self.action == 'build':
                regions=checked_plan(context, scene_regions(context))['regions']
                request=output/'region-request.json'
                request.write_text(json.dumps({'regions':regions},indent=2))
                command.extend(['--request',str(request)])
            if self.action == 'preview':
                command.extend(['--url', prefs.preview, '--npm', str(Path(bpy.path.abspath(prefs.node)).parent / 'npm')])
            fd, path = tempfile.mkstemp(prefix=self.action + '-', suffix='.log', dir=output)
            _terrain_log = path
            with os.fdopen(fd, 'w') as log:
                _terrain_process = subprocess.Popen(command, cwd=project, env=env, stdout=log, stderr=subprocess.STDOUT)
            _terrain_status = self.bl_label + '...'
            bpy.app.timers.register(terrain_poll, first_interval=0.5)
            self.report({'INFO'}, 'Terrain task started; log: ' + path)
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}


class EARTH_OT_terrain_build(TerrainTask, bpy.types.Operator):
    bl_idname = 'earth_local.terrain_build'
    bl_label = 'Build Terrain Region'
    bl_description = 'Rebuild local Alps L0/L1/L2 using project scripts; no uploads'
    action = 'build'


class EARTH_OT_terrain_validate(TerrainTask, bpy.types.Operator):
    bl_idname = 'earth_local.terrain_validate'
    bl_label = 'Validate Terrain'
    bl_description = 'Check manifests, vertices, textures, bounds, neighbors and seams'
    action = 'validate'


class EARTH_OT_terrain_preview(TerrainTask, bpy.types.Operator):
    bl_idname = 'earth_local.terrain_preview'
    bl_label = 'Preview Terrain'
    bl_description = 'Ensure local preview server is ready and open Alps'
    action = 'preview'


class EARTH_OT_terrain_log(bpy.types.Operator):
    bl_idname = 'earth_local.terrain_log'
    bl_label = 'Open Terrain Log'

    @classmethod
    def poll(cls, context):
        return bool(_terrain_log)

    def execute(self, context):
        webbrowser.open(Path(_terrain_log).as_uri())
        return {'FINISHED'}


class EARTH_PT_terrain(bpy.types.Panel):
    bl_label = 'TERRAIN REGIONS'
    bl_idname = 'EARTH_PT_terrain_regions'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Earth'

    def draw(self, context):
        self.layout.prop(settings(context), 'terrain_region')
        self.layout.operator('earth_local.terrain_add', icon='ADD')
        for region in scene_regions(context):
            self.layout.label(text=region['name'])
            w,s,e,n = region['bounds']
            self.layout.label(text=f'{w:.2f}..{e:.2f} / {s:.2f}..{n:.2f}')
        for name in ('build', 'validate', 'preview'):
            self.layout.operator('earth_local.terrain_' + name)
        self.layout.label(text=_terrain_status)
        self.layout.operator('earth_local.terrain_log')


class EARTH_PT_panel(bpy.types.Panel):
    bl_label = 'SVET IKONY - EARTH'
    bl_idname = 'EARTH_PT_local_publish'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Earth'

    def draw(self, context):
        layout = self.layout
        prefs = settings(context)
        layout.label(text='LOCAL ONLY')
        layout.prop(prefs, 'project')
        layout.prop(prefs, 'preview')
        for operator in ('export', 'validate', 'preview', 'publish'):
            layout.operator('earth_local.' + operator)


CLASSES = (EARTH_AddonPreferences, EARTH_OT_export, EARTH_OT_validate,
           EARTH_OT_preview, EARTH_OT_publish, EARTH_PT_panel,
           EARTH_OT_terrain_build, EARTH_OT_terrain_validate, EARTH_OT_terrain_preview,
           EARTH_OT_terrain_log, EARTH_OT_terrain_add, EARTH_PT_terrain)


def register():
    registered = []
    try:
        for cls in CLASSES:
            bpy.utils.register_class(cls)
            registered.append(cls)
    except Exception:
        for cls in reversed(registered):
            bpy.utils.unregister_class(cls)
        raise


def unregister():
    global _terrain_process
    if _terrain_process is not None:
        raise RuntimeError('Wait for the terrain task to finish before disabling this addon')
    if bpy.app.timers.is_registered(terrain_poll):
        bpy.app.timers.unregister(terrain_poll)
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
