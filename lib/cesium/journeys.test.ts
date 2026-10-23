import {describe,expect,it} from 'vitest';
import {distanceKm,interpolate,journeyPosition,journeySchedule,journeys} from './journeys';

describe('journeys of the Apostle Paul',()=>{
  it('has complete, located, translated stops with Acts references',()=>{
    expect(journeys.map(j=>j.id)).toEqual(['paul-1','paul-2','paul-3','paul-rome']);
    for(const journey of journeys){
      expect(journey.stops.length).toBeGreaterThan(5);expect(journey.stops[0].by).toBeUndefined();
      for(const stop of journey.stops){
        expect(Math.abs(stop.lat)).toBeLessThan(90);expect(Math.abs(stop.lon)).toBeLessThan(180);
        expect(stop.name.uk&&stop.name.ru&&stop.name.en).toBeTruthy();expect(stop.acts).toMatch(/^\d+:\d+/);
      }
    }
    expect(journeys[0].stops.at(0)?.id).toBe('antioch');expect(journeys[0].stops.at(-1)?.id).toBe('antioch');
    expect(journeys[3].stops.at(-1)?.id).toBe('rome');
  });
  it('measures great-circle distances and interpolates along them',()=>{
    const athens={lat:37.9715,lon:23.7257},rome={lat:41.893,lon:12.483};
    expect(distanceKm(athens,rome)).toBeGreaterThan(1040);expect(distanceKm(athens,rome)).toBeLessThan(1060);
    expect(interpolate(athens,rome,0)).toEqual(expect.objectContaining({lat:expect.closeTo(athens.lat,6),lon:expect.closeTo(athens.lon,6)}));
    const middle=interpolate(athens,rome,.5);
    expect(distanceKm(athens,middle)).toBeCloseTo(distanceKm(middle,rome),3);
  });
  it('schedules legs by length with a pause at every stop',()=>{
    const journey=journeys[3],schedule=journeySchedule(journey,30,2);
    expect(schedule.stops).toHaveLength(journey.stops.length);
    expect(schedule.total).toBeCloseTo(30+2*journey.stops.length,6);
    expect(journeyPosition(journey,schedule,0)).toEqual({stop:0,leg:null,fraction:0});
    const first=schedule.stops[1];
    expect(journeyPosition(journey,schedule,(schedule.stops[0].leave+first.arrive)/2)).toEqual({stop:0,leg:1,fraction:expect.closeTo(.5,9)});
    expect(journeyPosition(journey,schedule,first.arrive+.5)).toEqual({stop:1,leg:null,fraction:0});
    expect(journeyPosition(journey,schedule,9999).stop).toBe(journey.stops.length-1);
  });
});
