import * as C from '@cesium/engine';
import {styleCluster} from './atlas-style';

/**
 * Screen-space decluttering for the shared globe marker source.
 *
 * Replaces Cesium's EntityCluster, which places a cluster at the average of
 * its members (so it can land on a neighbouring pin or cluster), never
 * clusters labels, and skips its horizon test in 2D. Here every visible pin
 * is projected once per view change and laid out greedily: a pin that would
 * overlap an already placed mark joins it, otherwise it becomes a new mark.
 * A cluster is drawn on its first member's own position, so placed marks
 * never overlap. Hidden members get `entity.show=false`, which also hides
 * their labels.
 *
 * On the flat map (2D/Columbus) ground-clamped billboards and labels are drawn
 * hundreds of pixels away from their projected position, so there the
 * source's graphics are switched to HeightReference.NONE (the flat map has no
 * terrain) and restored on the way back to the globe.
 */
export type ScreenMark={x:number;y:number;width:number;height:number};
export type ClusterGraphics={label:C.Label;point:C.PointPrimitive;billboard:C.Billboard};
/** Cluster disc size in CSS pixels (see styleCluster). */
export const CLUSTER_SIZE=46;
/** Minimum free space between two placed marks. */
const GAP=6;

/** Bottom-anchored boxes (pins and clusters both stand on their anchor). */
function overlaps(a:ScreenMark,b:ScreenMark){
  return Math.abs(a.x-b.x)<(a.width+b.width)/2+GAP&&a.y-a.height-GAP<b.y&&b.y-b.height-GAP<a.y;
}
/** Greedy layout: returns, per placed mark, the indices of the marks it absorbs (its own index first). */
export function declutter(marks:ScreenMark[]):number[][]{
  const placed:{box:ScreenMark;members:number[]}[]=[];
  marks.forEach((mark,index)=>{
    const target=placed.find(group=>overlaps(group.box,mark));
    if(target){
      target.members.push(index);
      // Once it is a cluster the mark may be the disc or the first pin, whichever is larger.
      target.box={...target.box,width:Math.max(target.box.width,CLUSTER_SIZE),height:Math.max(target.box.height,CLUSTER_SIZE)};
    }else placed.push({box:{...mark,width:Math.max(mark.width,CLUSTER_SIZE),height:Math.max(mark.height,CLUSTER_SIZE)},members:[index]});
  });
  return placed.map(group=>group.members);
}

function nearFar(scalar:C.NearFarScalar|undefined,distance:number){
  if(!scalar)return 1;
  const t=Math.min(1,Math.max(0,(distance-scalar.near)/Math.max(1,scalar.far-scalar.near)));
  return scalar.nearValue+(scalar.farValue-scalar.nearValue)*t;
}

