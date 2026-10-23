import {describe,expect,it} from 'vitest';
import {formatDistance,formatDuration,navigationLinks,routeCopy} from './RoutePlanner';
import {routeBounds} from '@/lib/cesium/route-layer';

describe('route planner',()=>{
  it('formats distance and duration for people',()=>{
    const text=routeCopy.uk;
    expect(formatDistance(430,text)).toBe('430 м');expect(formatDistance(3927,text)).toBe('3.9 км');expect(formatDistance(1_234_567,text)).toBe('1235 км');
    expect(formatDuration(20,text)).toBe('1 хв');expect(formatDuration(3144,text)).toBe('52 хв');expect(formatDuration(3*3600+5*60,text)).toBe('3 год 5 хв');
  });
  it('hands the destination and travel mode to navigation apps',()=>{
    const [google,apple,osm]=navigationLinks(31.7784,35.2296,'foot');
    expect(google.href).toBe('https://www.google.com/maps/dir/?api=1&destination=31.7784,35.2296&travelmode=walking');
    expect(apple.href).toBe('https://maps.apple.com/?daddr=31.7784,35.2296&dirflg=w');
    expect(osm.href).toContain('engine=fossgis_osrm_foot');
    expect(navigationLinks(1,2,'car')[0].href).toContain('travelmode=driving');
  });
  it('pads route bounds and keeps them on the globe',()=>{
    // 18% of the span on each side, never less than 0.01 degrees.
    const city=routeBounds([[30.5,50.45],[30.56,50.43]]);
    expect(city.west).toBeCloseTo(30.4892,4);expect(city.east).toBeCloseTo(30.5708,4);expect(city.south).toBeCloseTo(50.42,4);expect(city.north).toBeCloseTo(50.46,4);
    // A right-hand panel over 30% of the canvas: the bounds grow east by the hidden share, the route keeps the left 70%.
    const covered=routeBounds([[30.5,50.45],[30.56,50.43]],.18,{left:0,right:.3,top:0,bottom:0});
    expect(covered.west).toBeCloseTo(city.west,6);expect((covered.east-city.east)/(covered.east-covered.west)).toBeCloseTo(.3,6);
    const wide=routeBounds([[-179.9,-89.9],[179.9,89.9]]);
    expect([wide.west,wide.south,wide.east,wide.north]).toEqual([-180,-90,180,90]);
  });
});
