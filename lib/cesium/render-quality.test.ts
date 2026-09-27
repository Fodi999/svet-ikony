import {afterEach,expect,it,vi} from 'vitest';
import type {CesiumWidget} from '@cesium/engine';
import {installRenderQuality,resolutionForMotion} from './render-quality';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('restores Retina sharpness and caps high density displays',()=>{
  expect(resolutionForMotion(2,1440,924,false)).toBe(1);
  expect(resolutionForMotion(3,1440,924,false)).toBe(2/3);
});
it('limits moving pixel count without dropping below CSS resolution',()=>{
  const scale=resolutionForMotion(2,1440,924,true);
  expect(1440*924*(2*scale)**2).toBeCloseTo(1_500_000);
  expect(resolutionForMotion(2,3840,2160,true)).toBe(.5);
  expect(resolutionForMotion(1,1440,924,true)).toBe(1);
});
it('retains mobile density and handles empty canvases',()=>{
  expect(resolutionForMotion(2,390,716,true)).toBe(1);
  expect(resolutionForMotion(2,0,0,true)).toBe(1);
});
it('restores quality after motion, cancels pending restoration and removes listeners',()=>{
  vi.useFakeTimers();
  const event=()=>{
    const listeners=new Set<()=>void>();
    return {listeners,addEventListener(fn:()=>void){listeners.add(fn);return ()=>listeners.delete(fn);},raise(){listeners.forEach(fn=>fn());}};
  };
  const moveStart=event(),moveEnd=event(),resize=vi.fn(),requestRender=vi.fn();
  const addEventListener=vi.fn(),removeEventListener=vi.fn();
  vi.stubGlobal('window',{devicePixelRatio:2,addEventListener,removeEventListener});
  const viewMatrix=Array(16).fill(0);
  const widget={resolutionScale:1,useBrowserRecommendedResolution:true,isDestroyed:()=>false,canvas:{clientWidth:1440,clientHeight:924},camera:{moveStart,moveEnd,viewMatrix},scene:{requestRender},resize};
  const dispose=installRenderQuality(widget as unknown as CesiumWidget);
  viewMatrix[12]=10;moveStart.raise();expect(widget.resolutionScale).toBeLessThan(1);
  moveEnd.raise();vi.advanceTimersByTime(100);moveStart.raise();vi.advanceTimersByTime(300);
  expect(widget.resolutionScale).toBeLessThan(1);
  moveEnd.raise();vi.advanceTimersByTime(200);expect(widget.resolutionScale).toBe(1);
  moveStart.raise();expect(widget.resolutionScale).toBe(1);
  viewMatrix[12]=20;moveStart.raise();moveEnd.raise();dispose();const calls=resize.mock.calls.length;
  vi.advanceTimersByTime(300);expect(resize).toHaveBeenCalledTimes(calls);
  expect(moveStart.listeners.size+moveEnd.listeners.size).toBe(0);
  expect(removeEventListener).toHaveBeenCalledWith('resize',addEventListener.mock.calls[0][1]);
});
