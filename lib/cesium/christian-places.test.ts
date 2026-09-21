import {it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {christianPlaces,chessModel,chessIcon,sacredPlaceItem} from './christian-places';
import {initialLayers,layersForMode,defaultLayers,globeModes} from './unified';
import {calendarModelGraphics} from './sacred-markers';
it('contains twenty unique, localized finite anchors without calendar IDs',()=>{
 expect(christianPlaces).toHaveLength(20);expect(new Set(christianPlaces.map(p=>p.id)).size).toBe(20);
 for(const p of christianPlaces){expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);expect(Math.abs(p.lng)).toBeLessThanOrEqual(180);expect(p.source).toMatch(/^https:\/\//);for(const locale of ['ru','uk','en'] as const){expect(p.name[locale].length).toBeGreaterThan(1);expect(p.description[locale].length).toBeGreaterThan(20);expect(sacredPlaceItem(p,locale).entityId).toBe('place:'+p.id);}}
});
it('reuses six different existing GLBs with distinct far symbols',()=>{
 const roles=['king','queen','bishop','knight','rook','pawn'] as const;
 expect(new Set(roles.map(chessModel)).size).toBe(6);expect(new Set(roles.map(role=>chessIcon(role,false))).size).toBe(6);
 for(const role of roles)expect(existsSync('public'+chessModel(role))).toBe(true);
 expect(chessModel('king')).toContain('major');expect(chessModel('rook')).toContain('church');
});
it('never duplicates an asset per location -- same chess role always resolves to the identical GLB',()=>{
 const jerusalem=christianPlaces.find(p=>p.id==='jerusalem')!,rome=christianPlaces.find(p=>p.id==='rome')!,constantinople=christianPlaces.find(p=>p.id==='constantinople')!;
 expect(jerusalem.markerType).toBe('king');expect(rome.markerType).toBe('king');expect(constantinople.markerType).toBe('king');
 expect(chessModel(jerusalem.markerType)).toBe(chessModel(rome.markerType));expect(chessModel(rome.markerType)).toBe(chessModel(constantinople.markerType));
 // Every place sharing a markerType must resolve to the one shared URI for that role -- never a per-place file.
 for(const role of ['king','queen','bishop','knight','rook','pawn'] as const){
  const uris=new Set(christianPlaces.filter(p=>p.markerType===role).map(p=>chessModel(p.markerType)));
  expect(uris.size).toBeLessThanOrEqual(1);
 }
});
it('sizes each chess role individually, ordered by visual importance',()=>{
 const scale=(role:typeof christianPlaces[number]['markerType'])=>Number(calendarModelGraphics(chessModel(role)!,false).scale);
 expect(scale('king')).toBeGreaterThan(scale('queen'));
 expect(scale('queen')).toBeGreaterThan(scale('bishop'));
 expect(scale('bishop')).toBeCloseTo(scale('knight'),5);
 expect(scale('knight')).toBeGreaterThan(scale('rook'));
 expect(scale('rook')).toBeGreaterThan(scale('pawn'));
});
it('preserves independent Christian Places and models flags across every section',()=>{
 for(const mode of globeModes)expect(layersForMode({...defaultLayers,christianPlaces:false,sacredModels:false},mode)).toMatchObject({christianPlaces:false,sacredModels:false,cities:true});
 expect(initialLayers(new URLSearchParams('layers=christianPlaces'))).toMatchObject({christianPlaces:true,sacredModels:false});
});
