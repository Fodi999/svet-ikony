import * as C from '@cesium/engine';

export const MODEL_MAX_DISTANCE=600_000;
export const MODEL_SCALE=8;
export const MODEL_MIN_PIXEL_SIZE=58;
export const MODEL_MAX_SCALE=40_000;
export const MODEL_SELECTED_FACTOR=1.15;
export const MAX_ACTIVE_MODELS=25;
const families:Readonly<Record<string,string>>={saint:'saint',person:'saint',church:'church',cathedral:'church',icon:'icon',relic:'icon',shrine:'icon',pilgrimage_route:'knight',historical_movement:'knight',monastery:'monastery',holy_center:'monastery',major_sacred_place:'major'};
export function markerModel(type:string){const family=families[type];return family?`/markers/sacred/marker-${family}.glb`:undefined;}
/** Per-chess-role visual size, tuned by eye (king largest/most important down
 * to pawn smallest) -- keyed by the family segment already embedded in
 * markerModel()'s own URI, so no caller needs to pass the role separately. */
const familySizeFactor:Readonly<Record<string,number>>={major:1.15,icon:1.10,monastery:1.05,knight:1.05,church:1.00,saint:0.90};
export function modelSizeFactor(uri:string){const match=/marker-([a-z]+)\.glb$/.exec(uri);return match?familySizeFactor[match[1]]??1:1;}
export function calendarModelGraphics(uri:string,selected:boolean):C.ModelGraphics.ConstructorOptions {
  const size=modelSizeFactor(uri)*(selected?MODEL_SELECTED_FACTOR:1);
  return {uri,show:true,scale:MODEL_SCALE*size,minimumPixelSize:MODEL_MIN_PIXEL_SIZE*size,maximumScale:MODEL_MAX_SCALE,
    heightReference:C.HeightReference.CLAMP_TO_GROUND,shadows:C.ShadowMode.DISABLED,
    silhouetteColor:C.Color.fromCssColorString('#e7bd6b'),silhouetteSize:selected?1:0,
    distanceDisplayCondition:new C.DistanceDisplayCondition(0,MODEL_MAX_DISTANCE)};
}
export type SacredCandidate={entity:C.Entity;position:C.Cartesian3;uri:string;selected:boolean};
const budgets=new WeakMap<C.CesiumWidget,Set<{count:number;candidates:number;invalidate:()=>void}>>();

/** Models are attached only to nearby visible entities, not merely hidden by DDC.
 * This prevents Cesium ModelVisualizer from downloading every far-away GLB.
 */
