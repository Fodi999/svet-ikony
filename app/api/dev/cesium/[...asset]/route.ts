import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {resolveVisualizerEngine} from '@/lib/cesium/local-mode';

export async function GET(request:Request,context:{params:Promise<{asset:string[]}>}) {
  if(process.env.NODE_ENV !== 'development')return new Response(null,{status:404});
  if(resolveVisualizerEngine(process.env.NODE_ENV,new URL(request.url).host,'cesium')!=='cesium')return new Response(null,{status:404});
  const {asset}=await context.params;
  if(!asset.length || asset.some(p=>!p || p==='.' || p==='..' || !/^[\w.\-]+$/.test(p)))return new Response(null,{status:404});
  const [kind,...rest]=asset;
  const roots:Record<string,string>={Workers:'node_modules/@cesium/engine/Build/Workers',ThirdParty:'node_modules/@cesium/engine/Build/ThirdParty',Assets:'node_modules/@cesium/engine/Source/Assets',data:'tools/terrain/cesium/build'};
  if(!roots[kind])return new Response(null,{status:404});
  const mime:Record<string,string>={'.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.wasm':'application/wasm','.terrain':'application/octet-stream','.bin':'application/octet-stream','.css':'text/css'};
  try {
    const data=await readFile(path.join(process.cwd(),roots[kind],...rest));
    return new Response(data,{headers:{'content-type':mime[path.extname(asset.at(-1)!)] ?? 'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'}});
  } catch(error) {
    if((error as NodeJS.ErrnoException).code==='ENOENT')return new Response(null,{status:404});
    throw error;
  }
}
