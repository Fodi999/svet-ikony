import * as C from '@cesium/engine';
import {getCountryAtLatLng,prepareCountryIndex} from '@/lib/visualizer/countries';
import type {CountryData} from '@/lib/visualizer/country-borders';

export async function createCesiumCountries(widget:C.CesiumWidget,options:{locale:()=> 'uk'|'ru'|'en';onSelect:(code:string)=>void;signal:AbortSignal}) {
  const response=await fetch('/data/country-borders-50m.geojson',{signal:options.signal});
  if(!response.ok)throw new Error('Country data unavailable');
  const data=await response.json() as CountryData,index=prepareCountryIndex(data);
  options.signal.throwIfAborted();
  const instances:C.GeometryInstance[]=[];
  for(const country of index.countries)for(const polygon of country.polygons)for(const ring of polygon.rings){
    if(ring.length<2)continue;
    instances.push(new C.GeometryInstance({geometry:new C.GroundPolylineGeometry({positions:C.Cartesian3.fromDegreesArray(ring.flat()),width:1.2}),
      attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#d8cba6').withAlpha(.6))}}));
  }
  const borders=widget.scene.groundPrimitives.add(new C.GroundPolylinePrimitive({geometryInstances:instances,appearance:new C.PolylineColorAppearance(),allowPicking:false}));
  const labels=widget.scene.primitives.add(new C.LabelCollection({scene:widget.scene})) as C.LabelCollection;
  const countryLabels=[...index.countries].sort((a,b)=>b.angularExtent-a.angularExtent).map(country=>({country,label:labels.add({position:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude),
    text:country.info.name[options.locale()],font:'600 18px Arial',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin:C.HorizontalOrigin.CENTER,distanceDisplayCondition:new C.DistanceDisplayCondition(200000,22000000)})}));
  let selected:string|null=null,hovered:string|null=null,highlight:C.GeoJsonDataSource|null=null,generation=0,disposed=false;
  async function highlightCountry(code:string|null){
    const seq=++generation;
    if(highlight){widget.dataSources.remove(highlight,true);highlight=null;}
    const country=code?index.byCode.get(code):null;if(!country){widget.scene.requestRender();return;}
    const source=await C.GeoJsonDataSource.load({type:'FeatureCollection',features:[{...country.feature,type:'Feature'}]},
      {clampToGround:true,fill:C.Color.fromCssColorString('#cfa958').withAlpha(selected===code?.22:.10),stroke:C.Color.TRANSPARENT});
    if(disposed || seq!==generation){source.entities.removeAll();return;}
    for(const entity of source.entities.values)if(entity.polygon)entity.polygon.outline=new C.ConstantProperty(false);
    highlight=source;await widget.dataSources.add(source);widget.scene.requestRender();
  }
  const handler=new C.ScreenSpaceEventHandler(widget.canvas);
  function countryAt(position:C.Cartesian2){
    const ray=widget.camera.getPickRay(position);if(!ray)return null;
    const point=widget.scene.globe.pick(ray,widget.scene);if(!point)return null;
    const cartographic=C.Cartographic.fromCartesian(point);
    return getCountryAtLatLng(index,C.Math.toDegrees(cartographic.latitude),C.Math.toDegrees(cartographic.longitude));
  }
  handler.setInputAction((movement:{endPosition:C.Cartesian2})=>{
    const code=countryAt(movement.endPosition)?.info.code??null;
    if(code===hovered)return;hovered=code;
    if(!selected)void highlightCountry(code).catch(console.warn);
  },C.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((movement:{position:C.Cartesian2})=>{
    const picked=widget.scene.pick(movement.position);
    if(picked?.id?.properties?.capitalId || picked?.id?.properties?.eventId)return;
    const country=countryAt(movement.position);if(country)options.onSelect(country.info.code);
  },C.ScreenSpaceEventType.LEFT_CLICK);
  let labelBoxes:{x:number;y:number;w:number}[]=[];
  const remove=widget.scene.preRender.addEventListener(()=>{
    const occupied:{x:number;y:number;w:number}[]=[];
    const budget=Math.max(3,Math.min(12,Math.floor(widget.canvas.clientWidth*widget.canvas.clientHeight/65000)));
    for(const {country,label} of countryLabels){
      label.text=country.info.name[options.locale()];
      const point=C.SceneTransforms.worldToWindowCoordinates(widget.scene,label.position);
      const width=label.text.length*10;
      const front=C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(label.position),C.Cartesian3.subtract(widget.camera.positionWC,label.position,new C.Cartesian3()))>0;
      label.show=widget.camera.positionCartographic.height>=200000 && front && !!point && country.angularExtent>2 && occupied.length<budget && point.x>width/2 && point.x+width/2<widget.canvas.clientWidth && point.y>24 && point.y<widget.canvas.clientHeight-24 && !occupied.some(p=>Math.abs(p.x-point.x)<(p.w+width)/2+24 && Math.abs(p.y-point.y)<50);
      if(label.show && point)occupied.push({x:point.x,y:point.y,w:width});
    }
    labelBoxes=occupied.map(b=>({...b,x:b.x-b.w/2}));
  });
  return {
    labelBoxes:()=>labelBoxes,
    setBorders(value:boolean){borders.show=value;widget.scene.requestRender();},
    select(code:string|null,fly=true){selected=code;void highlightCountry(code).catch(console.warn);const country=code?index.byCode.get(code):null;
      if(country && fly)widget.camera.flyTo({destination:C.Cartesian3.fromDegrees(country.point.longitude,country.point.latitude,Math.max(100000,country.angularExtent*130000))});},
    dispose(){disposed=true;generation++;handler.destroy();remove();if(highlight)widget.dataSources.remove(highlight,true);widget.scene.groundPrimitives.remove(borders);widget.scene.primitives.remove(labels);}
  };
}
