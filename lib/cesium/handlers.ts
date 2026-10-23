import {ScreenSpaceEventHandler,type CesiumWidget} from '@cesium/engine';
import * as C from '@cesium/engine';

/**
 * Shared click/tap resolution for every globe layer.
 *
 * Before: each layer (countries, capitals, cities, calendar markers, sacred
 * places, events) ran its own scene.pick on the same click, and a
 * screen-distance scan (the old pickCalendarMarker) also matched entities
 * hidden inside a cluster -- so clicking a cluster over Ukraine could open
 * Alexandria, and a click on a pin could also select the country under it.
 *
 * Now every layer asks for the SAME topmost interactive hit and acts only
 * when that hit belongs to it. The hit is searched in a small square around
 * the pointer (bigger for touch), so a trackpad tap that lands a few pixels
 * off a pin, or a finger tap, still selects it.
 */
const INTERACTIVE_KEYS=['calendarEntityId','sacredPlaceId','eventId','capitalId','cityId'] as const;
export type GlobeHit=C.Entity|C.Entity[]|{sacredPlotId:string};

export function pickSize(){
  if(typeof window==='undefined'||!window.matchMedia)return 24;
  return window.matchMedia('(pointer: coarse)').matches?40:24;
}
function hasKey(entity:C.Entity){
  const properties=entity.properties;
  return !!properties&&INTERACTIVE_KEYS.some(key=>properties.hasProperty(key));
}
export function isInteractive(id:unknown):id is GlobeHit{
  if(Array.isArray(id))return id.length>0&&id.every(item=>item instanceof C.Entity);
  if(id instanceof C.Entity)return hasKey(id);
  return !!id&&typeof id==='object'&&typeof (id as {sacredPlotId?:unknown}).sacredPlotId==='string';
}
/** Pins, clusters and labels outrank ground footprints (selection hex, territory). */
function isPointLike(id:GlobeHit){
  return Array.isArray(id)||(id instanceof C.Entity&&!!(id.billboard||id.point||id.model||id.label));
}
const cache=new WeakMap<CesiumWidget,{x:number;y:number;at:number;hit:GlobeHit|undefined}>();
export function interactiveHit(widget:CesiumWidget,position:C.Cartesian2):GlobeHit|undefined{
  const now=typeof performance!=='undefined'?performance.now():Date.now();
  const cached=cache.get(widget);
  if(cached&&Math.abs(cached.x-position.x)<.5&&Math.abs(cached.y-position.y)<.5&&now-cached.at<150)return cached.hit;
  const size=pickSize();
  let ids:GlobeHit[]=[];
  try{ids=widget.scene.drillPick(position,8,size,size).map(hit=>hit?.id).filter(isInteractive);}
  catch{const id=widget.scene.pick(position,size,size)?.id;ids=isInteractive(id)?[id]:[];}
  const hit=ids.find(isPointLike)??ids[0];
  cache.set(widget,{x:position.x,y:position.y,at:now,hit});
  return hit;
}
/** Back-compat helper: the calendar-entity pin under the pointer, if it is the top hit. */
export function pickCalendarMarker(widget:CesiumWidget,position:C.Cartesian2){
  const hit=interactiveHit(widget,position);
  return hit instanceof C.Entity&&hit.properties?.hasProperty('calendarEntityId')?hit:undefined;
}
export function entityValue(hit:GlobeHit|undefined,key:string,time?:C.JulianDate):unknown{
  return hit instanceof C.Entity?hit.properties?.[key]?.getValue(time):undefined;
}

const counts=new WeakMap<CesiumWidget,number>();
export function layerHandlerCount(widget:CesiumWidget){return counts.get(widget)??0;}
/** Layer-owned input handlers are counted independently of Cesium's camera controls. */
export function createLayerHandler(widget:CesiumWidget){
  const handler=new ScreenSpaceEventHandler(widget.canvas);let disposed=false;
  counts.set(widget,layerHandlerCount(widget)+1);
  return {handler,dispose(){if(disposed)return;disposed=true;handler.destroy();counts.set(widget,layerHandlerCount(widget)-1);}};
}

/** Extra hover tests for things that are not GPU-pickable (the Sacred
 * Plots raster grid resolves hexes with exact ground math instead). */
const hoverResolvers=new WeakMap<CesiumWidget,Set<(position:C.Cartesian2)=>string|null>>();
export function registerHoverResolver(widget:CesiumWidget,resolver:(position:C.Cartesian2)=>string|null){
  const set=hoverResolvers.get(widget)??new Set();set.add(resolver);hoverResolvers.set(widget,set);
  return ()=>{set.delete(resolver);};
}

/** One pointer-cursor controller for the whole globe: shows a hand over
 * anything clickable (pins, clusters, hex cells) and a tooltip with its
 * name. Replaces per-layer cursor juggling that fought over the canvas. */
export function installPointerFeedback(widget:CesiumWidget){
  const canvas=widget.canvas;
  let timer:ReturnType<typeof setTimeout>|undefined,last:{x:number;y:number}|null=null,disposed=false;
  const reset=()=>{canvas.style.cursor='';canvas.removeAttribute('title');};
  const probe=()=>{
    timer=undefined;
    if(disposed||widget.isDestroyed()||!last)return;
    const size=pickSize(),position=new C.Cartesian2(last.x,last.y);
    const id=widget.scene.pick(position,size,size)?.id;
    let extra:string|null=null;
    if(!isInteractive(id))for(const resolve of hoverResolvers.get(widget)??[]){extra=resolve(position);if(extra)break;}
    if(extra){canvas.style.cursor='pointer';canvas.title=extra;}
    else if(isInteractive(id)){
      canvas.style.cursor='pointer';
      const name=Array.isArray(id)?`${id.length}`:id instanceof C.Entity?id.name:undefined;
      if(name)canvas.title=name;else canvas.removeAttribute('title');
    }else reset();
  };
  const move=(event:PointerEvent)=>{
    if(event.pointerType==='touch'||event.buttons)return;
    const rect=canvas.getBoundingClientRect();
    last={x:event.clientX-rect.left,y:event.clientY-rect.top};
    if(!timer)timer=setTimeout(probe,90);
  };
  const leave=()=>{last=null;if(timer)clearTimeout(timer);timer=undefined;reset();};
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerleave',leave);
  return ()=>{disposed=true;leave();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);};
}
