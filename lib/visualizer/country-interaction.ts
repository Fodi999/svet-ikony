import * as THREE from 'three';
import { resolveEventCountry } from './event-country';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneCamera } from './base-scene';
import { getCountryAtLatLng, type Country, type CountryIndex } from './countries';
import { createCountryHighlight, disposeCountryHighlight, type CountryHighlight } from './country-highlight';
import { animateCountryCamera, countryCameraTarget, screenPointToEarthLatLng } from './country-camera';

/** Position measured HTML inside the canvas, including narrow scenes and long translations. */
export function countryTooltipPosition(pointer:{x:number;y:number}, viewport:{width:number;height:number}, size:{width:number;height:number}) {
  const gap = 14, margin = 8;
  const clamp = (value:number, max:number) => Math.max(margin, Math.min(Math.max(margin,max),value));
  const right = pointer.x + gap;
  const left = clamp(right + size.width <= viewport.width - margin ? right : pointer.x - gap - size.width, viewport.width - size.width - margin);
  const above = pointer.y - gap - size.height >= margin;
  const top = clamp(above ? pointer.y - gap - size.height : pointer.y + gap, viewport.height - size.height - margin);
  return {left,top,placement:above?'above':'below',anchor:clamp(pointer.x-left,size.width-margin)};
}

