import * as C from '@cesium/engine';
import {mosaicHex} from './history-mosaic';

// A screen-readable selection footprint, never cadastral or historical territory.
export function selectionRadius(metersPerPixel:number){
  return Math.min(200000,Math.max(3,Number.isFinite(metersPerPixel)&&metersPerPixel>0?metersPerPixel*96:700));
}
export function selectionHex(lon:number,lat:number,properties:Record<string,unknown>={}):C.Entity.ConstructorOptions{
  return {
    properties:{...properties,selectionHexLocation:[lon,lat]},
    position:C.Cartesian3.fromDegrees(lon,lat),
    polygon:{hierarchy:new C.PolygonHierarchy(mosaicHex(lon,lat)),material:C.Color.fromCssColorString('#e9c479').withAlpha(.16),classificationType:C.ClassificationType.BOTH},
    polyline:{positions:mosaicHex(lon,lat),width:3,clampToGround:true,classificationType:C.ClassificationType.BOTH,material:new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#e9c479'),outlineColor:C.Color.fromCssColorString('#182026'),outlineWidth:1})},
  };
}
export function createSelectionHexController(widget:C.CesiumWidget,source:C.CustomDataSource){
  const radii=new WeakMap<C.Entity,number>();
  const refresh=()=>{
    if(widget.isDestroyed())return;
    let changed=false;
    for(const entity of source.entities.values){
      const location=entity.properties?.selectionHexLocation?.getValue() as number[]|undefined;
      if(!location)continue;
      const [lon,lat]=location,center=C.Cartesian3.fromDegrees(lon,lat);
      const radius=selectionRadius(widget.camera.getPixelSize(new C.BoundingSphere(center,1),widget.scene.drawingBufferWidth??widget.canvas.clientWidth,widget.scene.drawingBufferHeight??widget.canvas.clientHeight));
      const previous=radii.get(entity);
      if(previous&&Math.abs(radius-previous)/previous<.1)continue;
      const positions=mosaicHex(lon,lat,radius);
      entity.polygon!.hierarchy=new C.ConstantProperty(new C.PolygonHierarchy(positions));
      entity.polyline!.positions=new C.ConstantProperty(positions);
      radii.set(entity,radius);changed=true;
    }
    if(changed)widget.scene.requestRender();
  };
  const removeChanged=widget.camera.changed?.addEventListener(refresh);
  const removeEnd=widget.camera.moveEnd?.addEventListener(refresh);
  return {refresh,dispose(){removeChanged?.();removeEnd?.();}};
}
