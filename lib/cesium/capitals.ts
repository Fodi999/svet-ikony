import * as C from '@cesium/engine';
import type {CapitalCity} from '@/lib/visualizer/capital-cities';
import type {KnowledgeLayer} from './knowledge';

export async function createCesiumCapitals(widget:C.CesiumWidget,options:{locale:()=> 'uk'|'ru'|'en';onSelect:(city:CapitalCity)=>void;signal:AbortSignal;reserved:()=>{x:number;y:number;w:number}[]}):Promise<KnowledgeLayer> {
  const response=await fetch('/data/capitals-10m.json',{signal:options.signal});if(!response.ok)throw new Error('Capital dataset unavailable');
  const {capitals}=await response.json() as {capitals:CapitalCity[]};
  if(capitals.length!==215 || capitals.some(c=>!Number.isFinite(c.lat+c.lon) || !['Admin-0 capital','Admin-0 capital alt'].includes(c.featureClass)))throw new Error('Capital dataset invalid');
  options.signal.throwIfAborted();
  const source=new C.CustomDataSource('CapitalCities');
  const ordered=[...capitals].sort((a,b)=>a.scalerank-b.scalerank || b.population-a.population);
  const entries=ordered.map(city=>({city,entity:source.entities.add({id:`capital:${city.id}`,position:C.Cartesian3.fromDegrees(city.lon,city.lat),properties:{capitalId:city.id},
    point:{pixelSize:5,color:C.Color.fromCssColorString('#f4d793'),outlineColor:C.Color.BLACK,outlineWidth:1,heightReference:C.HeightReference.CLAMP_TO_GROUND},
    label:{show:true,text:city.names[options.locale()] || city.name,font:'13px Arial',pixelOffset:new C.Cartesian2(8,0),horizontalOrigin:C.HorizontalOrigin.LEFT,
      fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,heightReference:C.HeightReference.CLAMP_TO_GROUND}})}));
  await widget.dataSources.add(source);
  if(options.signal.aborted){widget.dataSources.remove(source,true);throw options.signal.reason;}
  const handler=new C.ScreenSpaceEventHandler(widget.canvas);
  handler.setInputAction((movement:{position:C.Cartesian2})=>{const picked=widget.scene.pick(movement.position);const id=picked?.id?.properties?.capitalId?.getValue();const city=id?capitals.find(c=>c.id===id):null;if(city)options.onSelect(city);},C.ScreenSpaceEventType.LEFT_CLICK);
  const normal=new C.Cartesian3(),view=new C.Cartesian3();
  const remove=widget.scene.preRender.addEventListener(()=>{
    const boxes=[...options.reserved()];
    for(const {city,entity} of entries){
      const point=C.Cartesian3.fromDegrees(city.lon,city.lat),screen=C.SceneTransforms.worldToWindowCoordinates(widget.scene,point);
      const text=city.names[options.locale()] || city.name,width=text.length*7+12;
      C.Ellipsoid.WGS84.geodeticSurfaceNormal(point,normal);C.Cartesian3.subtract(widget.camera.positionWC,point,view);
      const visible=C.Cartesian3.dot(normal,view)>0 && !!screen && screen.x>0 && screen.y>12 && screen.x+width<widget.canvas.clientWidth && screen.y<widget.canvas.clientHeight-12 && (widget.camera.positionCartographic.height<5000000 || city.scalerank<=2);
      entity.show=visible;
      if(entity.label){(entity.label.text as C.ConstantProperty).setValue(text);(entity.label.show as C.ConstantProperty | undefined)?.setValue(visible && !!screen && !boxes.some(b=>Math.abs(b.y-screen.y)<24 && screen.x<b.x+b.w+10 && screen.x+width>b.x-10));}
      if(visible && screen && entity.label?.show?.getValue())boxes.push({x:screen.x,y:screen.y,w:width});
    }
  });
  return {id:'capitals',kind:'capital',setVisible(visible){source.show=visible;widget.scene.requestRender();},dispose(){handler.destroy();remove();widget.dataSources.remove(source,true);}};
}
