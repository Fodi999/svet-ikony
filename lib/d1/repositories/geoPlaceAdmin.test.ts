import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({first: vi.fn(), all: vi.fn(), run: vi.fn(), batch: vi.fn(), prepare: vi.fn()}));
vi.mock('@/lib/d1/env', () => ({getDb: async () => ({prepare: mocks.prepare, batch: mocks.batch})}));
import {isModelUrl, linkSaintPlace, parseGeoPlaceInput, parseGeoPlaceModel, setSaintPlaceVerified, updateGeoPlace} from './geoPlaceAdmin';

const place = {names: {uk: 'Храм'}, type: 'church', lat: 50.45, lon: 30.52};
const bound: {sql: string; args: unknown[]}[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  bound.length = 0;
  mocks.prepare.mockImplementation((sql: string) => {
    const statement = {bind: vi.fn((...args: unknown[]) => { bound.push({sql, args}); return statement; }), first: mocks.first, all: mocks.all, run: mocks.run};
    return statement;
  });
  mocks.all.mockResolvedValue({results: []});
  mocks.batch.mockResolvedValue([]);
});

describe('place input', () => {
  it('keeps old-style minimal places valid: optional fields stay null', () => {
    expect(parseGeoPlaceInput(place)).toMatchObject({countryCode: null, city: null, district: null, altitude: null, model: null, verified: false, showOnGlobe: false});
  });
  it('normalises the country code and keeps zero coordinates', () => {
    expect(parseGeoPlaceInput({...place, countryCode: 'ua', lat: 0, lon: 0})).toMatchObject({countryCode: 'UA', lat: 0, lon: 0});
  });
  it.each([{lat: 91}, {lon: -181}, {lat: '50'}, {altitude: 10000}, {type: 'castle'}, {names: {uk: ' '}}, {countryCode: 'UKR'}, {source: 'javascript:alert(1)'}])('rejects %j', invalid => {
    expect(() => parseGeoPlaceInput({...place, ...invalid})).toThrow();
  });
});

describe('3D model settings', () => {
  it('accepts R2 media keys and bundled site paths only', () => {
    expect(isModelUrl('media/church/x/model/a.glb')).toBe(true);
    expect(isModelUrl('/markers/sacred/marker-church.glb')).toBe(true);
    for (const bad of ['https://cdn.example/a.glb', 'media/../secret.glb', 'media/a.gltf', '//evil/a.glb', 'media/a.glb?x=1']) expect(isModelUrl(bad)).toBe(false);
  });
  it('defaults transform values and draft status', () => {
    expect(parseGeoPlaceModel({modelUrl: '/markers/sacred/marker-church.glb'})).toEqual({modelUrl: '/markers/sacred/marker-church.glb', status: 'draft', scale: 1, heading: 0, pitch: 0, roll: 0, heightOffset: 0});
  });
  it('an empty model URL means "no model"', () => expect(parseGeoPlaceModel({modelUrl: ''})).toBeNull());
  it.each([{scale: 0}, {heading: 400}, {pitch: -200}, {roll: 181}, {heightOffset: 5000}, {status: 'live'}])('rejects %j', invalid => {
    expect(() => parseGeoPlaceModel({modelUrl: '/markers/sacred/marker-church.glb', ...invalid})).toThrow();
  });
});

describe('writes', () => {
  it('rejects an unknown place before any write', async () => {
    mocks.first.mockResolvedValue({has_profile: 0, id: null});
    await expect(updateGeoPlace('missing', place)).rejects.toMatchObject({status: 404});
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it('removing the model deletes only the model row, atomically with the place update', async () => {
    mocks.first.mockResolvedValueOnce({has_profile: 0, id: 'p'}).mockResolvedValue(null);
    await updateGeoPlace('p', place).catch(() => {/* the follow-up read hits the mocked empty DB */});
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    const sql = mocks.prepare.mock.calls.map(([text]) => String(text));
    expect(sql.some(text => text.startsWith('DELETE FROM calendar_geo_place_models'))).toBe(true);
    expect(sql.some(text => text.includes('INSERT OR IGNORE INTO calendar_geo_place_profiles'))).toBe(false);
  });
  it('refuses to link an unknown saint', async () => {
    mocks.first.mockResolvedValue(null);
    await expect(linkSaintPlace({groupId: 'g', placeId: 'p'})).rejects.toMatchObject({status: 404});
    expect(mocks.batch).not.toHaveBeenCalled();
  });
});

describe('publication and verification stay independent', () => {
  it('linking a place never verifies the saint, the link or the place', async () => {
    mocks.first.mockResolvedValueOnce({name: 'Свята Варвара'}).mockResolvedValueOnce({id: 'p'});
    await linkSaintPlace({groupId: 'g', placeId: 'p', relationType: 'relics'});
    const sql = bound.map(entry => entry.sql);
    expect(sql.some(text => text.includes('UPDATE calendar_geo_entities'))).toBe(false);
    const relation = sql.find(text => text.includes('INTO calendar_geo_relations'))!;
    expect(relation).toContain("'needs_review', 'needs_review', 'manual_unverified'");
    expect(relation).not.toContain('reviewed_verified');
    expect(relation).toContain('INSERT OR IGNORE');
    const entity = sql.find(text => text.includes('INTO calendar_geo_entities'))!;
    expect(entity).not.toContain('reviewed_verified');
  });
  it('confirming a link is an explicit, boolean-only action', async () => {
    await expect(setSaintPlaceVerified({groupId: 'g', placeId: 'p', relationType: 'relics'})).rejects.toMatchObject({status: 400});
    mocks.all.mockResolvedValueOnce({results: [{id: 'internal:saint:g', title: 'S', matchStatus: 'needs_review'}]});
    mocks.run.mockResolvedValueOnce({meta: {changes: 0}});
    await expect(setSaintPlaceVerified({groupId: 'g', placeId: 'p', relationType: 'relics', verified: true})).rejects.toMatchObject({status: 404});
  });
  it('hiding a place from the globe only flips public_visible: nothing is deleted', async () => {
    mocks.first.mockResolvedValueOnce({has_profile: 1, id: 'p'}).mockResolvedValue(null);
    await updateGeoPlace('p', {...place, showOnGlobe: false, address: {uk: 'вул. Лаврська, 15'},
      model: {modelUrl: '/markers/sacred/marker-church.glb', status: 'published'}}).catch(() => {/* follow-up read */});
    expect(bound.some(entry => /^\s*DELETE/i.test(entry.sql))).toBe(false);
    const profile = bound.find(entry => entry.sql.includes('INTO calendar_geo_place_profiles('))!;
    expect(profile.sql).toContain('public_visible=excluded.public_visible');
    expect(profile.args).toEqual(['p', 0]);
    expect(bound.some(entry => entry.sql.includes('calendar_geo_place_profile_translations') && entry.args.includes('вул. Лаврська, 15'))).toBe(true);
    expect(bound.some(entry => entry.sql.includes('INTO calendar_geo_place_models'))).toBe(true);
  });
});
