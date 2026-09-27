import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({first: vi.fn(), batch: vi.fn(), bind: vi.fn(), prepare: vi.fn()}));
vi.mock('@/lib/d1/env', () => ({getDb: async () => ({prepare: mocks.prepare, batch: mocks.batch})}));
import {createMarkerPlace, parseMarkerPlace} from './createMarkerPlace';

const place = {requestId: '2ae985bc-d716-45eb-b605-a181bf8b60f8', title: 'Test church', type: 'church', locale: 'uk', lat: 0, lon: 0, history: 'Test description', source: 'https://example.org/place'};
describe('create marker place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.first.mockResolvedValue(null);
    mocks.bind.mockReturnValue({first: mocks.first});
    mocks.prepare.mockReturnValue({bind: mocks.bind});
    mocks.batch.mockResolvedValue([]);
  });
  it('accepts zero coordinates without substituting defaults', () => {
    expect(parseMarkerPlace(place)).toMatchObject({lat: 0, lon: 0, address: ''});
  });
  it.each([{lat: 91}, {lon: -181}, {lat: NaN}, {lon: Infinity}, {lat: ''}, {title: ' '}, {history: ''}, {type: 'invalid'}, {locale: 'xx'}, {source: 'javascript:alert(1)'}, {requestId: '../bad'}])('rejects invalid input %j', async invalid => {
    await expect(createMarkerPlace({...place, ...invalid})).rejects.toMatchObject({status: 400});
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('writes the place, profile, translation and provenance in one atomic batch', async () => {
    expect(await createMarkerPlace(place)).toEqual({placeId: `manual:${place.requestId}`});
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.mock.calls[0][0]).toHaveLength(6);
    expect(mocks.prepare.mock.calls.some(([sql]) => sql.includes("'needs_review'"))).toBe(true);
  });
  it('does not duplicate a successfully stored request on retry', async () => {
    mocks.first.mockResolvedValue({id: `manual:${place.requestId}`});
    expect(await createMarkerPlace(place)).toEqual({placeId: `manual:${place.requestId}`});
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it('propagates a failed transaction', async () => {
    mocks.batch.mockRejectedValue(new Error('database unavailable'));
    await expect(createMarkerPlace(place)).rejects.toThrow('database unavailable');
  });
});
