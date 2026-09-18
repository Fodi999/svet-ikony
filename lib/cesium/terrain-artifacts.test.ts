import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {GeographicTilingScheme,Math as CesiumMath} from '@cesium/engine';

const root='tools/terrain/cesium/build';
type Tile={level:number;x:number;y:number;bbox:number[];file:string;children:number[][]};
describe.skipIf(!existsSync(`${root}/alps-heightmap/audit.json`))('local Cesium terrain artifacts',()=>{
  const audit=()=>JSON.parse(readFileSync(`${root}/alps-heightmap/audit.json`,'utf8')) as {tiles:Tile[]};
  it('uses Cesium geographic addressing, TMS files and valid finite heights',()=>{
    const scheme=new GeographicTilingScheme();
    for(const tile of audit().tiles){
      const rectangle=scheme.tileXYToRectangle(tile.x,tile.y,tile.level);
      [rectangle.west,rectangle.south,rectangle.east,rectangle.north].map(CesiumMath.toDegrees).forEach((v,i)=>expect(v).toBeCloseTo(tile.bbox[i],9));
      expect(tile.file).toBe(`${tile.level}/${tile.x}/${(1<<tile.level)-1-tile.y}.terrain`);
      const bytes=readFileSync(`${root}/alps-heightmap/${tile.file}`);
      expect(bytes.length).toBe(65*65*2+2);
      let minimum=Infinity;for(let i=0;i<65*65;i++)minimum=Math.min(minimum,bytes.readUInt16LE(i*2)/5-1000);
      expect(minimum).toBeGreaterThanOrEqual(0);
      expect(bytes[8450]).toBeLessThanOrEqual(15);
    }
  });
  it('has identical same-level shared edge samples',()=>{
    const tiles=audit().tiles,byId=new Map(tiles.map(t=>[`${t.level}/${t.x}/${t.y}`,t]));
    for(const tile of tiles){
      const data=readFileSync(`${root}/alps-heightmap/${tile.file}`);
      for(const [dx,dy] of [[1,0],[0,1]]){
        const neighbor=byId.get(`${tile.level}/${tile.x+dx}/${tile.y+dy}`);if(!neighbor)continue;
        const other=readFileSync(`${root}/alps-heightmap/${neighbor.file}`);
        for(let i=0;i<65;i++)expect(data.readUInt16LE((dx?i*65+64:64*65+i)*2)).toBe(other.readUInt16LE((dx?i*65:i)*2));
      }
    }
  });
  it.skipIf(!existsSync(`${root}/alps-quantized/audit.json`))('has valid quantized mesh headers and high-water-mark indices',()=>{
    for(const tile of audit().tiles){
      const bytes=readFileSync(`${root}/alps-quantized/${tile.file}`);
      for(const offset of [0,8,16,32,40,48,56,64,72,80])expect(Number.isFinite(bytes.readDoubleLE(offset))).toBe(true);
      const vertices=bytes.readUInt32LE(88),offset=92+vertices*6;
      const triangles=bytes.readUInt32LE(offset);let highest=0;
      expect(vertices).toBe(4225);expect(triangles).toBe(8192);
      for(let i=0;i<triangles*3;i++){
        const code=bytes.readUInt16LE(offset+4+i*2),index=highest-code;
        if(index<0 || index>=vertices)throw new Error(`Invalid index in ${tile.file}: ${index}`);
        if(code===0)highest++;
      }
    }
  });
});
