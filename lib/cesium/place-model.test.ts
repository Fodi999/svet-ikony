import {expect,it} from 'vitest';
import * as C from '@cesium/engine';
import {placeModelEntity} from './sacred-places';
// Direction of a glTF-space vector on the globe, applying Cesium's own glTF axis correction (Y-up, Z-forward).
function worldDirection(entity:C.Entity.ConstructorOptions,v:C.Cartesian3){
  const axis=C.Axis as unknown as {Y_UP_TO_Z_UP:C.Matrix4;Z_UP_TO_X_UP:C.Matrix4};
  const fix=C.Matrix4.multiplyTransformation(axis.Y_UP_TO_Z_UP,axis.Z_UP_TO_X_UP,new C.Matrix4());
  const local=C.Matrix4.multiplyByPointAsVector(fix,v,new C.Cartesian3());
  const rot=C.Matrix3.fromQuaternion(entity.orientation as C.Quaternion);
  return C.Cartesian3.normalize(C.Matrix3.multiplyByVector(rot,local,new C.Cartesian3()),new C.Cartesian3());
}
const enu=(p:C.Cartesian3)=>{const m=C.Transforms.eastNorthUpToFixedFrame(p);return{east:C.Matrix4.getColumn(m,0,new C.Cartesian4()),north:C.Matrix4.getColumn(m,1,new C.Cartesian4())};};
const base={id:'p',title:'Temple',lat:50,lon:30};
it('keeps places without a model on their 2D pin',()=>expect(placeModelEntity(base)).toBeNull());
it('stands a model without altitude on the terrain, lifted by its offset',()=>{
  const entity=placeModelEntity({...base,model:{url:'/markers/sacred/marker-church.glb',scale:2,heading:90,pitch:0,roll:0,heightOffset:5,altitude:null}})!;
  expect(entity.model?.heightReference).toBe(C.HeightReference.RELATIVE_TO_GROUND);
  expect(C.Cartographic.fromCartesian(entity.position as C.Cartesian3).height).toBeCloseTo(5,3);
  expect((entity.properties as {sacredPlaceId:string}).sacredPlaceId).toBe('p');
});
it('uses a surveyed altitude as an absolute height',()=>{
  const entity=placeModelEntity({...base,model:{url:'/media/church/p/model/a.glb',scale:1,heading:0,pitch:0,roll:0,heightOffset:-2,altitude:180}})!;
  expect(entity.model?.heightReference).toBe(C.HeightReference.NONE);
  expect(C.Cartographic.fromCartesian(entity.position as C.Cartesian3).height).toBeCloseTo(178,3);
});
it('keeps a north-up authored model (Blender +Y = glTF -Z) pointing north at heading 0',()=>{
  const entity=placeModelEntity({...base,model:{url:'/media/church/p/model/a.glb',scale:1,heading:0,pitch:0,roll:0,heightOffset:0,altitude:null}})!;
  const dir=worldDirection(entity,new C.Cartesian3(0,0,-1)), {north,east}=enu(entity.position as C.Cartesian3);
  expect(C.Cartesian3.dot(dir,new C.Cartesian3(north.x,north.y,north.z))).toBeCloseTo(1,5);
  const eastDir=worldDirection(entity,new C.Cartesian3(1,0,0));
  expect(C.Cartesian3.dot(eastDir,new C.Cartesian3(east.x,east.y,east.z))).toBeCloseTo(1,5);
});
it('turns clockwise for a positive heading',()=>{
  const entity=placeModelEntity({...base,model:{url:'/media/church/p/model/a.glb',scale:1,heading:90,pitch:0,roll:0,heightOffset:0,altitude:null}})!;
  const dir=worldDirection(entity,new C.Cartesian3(0,0,-1)), {east}=enu(entity.position as C.Cartesian3);
  expect(C.Cartesian3.dot(dir,new C.Cartesian3(east.x,east.y,east.z))).toBeCloseTo(1,5);
});
