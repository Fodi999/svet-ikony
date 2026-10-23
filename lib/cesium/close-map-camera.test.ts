import {describe,expect,it} from 'vitest';
import {CAMERA_TUNING,TILT_POINTS,ZONE_HEIGHTS,MAX_TILT_STEP,classifyGesture,closeMapEnabled,createTiltCurve,easedTilt,effectiveCap,preferredTilt,zoneFor,zoomFactorFor} from './close-map-camera';

const deg=(value:number)=>value*Math.PI/180;
const toDeg=(value:number)=>value*180/Math.PI;

describe('close-map camera',()=>{
  it('splits the camera height into global, regional and close zones',()=>{
    expect(zoneFor(14_000_000)).toBe('global');
    expect(zoneFor(ZONE_HEIGHTS.global+1)).toBe('global');
    expect(zoneFor(ZONE_HEIGHTS.global)).toBe('regional');
    expect(zoneFor(500_000)).toBe('regional');
    expect(zoneFor(ZONE_HEIGHTS.close)).toBe('regional');
    expect(zoneFor(199_999)).toBe('close');
    expect(zoneFor(50)).toBe('close');
  });
  it('never restricts the global view',()=>{
    expect(preferredTilt(20_000_000)).toBe(Infinity);
    expect(preferredTilt(ZONE_HEIGHTS.global)).toBe(Infinity);
  });
  it('passes through every control point and ends top-down',()=>{
    for(const [height,tilt] of TILT_POINTS.slice(0,-1))expect(toDeg(preferredTilt(height))).toBeCloseTo(tilt,4);
    expect(toDeg(preferredTilt(1_499_999))).toBeCloseTo(70,0);
    expect(preferredTilt(5_000)).toBe(0);
    expect(preferredTilt(50)).toBe(0);
  });
  it('is smooth and monotone while descending (no snap, no overshoot)',()=>{
    let last=Infinity;
    for(let height=1_499_000;height>=5_000;height*=0.97){
      const cap=preferredTilt(height);
      expect(cap).toBeLessThanOrEqual(last+1e-9);
      expect(cap).toBeGreaterThanOrEqual(0);
      last=cap;
    }
    let previous=preferredTilt(1_499_000);
    for(let height=1_499_000;height>=5_000;height*=0.99){
      const cap=preferredTilt(height);
      expect(previous-cap).toBeLessThan(deg(1.2));
      previous=cap;
    }
  });
  it('matches the requested pitch landmarks',()=>{
    expect(toDeg(preferredTilt(40_000))).toBeGreaterThan(5);
    expect(toDeg(preferredTilt(40_000))).toBeLessThan(10);
    expect(toDeg(preferredTilt(10_000))).toBeLessThan(3);
    expect(toDeg(preferredTilt(100_000))).toBeCloseTo(20,0);
  });
  it('accepts a custom curve',()=>{
    const flat=createTiltCurve([[1000,0],[2000,0],[3000,0]]);
    expect(flat(1500)).toBe(0);
    expect(flat(3000)).toBe(Infinity);
  });
  it('eases toward the cap only while zooming in',()=>{
    expect(easedTilt(deg(50),deg(10),0)).toBe(deg(50));
    expect(easedTilt(deg(5),deg(10),.1)).toBe(deg(5));
    const step=easedTilt(deg(50),deg(10),.02);
    expect(step).toBeLessThan(deg(50));
    expect(step).toBeGreaterThan(deg(10));
    expect(easedTilt(deg(50),deg(10),.5)).toBe(deg(50)-MAX_TILT_STEP);
    expect(easedTilt(deg(12),deg(10),.5)).toBe(deg(10));
    expect(easedTilt(deg(10.05),deg(10),.02)).toBe(deg(10));
  });
  it('honours a manual tilt until the user zooms in to half of the height where it was set',()=>{
    const manual={tilt:deg(40),height:20_000};
    expect(effectiveCap(deg(6),19_000,manual)).toBe(deg(40));
    expect(effectiveCap(deg(6),10_001,manual)).toBe(deg(40));
    expect(effectiveCap(deg(6),9_999,manual)).toBe(deg(6));
    expect(effectiveCap(deg(6),19_000,null)).toBe(deg(6));
    expect(effectiveCap(deg(45),19_000,manual)).toBe(deg(45));
  });
  it('keeps the wheel/pinch tuning inside documented ScreenSpaceCameraController ranges',()=>{
    expect(CAMERA_TUNING.minimumZoomDistance).toBeGreaterThanOrEqual(10);
    expect(CAMERA_TUNING.inertiaZoom).toBeGreaterThanOrEqual(0);
    expect(CAMERA_TUNING.inertiaZoom).toBeLessThan(1);
    expect(CAMERA_TUNING.zoomFactorClose).toBeGreaterThan(0);
    expect(CAMERA_TUNING.zoomFactorClose).toBeLessThanOrEqual(CAMERA_TUNING.zoomFactorFar);
  });
  it('keeps the default wheel speed on the globe and slows it smoothly toward street scale',()=>{
    expect(zoomFactorFor(20_000_000)).toBe(CAMERA_TUNING.zoomFactorFar);
    expect(zoomFactorFor(ZONE_HEIGHTS.global)).toBe(CAMERA_TUNING.zoomFactorFar);
    expect(zoomFactorFor(ZONE_HEIGHTS.close)).toBeCloseTo(CAMERA_TUNING.zoomFactorClose,6);
    expect(zoomFactorFor(100)).toBeCloseTo(CAMERA_TUNING.zoomFactorClose,6);
    let last=Infinity;
    for(let height=2_000_000;height>50;height*=0.9){const factor=zoomFactorFor(height);expect(factor).toBeLessThanOrEqual(last);last=factor;}
  });
  it('can be disabled with ?closeMap=0',()=>{
    expect(closeMapEnabled('')).toBe(true);
    expect(closeMapEnabled('?closeMap=0')).toBe(false);
  });
  it('tells zoom, tilt and pan gestures apart so a tilt drag is never undone as a zoom',()=>{
    const left={button:0,ctrl:false,x:0,y:0},middle={button:1,ctrl:false,x:0,y:0},right={button:2,ctrl:false,x:0,y:0},ctrlLeft={button:0,ctrl:true,x:0,y:0};
    expect(classifyGesture([])).toBe('none');
    expect(classifyGesture([left])).toBe('pan');
    expect(classifyGesture([middle])).toBe('tilt');
    expect(classifyGesture([ctrlLeft])).toBe('tilt');
    expect(classifyGesture([right])).toBe('zoom');
    expect(classifyGesture([left,left],{spread:12,midY:1})).toBe('zoom');
    expect(classifyGesture([left,left],{spread:-12,midY:2})).toBe('zoom');
    expect(classifyGesture([left,left],{spread:2,midY:9})).toBe('tilt');
    expect(classifyGesture([left,left])).toBe('tilt');
    expect(classifyGesture([left,left],{spread:0,midY:0})).toBe('none');
    expect(classifyGesture([left,left],{spread:0.4,midY:-0.3})).toBe('none');
  });
});
