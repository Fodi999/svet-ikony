import * as C from '@cesium/engine';
import {glyphGroup,type OrthodoxGlyph} from '@/lib/icons/orthodox';

export const MARKER_SIZE=64;
/** Full size up close; about 60% at whole-Earth distance so a zoomed-out
 * globe stays readable instead of being covered by pins. */
export const MARKER_FAR_SCALE=.6;
export const markerScale=()=>new C.NearFarScalar(250000,1,20000000,MARKER_FAR_SCALE);
export function verifiedMarkerImage(url:string|null|undefined,verified:boolean){
  return verified&&url&&(/^(https:\/\/|\/[^/])/.test(url))?url:undefined;
}
/** Which glyph of the site's icon set (lib/icons/orthodox.ts) a marker type shows. */
export function markerGlyph(type:string):OrthodoxGlyph{
  if(['church','cathedral','major_center'].includes(type))return 'church';
  if(type==='monastery')return 'monastery';
  if(['shrine','relic','relic_location','pilgrimage','pilgrimage_place','burial_place'].includes(type))return 'lampada';
  if(['saint','saint_place','birthplace','martyrdom_place'].includes(type))return 'saint';
  if(type==='icon')return 'icon';
  if(type==='feast')return 'feast';
  if(['event','historical_region','council'].includes(type))return 'scroll';
  return 'cross';
}
export function markerFallback(type:string,selected=false){
  const gold=selected?'#ffe5a0':'#e9c479';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="216" viewBox="0 0 64 72"><path d="M25 57L32 70L39 57" fill="${gold}"/><circle cx="32" cy="31" r="28" fill="#101a20" stroke="${gold}" stroke-width="2"/>${glyphGroup(markerGlyph(type),14,13,36,gold,1.45)}</svg>`);
}
export function photoMarker(image:HTMLImageElement,selected=false){
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=216;
  const ctx=canvas.getContext('2d');if(!ctx)return undefined;
  ctx.scale(3,3);ctx.fillStyle=selected?'#ffe5a0':'#e9c479';
  ctx.beginPath();ctx.moveTo(25,57);ctx.lineTo(32,70);ctx.lineTo(39,57);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(32,31,28,0,Math.PI*2);ctx.clip();
  const side=Math.min(image.naturalWidth,image.naturalHeight);
  ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,4,3,56,56);ctx.restore();
  ctx.beginPath();ctx.arc(32,31,28,0,Math.PI*2);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=selected?2.5:2;ctx.stroke();return canvas;
}
export function markerBillboard(image:string|HTMLCanvasElement,selected=false):C.BillboardGraphics.ConstructorOptions{
  return {image,width:MARKER_SIZE*(selected?1.08:1),height:MARKER_SIZE*1.125*(selected?1.08:1),
    verticalOrigin:C.VerticalOrigin.BOTTOM,heightReference:C.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance:0,scaleByDistance:markerScale()};
}
