import {it,expect,vi,afterEach} from 'vitest';
import {fixture} from './test-support';
const mocks=vi.hoisted(()=>({bucket:null as R2Bucket|null,auth:vi.fn(async()=>({}))}));
vi.mock('@/lib/d1/env',()=>({getMediaBucket:async()=>mocks.bucket}));
vi.mock('@/lib/d1/auth',()=>({requireSuperAdmin:mocks.auth}));
import {GET,POST} from '@/app/api/admin/terrain-bundles/[region]/[lod]/route';
import {PUT} from '@/app/api/admin/terrain-bundles/[region]/[lod]/tiles/[tile]/route';
import {POST as reconcile} from '@/app/api/admin/terrain-bundles/[region]/[lod]/reconcile/route';
import {GET as fileGET} from '@/app/terrain/[region]/[lod]/[file]/route';
import {ApiError} from '@/lib/d1/errors';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const context={params:Promise.resolve({region:'test',lod:'L1'})};
const url='http://localhost/api/admin/terrain-bundles/test/L1';
it('HTTP manifest → GLB → reconcile → served manifest, with readback and MIME',async()=>{
 vi.stubEnv('NODE_ENV','development');const s=await fixture();mocks.bucket=s.bucket;
 expect((await GET(new Request(url),context)).status).toBe(200);
 const initial=await POST(new Request(url,{method:'POST',body:JSON.stringify(s.manifest)}),context);expect(initial.status).toBe(200);const body=await initial.json() as {bundleId:string};
 const fc={params:Promise.resolve({region:'test',lod:'L1',file:'manifest.json'})};
 expect((await fileGET(new Request('http://localhost/terrain/test/L1/manifest.json'),fc)).status).toBe(404);
 const upload=await PUT(new Request(url+'/tiles/0_0',{method:'PUT',headers:{'content-type':'model/gltf-binary','x-terrain-bundle-id':body.bundleId},body:s.bytes}),{params:Promise.resolve({region:'test',lod:'L1',tile:'0_0'})});expect(upload.status).toBe(200);
 const result=await reconcile(new Request(url+'/reconcile',{method:'POST',headers:{'x-terrain-bundle-id':body.bundleId}}),context);expect((await result.json() as {complete:boolean}).complete).toBe(true);
 const served=await fileGET(new Request('http://localhost/terrain/test/L1/manifest.json'),fc);expect(served.headers.get('content-type')).toBe('application/json');expect((await served.json() as {tiles:{file:string}[]}).tiles[0].file).toBe('0_0.glb');
});
it('HTTP requires authorization and rejects malformed manifest without storage writes',async()=>{
 vi.stubEnv('NODE_ENV','development');const s=await fixture();mocks.bucket=s.bucket;mocks.auth.mockRejectedValueOnce(ApiError.authentication('test'));
 expect((await GET(new Request(url),context)).status).toBe(401);
 expect((await POST(new Request(url,{method:'POST',body:'{}'}),context)).status).toBe(400);expect(s.puts.length).toBe(0);
});
it('production request is rejected before auth or R2 lookup',async()=>{
 vi.stubEnv('NODE_ENV','production');expect((await GET(new Request(url),context)).status).toBe(403);expect(mocks.auth).not.toHaveBeenCalled();
});
