import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),batch:vi.fn()}));
vi.mock('@/lib/d1/auth',()=>({requireSuperAdmin:m.auth}));
vi.mock('@/lib/d1/env',()=>({getDb:async()=>{const s={bind:()=>s,first:async()=>null,all:async()=>({results:[]}),run:async()=>({})};return {prepare:()=>s,batch:m.batch};}}));
import * as route from './route';
import {ApiError} from '@/lib/d1/errors';
const request=(method:string,body?:unknown,query='')=>new Request('https://example.com/api/admin/saint-places'+query,{method,body:body===undefined?undefined:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({});});
describe('/api/admin/saint-places',()=>{
  it('requires super admin before touching data',async()=>{
    m.auth.mockRejectedValue(ApiError.authorization('Denied'));
    expect((await route.POST(request('POST',{}))).status).toBe(403);
    expect(m.batch).not.toHaveBeenCalled();
  });
  it('validates input before any write',async()=>{
    expect((await route.POST(request('POST',{groupId:'',placeId:''}))).status).toBe(400);
    expect(m.batch).not.toHaveBeenCalled();
  });
});
