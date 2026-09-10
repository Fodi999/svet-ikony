import type { WebGLRenderer } from 'three';
/** Non-blocking, sampled GPU timings. Never gl.finish/readPixels in the loop. */
export function createRenderMetrics(renderer:WebGLRenderer){
 const gl=renderer.getContext() as WebGL2RenderingContext;
 const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2') as {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
 let pending:WebGLQuery|null=null,active=false,lastQuery=0,gpu:number|null=null;
 let began=0,cpuSum=0,frames=0,start=performance.now(),maxFrame=0,previous=start;
 return {
  begin(now:number){began=performance.now();maxFrame=Math.max(maxFrame,now-previous);previous=now;
   if(pending&&!active&&ext&&gl.getQueryParameter(pending,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu=Number(gl.getQueryParameter(pending,gl.QUERY_RESULT))/1e6;gl.deleteQuery(pending);pending=null;}
   if(ext&&!pending&&now-lastQuery>=500){pending=gl.createQuery();if(pending){gl.beginQuery(ext.TIME_ELAPSED_EXT,pending);active=true;lastQuery=now;}}
  },
  end(){if(active&&ext){gl.endQuery(ext.TIME_ELAPSED_EXT);active=false;}cpuSum+=performance.now()-began;frames++;},
  sample(now:number){const elapsed=now-start;if(elapsed<500)return null;const value={fps:frames*1000/elapsed,cpuMs:cpuSum/Math.max(frames,1),gpuMs:gpu,maxFrameMs:maxFrame,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,dpr:renderer.getPixelRatio()};start=now;frames=0;cpuSum=0;maxFrame=0;return value;},
  reset(){start=previous=performance.now();frames=0;cpuSum=0;maxFrame=0;},
  dispose(){if(active&&ext)gl.endQuery(ext.TIME_ELAPSED_EXT);if(pending)gl.deleteQuery(pending);pending=null;}
 };
}
