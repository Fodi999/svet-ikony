import * as C from '@cesium/engine';

/** NASA VIIRS Black Marble (public domain), straight from NASA GIBS: no key, CORS open, tiles to zoom 8. */
export const NIGHT_LIGHTS_URL='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
const layers=new WeakMap<C.CesiumWidget,C.ImageryLayer>();

/** City lights on the night side of the globe; only visible while sun lighting is on (dayAlpha 0). */
export function setNightLights(widget:C.CesiumWidget,enabled:boolean){
  let layer=layers.get(widget);
  if(enabled&&!layer){
    layer=widget.scene.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({url:NIGHT_LIGHTS_URL,maximumLevel:8,
      credit:'NASA Earth Observatory / VIIRS Black Marble'}));
    layer.dayAlpha=0;layer.nightAlpha=1;
    layers.set(widget,layer);
  }
  if(layer){
    // Keep the lights above whichever basemap was added later.
    if(enabled)widget.scene.imageryLayers.raiseToTop(layer);
    layer.show=enabled;
  }
}
