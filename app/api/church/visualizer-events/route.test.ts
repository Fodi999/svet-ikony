import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
const list = vi.hoisted(() => vi.fn());
vi.mock('@/lib/d1/repositories/visualizerEvents', () => ({ listVisualizerEvents: list }));
import { GET } from './route';
describe('public visualizer catalog', () => {
  it('requests only published events, including when a requested translation is a draft', async () => {
    list.mockResolvedValue([{ id: 'public', translationGroupId: 'group', language: 'uk', status: 'published' }]);
    const response = await GET(new NextRequest('http://localhost/api/church/visualizer-events?language=ru'));
    expect(list).toHaveBeenCalledWith({ status: 'published' });
    expect(await response.json()).toEqual([expect.objectContaining({ id: 'public', translated: false })]);
  });
});