type Options={
  /** Entities of groups that currently want every pin visible (up-close 3D models). */
  paused:()=>boolean;
  decorate:(entities:C.Entity[],cluster:ClusterGraphics)=>void;
};
export function createMarkerDeclutter(widget:C.CesiumWidget,source:C.CustomDataSource,options:Options){
  const scene=widget.scene;
  const billboards=scene.primitives.add(new C.BillboardCollection({scene})) as C.BillboardCollection;
  const labels=scene.primitives.add(new C.LabelCollection({scene})) as C.LabelCollection;
  const points=scene.primitives.add(new C.PointPrimitiveCollection()) as C.PointPrimitiveCollection;
  const hidden=new Set<C.Entity>();
  const heightReferences=new WeakMap<object,C.Property|undefined>();
  const flatten=(entity:C.Entity,flat:boolean)=>{
    for(const graphics of [entity.billboard,entity.label,entity.point]){
      if(!graphics)continue;
      if(flat){
        if(heightReferences.has(graphics))continue;
        heightReferences.set(graphics,graphics.heightReference);
        graphics.heightReference=new C.ConstantProperty(C.HeightReference.NONE);
      }else if(heightReferences.has(graphics)){graphics.heightReference=heightReferences.get(graphics);heightReferences.delete(graphics);}
    }
  };
  const flatMap=()=>scene.mode===C.SceneMode.SCENE2D||scene.mode===C.SceneMode.COLUMBUS_VIEW;
  let anchors:C.Cartesian3[]=[];
  let dirty=true,width=0,height=0,mode=scene.mode,frustumKey='';
  const view=new C.Matrix4();
  // 2D zoom changes the orthographic frustum, not the view matrix.
  const frustum=()=>{const value=widget.camera.frustum as {left?:number;right?:number;top?:number;fov?:number};return `${value.left}:${value.right}:${value.top}:${value.fov}`;};
  // Layers can still detach after the widget is gone (React unmount order); the scene must not be touched then.
  const markDirty=()=>{dirty=true;if(!widget.isDestroyed())scene.requestRender();};
  const removeCollection=source.entities.collectionChanged.addEventListener((_collection:C.EntityCollection,added:C.Entity[])=>{
    if(flatMap())for(const entity of added)flatten(entity,true);
    markDirty();
  });
  const removeMorph=scene.morphComplete.addEventListener(()=>{
    const flat=flatMap();
    for(const entity of source.entities.values)flatten(entity,flat);
    markDirty();
  });
  const time=()=>widget.clock.currentTime;
  const wantsBillboard=(entity:C.Entity,cameraPosition:C.Cartesian3)=>{
    const billboard=entity.billboard;
    if(!billboard||!entity.parent?.isShowing)return false;
    if(billboard.show?.getValue(time())===false)return false;
    const condition=billboard.distanceDisplayCondition?.getValue(time()) as C.DistanceDisplayCondition|undefined;
    const position=entity.position?.getValue(time());
    if(!position)return false;
    if(condition){const distance=C.Cartesian3.distance(cameraPosition,position);if(distance<condition.near||distance>condition.far)return false;}
    return true;
  };
  const layout=()=>{
    const camera=widget.camera,cameraPosition=camera.positionWC;
    const globe3d=scene.mode===C.SceneMode.SCENE3D,toCamera=new C.Cartesian3();
    const marks:ScreenMark[]=[],entities:C.Entity[]=[],positions:C.Cartesian3[]=[],free:C.Entity[]=[],flat=flatMap();
    for(const entity of source.entities.values){
      // Layers swap in new graphics when a photo loads; those arrive ground-clamped again.
      if(flat)flatten(entity,true);
      if(!wantsBillboard(entity,cameraPosition)){if(entity.billboard)free.push(entity);continue;}
      const position=entity.position!.getValue(time())!;
      // Behind the globe: the depth test hides the pin anyway; it must not absorb visible pins.
      if(globe3d&&C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(position),C.Cartesian3.subtract(cameraPosition,position,toCamera))<=0){free.push(entity);continue;}
      const screen=C.SceneTransforms.worldToWindowCoordinates(scene,position);
      if(!screen){free.push(entity);continue;}
      const billboard=entity.billboard!,scale=(billboard.scale?.getValue(time()) as number|undefined??1)*nearFar(billboard.scaleByDistance?.getValue(time()) as C.NearFarScalar|undefined,C.Cartesian3.distance(cameraPosition,position));
      marks.push({x:screen.x,y:screen.y,width:(billboard.width?.getValue(time()) as number|undefined??48)*scale,height:(billboard.height?.getValue(time()) as number|undefined??48)*scale});
      entities.push(entity);positions.push(position);
    }
    // Photos and selected (larger) pins keep their own place; everything else in a stable order.
    const order=entities.map((_,index)=>index).sort((a,b)=>{
      const photo=Number(!!entities[b].properties?.publishedPhoto?.getValue())-Number(!!entities[a].properties?.publishedPhoto?.getValue());
      return photo||marks[b].width-marks[a].width||entities[a].id.localeCompare(entities[b].id);
    });
    const groups=options.paused()?order.map(index=>[index]):declutter(order.map(index=>marks[index])).map(group=>group.map(position=>order[position]));
    billboards.removeAll();labels.removeAll();points.removeAll();
    const nextHidden=new Set<C.Entity>(),nextAnchors:C.Cartesian3[]=[];
    for(const group of groups){
      nextAnchors.push(positions[group[0]]);
      if(group.length<2)continue;
      const members=group.map(index=>entities[index]);
      for(const entity of members)nextHidden.add(entity);
      const position=positions[group[0]];
      const cluster:ClusterGraphics={
        billboard:billboards.add({position,id:members}),
        label:labels.add({position,id:members,text:String(members.length)}),
        point:points.add({position,id:members,show:false}),
      };
      styleCluster(cluster);
      options.decorate(members,cluster);
    }
    let changed=false;
    for(const entity of hidden)if(!nextHidden.has(entity)&&source.entities.contains(entity)){entity.show=true;changed=true;}
    for(const entity of nextHidden)if(!hidden.has(entity)){entity.show=false;changed=true;}
    for(const entity of free)if(!entity.show&&!nextHidden.has(entity)){entity.show=true;changed=true;}
    hidden.clear();for(const entity of nextHidden)hidden.add(entity);
    anchors=nextAnchors;
    // Entity visibility reaches the billboards on the next frame.
    if(changed)scene.requestRender();
  };
  const removePreRender=scene.preRender.addEventListener(()=>{
    if(!source.show){if(billboards.length){billboards.removeAll();labels.removeAll();}anchors=[];return;}
    const canvas=widget.canvas;
    const key=frustum();
    if(!dirty&&C.Matrix4.equals(view,widget.camera.viewMatrix)&&key===frustumKey&&width===canvas.clientWidth&&height===canvas.clientHeight&&mode===scene.mode)return;
    dirty=false;C.Matrix4.clone(widget.camera.viewMatrix,view);frustumKey=key;width=canvas.clientWidth;height=canvas.clientHeight;mode=scene.mode;
    layout();
  });
  return {
    invalidate:markDirty,
    anchors:()=>anchors,
    dispose(){
      removeCollection();removePreRender();removeMorph();
      for(const entity of source.entities.values)flatten(entity,false);
      for(const entity of hidden)entity.show=true;hidden.clear();
      if(!widget.isDestroyed()){scene.primitives.remove(billboards);scene.primitives.remove(labels);scene.primitives.remove(points);}
    },
  };
}
