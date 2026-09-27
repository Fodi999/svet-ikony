import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),first:vi.fn(),run:vi.fn(),batch:vi.fn()}));
vi.mock('@/lib/d1/auth',()=>({requireSuperAdmin:m.auth}));
vi.mock('@/lib/d1/env',()=>({getDb:async()=>({prepare:()=>({bind:()=>({first:m.first,run:m.run})}),batch:m.batch})}));
import {POST} from './route';
import {ApiError} from '@/lib/d1/errors';
const request=(body:unknown)=>new Request('https://example.com/api/admin/marker-targets',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({});});
describe('marker target assignment',()=>{
 it('requires server authorization before any write',async()=>{m.auth.mockRejectedValue(ApiError.authorization('Denied'));expect((await POST(request({kind:'place',id:'jerusalem'}))).status).toBe(403);expect(m.run).not.toHaveBeenCalled();});
 it('rejects a missing identity',async()=>{expect((await POST(request({kind:'saint'}))).status).toBe(400);expect(m.batch).not.toHaveBeenCalled();});
 it('does not invent a place from an arbitrary supplied ID',async()=>{m.first.mockResolvedValue(null);expect((await POST(request({kind:'place',id:'not-in-catalog'}))).status).toBe(404);expect(m.run).not.toHaveBeenCalled();});
 it('preserves an existing place record',async()=>{m.first.mockResolvedValue({id:'existing'});expect((await POST(request({kind:'place',id:'existing'}))).status).toBe(200);expect(m.run).not.toHaveBeenCalled();});
 it('refuses to overwrite another saint association',async()=>{m.first.mockResolvedValueOnce({id:'cms'}).mockResolvedValueOnce({id:'entity'}).mockResolvedValueOnce({translation_group_id:'other'});expect((await POST(request({kind:'saint',id:'entity',groupId:'group'}))).status).toBe(409);expect(m.batch).not.toHaveBeenCalled();});
});
