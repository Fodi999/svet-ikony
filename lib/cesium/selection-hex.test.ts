import {expect,it,vi} from 'vitest';
import * as C from '@cesium/engine';
import {createSelectionHexController,selectionHex,selectionRadius} from './selection-hex';
it('bounds a readable visual radius across zoom levels',()=>{
 expect(selectionRadius(.01)).toBe(3);expect(selectionRadius(1)).toBe(96);
 expect(selectionRadius(100000)).toBe(200000);expect(selectionRadius(NaN)).toBe(700);
});
it('keeps geographic mapping and classifies both ground and 3D surfaces',()=>{
 const entity=new C.Entity(selectionHex(30,50,{calendarEntityId:'saint'}));
 expect(entity.properties?.calendarEntityId.getValue()).toBe('saint');
 expect(entity.properties?.selectionHexLocation.getValue()).toEqual([30,50]);
 expect(entity.polygon?.classificationType?.getValue()).toBe(C.ClassificationType.BOTH);
 expect(entity.polyline?.clampToGround?.getValue()).toBe(true);
});
it('resizes only selected contours on camera changes and disposes its listeners',()=>{
 const source=new C.CustomDataSource(),changed=new C.Event(),moveEnd=new C.Event();
 const entity=source.entities.add(selectionHex(30,50)),center=C.Cartesian3.fromDegrees(30,50);
 let pixel=1;
 const measure=vi.fn(()=>pixel);
 const widget={camera:{changed,moveEnd,getPixelSize:measure},canvas:{clientWidth:1400,clientHeight:900},isDestroyed:()=>false,scene:{drawingBufferWidth:2800,drawingBufferHeight:1800,requestRender:vi.fn()}};
 const controller=createSelectionHexController(widget as unknown as C.CesiumWidget,source);
 controller.refresh();
 expect(measure).toHaveBeenCalledWith(expect.any(C.BoundingSphere),2800,1800);
 const first=entity.polygon!.hierarchy;
 expect(C.Cartesian3.distance(center,first!.getValue(C.JulianDate.now()).positions[0])).toBeCloseTo(96,1);
 pixel=1.05;changed.raiseEvent();expect(entity.polygon!.hierarchy).toBe(first);
 pixel=.1;moveEnd.raiseEvent();expect(C.Cartesian3.distance(center,entity.polygon!.hierarchy!.getValue(C.JulianDate.now()).positions[0])).toBeCloseTo(9.6,1);
 expect(source.entities.values).toHaveLength(1);
 controller.dispose();controller.dispose();expect(changed.numberOfListeners).toBe(0);expect(moveEnd.numberOfListeners).toBe(0);
});
