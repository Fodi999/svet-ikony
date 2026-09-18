#!/usr/bin/env python3
"""Generate terrain-contract-compliant GLB tiles + manifest.json for the
'alps' region from raycast-sampled height grids (tools/terrain/alps/raw/)
and pre-cropped satellite tile textures.

Mirrors lib/terrain/contract.ts's parseTerrainManifest exactly (same field
names/semantics) and lib/visualizer/terrain-alignment.ts's terrainPoint()
projection formula (same math), so the client's runtime projection
(terrain-projection.ts) curves these flat/local vertices onto the globe
correctly, same as the existing eastern_europe_test (Ukraine) bundle.
"""
import json, math, os, struct, hashlib, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(REPO, "tools/terrain/alps/raw")
TEX_DIR = os.path.expanduser("~/mnt/My project/Earth_Blender/satellite/alps/tiles")
OUT_DIR = os.path.join(REPO, "tools/terrain/alps/build")

REGION = "alps"
LOD = 1
COUNT_X = 4
COUNT_Y = 4
BOUNDS = {"minLon": 6.7, "minLat": 45.75, "maxLon": 6.98, "maxLat": 45.95}
ORIGIN_LAT = (BOUNDS["minLat"] + BOUNDS["maxLat"]) / 2
ORIGIN_LON = (BOUNDS["minLon"] + BOUNDS["maxLon"]) / 2
EARTH_RADIUS_M = 6371000.0
METERS_PER_UNIT = 100000.0
HEIGHT_EXAGGERATION = 1.0  # Native DEM meters; never use exaggerated Blender relief.
R_UNITS = EARTH_RADIUS_M / METERS_PER_UNIT

os.makedirs(OUT_DIR, exist_ok=True)


def terrain_point(lat_deg, lon_deg, elevation_m):
    """Exact port of lib/visualizer/terrain-alignment.ts terrainPoint()."""
    rad = math.pi / 180.0
    p = lat_deg * rad
    p0 = ORIGIN_LAT * rad
    dl = (lon_deg - ORIGIN_LON) * rad
    cos_val = max(-1.0, min(1.0, math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(dl)))
    angle = math.acos(cos_val)
    k = 1.0 if angle < 1e-10 else angle / math.sin(angle)
    x = R_UNITS * k * math.cos(p) * math.sin(dl)
    y = R_UNITS * (cos_val - 1.0) + elevation_m * HEIGHT_EXAGGERATION / METERS_PER_UNIT
    z = -R_UNITS * k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(dl))
    return (x, y, z)


def build_tile_mesh(row, col):
    with open(os.path.join(RAW_DIR, f"tile_{row}_{col}.json")) as f:
        raw = json.load(f)
    n = raw["n"]
    lat_min, lat_max = raw["lat_min"], raw["lat_max"]
    lon_min, lon_max = raw["lon_min"], raw["lon_max"]
    grid = raw["grid"]

    positions = []  # flat list of (x,y,z), row-major: index = i + j*n
    for j in range(n):
        lat = lat_min + (lat_max - lat_min) * j / (n - 1)
        for i in range(n):
            lon = lon_min + (lon_max - lon_min) * i / (n - 1)
            elevation = grid[j][i]
            positions.append(terrain_point(lat, lon, elevation))

    def idx(i, j):
        return i + j * n

    normals = [None] * (n * n)
    for j in range(n):
        for i in range(n):
            i0, i1 = max(i - 1, 0), min(i + 1, n - 1)
            j0, j1 = max(j - 1, 0), min(j + 1, n - 1)
            ax, ay, az = positions[idx(i1, j)]
            bx, by, bz = positions[idx(i0, j)]
            tx, ty, tz = positions[idx(i, j1)]
            cx, cy, cz = positions[idx(i, j0)]
            ux, uy, uz = ax - bx, ay - by, az - bz
            vx, vy, vz = tx - cx, ty - cy, tz - cz
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            normals[idx(i, j)] = (nx / length, ny / length, nz / length)

    uvs = []
    for j in range(n):
        v = j / (n - 1)
        for i in range(n):
            u = i / (n - 1)
            uvs.append((u, 1.0 - v))

    indices = []
    for j in range(n - 1):
        for i in range(n - 1):
            a = idx(i, j)
            b = idx(i + 1, j)
            c = idx(i, j + 1)
            d = idx(i + 1, j + 1)
            indices += [a, b, c, b, d, c]

    heights = [v for row_ in grid for v in row_]
    return {
        "positions": positions, "normals": normals, "uvs": uvs, "indices": indices,
        "vertex_resolution": [n, n], "height_min": min(heights), "height_max": max(heights),
        "min_lat": lat_min, "max_lat": lat_max, "min_lon": lon_min, "max_lon": lon_max,
    }


GLTF_JSON_CHUNK = 0x4E4F534A
GLTF_BIN_CHUNK = 0x004E4942


def pad4(data, pad_byte):
    rem = len(data) % 4
    if rem:
        data += pad_byte * (4 - rem)
    return data


