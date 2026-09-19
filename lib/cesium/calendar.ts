import * as C from '@cesium/engine';
import {createLayerHandler} from './handlers';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
import {atlasLabel,atlasVariant,saintIcon,styleCluster} from './atlas-style';
export function setCalendarLighting(widget:C.CesiumWidget,enabled:boolean) {
  widget.scene.globe.enableLighting=enabled;widget.scene.requestRender();
}
export function calendarCategory(type:string) {
  return ['church','monastery','shrine'].includes(type)?'holy_place':type==='saint'||type==='feast'||type==='icon'?type:'event';
}
export function calendarMarkers(items:CalendarGeoItem[],filter='all') {
  const unique=new Map<string,CalendarGeoItem>();
  for(const item of [...items].sort((a,b)=>b.markerPriority-a.markerPriority)) {
    if(filter!=='all'&&calendarCategory(item.entityType)!==filter)continue;
    if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon)||Math.abs(item.lat)>90||Math.abs(item.lon)>180)continue;
    const key=`${item.entityId}:${item.placeId}`;
    if(!unique.has(key))unique.set(key,item);
  }
  return [...unique.values()];
}
export function calendarMarkerStyle(item:CalendarGeoItem,selected:boolean) {
  const important=item.markerPriority>=80;
  return {pixelSize:selected?11:important?7:4,thumbnail:!!item.thumbnail&&(important||selected),scale:selected?1.15:1};
}
function markerCanvas(selected:boolean,image?:HTMLImageElement) {
  if(typeof document==='undefined')return undefined;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const context=canvas.getContext('2d');if(!context)return undefined;
  context.scale(2,2);
  if(selected){const glow=context.createRadialGradient(48,48,12,48,48,35);glow.addColorStop(0,'rgba(235,190,100,0)');glow.addColorStop(.4,'rgba(235,190,100,.18)');glow.addColorStop(1,'rgba(235,190,100,0)');context.fillStyle=glow;context.fillRect(0,0,96,96);}
  context.beginPath();context.arc(48,48,image?29:16,0,Math.PI*2);
  if(image){context.save();context.clip();const size=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,19,19,58,58);context.restore();}
  context.strokeStyle='#f2ce86';context.lineWidth=2;context.stroke();
  if(!image){context.beginPath();context.arc(48,48,5,0,Math.PI*2);context.fillStyle='#f2ce86';context.fill();}
  return canvas;
}
export function createOrthodoxCalendarLayer(widget:C.CesiumWidget,onSelect:(id:string)=>void,onError:(error:unknown)=>void) {
  const source=new C.CustomDataSource('OrthodoxCalendarLayer');
  let disposed=false,generation=0;
  const thumbnails=new Map<string,Promise<HTMLImageElement|null>>();
  const variant=atlasVariant(),pin=variant==='pin'&&typeof document!=='undefined'?new C.PinBuilder().fromText('\u2626',C.Color.fromCssColorString('#d9b66a'),128):undefined;
  source.clustering.enabled=true;source.clustering.pixelRange=2;source.clustering.minimumClusterSize=2;
  const removeCluster=source.clustering.clusterEvent.addEventListener((_entities:unknown[],cluster:{label:C.Label;point:C.PointPrimitive;billboard:C.Billboard})=>{
    styleCluster(cluster);
  });
  void widget.dataSources.add(source).then(()=>{if(disposed&&!widget.isDestroyed())widget.dataSources.remove(source,true);}).catch(onError);
  const input=createLayerHandler(widget),handler=input.handler;
  handler.setInputAction((event:{position:C.Cartesian2})=>{
    const picked=widget.scene.pick(event.position)?.id;
    if(Array.isArray(picked)){
      const points=picked.map(entity=>entity.position?.getValue(widget.clock.currentTime)).filter((point):point is C.Cartesian3=>!!point);
      if(points.length)widget.camera.flyToBoundingSphere(C.BoundingSphere.fromPoints(points),{duration:1});
      return;
    }
    const id=picked?.properties?.calendarEntityId?.getValue();
    if(typeof id==='string')onSelect(id);
  },C.ScreenSpaceEventType.LEFT_CLICK);
  return {
    id:'orthodox-calendar',kind:'event' as const,
    update(items:CalendarGeoItem[],filter='all',selectedId:string|null=null) {
      if(disposed||widget.isDestroyed())return;
      const version=++generation;
      source.clustering.enabled=!selectedId;
      source.entities.removeAll();
      let labeledSelected=false;
      for(const item of calendarMarkers(items,filter)){
        const selected=item.entityId===selectedId,style=calendarMarkerStyle(item,selected);
        const holyPlace=['church','monastery','shrine'].includes(item.entityType);
        const billboard=variant!=='points';
        const labelText=selected&&labeledSelected?item.placeTitle:item.title;if(selected)labeledSelected=true;
        const entity=source.entities.add({id:`calendar:${item.entityId}:${item.placeId}`,name:item.title,
        properties:{calendarEntityId:item.entityId},position:C.Cartesian3.fromDegrees(item.lon,item.lat,30),
        point:billboard?undefined:{pixelSize:selected?12:8,color:C.Color.fromCssColorString('#efcc86'),outlineColor:C.Color.fromCssColorString('#15212b'),outlineWidth:2,heightReference:C.HeightReference.RELATIVE_TO_GROUND,disableDepthTestDistance:0,distanceDisplayCondition:new C.DistanceDisplayCondition(0,selected?30000000:9000000),scaleByDistance:new C.NearFarScalar(100000,1,9000000,.8)},
        billboard:billboard?{image:pin??saintIcon(selected,holyPlace),width:selected?48:32,height:selected?48:32,verticalOrigin:C.VerticalOrigin.BOTTOM,pixelOffset:new C.Cartesian2(0,-2),heightReference:C.HeightReference.RELATIVE_TO_GROUND,disableDepthTestDistance:0,scaleByDistance:new C.NearFarScalar(100000,1,12000000,.8),distanceDisplayCondition:new C.DistanceDisplayCondition(0,selected?30000000:9000000)}:undefined,
        label:{text:labelText,...atlasLabel('saint',selected),heightReference:C.HeightReference.RELATIVE_TO_GROUND}});
        if(billboard&&style.thumbnail&&item.thumbnail&&typeof Image!=='undefined'){
          const url=item.thumbnail;
          if(!thumbnails.has(url))thumbnails.set(url,new Promise(resolve=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url;}));
          void thumbnails.get(url)!.then(image=>{
            if(!image||disposed||version!==generation||widget.isDestroyed())return;
            const thumbnail=markerCanvas(selected,image);if(!thumbnail)return;
            entity.point=undefined;
            entity.billboard=new C.BillboardGraphics({image:thumbnail,width:selected?64:48,height:selected?64:48,verticalOrigin:C.VerticalOrigin.BOTTOM,pixelOffset:new C.Cartesian2(0,-2),heightReference:C.HeightReference.RELATIVE_TO_GROUND,disableDepthTestDistance:0,distanceDisplayCondition:new C.DistanceDisplayCondition(0,selected?30000000:9000000),scaleByDistance:new C.NearFarScalar(100000,1,12000000,.8)});
            widget.scene.requestRender();
          }).catch(()=>{/* Keep the gold point when a remote image cannot be used. */});
        }
      }
      widget.scene.requestRender();
    },
    focus(items:CalendarGeoItem[]) {
      if(disposed||widget.isDestroyed())return;
      const points=calendarMarkers(items).map(item=>C.Cartesian3.fromDegrees(item.lon,item.lat));
      if(points.length)widget.camera.flyToBoundingSphere(C.BoundingSphere.fromPoints(points),{duration:1.6,offset:new C.HeadingPitchRange(0,-Math.PI/2,Math.max(widget.canvas.clientWidth<768?24000000:13500000,C.BoundingSphere.fromPoints(points).radius*3))});
    },
    setVisible(visible:boolean){if(!disposed&&!widget.isDestroyed()){source.show=visible;widget.scene.requestRender();}},
    dispose(){if(disposed)return;disposed=true;removeCluster();input.dispose();if(!widget.isDestroyed())widget.dataSources.remove(source,true);},
  };
}
