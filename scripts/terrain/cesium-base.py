"""Offline geographic NASA imagery pyramid; never downloads or uploads."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path.home() / 'My project/Earth_Blender/textures/world.topo.200409.3x21600x10800.jpg'
OUT = ROOT / 'tools/terrain/cesium/build'

def main():
    Image.MAX_IMAGE_PIXELS = 250_000_000
    image = Image.open(SOURCE).convert('RGB')
    OUT.mkdir(parents=True, exist_ok=True)
    for level in range(5):
        nx, ny = 2 << level, 1 << level
        resized = image.resize((nx*256,ny*256),Image.Resampling.LANCZOS)
        for x in range(nx):
            folder = OUT/'nasa'/str(level)/str(x)
            folder.mkdir(parents=True,exist_ok=True)
            for y in range(ny):
                resized.crop((x*256,y*256,(x+1)*256,(y+1)*256)).save(folder/f'{y}.jpg',quality=88)
    (OUT/'nasa-source.json').write_text(json.dumps({'source':str(SOURCE),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
      'credit':'NASA Earth Observatory','scheme':'GeographicTilingScheme XYZ','maximumLevel':4,'tileSize':256},indent=2))
    print('NASA local pyramid ready: levels 0..4, 682 tiles')

if __name__ == '__main__':
    main()
