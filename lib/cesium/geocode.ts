import * as C from '@cesium/engine';

export type GeocodeResult={name:string;destination:C.Rectangle|C.Cartesian3};
/** World place and address search (Cesium ion geocoder); empty for short queries. */
export async function geocodePlaces(widget:C.CesiumWidget,query:string,limit=5):Promise<GeocodeResult[]>{
  const text=query.trim();
  if(text.length<3)return [];
  const results=await new C.IonGeocoderService({scene:widget.scene}).geocode(text,C.GeocodeType.SEARCH);
  const seen=new Set<string>();
  return results.filter(result=>!seen.has(result.displayName)&&seen.add(result.displayName)).slice(0,limit).map(result=>({name:result.displayName,destination:result.destination}));
}
/** Flies to a result: a city or region is framed, a point is approached from 6 km. */
export function flyToResult(widget:C.CesiumWidget,result:GeocodeResult){
  widget.camera.cancelFlight();
  const destination=result.destination instanceof C.Rectangle?result.destination
    :C.Cartesian3.fromRadians(C.Cartographic.fromCartesian(result.destination).longitude,C.Cartographic.fromCartesian(result.destination).latitude,6000);
  widget.camera.flyTo({destination,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:2});
}
