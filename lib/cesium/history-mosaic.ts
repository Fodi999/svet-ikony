import * as C from '@cesium/engine';

/** Display footprint only: this radius is not the council's historical extent. */
export const MOSAIC_MARKER_RADIUS_METERS=700;
export function isNicaeaPilot(event:{slug:string;status:string;latitude:number|null;longitude:number|null}|null) {
  return !!event&&event.slug==='pershyi-vselenskyi-sobor'&&event.status==='published'&&
    event.latitude!==null&&event.longitude!==null&&Number.isFinite(event.latitude)&&Number.isFinite(event.longitude)&&
    Math.abs(event.latitude)<=90&&Math.abs(event.longitude)<=180;
}
export const mosaicNotice={
  ru:'Место события, расположение приблизительное. Сота — условный маркер города, не историческая граница. Точная площадка собора и источники требуют проверки.',
  uk:'Місце події, розташування приблизне. Комірка — умовний маркер міста, не історичний кордон. Точне місце собору та джерела потребують перевірки.',
  en:'Approximate event location. The hex is a city marker, not a historical boundary. The exact council site and sources need verification.',
};
export function mosaicHex(longitude:number,latitude:number,radius=MOSAIC_MARKER_RADIUS_METERS) {
  const frame=C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(longitude,latitude));
  const ring=Array.from({length:6},(_,i)=>{
    const angle=i*Math.PI/3;
    const point=C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(Math.cos(angle)*radius,Math.sin(angle)*radius,0),new C.Cartesian3());
    return C.Ellipsoid.WGS84.scaleToGeodeticSurface(point,new C.Cartesian3())!;
  });
  return [...ring,ring[0]];
}
