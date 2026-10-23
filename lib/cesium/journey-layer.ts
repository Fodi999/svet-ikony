import * as C from '@cesium/engine';
import {interpolate,journeyPosition,journeySchedule,type Journey,type Schedule} from './journeys';
import {markerBillboard,markerFallback,photoMarker} from './photo-marker';
import {setMarkersHidden} from './marker-groups';
import {routeBounds,type ScreenInsets} from './route-layer';

/** Lines float a little above the ellipsoid so the 3D relief does not swallow them; at journey scale it is invisible. */
const LINE_HEIGHT=2500;
const GOLD='#f2c76b';
export type JourneyTick={time:number;total:number;stop:number;moving:boolean;playing:boolean};
type Point={lat:number;lon:number};
const toCartesian=(point:Point,height=0)=>C.Cartesian3.fromDegrees(point.lon,point.lat,height);

/** Points along a leg, so a long sea crossing follows the great circle. */
function legPoints(a:Point,b:Point,until=1){
  const steps=Math.max(2,Math.ceil(16*until));
  return Array.from({length:steps+1},(_,i)=>interpolate(a,b,until*i/steps));
}

/**
 * Animated journey on the globe: the whole route in faint gold (dashed at sea),
 * the stops, the travelled part in bright gold and the traveller's icon moving
 * along it. While playing, the camera follows the icon until the visitor
 * takes the map.
 */
