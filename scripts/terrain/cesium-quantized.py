"""Encode the identical heightmap grids for a format-only A/B baseline."""
import gzip
import hashlib
import io
import json
import time
from pathlib import Path
import numpy as np
from quantized_mesh_encoder import encode

ROOT=Path(__file__).resolve().parents[2]/'tools/terrain/cesium/build'
def main():
    source=ROOT/'alps-heightmap';out=ROOT/'alps-quantized';out.mkdir(parents=True,exist_ok=True)
    audit=json.loads((source/'audit.json').read_text())
    indices=[]
    for y in range(64):
        for x in range(64):
            a=y*65+x
            indices.extend([a,a+65,a+1,a+1,a+65,a+66])
    indices=np.array(indices,dtype=np.uint32)
    # High-water-mark encoding requires vertices in first-use order.
    order=list(dict.fromkeys(indices.tolist()))
    remap=np.empty(65*65,dtype=np.uint32);remap[order]=np.arange(len(order))
    indices=remap[indices]
    sizes={'heightmap':0,'heightmapGzip':0,'quantized':0,'quantizedGzip':0};start=time.perf_counter()
    for tile in audit['tiles']:
        data=(source/tile['file']).read_bytes()
        heights=np.frombuffer(data[:65*65*2],dtype='<u2').reshape(65,65)/5-1000
        w,s,e,n=tile['bbox'];lon,lat=np.meshgrid(np.linspace(w,e,65),np.linspace(n,s,65))
        positions=np.stack([lon,lat,heights],axis=-1).reshape(-1,3)
        buf=io.BytesIO();encode(buf,positions[order],indices,bounds=[w,s,e,n]);mesh=buf.getvalue()
        target=out/tile['file'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(mesh)
        tile['bytes']=len(mesh);tile['sha256']=hashlib.sha256(mesh).hexdigest()
        sizes['heightmap']+=len(data);sizes['heightmapGzip']+=len(gzip.compress(data));sizes['quantized']+=len(mesh);sizes['quantizedGzip']+=len(gzip.compress(mesh))
    layer=json.loads((source/'layer.json').read_text());layer['format']='quantized-mesh-1.0'
    (out/'layer.json').write_text(json.dumps(layer));(out/'audit.json').write_text(json.dumps(audit))
    report={'tiles':len(audit['tiles']),'seconds':time.perf_counter()-start,'bytes':sizes,'encoder':'quantized-mesh-encoder 0.5.0','sameGrid':True,
      'limitation':'No adaptive simplification. This is format baseline, not final quantized-mesh performance verdict.'}
    (ROOT/'terrain-format-benchmark.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
if __name__=='__main__':main()
