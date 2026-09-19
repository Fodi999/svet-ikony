import * as C from '@cesium/engine';
export type AtlasVariant='points'|'billboards'|'pin';
export function atlasVariant():AtlasVariant {
  const variant=process.env.NODE_ENV==='development'&&typeof window!=='undefined'?new URLSearchParams(window.location.search).get('atlasStyle'):null;
  return variant==='points'||variant==='pin'?variant:'billboards';
}
export type AtlasLabelKind='country'|'capital'|'city'|'saint';
/** Rasterize large glyphs and only downscale; never magnify a small glyph atlas. */
export function atlasLabel(kind:AtlasLabelKind,selected=false){
  const country=kind==='country',capital=kind==='capital',saint=kind==='saint';
  const far=country?30000000:saint?(selected?30000000:1200000):capital?9000000:1800000;
  return {font:country?'600 28px Arial':kind==='city'?'500 22px Arial':'600 24px Arial',
    scale:country?.72:kind==='city'?.62:.68,
    fillColor:C.Color.fromCssColorString(selected?'#ffe6a8':country?'#f5f3ec':'#f0f2f3'),
    outlineColor:C.Color.fromCssColorString('#101820'),outlineWidth:country?2.5:2,
    style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(country?0:saint?24:11,saint?-12:0),
    horizontalOrigin:country?C.HorizontalOrigin.CENTER:C.HorizontalOrigin.LEFT,
    distanceDisplayCondition:new C.DistanceDisplayCondition(country?200000:0,far),
    scaleByDistance:new C.NearFarScalar(10000,1,far,.9),
    translucencyByDistance:new C.NearFarScalar(far*.7,1,far,.15),disableDepthTestDistance:0};
}
export function cityRankAtHeight(height:number){return height>1800000?-1:height>400000?3:height>100000?5:height>25000?7:10;}

/** SVG is just an image asset; Cesium BillboardGraphics owns placement, picking and rendering. */
export function saintIcon(selected:boolean,holyPlace=false){
  const stroke=selected?'#ffe4a0':'#e4c480';
  const symbol=holyPlace?'<path d="M19 40V27l13-11 13 11v13M27 40V29h10v11M32 8v9M27 12h10"/>':'<path d="M32 17v28M23 26h18M27 21h10M26 36l12 5"/>';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64"><circle cx="32" cy="31" r="${selected?28:25}" fill="#101a24" stroke="${stroke}" stroke-width="${selected?3:2}"/>${selected?'<circle cx="32" cy="31" r="23" fill="none" stroke="#ad8644" stroke-width="1"/>':''}<g fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${symbol}</g><path d="M28 57l4 5 4-5" fill="${stroke}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export function styleCluster(cluster:{label:C.Label;point:C.PointPrimitive;billboard:C.Billboard}){
  cluster.label.font='600 24px Arial';cluster.label.scale=.6;cluster.label.fillColor=C.Color.fromCssColorString('#fff0c8');
  cluster.label.outlineColor=C.Color.fromCssColorString('#15212b');cluster.label.outlineWidth=2;cluster.label.style=C.LabelStyle.FILL_AND_OUTLINE;
  cluster.label.showBackground=true;cluster.label.backgroundColor=C.Color.fromCssColorString('#15212b').withAlpha(.95);cluster.label.backgroundPadding=new C.Cartesian2(7,5);
  cluster.label.show=true;cluster.billboard.show=false;cluster.point.show=false;
}