type Context = {
  canvas:HTMLCanvasElement; tooltip:HTMLDivElement; debug:HTMLOutputElement|null; index:CountryIndex;
  frame:THREE.Group; borders:THREE.LineSegments; pins:THREE.Group; controls:OrbitControls;
  camera:()=>SceneCamera; overview:()=>SceneCamera; surface:()=>THREE.Object3D|null;
  locale:()=> 'uk'|'ru'|'en'; hint:()=>string; selected:()=>string|null; onSelect:(code:string)=>void;
  transitioning:(value:boolean)=>void; available:()=>boolean; reducedMotion:()=>boolean;
};
export function createCountryInteraction(ctx:Context){
  let eventCountry:Country|null=null, highlightFrame=0;
  let hovered:Country|null=null,selected:Country|null=null,cancelFlight:(()=>void)|null=null;
  const cache=new Map<string,CountryHighlight>();
  const raycaster=new THREE.Raycaster();
  let hoverFrame=0,lastMove:PointerEvent|null=null,lastDetection=0;
  const pointers=new Set<number>();let down:{x:number;y:number}|null=null,dragged=false,multi=false;
  let lastLatLng:{latitude:number;longitude:number}|null=null,lastPipMs=0;
  let tooltipPointer:{clientX:number;clientY:number}|null=null;
  const tooltipTitle=document.createElement('strong'),tooltipHint=document.createElement('span');
  ctx.tooltip.replaceChildren(tooltipTitle,document.createTextNode('\n'),tooltipHint);
  const radius=()=>Number(ctx.borders.userData.earthRadius);
  function cancelFly(){if(!cancelFlight)return;cancelFlight();cancelFlight=null;ctx.transitioning(false);}
  function obtain(country:Country){
    let layer=cache.get(country.info.code);
    if(!layer){layer=createCountryHighlight(country);layer.group.visible=false;layer.outline.material.opacity=0;cache.set(country.info.code,layer);ctx.frame.add(layer.group);}
    layer.group.position.copy(ctx.borders.position);layer.group.scale.setScalar(radius());
    return layer;
  }
  const fades = new Map<string,{from:number;to:number;start:number}>();
  function showHighlights(){
    for(const country of [hovered,selected,eventCountry]) if(country) obtain(country);
    for(const [code,layer] of cache){
      const manual=code===selected?.info.code, hover=code===hovered?.info.code, event=code===eventCountry?.info.code;
      layer.outline.material.color.setHex(event && !manual && !hover ? 0xc7c9b7 : 0xf1d397);
      const target=manual?1:hover?.9:event?.95:0;
      layer.fill.material.opacity=manual?.23:hover?.16:0;
      layer.anchor.visible=manual||hover;
      if(layer.group.userData.target!==target){
        layer.group.userData.target=target;
        if(ctx.reducedMotion() || (!event && !layer.group.userData.event)){layer.outline.material.opacity=target;fades.delete(code);}
        else fades.set(code,{from:layer.group.visible?layer.outline.material.opacity:0,to:target,start:performance.now()});
      }
      layer.group.userData.event=event;
      layer.group.visible=target>0||fades.has(code);
    }
    if(fades.size&&!highlightFrame) highlightFrame=requestAnimationFrame(fadeHighlights);
    for(const [code,layer] of cache)if(cache.size>6&&!layer.group.visible&&!fades.has(code)){ctx.frame.remove(layer.group);disposeCountryHighlight(layer);cache.delete(code);}
  }
  function fadeHighlights(now:number){
    highlightFrame=0;
    for(const [code,fade] of fades){const layer=cache.get(code)!;const t=Math.min(1,(now-fade.start)/400);layer.outline.material.opacity=fade.from+(fade.to-fade.from)*t*t*(3-2*t);if(t===1){fades.delete(code);layer.group.visible=fade.to>0;}}
    if(fades.size)highlightFrame=requestAnimationFrame(fadeHighlights);
    else showHighlights();
  }
  function setEventLocation(point:{latitude:number|null;longitude:number|null}|null){
    const next=point?.latitude!=null&&point.longitude!=null&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)
      ?resolveEventCountry(ctx.index,point.latitude,point.longitude):null;
    if(next===eventCountry)return;
    eventCountry=next;showHighlights();debug();
  }
  function debug(){if(ctx.debug)ctx.debug.textContent=`Hovered: ${hovered?.info.code??'—'} · Latitude: ${lastLatLng?.latitude.toFixed(4)??'—'} · Longitude: ${lastLatLng?.longitude.toFixed(4)??'—'} · Selected: ${selected?.info.code??'—'} · Event: ${eventCountry?.info.code??'—'} · PIP: ${lastPipMs.toFixed(3)} ms`;}
  function refreshTooltip(){
    if(!hovered||!tooltipPointer||ctx.tooltip.hidden)return;
    const name=hovered.info.name[ctx.locale()],hint=ctx.hint();
    if(tooltipTitle.textContent!==name)tooltipTitle.textContent=name;
    if(tooltipHint.textContent!==hint)tooltipHint.textContent=hint;
    const box=ctx.canvas.getBoundingClientRect();
    const position=countryTooltipPosition({x:tooltipPointer.clientX-box.left,y:tooltipPointer.clientY-box.top},box,{width:ctx.tooltip.offsetWidth,height:ctx.tooltip.offsetHeight});
    ctx.tooltip.style.left=`${position.left}px`;ctx.tooltip.style.top=`${position.top}px`;
    ctx.tooltip.style.setProperty('--country-tooltip-anchor',`${position.anchor}px`);
    ctx.tooltip.dataset.placement=position.placement;
  }
  function setHoveredCountry(country:Country|null,event?:PointerEvent){
    if(hovered!==country){hovered=country;showHighlights();}
    ctx.tooltip.hidden=!country;
    if(event)tooltipPointer=event;
    if(country)refreshTooltip();else tooltipPointer=null;
    ctx.canvas.style.cursor=dragged?'grabbing':country?'pointer':'grab';debug();
  }
  function detect(event:PointerEvent){
    const surface=ctx.surface();if(!surface || !ctx.available())return null;
    const point=screenPointToEarthLatLng(event.clientX,event.clientY,ctx.canvas.getBoundingClientRect(),ctx.camera(),surface,ctx.frame,ctx.borders.position,raycaster);
    lastLatLng=point;
    // Published event pins keep priority over the country beneath them.
    if(raycaster.intersectObjects(ctx.pins.children,false).some(hit=>hit.object.visible))return null;
    const start=performance.now();const country=point?resolveEventCountry(ctx.index,point.latitude,point.longitude):null;lastPipMs=performance.now()-start;return country;
  }
  function flushHover(){
    hoverFrame=0;if(!lastMove || dragged || multi)return;
    const now=performance.now();if(now-lastDetection<25){hoverFrame=requestAnimationFrame(flushHover);return;}
    lastDetection=now;setHoveredCountry(detect(lastMove),lastMove);
  }
  function onMove(event:PointerEvent){
    if(down && Math.hypot(event.clientX-down.x,event.clientY-down.y)>6)dragged=true;
    if(down||dragged||multi){setHoveredCountry(null);ctx.canvas.style.cursor='grabbing';return;}
    if(event.pointerType==='touch')return;
    lastMove=event;
    if(!hoverFrame)hoverFrame=requestAnimationFrame(flushHover);
  }
  function onDown(event:PointerEvent){
    if(event.pointerType!=='touch'&&event.button!==0)return;
    cancelFly();cancelAnimationFrame(hoverFrame);hoverFrame=0;lastMove=null;pointers.add(event.pointerId);if(pointers.size>1)multi=true;
    if(pointers.size===1){down={x:event.clientX,y:event.clientY};dragged=false;multi=false;}
    ctx.tooltip.hidden=true;ctx.canvas.style.cursor='grabbing';
  }
  function flyToCountry(country:Country){
    cancelFly();ctx.transitioning(true);
    cancelFlight=animateCountryCamera(ctx.camera(),ctx.controls,countryCameraTarget(country,ctx.camera(),ctx.frame,ctx.borders.position,radius(),ctx.controls),ctx.reducedMotion()?0:1000,()=>{cancelFlight=null;ctx.transitioning(false);});
  }
  function setSelectedCountry(code:string|null){
    const next=code?ctx.index.byCode.get(code)??null:null;if(next===selected)return;
    selected=next;setHoveredCountry(null);showHighlights();debug();if(next)flyToCountry(next);else cancelFly();
  }
  function onUp(event:PointerEvent){
    const click=!!down&&!dragged&&!multi&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<=6;
    pointers.delete(event.pointerId);
    if(!pointers.size){down=null;dragged=false;multi=false;ctx.canvas.style.cursor='grab';}
    if(click){const country=detect(event);if(country){if(country===selected)flyToCountry(country);ctx.onSelect(country.info.code);}}
  }
  function onCancel(){pointers.clear();down=null;dragged=false;multi=false;setHoveredCountry(null);}
  function onLeave(){lastMove=null;setHoveredCountry(null);}
  function onWheel(){
    cancelFly();setHoveredCountry(null);
    // Re-evaluate after OrbitControls applies zoom; a stationary pointer may
    // now be over a different country or the ocean.
    if(lastMove&&!hoverFrame)hoverFrame=requestAnimationFrame(flushHover);
  }
  ctx.canvas.style.cursor='grab';
  ctx.canvas.addEventListener('pointermove',onMove);
  ctx.canvas.addEventListener('pointerdown',onDown,true);
  ctx.canvas.addEventListener('pointerup',onUp);
  ctx.canvas.addEventListener('pointercancel',onCancel);
  ctx.canvas.addEventListener('pointerleave',onLeave);
  ctx.canvas.addEventListener('wheel',onWheel,{passive:true});
  if(ctx.selected())setSelectedCountry(ctx.selected());
  return {setEventLocation,setHoveredCountry,setSelectedCountry,flyToCountry,cancelFly,refreshTooltip,
    refreshSurface(){showHighlights();if(selected)flyToCountry(selected);},
    reset(){cancelFly();selected=null;eventCountry=null;setHoveredCountry(null);showHighlights();ctx.transitioning(true);const camera=ctx.overview();cancelFlight=animateCountryCamera(ctx.camera(),ctx.controls,{position:camera.position.clone(),center:new THREE.Vector3(),zoom:camera.zoom},ctx.reducedMotion()?0:1000,()=>{cancelFlight=null;ctx.transitioning(false);});},
    dispose(){cancelAnimationFrame(highlightFrame);fades.clear();cancelFly();cancelAnimationFrame(hoverFrame);for(const layer of cache.values()){ctx.frame.remove(layer.group);disposeCountryHighlight(layer);}cache.clear();ctx.tooltip.hidden=true;ctx.canvas.style.cursor='';ctx.canvas.removeEventListener('pointermove',onMove);ctx.canvas.removeEventListener('pointerdown',onDown,true);ctx.canvas.removeEventListener('pointerup',onUp);ctx.canvas.removeEventListener('pointercancel',onCancel);ctx.canvas.removeEventListener('pointerleave',onLeave);ctx.canvas.removeEventListener('wheel',onWheel);}
  };
}