export function createSacredModelController(widget:C.CesiumWidget,visible:()=>boolean,onActive:(active:boolean)=>void=()=>{}){
  let entries:SacredCandidate[]=[],dirty=true;
  const budget=budgets.get(widget)??new Set<{count:number;candidates:number;invalidate:()=>void}>();budgets.set(widget,budget);
  const allocation={count:0,candidates:0,invalidate:()=>{dirty=true;}};budget.add(allocation);
  const last=new C.Cartesian3(),direction=new C.Cartesian3();let width=0,height=0;
  // Candidates are stored at ellipsoid height 0. With streamed World Terrain the ground can be hundreds of metres
  // higher (Jerusalem ~750 m), which projects the marker far below its real screen position and wrongly drops it
  // from the eligible set. Use the loaded terrain height when the globe knows it (near markers only).
  const ground=(entry:SacredCandidate)=>{
    const globe=widget.scene.globe as C.Globe|undefined;
    if(!globe||typeof globe.getHeight!=='function')return entry.position;
    const carto=C.Cartographic.fromCartesian(entry.position),terrain=globe.getHeight(carto);
    return terrain===undefined||Math.abs(terrain)<1?entry.position:C.Cartesian3.fromRadians(carto.longitude,carto.latitude,terrain);
  };
  const update=()=>{
    const camera=widget.camera,canvas=widget.canvas;
    if(!dirty&&width===canvas.clientWidth&&height===canvas.clientHeight&&C.Cartesian3.equals(last,camera.positionWC)&&C.Cartesian3.equals(direction,camera.directionWC))return;
    dirty=false;width=canvas.clientWidth;height=canvas.clientHeight;C.Cartesian3.clone(camera.positionWC,last);C.Cartesian3.clone(camera.directionWC,direction);
    const available=Math.max(0,MAX_ACTIVE_MODELS-[...budget].filter(item=>item!==allocation).reduce((sum,item)=>sum+item.count,0));
    const eligible=visible()?entries.filter(entry=>{
      const distance=C.Cartesian3.distance(camera.positionWC,entry.position);
      if(distance>MODEL_MAX_DISTANCE)return false;
      const at=ground(entry);
      const front=C.Cartesian3.dot(C.Ellipsoid.WGS84.geodeticSurfaceNormal(at),C.Cartesian3.subtract(camera.positionWC,at,new C.Cartesian3()))>0;
      const screen=C.SceneTransforms.worldToWindowCoordinates(widget.scene,at);
      return front&&screen&&screen.x>=-64&&screen.x<=width+64&&screen.y>=-64&&screen.y<=height+64;
    }).sort((a,b)=>Number(b.selected)-Number(a.selected)||C.Cartesian3.distance(camera.positionWC,a.position)-C.Cartesian3.distance(camera.positionWC,b.position)).slice(0,available):[];
    if(allocation.count!==eligible.length){allocation.count=eligible.length;for(const item of budget)if(item!==allocation)item.invalidate();}
    allocation.candidates=entries.length;
    const active=new Set(eligible);
    onActive(eligible.length>0);
    for(const entry of entries){
      const {entity,selected}=entry,show=active.has(entry),position=show?ground(entry):entry.position;
      if(!entity.model){
        // Lazy creation only: never fetch a far-away GLB before an entry is
        // first actually eligible (see the module doc comment above).
        if(show)entity.model=new C.ModelGraphics(calendarModelGraphics(entry.uri,selected));
      }else if((entity.model.show as C.ConstantProperty).getValue()!==show){
        // Toggle visibility in place -- never null out entity.model here.
        // ModelVisualizer treats entity.model===undefined as "no model" and
        // destroys the loaded Cesium.Model primitive outright (removeAndDestroy),
        // so a later far->near swing would redo Model.fromGltfAsync() (a full
        // refetch+reparse+GPU-reupload) for a URI that never changed. Setting
        // .show=false instead just flips the already-loaded primitive's own
        // .show (ModelVisualizer's own hide path), keeping it warm in memory
        // for the next near pass -- confirmed against
        // node_modules/@cesium/engine/Source/DataSources/ModelVisualizer.js.
        (entity.model.show as C.ConstantProperty).setValue(show);
      }
      // Budget overflow retains the billboard even at near range.
      for(const graphic of [entity.billboard,entity.point])if(graphic)(graphic.show as C.ConstantProperty).setValue(!show);
      let pixels=0,factor=1;
      if(entity.model&&show){
        const mpp=camera.getPixelSize(new C.BoundingSphere(position,1),width,height);
        factor=(selected?MODEL_SELECTED_FACTOR:1)*modelSizeFactor(entry.uri);
        pixels=(C.Cartesian3.distance(camera.positionWC,position)<50000?90:MODEL_MIN_PIXEL_SIZE)*factor;
        (entity.model.minimumPixelSize as C.ConstantProperty).setValue(pixels);
        (entity.model.scale as C.ConstantProperty).setValue(Math.min(MODEL_SCALE,mpp*MODEL_MIN_PIXEL_SIZE*.7)*factor);
        if(selected){
          const radius=Math.min(MODEL_MAX_SCALE*.24,Math.max(.02,mpp*13*factor));
          const frame=C.Transforms.eastNorthUpToFixedFrame(position),points:C.Cartesian3[]=[];
          for(let i=0;i<=64;i++){const a=i*Math.PI/32;points.push(C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(Math.cos(a)*radius,Math.sin(a)*radius,0),new C.Cartesian3()));}
          if(!entity.polyline)entity.polyline=new C.PolylineGraphics({positions:points,clampToGround:true,width:5,material:new C.PolylineGlowMaterialProperty({color:C.Color.fromCssColorString('#efc774'),glowPower:.22})});
          else (entity.polyline.positions as C.ConstantProperty).setValue(points);
        }
      }
      if(!show&&entity.polyline)entity.polyline=undefined;
      if(entity.label){
        // Lift scales with the near-mode marker's own rendered pixel height so
        // a big (near/selected) model never pokes into its own label -- a flat
        // -12px offset only ever cleared the smallest far-mode billboards.
        const lift=show?Math.max(24,pixels*.55+12):12;
        (entity.label.pixelOffset as C.ConstantProperty).setValue(new C.Cartesian2(show?40:24,-lift));
        entity.label.eyeOffset=new C.ConstantProperty(new C.Cartesian3(0,0,show?-camera.getPixelSize(new C.BoundingSphere(position,1),width,height)*3:0));
      }
    }
    const occupied:{x:number;y:number;w:number}[]=[];
    const modelBounds=eligible.flatMap(entry=>{
      const at=ground(entry),p=C.SceneTransforms.worldToWindowCoordinates(widget.scene,at);
      const size=C.Cartesian3.distance(camera.positionWC,at)<50000?90:MODEL_MIN_PIXEL_SIZE;
      return p?[{entry,left:p.x-24,right:p.x+24,top:p.y-size,bottom:p.y+8}]:[];
    });
    for(const entry of [...entries].sort((a,b)=>Number(b.selected)-Number(a.selected))){
      const label=entry.entity.label;if(!label)continue;
      const screen=C.SceneTransforms.worldToWindowCoordinates(widget.scene,active.has(entry)?ground(entry):entry.position);
      const w=String(label.text?.getValue(widget.clock?.currentTime)??'').length*8;
      const x=(screen?.x??0)+(active.has(entry)?40:24),y=(screen?.y??0)-12;
      const show=!active.has(entry)||!!screen&&x>=8&&x+w<width-8&&y>=20&&y<height-20
        &&!occupied.some(b=>Math.abs(b.y-y)<24&&x<b.x+b.w+8&&x+w>b.x-8)
        &&!modelBounds.some(b=>b.entry!==entry&&x<b.right&&x+w>b.left&&y+12>b.top&&y-12<b.bottom);
      label.show=new C.ConstantProperty(show);
      if(show&&active.has(entry))occupied.push({x,y,w});
    }
    canvas.dataset.sacredModels=String([...budget].reduce((sum,item)=>sum+item.count,0));
    canvas.dataset.sacredCandidates=String([...budget].reduce((sum,item)=>sum+item.candidates,0));
    widget.scene.requestRender();
  };
  const remove=widget.scene.preRender.addEventListener(update);
  // Terrain heights arrive after the first frame: re-evaluate once the globe has finished loading tiles.
  const removeTiles=(widget.scene.globe as C.Globe|undefined)?.tileLoadProgressEvent?.addEventListener(count=>{if(count===0)dirty=true;});
  let stopQA=()=>{};
  if(process.env.NODE_ENV==='development'&&typeof window!=='undefined'){
    let until=0,frames:number[]=[],raf=0;
    const tick=()=>{widget.scene.requestRender();if(performance.now()<until)raf=requestAnimationFrame(tick);};
    const benchmark=()=>{frames=[];until=performance.now()+5000;tick();};
    widget.canvas.addEventListener('sacred:benchmark',benchmark);
    const removePost=widget.scene.postRender.addEventListener(()=>{
      let ready=0;const walk=(collection:C.PrimitiveCollection)=>{for(let i=0;i<collection.length;i++){const primitive=collection.get(i);if(primitive instanceof C.Model&&primitive.ready)ready++;else if(primitive instanceof C.PrimitiveCollection)walk(primitive);}};walk(widget.scene.primitives);
      widget.canvas.dataset.sacredReady=String(ready);
      if(until){frames.push(performance.now());if(performance.now()>=until){const elapsed=frames.at(-1)!-frames[0];widget.canvas.dataset.sacredBenchmark=JSON.stringify({frames:frames.length,elapsedMs:elapsed,fps:(frames.length-1)*1000/elapsed,frameMs:elapsed/(frames.length-1),active:entries.filter(e=>e.entity.model).length,ready,gpuMemoryBytes:null});until=0;}}
    });
    stopQA=()=>{removePost();cancelAnimationFrame(raf);widget.canvas.removeEventListener('sacred:benchmark',benchmark);};
  }
  return {set(next:SacredCandidate[]){entries=next;dirty=true;widget.scene.requestRender();},invalidate(){dirty=true;widget.scene.requestRender();},dispose(){remove();removeTiles?.();stopQA();entries=[];budget.delete(allocation);for(const item of budget)item.invalidate();if(!budget.size){delete widget.canvas.dataset.sacredModels;delete widget.canvas.dataset.sacredCandidates;}}};
}
