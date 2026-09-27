import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors,ApiError} from '@/lib/d1/errors';
import {markerImageState,saveMarkerDraft,publishMarkerImage,type ImageDraft} from '@/lib/d1/repositories/markerImages';
type Context={params:Promise<{kind:string;id:string}>};
export async function GET(request:Request,context:Context){return withErrors(async()=>{await requireSuperAdmin(request);const {kind,id}=await context.params;return Response.json(await markerImageState(kind,id),{headers:{'Cache-Control':'no-store'}});});}
export async function POST(request:Request,context:Context){return withErrors(async()=>{
 await requireSuperAdmin(request);const {kind,id}=await context.params,raw=await request.json();
 if(!raw||typeof raw!=='object')throw ApiError.validation('Object required');
 const body=raw as {action?:string;versionId?:string;draft:ImageDraft};
 const result=body.action==='save'?await saveMarkerDraft(kind,id,body.draft):body.action==='publish'&&typeof body.versionId==='string'?await publishMarkerImage(kind,id,body.versionId):body.action==='withdraw'?await publishMarkerImage(kind,id,null):null;
 if(!result)throw ApiError.validation('Unknown action');return Response.json(result,{headers:{'Cache-Control':'no-store'}});
});}