def build_glb(mesh, tex_bytes, tile_id, texture_mime='image/jpeg'):
    positions = mesh["positions"]; normals = mesh["normals"]; uvs = mesh["uvs"]; indices = mesh["indices"]
    n_verts = len(positions)

    pos_buf = b"".join(struct.pack("<fff", *p) for p in positions)
    norm_buf = b"".join(struct.pack("<fff", *nrm) for nrm in normals)
    uv_buf = b"".join(struct.pack("<ff", *uv) for uv in uvs)
    use_uint32 = n_verts > 65535
    idx_fmt = "<I" if use_uint32 else "<H"
    idx_comp_type = 5125 if use_uint32 else 5123
    idx_buf = b"".join(struct.pack(idx_fmt, v) for v in indices)
    idx_buf = pad4(idx_buf, b"\x00")

    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]

    buffers_concat = pos_buf + norm_buf + uv_buf + idx_buf
    img_offset = len(buffers_concat)
    buffers_concat += tex_bytes
    buffers_concat = pad4(buffers_concat, b"\x00")

    buffer_views = [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_buf), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_buf), "byteLength": len(norm_buf), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_buf) + len(norm_buf), "byteLength": len(uv_buf), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_buf) + len(norm_buf) + len(uv_buf), "byteLength": len(idx_buf), "target": 34963},
        {"buffer": 0, "byteOffset": img_offset, "byteLength": len(tex_bytes)},
    ]
    accessors = [
        {"bufferView": 0, "componentType": 5126, "count": n_verts, "type": "VEC3",
         "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
        {"bufferView": 1, "componentType": 5126, "count": n_verts, "type": "VEC3"},
        {"bufferView": 2, "componentType": 5126, "count": n_verts, "type": "VEC2"},
        {"bufferView": 3, "componentType": idx_comp_type, "count": len(indices), "type": "SCALAR"},
    ]
    gltf = {
        "asset": {"version": "2.0", "generator": "svet-ikony terrain/alps pipeline"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": tile_id}],
        "meshes": [{"name": tile_id, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0,
        }]}],
        "materials": [{
            "name": f"AlpsTerrain_{tile_id}",
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.95},
            "doubleSided": False,
        }],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"wrapS": 33071, "wrapT": 33071}],
        "images": [{"mimeType": texture_mime, "bufferView": 4, "name": f"{tile_id}_color"}],
        "buffers": [{"byteLength": len(buffers_concat)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")

    total_len = 12 + 8 + len(json_bytes) + 8 + len(buffers_concat)
    header = struct.pack("<4sII", b"glTF", 2, total_len)
    json_chunk = struct.pack("<II", len(json_bytes), GLTF_JSON_CHUNK) + json_bytes
    bin_chunk = struct.pack("<II", len(buffers_concat), GLTF_BIN_CHUNK) + buffers_concat
    return header + json_chunk + bin_chunk


def main():
    from PIL import Image
    import io
    tiles_manifest = []
    dx = (BOUNDS["maxLon"] - BOUNDS["minLon"]) / COUNT_X
    dy = (BOUNDS["maxLat"] - BOUNDS["minLat"]) / COUNT_Y

    for row in range(4):
        for col in range(4):
            x = col
            y = 3 - row
            tile_id = f"l{LOD}_{x}_{y}"
            mesh = build_tile_mesh(row, col)

            with open(os.path.join(TEX_DIR, f"{row}{col}.png"), "rb") as f:
                im = Image.open(f).convert("RGB")
                buf = io.BytesIO()
                im.save(buf, format="JPEG", quality=90)
                tex_bytes = buf.getvalue()

            glb = build_glb(mesh, tex_bytes, tile_id)
            fname = f"{x}_{y}.glb"
            out_path = os.path.join(OUT_DIR, fname)
            with open(out_path, "wb") as f:
                f.write(glb)
            sha256 = hashlib.sha256(glb).hexdigest()

            west = BOUNDS["minLon"] + x * dx
            east = BOUNDS["minLon"] + (x + 1) * dx
            north = BOUNDS["maxLat"] - y * dy
            south = BOUNDS["maxLat"] - (y + 1) * dy

            tiles_manifest.append({
                "tile_id": tile_id, "lod": LOD, "x": x, "y": y, "file": fname,
                "file_size_bytes": len(glb), "sha256": sha256,
                "min_lon": west, "max_lon": east, "min_lat": south, "max_lat": north,
                "center_lat": (south + north) / 2, "center_lon": (west + east) / 2,
                "world_position": [0, 0, 0], "world_scale": [1, 1, 1],
                "height_min": mesh["height_min"], "height_max": mesh["height_max"],
                "vertex_resolution": mesh["vertex_resolution"],
                "triangles": len(mesh["indices"]) // 3,
                "surface_triangles": len(mesh["indices"]) // 3,
                "texture_resolution": {"color": [256, 256]},
            })
            print(f"tile row={row} col={col} -> x={x} y={y} {fname} {len(glb)} bytes h[{mesh['height_min']:.0f},{mesh['height_max']:.0f}]")

    tiles_manifest.sort(key=lambda t: (t["y"], t["x"]))
    manifest = {
        "region": REGION,
        "grid": {"lod": LOD, "countX": COUNT_X, "countY": COUNT_Y, "xDirection": "east", "yDirection": "south",
                  "tileDegreesLon": dx, "tileDegreesLat": dy},
        "bounds": BOUNDS,
        "coordinateSystem": {
            "east": "+X", "north": "-Z", "up": "+Y",
            "origin": {"latitude": ORIGIN_LAT, "longitude": ORIGIN_LON},
            "metersPerUnit": METERS_PER_UNIT, "earthRadiusMeters": EARTH_RADIUS_M,
            "heightExaggeration": HEIGHT_EXAGGERATION,
            "projection": "spherical AEQD + spherical sag",
            "vertexCoordinates": "baked regional coordinates; identity object transforms, no independent tile recentering",
            "blenderEast": "+X", "blenderNorth": "+Y", "blenderUp": "+Z",
        },
        "tiles": tiles_manifest,
        "total_glb_bytes": sum(t["file_size_bytes"] for t in tiles_manifest),
    }
    manifest_path = os.path.join(OUT_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print("manifest written:", manifest_path)
    print("total tiles:", len(tiles_manifest), "total bytes:", manifest["total_glb_bytes"])


if __name__ == "__main__":
    main()
