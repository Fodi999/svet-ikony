import {expect,it,vi} from 'vitest';
import {defaultLayers,initialLayers,layersForMode,modeFromParams,globeModes} from './unified';
import {KnowledgeLayerManager} from './knowledge';
it('maps legacy links into one mode without a second renderer',()=>{
  expect(modeFromParams(new URLSearchParams())).toBe('globe');
  expect(modeFromParams(new URLSearchParams('engine=cesium&view=history'))).toBe('history');
  expect(modeFromParams(new URLSearchParams('calendarDate=2026-01-21'))).toBe('calendar');
  expect(modeFromParams(new URLSearchParams('mode=globe&date=2026-01-21'))).toBe('globe');
});
it('preserves geography and explicit visibility through 50 mode switches',()=>{
  let state={...defaultLayers,cities:true,borders:false};
  for(let i=0;i<50;i++){
    state=layersForMode(state,globeModes[i%globeModes.length]);
    expect(state).toMatchObject({countries:true,capitals:true,cities:true,borders:false});
  }
});
it('restores explicit URL layers including an empty set',()=>{
  expect(initialLayers(new URLSearchParams('mode=calendar')).calendar).toBe(true);
  expect(initialLayers(new URLSearchParams('layers=countries,capitals'))).toMatchObject({countries:true,capitals:true,borders:false,calendar:false});
  expect(Object.values(initialLayers(new URLSearchParams('layers='))).every(value=>!value)).toBe(true);
});
it('applies pending visibility to asynchronous layers and disposes once',()=>{
  const manager=new KnowledgeLayerManager();manager.setVisible('cities',false);
  const layer={id:'cities',kind:'city' as const,setVisible:vi.fn(),dispose:vi.fn()};
  manager.add(layer);expect(layer.setVisible).toHaveBeenLastCalledWith(false);
  for(let i=0;i<50;i++)manager.setVisible('cities',i%2===0);
  expect(manager.snapshot()).toHaveLength(1);manager.dispose();manager.dispose();expect(layer.dispose).toHaveBeenCalledOnce();
});
