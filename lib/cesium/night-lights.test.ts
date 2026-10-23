import {expect,it,vi} from 'vitest';
import * as C from '@cesium/engine';
import {setNightLights} from './night-lights';
it('adds the city lights once, only on the night side, and keeps them on top while enabled',()=>{
  const layers:C.ImageryLayer[]=[];
  const imageryLayers={addImageryProvider:vi.fn((provider:C.ImageryProvider)=>{const layer=new C.ImageryLayer(provider);layers.push(layer);return layer;}),raiseToTop:vi.fn()};
  const widget={scene:{imageryLayers}} as unknown as C.CesiumWidget;
  setNightLights(widget,false);expect(imageryLayers.addImageryProvider).not.toHaveBeenCalled();
  setNightLights(widget,true);setNightLights(widget,true);
  expect(imageryLayers.addImageryProvider).toHaveBeenCalledOnce();
  expect(layers[0].dayAlpha).toBe(0);expect(layers[0].nightAlpha).toBe(1);expect(layers[0].show).toBe(true);
  expect(imageryLayers.raiseToTop).toHaveBeenCalledTimes(2);
  setNightLights(widget,false);expect(layers[0].show).toBe(false);
});
