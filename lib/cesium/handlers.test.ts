import {describe,expect,it,vi} from 'vitest';
import * as C from '@cesium/engine';
import {interactiveHit,isInteractive,pickCalendarMarker} from './handlers';
import {zoomStep} from './trackpad';

const pin=(key:string,value:string)=>new C.Entity({properties:{[key]:value},billboard:{image:'x'}});
const hex=(key:string,value:string)=>new C.Entity({properties:{[key]:value},polygon:{hierarchy:new C.PolygonHierarchy([])}});
function widgetWith(ids:unknown[]){
  const drillPick=vi.fn(()=>ids.map(id=>({id})));
  return {widget:{scene:{drillPick,pick:vi.fn()}} as unknown as C.CesiumWidget,drillPick};
}

describe('shared globe hit resolution',()=>{
  it('recognises pins, clusters and plots, ignores bare geometry',()=>{
    expect(isInteractive(pin('calendarEntityId','e'))).toBe(true);
    expect(isInteractive([pin('sacredPlaceId','p')])).toBe(true);
    expect(isInteractive({sacredPlotId:'1'})).toBe(true);
    expect(isInteractive(new C.Entity())).toBe(false);
    expect(isInteractive([])).toBe(false);
  });
  it('prefers a pin or cluster over a ground footprint underneath',()=>{
    const territory=hex('sacredPlaceId','lavra'),marker=pin('calendarEntityId','saint');
    const {widget}=widgetWith([territory,marker]);
    expect(interactiveHit(widget,new C.Cartesian2(10,10))).toBe(marker);
  });
  it('searches a forgiving square around the pointer for trackpads and touch',()=>{
    const {widget,drillPick}=widgetWith([]);
    interactiveHit(widget,new C.Cartesian2(20,20));
    const [,,width,height]=drillPick.mock.calls[0] as unknown as [unknown,number,number,number];
    expect(width).toBeGreaterThanOrEqual(24);expect(height).toBe(width);
  });
  it('never returns an entity hidden in a cluster as a calendar pin',()=>{
    const {widget}=widgetWith([[pin('calendarEntityId','a'),pin('calendarEntityId','b')]]);
    expect(pickCalendarMarker(widget,new C.Cartesian2(30,30))).toBeUndefined();
  });
});

describe('trackpad pinch zoom',()=>{
  it('scales with height and stays bounded',()=>{
    expect(zoomStep(1_000_000,10)).toBeCloseTo(120_000);
    expect(zoomStep(1_000_000,1000)).toBe(450_000);
    expect(zoomStep(10,.1)).toBe(2);
  });
});
