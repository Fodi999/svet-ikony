import {describe,it,expect,vi} from 'vitest';
import type {CesiumWidget} from '@cesium/engine';
import {calendarMarkers,calendarMarkerStyle,createOrthodoxCalendarLayer} from './calendar';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
vi.mock('@cesium/engine',async original=>({...await original<typeof import('@cesium/engine')>(),ScreenSpaceEventHandler:class{setInputAction(){}destroy(){}}}));
const point:CalendarGeoItem={entityId:'e',entityType:'saint',title:'Test',placeId:'p',placeTitle:'Place',relationType:'birth',lat:38,lon:35,markerPriority:70,thumbnail:null,matchStatus:'machine_high'};
describe('OrthodoxCalendarLayer',()=>{
  it('uses restrained point sizes and only available thumbnails',()=>{
    expect(calendarMarkerStyle(point,false).pixelSize).toBe(4);
    expect(calendarMarkerStyle({...point,markerPriority:90},false).pixelSize).toBe(7);
    expect(calendarMarkerStyle(point,true)).toMatchObject({pixelSize:11,thumbnail:false});
    expect(calendarMarkerStyle({...point,thumbnail:'https://example.org/image.jpg'},true).thumbnail).toBe(true);
  });
  it('deduplicates multiple relations at one place without losing different places',()=>{
    expect(calendarMarkers([point,{...point,relationType:'death'},{...point,placeId:'p2',lat:40}])).toHaveLength(2);
  });
  it('filters categories and rejects unknown/invalid coordinates',()=>{
    expect(calendarMarkers([point],'icon')).toEqual([]);
    expect(calendarMarkers([{...point,lat:NaN},{...point,lon:181}])).toEqual([]);
  });
  it('handles a dense calendar day without duplicating repeated commemorations',()=>{
    const day=Array.from({length:500},(_,i)=>({...point,entityId:`saint-${i%50}`,markerPriority:i%50}));
    const markers=calendarMarkers(day);expect(markers).toHaveLength(50);expect(markers[0].markerPriority).toBe(49);
  });
  it('clears markers on date changes and safely disposes after widget destruction',()=>{
    let source:{entities:{values:unknown[]}}|undefined;
    let destroyed=false;
    const widget={canvas:{},dataSources:{add:vi.fn(async value=>{source=value;return value;}),remove:vi.fn()},
      isDestroyed:()=>destroyed,scene:{requestRender:vi.fn()},camera:{flyToBoundingSphere:vi.fn()}};
    const layer=createOrthodoxCalendarLayer(widget as unknown as CesiumWidget,vi.fn(),vi.fn());
    layer.update([point]);expect(source?.entities.values).toHaveLength(1);
    layer.update([]);expect(source?.entities.values).toHaveLength(0);
    layer.focus([]);expect(widget.camera.flyToBoundingSphere).not.toHaveBeenCalled();
    layer.focus([point]);expect(widget.camera.flyToBoundingSphere).toHaveBeenCalledOnce();
    destroyed=true;expect(()=>layer.dispose()).not.toThrow();expect(widget.dataSources.remove).not.toHaveBeenCalled();
  });
});
