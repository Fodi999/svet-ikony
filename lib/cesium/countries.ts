import * as C from '@cesium/engine';
import {markerAnchors} from './marker-groups';
import {createLayerHandler,interactiveHit} from './handlers';
import {getCountryAtLatLng,prepareCountryIndex} from '@/lib/visualizer/countries';
import type {CountryData} from '@/lib/visualizer/country-borders';
import {atlasLabel} from './atlas-style';

export async function createCesiumCountries(widget:C.CesiumWidget,options:{locale:()=> 'uk'|'ru'|'en';onSelect:(code:string)=>void;signal:AbortSignal}) {
  const response=await fetch('/data/country-borders-50m.geojson',{signal:options.signal});
  if(!response.ok)throw new Error('Country data unavailable');
  const data=await response.json() as CountryData,index=prepareCountryIndex(data);
  options.signal.throwIfAborted();
  const instances:C.GeometryInstance[]=[],rings:C.Cartesian3[][]=[];
  const borderColor=C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#d9dce0').withAlpha(.48));
  for(const country of index.countries)for(const polygon of country.polygons)for(const ring of polygon.rings){
    if(ring.length<2)continue;
    const positions=C.Cartesian3.fromDegreesArray(ring.flat());rings.push(positions);
    instances.push(new C.GeometryInstance({geometry:new C.GroundPolylineGeometry({positions,width:1}),attributes:{color:borderColor}}));
  }
  const borders=widget.scene.groundPrimitives.add(new C.GroundPolylinePrimitive({geometryInstances:instances,appearance:new C.PolylineColorAppearance(),allowPicking:false}));
  // On the flat map ground polylines are drawn after billboards and cut through every pin; there is no terrain
  // to clamp to, so plain polylines (built on first use) stand in for them.
  let flatBorders:C.Primitive|undefined;
  const flatMap=()=>widget.scene.mode===C.SceneMode.SCENE2D||widget.scene.mode===C.SceneMode.COLUMBUS_VIEW;
  const showBorders=(value:boolean)=>{
    const flat=flatMap();
    borders.show=value&&!flat;
    if(flat&&value&&!flatBorders)flatBorders=widget.scene.primitives.add(new C.Primitive({allowPicking:false,asynchronous:true,appearance:new C.PolylineColorAppearance(),
      geometryInstances:rings.map(positions=>new C.GeometryInstance({geometry:new C.PolylineGeometry({positions,width:1,arcType:C.ArcType.RHUMB}),attributes:{color:borderColor}}))})) as C.Primitive;
    if(flatBorders)flatBorders.show=value&&flat;
  };
  const labels=widget.scene.primitives.add(new C.LabelCollection({scene:widget.scene})) as C.LabelCollection;
  const countryLabels=[...index.countries].sort((a,b)=>b.angularExtent-a.angularExtent).map(country=>({country,label:labels.add({position:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude),
    text:country.info.name[options.locale()],...atlasLabel('country'),disableDepthTestDistance:Number.POSITIVE_INFINITY})}));
  let selected:string|null=null,hovered:string|null=null,highlight:C.GeoJsonDataSource|null=null,generation=0,disposed=false,enabled=true;
  let coast:C.GeoJsonDataSource|null=null,bordersEnabled=true;
  if(process.env.NODE_ENV==='development'){
    void fetch('/data/bosphorus-swbd.geojson',{signal:options.signal}).then(response=>{
      if(!response.ok)throw new Error('SWBD unavailable');return response.json();
    }).then(data=>C.GeoJsonDataSource.load(data,{clampToGround:true})).then(async source=>{
      if(disposed)return;
      source.name='Bosphorus SWBD (2000)';source.show=false;
      for(const entity of source.entities.values)if(entity.polyline){
        entity.polyline.width=new C.ConstantProperty(4);
        entity.polyline.material=new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#f1d495'),outlineColor:C.Color.fromCssColorString('#252a28'),outlineWidth:1});
      }
      coast=source;await widget.dataSources.add(source);
      if(disposed&&!widget.isDestroyed())widget.dataSources.remove(source,true);
      if(!widget.isDestroyed())widget.scene.requestRender();
    }).catch(error=>{if(!options.signal.aborted)console.warn('[SWBD]',error);});
  }
  async function highlightCountry(code:string|null){
    const seq=++generation;
    if(highlight){widget.dataSources.remove(highlight,true);highlight=null;}
    const country=code?index.byCode.get(code):null;if(!country){widget.scene.requestRender();return;}
    const source=await C.GeoJsonDataSource.load({type:'FeatureCollection',features:[{...country.feature,type:'Feature'}]},
      {clampToGround:true,fill:C.Color.fromCssColorString('#cfa958').withAlpha(selected===code?.07:.025),stroke:C.Color.TRANSPARENT});
    if(disposed || seq!==generation){source.entities.removeAll();return;}
    for(const entity of source.entities.values)if(entity.polygon)entity.polygon.outline=new C.ConstantProperty(false);
    if(selected===code)for(const polygon of country.polygons)for(const ring of polygon.rings){
      const positions=C.Cartesian3.fromDegreesArray(ring.flat());
      source.entities.add({polyline:{positions,width:5,clampToGround:true,material:new C.PolylineGlowMaterialProperty({color:C.Color.fromCssColorString('#e8c579').withAlpha(.7),glowPower:.12,taperPower:1})}});
      source.entities.add({polyline:{positions,width:2.5,clampToGround:true,material:new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#f1d495'),outlineColor:C.Color.fromCssColorString('#252a28'),outlineWidth:.7})}});
    }
    highlight=source;await widget.dataSources.add(source);widget.scene.requestRender();
  }
  const input=createLayerHandler(widget),handler=input.handler;
  let hoverTimer:ReturnType<typeof setTimeout>|undefined;
  let hoverPosition:C.Cartesian2|undefined;
  const clearHover=()=>{clearTimeout(hoverTimer);hoverTimer=undefined;hoverPosition=undefined;};
  const leave=()=>{clearHover();hovered=null;if(!selected&&!disposed)void highlightCountry(null).catch(console.warn);};
  widget.canvas.addEventListener('pointerleave',leave);
  function countryAt(position:C.Cartesian2){
    const ray=widget.camera.getPickRay(position);if(!ray)return null;
    const point=widget.scene.globe.pick(ray,widget.scene);if(!point)return null;
    const cartographic=C.Cartographic.fromCartesian(point);
    return getCountryAtLatLng(index,C.Math.toDegrees(cartographic.latitude),C.Math.toDegrees(cartographic.longitude));
  }
  handler.setInputAction((movement:{endPosition:C.Cartesian2})=>{
    if(!enabled||selected)return;
    hoverPosition=C.Cartesian2.clone(movement.endPosition,hoverPosition);
    if(hoverTimer!==undefined)return;
    hoverTimer=setTimeout(()=>{
      hoverTimer=undefined;
      if(disposed||!enabled||selected||!hoverPosition)return;
      const code=countryAt(hoverPosition)?.info.code??null;
      if(code===hovered)return;hovered=code;
      void highlightCountry(code).catch(console.warn);
    },80);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((movement:{position:C.Cartesian2})=>{
    if(!enabled)return;
    // Any pin, cluster, hex cell, capital, city or event under the pointer
    // wins over the country polygon underneath it.
    if(interactiveHit(widget,movement.position))return;
    /* Sacred Place markers/territory (properties.sacredPlaceId) and Sacred
       Plot hexes (a plain {sacredPlotId} pick id, see lib/cesium/sacred-plots-layer.ts
       -- not an Entity, so no .properties) must win over the country polygon
       underneath them, same as the existing capital/city/event/entity guards below. */
    const country=countryAt(movement.position);if(country)options.onSelect(country.info.code);
  },C.ScreenSpaceEventType.LEFT_CLICK);
  let labelBoxes:{x:number;y:number;w:number}[]=[];
  const remove=widget.scene.preRender.addEventListener(()=>{
    const occupied:{x:number;y:number;w:number}[]=[];
    const altitude=widget.camera.positionCartographic.height;
    const camera=widget.camera.positionCartographic,lon=C.Math.toDegrees(camera.longitude),lat=C.Math.toDegrees(camera.latitude);
    const localCoast=!!coast&&altitude<90000&&lon>28.65&&lon<29.3&&lat>40.9&&lat<41.25;
    if(coast)coast.show=bordersEnabled&&localCoast;
    showBorders(bordersEnabled&&!localCoast);
    if(highlight)highlight.show=enabled&&!localCoast;
    const selectedCard=!!widget.container.parentElement?.querySelector('[data-selected="true"]'),canvasWidth=widget.canvas.clientWidth,canvasHeight=widget.canvas.clientHeight;
    const budget=Math.max(3,Math.min(altitude>8000000?10:18,Math.floor(widget.canvas.clientWidth*widget.canvas.clientHeight/55000)));
    // Pins stand on their anchor (bottom origin) and reach ~56px up; a country caption under a pin is unreadable.
    const pins=markerAnchors(widget).filter(position=>C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(position),C.Cartesian3.subtract(widget.camera.positionWC,position,new C.Cartesian3()))>0)
      .map(position=>C.SceneTransforms.worldToWindowCoordinates(widget.scene,position)).filter((point):point is C.Cartesian2=>!!point);
    for(const {country,label} of countryLabels){
      label.text=country.info.name[options.locale()];
      const point=C.SceneTransforms.worldToWindowCoordinates(widget.scene,label.position);
      const width=label.text.length*10;
      // Skip captions close to the limb: there they hang half outside the globe's silhouette.
      const front=C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(label.position),C.Cartesian3.normalize(C.Cartesian3.subtract(widget.camera.positionWC,label.position,new C.Cartesian3()),new C.Cartesian3()))>.3;
      label.show=enabled && altitude>=200000 && front && !!point && country.angularExtent>(altitude>8000000?5:altitude>2000000?1:.15) && occupied.length<budget && point.x-width/2>(canvasWidth>=1200?200:12) && point.x+width/2<canvasWidth-(selectedCard&&canvasWidth>=768?390:16) && point.y>130 && point.y<canvasHeight-(selectedCard&&canvasWidth<768?canvasHeight*.52:110) && !occupied.some(p=>Math.abs(p.x-point.x)<(p.w+width)/2+24 && Math.abs(p.y-point.y)<50) && !pins.some(p=>Math.abs(p.x-point.x)<width/2+30 && point.y>p.y-66 && point.y<p.y+16);
      if(label.show && point)occupied.push({x:point.x,y:point.y,w:width});
    }
    labelBoxes=occupied.map(b=>({...b,x:b.x-b.w/2}));
  });
  return {
    labelBoxes:()=>labelBoxes,
    setVisible(value:boolean){enabled=value;if(!value)void highlightCountry(null);widget.scene.requestRender();},
    setBorders(value:boolean){bordersEnabled=value;showBorders(value);widget.scene.requestRender();},
    select(code:string|null,fly=true){selected=code;void highlightCountry(code).catch(console.warn);const country=code?index.byCode.get(code):null;
      if(country && fly)widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude,Math.max(100000,country.angularExtent*130000))});},
    dispose(){disposed=true;generation++;clearHover();widget.canvas.removeEventListener('pointerleave',leave);input.dispose();remove();if(widget.isDestroyed())return;if(coast)widget.dataSources.remove(coast,true);if(highlight)widget.dataSources.remove(highlight,true);widget.scene.groundPrimitives.remove(borders);if(flatBorders)widget.scene.primitives.remove(flatBorders);widget.scene.primitives.remove(labels);}
  };
}
