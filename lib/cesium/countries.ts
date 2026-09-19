import * as C from '@cesium/engine';
import {createLayerHandler} from './handlers';
import {getCountryAtLatLng,prepareCountryIndex} from '@/lib/visualizer/countries';
import type {CountryData} from '@/lib/visualizer/country-borders';
import {atlasLabel} from './atlas-style';

export async function createCesiumCountries(widget:C.CesiumWidget,options:{locale:()=> 'uk'|'ru'|'en';onSelect:(code:string)=>void;signal:AbortSignal}) {
  const response=await fetch('/data/country-borders-50m.geojson',{signal:options.signal});
  if(!response.ok)throw new Error('Country data unavailable');
  const data=await response.json() as CountryData,index=prepareCountryIndex(data);
  options.signal.throwIfAborted();
  const instances:C.GeometryInstance[]=[];
  for(const country of index.countries)for(const polygon of country.polygons)for(const ring of polygon.rings){
    if(ring.length<2)continue;
    instances.push(new C.GeometryInstance({geometry:new C.GroundPolylineGeometry({positions:C.Cartesian3.fromDegreesArray(ring.flat()),width:1}),
      attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#d9dce0').withAlpha(.48))}}));
  }
  const borders=widget.scene.groundPrimitives.add(new C.GroundPolylinePrimitive({geometryInstances:instances,appearance:new C.PolylineColorAppearance(),allowPicking:false}));
  const labels=widget.scene.primitives.add(new C.LabelCollection({scene:widget.scene})) as C.LabelCollection;
  const countryLabels=[...index.countries].sort((a,b)=>b.angularExtent-a.angularExtent).map(country=>({country,label:labels.add({position:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude),
    text:country.info.name[options.locale()],...atlasLabel('country'),disableDepthTestDistance:Number.POSITIVE_INFINITY})}));
  let selected:string|null=null,hovered:string|null=null,highlight:C.GeoJsonDataSource|null=null,generation=0,disposed=false,enabled=true;
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
  function countryAt(position:C.Cartesian2){
    const ray=widget.camera.getPickRay(position);if(!ray)return null;
    const point=widget.scene.globe.pick(ray,widget.scene);if(!point)return null;
    const cartographic=C.Cartographic.fromCartesian(point);
    return getCountryAtLatLng(index,C.Math.toDegrees(cartographic.latitude),C.Math.toDegrees(cartographic.longitude));
  }
  handler.setInputAction((movement:{endPosition:C.Cartesian2})=>{
    if(!enabled)return;
    const code=countryAt(movement.endPosition)?.info.code??null;
    if(code===hovered)return;hovered=code;
    if(!selected)void highlightCountry(code).catch(console.warn);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((movement:{position:C.Cartesian2})=>{
    if(!enabled)return;
    const picked=widget.scene.pick(movement.position);
    if(Array.isArray(picked?.id))return;
    if(picked?.id?.properties?.capitalId || picked?.id?.properties?.cityId || picked?.id?.properties?.eventId || picked?.id?.properties?.calendarEntityId)return;
    const country=countryAt(movement.position);if(country)options.onSelect(country.info.code);
  },C.ScreenSpaceEventType.LEFT_CLICK);
  let labelBoxes:{x:number;y:number;w:number}[]=[];
  const remove=widget.scene.preRender.addEventListener(()=>{
    const occupied:{x:number;y:number;w:number}[]=[];
    const altitude=widget.camera.positionCartographic.height;
    const selectedCard=!!widget.container.parentElement?.querySelector('[data-selected="true"]'),canvasWidth=widget.canvas.clientWidth,canvasHeight=widget.canvas.clientHeight;
    const budget=Math.max(3,Math.min(altitude>8000000?10:18,Math.floor(widget.canvas.clientWidth*widget.canvas.clientHeight/55000)));
    for(const {country,label} of countryLabels){
      label.text=country.info.name[options.locale()];
      const point=C.SceneTransforms.worldToWindowCoordinates(widget.scene,label.position);
      const width=label.text.length*10;
      const front=C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(label.position),C.Cartesian3.subtract(widget.camera.positionWC,label.position,new C.Cartesian3()))>0;
      label.show=enabled && altitude>=200000 && front && !!point && country.angularExtent>(altitude>8000000?5:altitude>2000000?1:.15) && occupied.length<budget && point.x-width/2>(canvasWidth>=1200?200:12) && point.x+width/2<canvasWidth-(selectedCard&&canvasWidth>=768?390:16) && point.y>130 && point.y<canvasHeight-(selectedCard&&canvasWidth<768?canvasHeight*.52:110) && !occupied.some(p=>Math.abs(p.x-point.x)<(p.w+width)/2+24 && Math.abs(p.y-point.y)<50);
      if(label.show && point)occupied.push({x:point.x,y:point.y,w:width});
    }
    labelBoxes=occupied.map(b=>({...b,x:b.x-b.w/2}));
  });
  return {
    labelBoxes:()=>labelBoxes,
    setVisible(value:boolean){enabled=value;if(!value)void highlightCountry(null);widget.scene.requestRender();},
    setBorders(value:boolean){borders.show=value;widget.scene.requestRender();},
    select(code:string|null,fly=true){selected=code;void highlightCountry(code).catch(console.warn);const country=code?index.byCode.get(code):null;
      if(country && fly)widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude,Math.max(100000,country.angularExtent*130000))});},
    dispose(){disposed=true;generation++;input.dispose();remove();if(widget.isDestroyed())return;if(highlight)widget.dataSources.remove(highlight,true);widget.scene.groundPrimitives.remove(borders);widget.scene.primitives.remove(labels);}
  };
}
