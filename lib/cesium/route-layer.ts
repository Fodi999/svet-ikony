import * as C from '@cesium/engine';

export type RouteLine={coordinates:[number,number][];from:{lat:number;lon:number}};
/** Screen space covered by panels, as fractions of the canvas, which the route must stay clear of. */
export type ScreenInsets={left:number;right:number;top:number;bottom:number};
const NO_INSETS:ScreenInsets={left:0,right:0,top:0,bottom:0};

/** The bounds of a route widened so it does not touch the screen edges (fraction of its own span, at least ~1 km)
 * and extended under any panels, so the route itself lands in the uncovered part of the map. */
export function routeBounds(coordinates:[number,number][],padding=.18,insets:ScreenInsets=NO_INSETS){
  const lons=coordinates.map(([lon])=>lon),lats=coordinates.map(([,lat])=>lat);
  let [west,east,south,north]=[Math.min(...lons),Math.max(...lons),Math.min(...lats),Math.max(...lats)];
  const padLon=Math.max(.01,(east-west)*padding),padLat=Math.max(.01,(north-south)*padding);
  [west,east,south,north]=[west-padLon,east+padLon,south-padLat,north+padLat];
  const visibleX=Math.max(.2,1-insets.left-insets.right),visibleY=Math.max(.2,1-insets.top-insets.bottom);
  const spanLon=(east-west)/visibleX,spanLat=(north-south)/visibleY;
  [west,east,south,north]=[west-spanLon*insets.left,east+spanLon*insets.right,south-spanLat*insets.bottom,north+spanLat*insets.top];
  return {west:Math.max(-180,west),south:Math.max(-90,south),east:Math.min(180,east),north:Math.min(90,north)};
}

/** "How to get there": one road route on the globe, drawn over the terrain, with the visitor's start point. */
export function createRouteLayer(widget:C.CesiumWidget){
  const source=new C.CustomDataSource('Route');
  let disposed=false;
  void widget.dataSources.add(source).then(()=>{if(disposed&&!widget.isDestroyed())widget.dataSources.remove(source,true);});
  return {
    show(route:RouteLine,insets:ScreenInsets=NO_INSETS){
      if(disposed||widget.isDestroyed()||route.coordinates.length<2)return;
      source.entities.removeAll();
      source.entities.add({id:'route:line',polyline:{
        positions:C.Cartesian3.fromDegreesArray(route.coordinates.flat()),width:6,clampToGround:true,
        material:new C.PolylineOutlineMaterialProperty({color:C.Color.fromCssColorString('#f2c76b'),outlineColor:C.Color.fromCssColorString('#2a1d08'),outlineWidth:1.5}),
      }});
      source.entities.add({id:'route:start',position:C.Cartesian3.fromDegrees(route.from.lon,route.from.lat),point:{
        pixelSize:14,color:C.Color.fromCssColorString('#4ea1ff'),outlineColor:C.Color.WHITE,outlineWidth:3,
        heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY,
      }});
      const bounds=routeBounds(route.coordinates,.18,insets);
      widget.camera.cancelFlight();
      widget.camera.flyTo({destination:C.Rectangle.fromDegrees(bounds.west,bounds.south,bounds.east,bounds.north),
        duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1.8});
      widget.scene.requestRender();
    },
    clear(){if(!disposed&&!widget.isDestroyed()){source.entities.removeAll();widget.scene.requestRender();}},
    dispose(){if(disposed)return;disposed=true;if(!widget.isDestroyed())widget.dataSources.remove(source,true);},
  };
}
