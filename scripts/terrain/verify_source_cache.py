"""Single source of truth for locally cached Copernicus DEM / Sentinel-2 source tiles.

Usage:
  python3 scripts/terrain/verify_source_cache.py            # verify + update checksums.json
  python3 scripts/terrain/verify_source_cache.py --check    # verify only, exit 1 on any mismatch

Every terrain-build script should call `lookup()` before attempting any network
download: it hashes what is already on disk and only reports a tile MISSING when
no valid, checksum-matching local copy exists anywhere in the known source roots.
This never re-downloads a tile that is already cached correctly, and it catches
truncated/corrupted downloads that a plain `Path.is_file()` check would miss.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
BUILD = PROJECT / 'tools/terrain/alps/build'
SOURCE_CACHE = BUILD / 'source-cache'


def _resolve_project_sibling(relative: str) -> Path:
    # Direct execution on the machine that owns "My project" (no device bridge).
    direct = Path.home() / relative
    if direct.is_dir():
        return direct
    # Executed through a bridged mount where PROJECT sits beside "My project"
    # as siblings under the same connected-folders root (…/mnt/svet-ikony,
    # …/mnt/My project) instead of under the real $HOME.
    sibling = PROJECT.parent / relative
    return sibling


DEM_ROOT = _resolve_project_sibling('My project/Earth_Blender/dem/alps')
SATELLITE_ROOT = _resolve_project_sibling('My project/Earth_Blender/satellite/alps')
CHECKSUMS = SOURCE_CACHE / 'checksums.json'
ROOTS = [DEM_ROOT, SOURCE_CACHE, SATELLITE_ROOT]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def is_valid_tiff(path: Path) -> bool:
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
        return magic in (b'II*\x00', b'MM\x00*')
    except OSError:
        return False


def scan():
    """Return {relative_key: {path, sha256, size, valid}} for every *.tif under the known roots."""
    found = {}
    for root in ROOTS:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob('*.tif')):
            key = str(path.relative_to(PROJECT)) if PROJECT in path.parents else str(path)
            found[key] = {
                'path': str(path),
                'size': path.stat().st_size,
                'valid_tiff': is_valid_tiff(path),
                'sha256': sha256_of(path),
            }
    return found


def lookup(name_substring: str):
    """Return the first cached, checksum-valid tile whose path contains name_substring, else None.
    Call this before any download: skip the network entirely when this returns a hit."""
    current = scan()
    for key, meta in current.items():
        if name_substring in key and meta['valid_tiff']:
            return meta
    return None


def main():
    check_only = '--check' in sys.argv
    current = scan()
    previous = {}
    if CHECKSUMS.is_file():
        previous = json.loads(CHECKSUMS.read_text())

    mismatches, new, ok = [], [], []
    for key, meta in current.items():
        prior = previous.get(key)
        if not meta['valid_tiff']:
            mismatches.append((key, 'not a valid TIFF (bad magic bytes / truncated)'))
        elif prior and prior.get('sha256') != meta['sha256']:
            mismatches.append((key, f"sha256 changed on disk since last verify (was {prior['sha256'][:12]}…, now {meta['sha256'][:12]}…)"))
        elif prior:
            ok.append(key)
        else:
            new.append(key)

    total_bytes = sum(m['size'] for m in current.values())
    print(f"scanned roots: {[str(r) for r in ROOTS if r.is_dir()]}")
    print(f"tiles found: {len(current)}  total bytes: {total_bytes} ({total_bytes/1e6:.1f} MB)")
    print(f"unchanged/verified: {len(ok)}  newly recorded: {len(new)}  mismatches: {len(mismatches)}")
    for key, reason in mismatches:
        print(f"  MISMATCH {key}: {reason}")
    for key in new:
        print(f"  NEW {key}  sha256={current[key]['sha256'][:16]}…  {current[key]['size']} bytes")

    # De-duplication check: same sha256 present under more than one path is a copy, not a distinct tile.
    by_hash = {}
    for key, meta in current.items():
        by_hash.setdefault(meta['sha256'], []).append(key)
    duplicates = {h: keys for h, keys in by_hash.items() if len(keys) > 1}
    if duplicates:
        print(f"duplicate content across {len(duplicates)} hash group(s) (same bytes, different paths):")
        for h, keys in duplicates.items():
            print(f"  {h[:16]}…: {keys}")
    else:
        print("no duplicate source tiles found (source-cache is the sole copy of each tile)")

    if not check_only:
        SOURCE_CACHE.mkdir(parents=True, exist_ok=True)
        CHECKSUMS.write_text(json.dumps(current, indent=1, sort_keys=True))
        print(f"wrote {CHECKSUMS}")

    if mismatches and check_only:
        sys.exit(1)


if __name__ == '__main__':
    main()
