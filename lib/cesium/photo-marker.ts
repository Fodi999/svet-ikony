import * as C from '@cesium/engine';

export const MARKER_SIZE=64;
export const markerScale=()=>new C.NearFarScalar(1000,1,30000000,.875);
export function verifiedMarkerImage(url:string|null|undefined,verified:boolean){
  return verified&&url&&(/^(https:\/\/|\/[^/])/.test(url))?url:undefined;
}
export function markerFallback(type:string,selected=false){
  const gold=selected?'#ffe5a0':'#e9c479';
  const path=['church','cathedral','monastery','major_center'].includes(type)
    ?'M18 43V26l14-10 14 10v17H18M28 43V32h8v11M32 10v10M28 14h8'
    :['saint','saint_place','icon'].includes(type)
    ?'M21 44v-4a11 11 0 0 1 22 0v4M38 28a6 6 0 1 0-12 0 6 6 0 0 0 12 0M43 25a11 11 0 1 0-22 0'
    :'M32 16v28M22 27h20M25 20h14';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="216" viewBox="0 0 64 72"><path d="M25 57L32 70L39 57" fill="${gold}"/><circle cx="32" cy="31" r="28" fill="#101a20" stroke="${gold}" stroke-width="2"/><path d="${path}" fill="none" stroke="${gold}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
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
