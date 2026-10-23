import * as C from '@cesium/engine';
import {createLayerHandler,interactiveHit} from './handlers';
import {createMarkerDeclutter,type ClusterGraphics} from './marker-declutter';

/**
 * One clustered CustomDataSource per widget, shared by every globe marker
 * layer (the day's saints, Christian places, Sacred Places).
 *
 * Clustering per data source let three separately clustered sources draw
 * their pins and clusters on top of each other; one source is laid out by
 * marker-declutter.ts. Each layer now owns a MarkerGroup inside the shared source: a
 * parent Entity (kept outside the collection) whose `show` hides the layer's
 * children, and whose membership replaces `source.entities.contains`.
 * Cluster clicks are resolved once here, because a cluster may now mix
 * entities of several layers.
 */
export type {ClusterGraphics};
type GroupOptions={
  onError:(error:unknown)=>void;
  /** Opens one record from a cluster whose members share a position and cannot be separated by zooming. */
  open?:(entity:C.Entity)=>void;
  /** Restyles a cluster that contains this group's entities (photo, active selection). */
  decorate?:(entities:C.Entity[],cluster:ClusterGraphics)=>void;
};
type Shared={source:C.CustomDataSource;groups:Set<MarkerGroup>;paused:Set<MarkerGroup>;invalidate:()=>void;anchors:()=>C.Cartesian3[];dispose:()=>void};
export type MarkerGroup=ReturnType<typeof createMarkerGroup>;
const shared=new WeakMap<C.CesiumWidget,Shared>();

function sharedSource(widget:C.CesiumWidget,onError:(error:unknown)=>void):Shared{
  const existing=shared.get(widget);if(existing)return existing;
  const source=new C.CustomDataSource('GlobeMarkers');
  const groups=new Set<MarkerGroup>(),paused=new Set<MarkerGroup>();
  // Test doubles of the widget have no primitive collection and simply show every pin.
  const declutter=widget.scene.primitives?createMarkerDeclutter(widget,source,{
    paused:()=>paused.size>0,
    decorate:(entities,cluster)=>{for(const group of groups)if(entities.some(group.contains))group.decorate?.(entities,cluster);},
  }):undefined;
  const input=createLayerHandler(widget);
  input.handler.setInputAction((event:{position:C.Cartesian2})=>{
    const picked=interactiveHit(widget,event.position);
    if(!Array.isArray(picked)||!picked.every(entity=>source.entities.contains(entity)))return;
    const points=picked.map(entity=>entity.position?.getValue(widget.clock.currentTime)).filter((point):point is C.Cartesian3=>!!point);
    if(!points.length)return;
    const sphere=C.BoundingSphere.fromPoints(points);
    // Coincident records cannot be separated by zooming. Open the photo
    // record; all records remain independently available in place search.
    if(sphere.radius<1){
      const target=picked.find(entity=>entity.properties?.publishedPhoto?.getValue())??picked[0];
      for(const group of groups)if(group.contains(target)&&group.open){group.open(target);return;}
    }
    widget.camera.flyToBoundingSphere(sphere,{duration:1,offset:new C.HeadingPitchRange(0,-Math.PI/3,Math.max(1500,sphere.radius*3))});
  },C.ScreenSpaceEventType.LEFT_CLICK);
  let disposed=false;
  void widget.dataSources.add(source).then(()=>{if(disposed&&!widget.isDestroyed())widget.dataSources.remove(source,true);}).catch(onError);
  const state:Shared={source,groups,paused,invalidate:()=>declutter?.invalidate(),anchors:()=>declutter?.anchors()??[],dispose(){
    disposed=true;declutter?.dispose();input.dispose();shared.delete(widget);
    if(!widget.isDestroyed())widget.dataSources.remove(source,true);
  }};
  shared.set(widget,state);
  return state;
}

export function createMarkerGroup(widget:C.CesiumWidget,name:string,options:GroupOptions){
  const state=sharedSource(widget,options.onError),entities=state.source.entities;
  const root=new C.Entity({id:`marker-group:${name}`});
  const members=()=>entities.values.filter(entity=>entity.parent===root);
  const group={
    name,
    source:state.source,
    /** Read-only view of this group's entities, shaped like a data source for helpers such as the selection hex. */
    entities:{get values(){return members();}},
    get show(){return root.show;},
    set show(value:boolean){if(root.show!==value){root.show=value;state.invalidate();}},
    contains:(entity:C.Entity)=>entity.parent===root,
    add:(entity:C.Entity.ConstructorOptions)=>entities.add({...entity,parent:root}),
    getById(id:string){const entity=entities.getById(id);return entity?.parent===root?entity:undefined;},
    removeAll(){entities.suspendEvents();try{for(const entity of members())entities.remove(entity);}finally{entities.resumeEvents();}},
    /** Up-close 3D models replace pins; clustering would hide the pins they hand over to. */
    pauseClustering(value:boolean){if(value===state.paused.has(group))return;if(value)state.paused.add(group);else state.paused.delete(group);state.invalidate();},
    /** Re-run the layout after an entity's billboard image changed in place. */
    recluster(){state.invalidate();},
    open:options.open,
    decorate:options.decorate,
    dispose(){
      if(!state.groups.delete(group))return;
      state.paused.delete(group);
      if(!widget.isDestroyed())group.removeAll();
      if(state.groups.size)state.invalidate();else state.dispose();
    },
  };
  state.groups.add(group);
  return group;
}

/** World positions of the visible pins and clusters, so other screen-space text (country labels) can keep clear of them. */
export function markerAnchors(widget:C.CesiumWidget):C.Cartesian3[]{
  const state=shared.get(widget);
  return state&&state.source.show?state.anchors():[];
}

/** Hides every globe marker (saints, places) while another story owns the map, e.g. a journey. */
export function setMarkersHidden(widget:C.CesiumWidget,hidden:boolean){
  const state=shared.get(widget);if(!state||widget.isDestroyed()||state.source.show===!hidden)return;
  state.source.show=!hidden;state.invalidate();widget.scene.requestRender();
}
