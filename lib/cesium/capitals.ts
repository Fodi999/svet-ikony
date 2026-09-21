import * as C from '@cesium/engine';
import {createLayerHandler} from './handlers';
import {atlasLabel,cityRankAtHeight,styleCluster} from './atlas-style';
import type {CapitalCity} from '@/lib/visualizer/capital-cities';
import type {KnowledgeLayer} from './knowledge';

/** Capital marker badge (public/icons/capital.svg); it replaced the old yellow point. */
export const CAPITAL_ICON='/icons/capital.svg';
export const CAPITAL_ICON_SIZE=22;

export async function createCesiumCapitals(widget:C.CesiumWidget,options:{locale:()=> 'uk'|'ru'|'en';onSelect:(city:CapitalCity)=>void;signal:AbortSignal;reserved:()=>{x:number;y:number;w:number}[];kind?:'capital'|'city';onData?:(cities:CapitalCity[])=>void}):Promise<KnowledgeLayer> {
  const isCity=options.kind==='city',kind=isCity?'city':'capital',property=isCity?'cityId':'capitalId';
  const response=await fetch(isCity?'/data/cities-10m.json':'/data/capitals-10m.json',{signal:options.signal});if(!response.ok)throw new Error('City dataset unavailable');
  const payload=await response.json() as {capitals?:CapitalCity[];cities?:CapitalCity[]};
  const capitals=(isCity?payload.cities:payload.capitals)??[];
  if((!isCity&&capitals.length!==215) || capitals.some(c=>!Number.isFinite(c.lat+c.lon)||Math.abs(c.lat)>90||Math.abs(c.lon)>180 || (!isCity&&!['Admin-0 capital','Admin-0 capital alt'].includes(c.featureClass))))throw new Error('City dataset invalid');
  options.signal.throwIfAborted();options.onData?.(capitals);
  const source=new C.CustomDataSource(isCity?'Cities':'CapitalCities');
  source.clustering.enabled=isCity;source.clustering.pixelRange=0;source.clustering.minimumClusterSize=2;
  source.clustering.clusterLabels=false;
  const removeCluster=source.clustering.clusterEvent.addEventListener((_entities:unknown[],cluster:{label:C.Label;point:C.PointPrimitive;billboard:C.Billboard})=>styleCluster(cluster));
  const ordered=[...capitals].sort((a,b)=>a.scalerank-b.scalerank || b.population-a.population);
  const range=new C.DistanceDisplayCondition(0,isCity?1800000:9000000),scale=new C.NearFarScalar(10000,1,isCity?1800000:9000000,.85);
  const makeEntity=(city:CapitalCity,position:C.Cartesian3)=>source.entities.add({id:`${kind}:${city.id}`,position,properties:{[property]:city.id},
    // Capitals use the /icons/capital.svg badge (Cesium billboard: same ground clamping, picking and pick mapping as before); cities keep small dots.
    ...(isCity?{point:{pixelSize:5,color:C.Color.fromCssColorString('#c7d8e5'),outlineColor:C.Color.fromCssColorString('#17212a'),outlineWidth:1.5,
      heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:0,distanceDisplayCondition:range,scaleByDistance:scale}}
      :{billboard:{image:CAPITAL_ICON,width:CAPITAL_ICON_SIZE,height:CAPITAL_ICON_SIZE,verticalOrigin:C.VerticalOrigin.CENTER,horizontalOrigin:C.HorizontalOrigin.CENTER,
      heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:0,distanceDisplayCondition:range,scaleByDistance:scale}}),
    label:{show:true,text:city.names[options.locale()] || city.name,...atlasLabel(kind),
      ...(isCity?{}:{pixelOffset:new C.Cartesian2(CAPITAL_ICON_SIZE/2+5,0)}),heightReference:C.HeightReference.CLAMP_TO_GROUND}});
  // Keep the real catalog in CPU memory. Only the visible city subset gets Entities,
  // preserving native ground clamping, EntityCluster and the existing pick mapping.
  const entries=ordered.map(city=>{const position=C.Cartesian3.fromDegrees(city.lon,city.lat);return {city,position,entity:isCity?null:makeEntity(city,position)};});
  await widget.dataSources.add(source);
  if(options.signal.aborted){if(!widget.isDestroyed())widget.dataSources.remove(source,true);throw options.signal.reason;}
  const input=createLayerHandler(widget),handler=input.handler;
  handler.setInputAction((movement:{position:C.Cartesian2})=>{
    const picked=widget.scene.pick(movement.position)?.id;
    if(isCity&&Array.isArray(picked)&&picked.every(entity=>entity.properties?.cityId)){
      const positions=picked.map(entity=>entity.position?.getValue(widget.clock.currentTime)).filter((point):point is C.Cartesian3=>!!point);
      if(positions.length)widget.camera.flyToBoundingSphere(C.BoundingSphere.fromPoints(positions),{duration:1});return;
    }
    const id=picked?.properties?.[property]?.getValue(),city=id?capitals.find(city=>city.id===id):null;if(city)options.onSelect(city);
  },C.ScreenSpaceEventType.LEFT_CLICK);
  const normal=new C.Cartesian3(),view=new C.Cartesian3(),lastPosition=new C.Cartesian3(),lastDirection=new C.Cartesian3();
  let dirty=true,lastLocale='',lastWidth=0,lastHeight=0,lastReserved='';
  let labelBoxes:{x:number;y:number;w:number}[]=[];
  const remove=widget.scene.preRender.addEventListener(()=>{
    if(!source.show)return;
    const locale=options.locale(),camera=widget.camera,altitude=camera.positionCartographic.height;
    const reserved=options.reserved(),reservedKey=reserved.map(box=>`${box.x.toFixed(0)},${box.y.toFixed(0)},${box.w}`).join(';');
    const selected=!!widget.container.parentElement?.querySelector('[data-selected="true"]');
    const layoutKey=reservedKey+selected;
    if(!dirty&&locale===lastLocale&&layoutKey===lastReserved&&lastWidth===widget.canvas.clientWidth&&lastHeight===widget.canvas.clientHeight&&C.Cartesian3.equals(lastPosition,camera.positionWC)&&C.Cartesian3.equals(lastDirection,camera.directionWC))return;
    dirty=false;lastLocale=locale;lastReserved=layoutKey;lastWidth=widget.canvas.clientWidth;lastHeight=widget.canvas.clientHeight;
    C.Cartesian3.clone(camera.positionWC,lastPosition);C.Cartesian3.clone(camera.directionWC,lastDirection);
    const boxes=[...reserved],rank=cityRankAtHeight(altitude);let visibleCities=0;labelBoxes=[];
    source.entities.suspendEvents();
    try{for(const entry of entries){
      const {city,position}=entry;
      const eligible=isCity?rank>=0&&city.scalerank<=rank&&visibleCities<600:altitude<8500000;
      const screen=eligible?C.SceneTransforms.worldToWindowCoordinates(widget.scene,position):undefined;
      const text=city.names[locale]||city.name,width=text.length*(isCity?7:8)+16;
      C.Ellipsoid.WGS84.geodeticSurfaceNormal(position,normal);C.Cartesian3.subtract(camera.positionWC,position,view);
      const visible=eligible&&C.Cartesian3.dot(normal,view)>0&&!!screen&&screen.x>(lastWidth>=1200?200:10)&&screen.y>130&&screen.x+width<lastWidth-(selected&&lastWidth>=768?390:16)&&screen.y<lastHeight-(selected&&lastWidth<768?lastHeight*.52:110);
      if(isCity&&!visible){if(entry.entity){source.entities.remove(entry.entity);entry.entity=null;}continue;}
      if(!entry.entity)entry.entity=makeEntity(city,position);
      entry.entity.show=visible;
      if(visible)visibleCities++;
      const labelVisible=visible&&!!screen&&!boxes.some(box=>Math.abs(box.y-screen.y)<26&&screen.x<box.x+box.w+12&&screen.x+width>box.x-12);
      if(entry.entity.label){(entry.entity.label.text as C.ConstantProperty).setValue(text);(entry.entity.label.show as C.ConstantProperty).setValue(labelVisible);}
      if(labelVisible&&screen){const box={x:screen.x,y:screen.y,w:width};boxes.push(box);labelBoxes.push(box);}
    }}finally{source.entities.resumeEvents();}
    widget.scene.requestRender();
  });
  return {id:isCity?'cities':'capitals',kind,labelBoxes:()=>source.show?labelBoxes:[],setVisible(visible){source.show=visible;dirty=true;widget.scene.requestRender();},dispose(){input.dispose();removeCluster();remove();if(!widget.isDestroyed())widget.dataSources.remove(source,true);}};
}
