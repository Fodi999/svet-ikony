"""Offline regression checks against a disposable copy of the local bundle."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
BUILD = HERE.parents[1] / 'tools/terrain/alps/build'


class TerrainValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for lod in range(3):
            shutil.copytree(BUILD / f'L{lod}', self.root / f'L{lod}')
        self.manifest_file = self.root / 'L0/manifest.json'
        self.manifest = json.loads(self.manifest_file.read_text())

    def check_invalid(self):
        self.manifest_file.write_text(json.dumps(self.manifest))
        result = subprocess.run([sys.executable, '-B', str(HERE / 'verify_alps_dem.py')],
                                env=dict(os.environ, ALPS_VERIFY_ROOT=str(self.root)),
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)

    def mutate_glb(self, mutate):
        tile = self.manifest['tiles'][0]
        path = self.root / 'L0' / tile['file']
        data = bytearray(path.read_bytes())
        length = struct.unpack_from('<I', data, 12)[0]
        gltf = json.loads(data[20:20+length])
        mutate(data, gltf, 28+length)
        path.write_bytes(data)
        tile['sha256'] = hashlib.sha256(data).hexdigest()

    def test_nan_vertex_rejected_even_with_valid_hash(self):
        def mutate(data, gltf, offset):
            view = gltf['bufferViews'][gltf['accessors'][0]['bufferView']]
            struct.pack_into('<f', data, offset+view.get('byteOffset', 0), float('nan'))
        self.mutate_glb(mutate)
        self.check_invalid()

    def test_corrupt_texture_rejected_even_with_valid_hash(self):
        def mutate(data, gltf, offset):
            view = gltf['bufferViews'][gltf['images'][0]['bufferView']]
            start = offset+view.get('byteOffset', 0)
            data[start:start+view['byteLength']] = bytes(view['byteLength'])
        self.mutate_glb(mutate)
        self.check_invalid()

    def test_neighbor_rejected(self):
        self.manifest['tiles'][0]['neighbors']['east'] = 'l0_3_3'
        self.check_invalid()

    def test_bbox_rejected(self):
        self.manifest['tiles'][0]['min_lon'] = 0
        self.check_invalid()

    def test_missing_lod_rejected(self):
        (self.root / 'L2/manifest.json').unlink()
        self.check_invalid()

    def test_duplicate_tile_rejected(self):
        self.manifest['tiles'][1] = self.manifest['tiles'][0]
        self.check_invalid()

    def test_remote_preview_rejected_without_browser(self):
        spec = importlib.util.spec_from_file_location('local_region', HERE / 'local_region.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module.webbrowser, 'open') as browser:
            with self.assertRaises(RuntimeError):
                module.preview('https://example.com', '/opt/homebrew/bin/npm')
            browser.assert_not_called()


if __name__ == '__main__':
    unittest.main()
