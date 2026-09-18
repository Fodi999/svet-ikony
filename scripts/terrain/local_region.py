"""Local-only orchestration; terrain generation lives in generate_alps_dem.py."""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse
import webbrowser
from region_plan import DEFAULT, validate_plan

PROJECT = Path(__file__).resolve().parents[2]
BUILD = PROJECT / 'tools/terrain/alps/build'


def verify(root):
    env = dict(os.environ, ALPS_VERIFY_ROOT=str(root), PYTHONDONTWRITEBYTECODE='1')
    subprocess.run([sys.executable, '-B', str(PROJECT / 'scripts/terrain/verify_alps_dem.py')],
                   cwd=PROJECT, env=env, check=True)


def build(request=None):
    if request is None and (BUILD/'region-request.json').is_file():request=BUILD/'region-request.json'
    plan=json.loads(Path(request).read_text()) if request else DEFAULT
    validate_plan(plan)
    dem = Path.home() / 'My project/Earth_Blender/dem/alps/Copernicus_DSM_COG_10_N45_00_E006_00_DEM.tif'
    previous = BUILD / 'L2/manifest.json'
    texture = os.environ.get('ALPS_TCI_PATH')
    if not texture and previous.is_file():
        texture = json.loads(previous.read_text()).get('textureSource', {}).get('path')
    texture = Path(texture or Path.home() / 'My project/Earth_Blender/satellite/alps/TCI.tif')
    for file in (dem, texture, BUILD / 'manifest.json'):
        if not file.is_file():
            raise RuntimeError(f'Missing LOCAL input: {file}. No downloads will be attempted.')
    os.environ['ALPS_TCI_PATH'] = str(texture.resolve())
    spec = importlib.util.spec_from_file_location('alps_generator', PROJECT / 'scripts/terrain/generate_alps_dem.py')
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    # Failed builds never replace the previous usable bundle.
    with tempfile.TemporaryDirectory(prefix='.staging-', dir=BUILD) as directory:
        staging = Path(directory)
        generator.main(staging,plan)
        verify(staging)
        names = ['L0', 'L1', 'L2', 'dem-build-report.json']
        backup = staging / 'previous'
        backup.mkdir()
        moved, installed = [], []
        try:
            for name in names:
                target = BUILD / name
                if target.exists():
                    target.rename(backup / name)
                    moved.append(name)
                (staging / name).rename(target)
                installed.append(name)
        except Exception:
            for name in installed:
                target = BUILD / name
                shutil.rmtree(target) if target.is_dir() else target.unlink()
            for name in moved:
                (backup / name).rename(BUILD / name)
            raise


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Local preview must not redirect')


def preview(url, npm):
    parsed = urlparse(url)
    if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1') or parsed.username or parsed.password:
        raise RuntimeError('Only HTTP localhost preview is allowed')
    origin = f'http://{parsed.netloc}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def ready():
        try:
            with opener.open(origin + '/api/dev/terrain-preview', timeout=3) as response:
                status = json.load(response)
            if not status.get('localEarthPreview'):
                raise RuntimeError('Existing server is not in EARTH_ASSET_MODE=local; it was not stopped')
            if not status.get('alpsReady'):
                raise RuntimeError('Build Terrain Region before preview')
            return True
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Existing server is not a terrain preview server: HTTP {error.code}') from error
        except (urllib.error.URLError, TimeoutError):
            return False

    if not ready():
        env = dict(os.environ, EARTH_ASSET_MODE='local')
        env['PATH'] = str(Path(npm).absolute().parent) + os.pathsep + env.get('PATH', '')
        with (BUILD / 'preview-server.log').open('a') as log:
            server = subprocess.Popen([npm, 'run', 'earth:preview', '--', '--hostname', parsed.hostname,
                                       '--port', str(parsed.port or 80)], cwd=PROJECT, env=env,
                                      stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(90):
            if server.poll() is not None:
                raise RuntimeError('Preview server exited; see preview-server.log. Existing servers were not stopped.')
            if ready():
                break
            time.sleep(1)
        else:
            raise RuntimeError('Preview startup timed out; see preview-server.log')
    target = origin + '/uk/pravoslavna-istoriya?terrainRegion=alps'
    if not webbrowser.open(target):
        raise RuntimeError('Browser could not be opened: ' + target)
    print(json.dumps({'ok': True, 'url': target}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['build', 'validate', 'preview'])
    parser.add_argument('--region', choices=['alps'], default='alps')
    parser.add_argument('--url', default='http://localhost:3000')
    parser.add_argument('--npm', default='/opt/homebrew/bin/npm')
    parser.add_argument('--request', type=Path)
    args = parser.parse_args()
    BUILD.mkdir(parents=True, exist_ok=True)
    with (BUILD / '.local-region.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another terrain task is already running')
        if args.action == 'build':
            build(args.request)
        elif args.action == 'validate':
            verify(BUILD)
        else:
            preview(args.url, args.npm)
    print(json.dumps({'ok': True, 'action': args.action, 'region': args.region}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'ERROR: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