export function createJourneyLayer(widget:C.CesiumWidget,options:{icon:string;locale:()=>'uk'|'ru'|'en';onTick:(tick:JourneyTick)=>void}){
  const source=new C.CustomDataSource('Journey');
  let disposed=false,journey:Journey|null=null,schedule:Schedule|null=null;
  let time=0,playing=false,following=false,frame=0,last=0;
  let current:Point={lat:0,lon:0},currentStop=0,moving=false;
  void widget.dataSources.add(source).then(()=>{if(disposed&&!widget.isDestroyed())widget.dataSources.remove(source,true);});

  let icon:string|HTMLCanvasElement=markerFallback('saint');
  const image=new Image();image.onload=()=>{const bitmap=photoMarker(image);if(bitmap){icon=bitmap;draw();}};image.src=options.icon;

  const travelled=()=>{
    if(!journey)return [];
    const points:Point[]=[journey.stops[0]];
    for(let i=1;i<=currentStop;i++)points.push(...legPoints(journey.stops[i-1],journey.stops[i]).slice(1));
    if(moving&&currentStop+1<journey.stops.length)points.push(...legPoints(journey.stops[currentStop],journey.stops[currentStop+1],
      Math.max(1e-3,positionFraction())).slice(1));
    return points.map(point=>toCartesian(point,LINE_HEIGHT+50));
  };
  let fraction=0;
  const positionFraction=()=>fraction;
  const update=()=>{
    if(!journey||!schedule)return;
    const position=journeyPosition(journey,schedule,time);
    currentStop=Math.max(0,position.stop);moving=position.leg!==null;fraction=position.fraction;
    current=moving?interpolate(journey.stops[position.leg!-1],journey.stops[position.leg!],fraction):journey.stops[position.stop];
  };
  const draw=()=>{
    source.entities.removeAll();
    if(!journey)return;
    const locale=options.locale();
    journey.stops.slice(1).forEach((stop,index)=>{
      const sea=stop.by==='sea';
      source.entities.add({polyline:{positions:legPoints(journey!.stops[index],stop).map(point=>toCartesian(point,LINE_HEIGHT)),width:sea?2.5:3,arcType:C.ArcType.NONE,
        material:sea?new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString(GOLD).withAlpha(.55),dashLength:14}):C.Color.fromCssColorString(GOLD).withAlpha(.35)}});
    });
    const seen=new Set<string>();
    for(const stop of journey.stops){
      if(seen.has(stop.id))continue;seen.add(stop.id);
      source.entities.add({position:toCartesian(stop,LINE_HEIGHT),point:{pixelSize:8,color:C.Color.fromCssColorString('#101a20'),outlineColor:C.Color.fromCssColorString(GOLD),outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},
        label:{text:stop.name[locale],font:'600 26px Georgia, serif',scale:.5,fillColor:C.Color.fromCssColorString('#f5ecd6'),outlineColor:C.Color.fromCssColorString('#0b1218'),outlineWidth:3,
          style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(10,0),horizontalOrigin:C.HorizontalOrigin.LEFT,disableDepthTestDistance:Number.POSITIVE_INFINITY,
          distanceDisplayCondition:new C.DistanceDisplayCondition(0,5_000_000)}});
    }
    source.entities.add({polyline:{positions:new C.CallbackProperty(travelled,false),width:5,arcType:C.ArcType.NONE,
      material:new C.PolylineGlowMaterialProperty({color:C.Color.fromCssColorString(GOLD),glowPower:.18})}});
    source.entities.add({position:new C.CallbackPositionProperty(()=>toCartesian(current,LINE_HEIGHT),false),
      billboard:{...markerBillboard(icon,true),heightReference:C.HeightReference.NONE,disableDepthTestDistance:Number.POSITIVE_INFINITY,scaleByDistance:undefined}});
    widget.scene.requestRender();
  };
  const tick=()=>options.onTick({time,total:schedule?.total??0,stop:currentStop,moving,playing});
  const followCamera=()=>{
    if(!following||widget.isDestroyed())return;
    const range=window.innerWidth<768?2_600_000:1_800_000;
    widget.camera.lookAt(toCartesian(current),new C.HeadingPitchRange(0,C.Math.toRadians(-58),range));
  };
  const release=()=>{if(!widget.isDestroyed()&&!widget.camera.transform.equals(C.Matrix4.IDENTITY))widget.camera.lookAtTransform(C.Matrix4.IDENTITY);};
  const takeOver=()=>{if(following){following=false;release();}};
  for(const type of ['pointerdown','wheel','touchstart'])widget.canvas.addEventListener(type,takeOver,{passive:true});
  const loop=(now:number)=>{
    if(disposed||!playing)return;
    time=Math.min(schedule!.total,time+(now-last)/1000);last=now;
    update();followCamera();widget.scene.requestRender();tick();
    if(time>=schedule!.total){playing=false;following=false;release();tick();return;}
    frame=requestAnimationFrame(loop);
  };
  const stopLoop=()=>{playing=false;if(frame)cancelAnimationFrame(frame);frame=0;};
  return {
    /** Shows a journey from its start and frames the whole route in the uncovered part of the map. */
    select(next:Journey|null,insets?:ScreenInsets){
      stopLoop();following=false;release();
      journey=next;schedule=next?journeySchedule(next):null;time=0;update();draw();
      setMarkersHidden(widget,!!next);
      if(next){
        const bounds=routeBounds(next.stops.map(stop=>[stop.lon,stop.lat] as [number,number]),.12,insets);
        widget.camera.cancelFlight();
        widget.camera.flyTo({destination:C.Rectangle.fromDegrees(bounds.west,bounds.south,bounds.east,bounds.north),duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1.8});
      }
      tick();
    },
    play(){
      if(!schedule||playing)return;
      if(time>=schedule.total)time=0;
      widget.camera.cancelFlight();playing=true;following=true;last=performance.now();update();tick();
      frame=requestAnimationFrame(loop);
    },
    pause(){stopLoop();following=false;release();tick();},
    seek(value:number){if(!schedule)return;time=Math.min(schedule.total,Math.max(0,value));update();followCamera();widget.scene.requestRender();tick();},
    /** Re-labels the stops after a language change. */
    redraw(){draw();},
    dispose(){
      if(disposed)return;disposed=true;stopLoop();release();setMarkersHidden(widget,false);
      for(const type of ['pointerdown','wheel','touchstart'])widget.canvas.removeEventListener(type,takeOver);
      if(!widget.isDestroyed())widget.dataSources.remove(source,true);
    },
  };
}
