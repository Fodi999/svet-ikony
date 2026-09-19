'use client';
import {useEffect,useRef,useState} from 'react';
import type {CesiumWidget} from '@cesium/engine';
import {KnowledgeLayerManager} from '@/lib/cesium/knowledge';
import {createCesiumCountries} from '@/lib/cesium/countries';
import {createCesiumCapitals} from '@/lib/cesium/capitals';
import {createCesiumEvents} from '@/lib/cesium/events';
import {countryMetadata} from '@/lib/visualizer/countries';
import {territoryForEvent} from '@/lib/visualizer/historical-territories';
import type {CapitalCity} from '@/lib/visualizer/capital-cities';
import type {ChurchVisualizerEventDto} from '@/lib/types';
import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';
import type {CalendarEntry} from '@/lib/church/calendar-entry';
import type {GlobeLayers} from '@/lib/cesium/unified';
import {layerHandlerCount} from '@/lib/cesium/handlers';

export type GlobeDetails={id:string;title:string;summary:string;biography?:string;entityType:string;matchStatus:string;wikipedia:string|null;places:CalendarGeoItem[];
  image:{url:string;author:string;license:string;commonsPage:string}|null;sources:{url:string;type:string}[];relatedContent:{type:string;slug:string;title:string;language:string}[]};
export function useUnifiedLayers(widget:CesiumWidget,locale:'uk'|'ru'|'en',visibility:GlobeLayers,selected:string|null,onSelect:(id:string|null)=>void) {
  const manager=useRef(new KnowledgeLayerManager()),countries=useRef<Awaited<ReturnType<typeof createCesiumCountries>>|null>(null),history=useRef<ReturnType<typeof createCesiumEvents>|null>(null);
  const options=useRef({locale,onSelect,selected});
  const cityCache=useRef(new Map<string,CapitalCity>());
  const [,setDataRevision]=useState(0);
  const [catalog,setCatalog]=useState<{items:CalendarGeoItem[];entries:CalendarEntry[]}>({items:[],entries:[]});
  const [events,setEvents]=useState<ChurchVisualizerEventDto[]>([]),[year,setYear]=useState(''),[error,setError]=useState('');
  useEffect(()=>{options.current={locale,onSelect,selected};widget.scene.requestRender();},[locale,onSelect,selected,widget]);
  useEffect(()=>{
    const abort=new AbortController(),layers=manager.current;
    let capitalBoxes=():{x:number;y:number;w:number}[]=>[];
    const fail=(error:unknown)=>{if(!abort.signal.aborted)setError(String(error));};
    const eventLayer=createCesiumEvents(widget,id=>options.current.onSelect('event:'+id),fail);history.current=eventLayer;
    layers.add({...eventLayer,id:'events'});
    layers.add({id:'territories',kind:'historical-territory',setVisible:value=>eventLayer.setTerritoriesVisible(value),dispose(){}});
    void createCesiumCountries(widget,{signal:abort.signal,locale:()=>options.current.locale,onSelect:code=>options.current.onSelect('country:'+code)}).then(layer=>{
      if(abort.signal.aborted){layer.dispose();return;}countries.current=layer;
      layers.add({id:'countries',kind:'country',setVisible:value=>layer.setVisible(value),dispose:()=>layer.dispose()});
      layers.add({id:'borders',kind:'border',setVisible:value=>layer.setBorders(value),dispose(){}});
      const selection=options.current.selected;
      layer.select(selection?.startsWith('country:')?selection.slice(8):null,false);
    }).catch(fail);
    for(const kind of ['capital','city'] as const)void createCesiumCapitals(widget,{kind,signal:abort.signal,locale:()=>options.current.locale,reserved:()=>[...(countries.current?.labelBoxes()??[]),...(kind==='city'?capitalBoxes():[])],onData:rows=>{for(const city of rows)cityCache.current.set(kind+':'+city.id,city);setDataRevision(value=>value+1);},onSelect:city=>options.current.onSelect(kind+':'+city.id)}).then(layer=>{
      if(abort.signal.aborted){layer.dispose();return;}if(kind==='capital')capitalBoxes=()=>layer.labelBoxes?.()??[];layers.add(layer);
    }).catch(fail);
    const remove=widget.scene.postRender.addEventListener(()=>{
      widget.canvas.dataset.layers=JSON.stringify(layers.snapshot());
      widget.canvas.dataset.sources=JSON.stringify(Array.from({length:widget.dataSources.length},(_,i)=>({name:widget.dataSources.get(i).name,count:widget.dataSources.get(i).entities.values.length,show:widget.dataSources.get(i).show})));
      widget.canvas.dataset.primitives=String(widget.scene.primitives.length+widget.scene.groundPrimitives.length);
      widget.canvas.dataset.layerHandlers=String(layerHandlerCount(widget));
      widget.canvas.dataset.preRenderListeners=String(widget.scene.preRender.numberOfListeners);
    });
    return()=>{abort.abort();remove();layers.dispose();countries.current=null;history.current=null;};
  },[widget]);
  useEffect(()=>{for(const [id,value] of Object.entries(visibility))manager.current.setVisible(id,value);},[visibility]);
  useEffect(()=>{
    const abort=new AbortController();
    void fetch('/api/calendar/catalog?locale='+locale,{signal:abort.signal}).then(response=>{if(!response.ok)throw new Error('Catalog unavailable');return response.json() as Promise<typeof catalog>;}).then(data=>{if(!abort.signal.aborted)setCatalog(data);}).catch(error=>{if(!abort.signal.aborted)setError(String(error));});
    void fetch('/api/church/visualizer-events?language='+locale,{signal:abort.signal}).then(response=>{if(!response.ok)throw new Error('History unavailable');return response.json() as Promise<ChurchVisualizerEventDto[]>;}).then(data=>{if(!abort.signal.aborted)setEvents(data);}).catch(error=>{if(!abort.signal.aborted)setError(String(error));});
    return()=>abort.abort();
  },[locale]);
  const filteredEvents=events.filter(event=>!year||String(event.yearStart)===year);
  useEffect(()=>{
    const active=events.find(event=>'event:'+event.id===selected)??null;
    history.current?.update(events.filter(event=>!year||String(event.yearStart)===year).flatMap(event=>event.latitude!==null&&event.longitude!==null?[{id:event.id,title:event.title,latitude:event.latitude,longitude:event.longitude,date:event.displayDate}]:[]),active?{id:active.id,latitude:active.latitude,longitude:active.longitude,modelUrl:null}:null);
    void history.current?.territory(territoryForEvent(active)).catch(error=>setError(String(error)));
    countries.current?.select(selected?.startsWith('country:')?selected.slice(8):null,false);
  },[events,selected,year]);
  function selectionDetails():GlobeDetails|null {
    const base={id:selected??'',summary:'',matchStatus:'',wikipedia:null,places:[],image:null,sources:[],relatedContent:[]};
    if(selected?.startsWith('country:')){const country=countryMetadata[selected.slice(8)];return country?{...base,title:country.name[locale],entityType:'country',summary:country.capital?.[locale]??country.continent}:null;}
    const city=selected?cityCache.current.get(selected):null;
    if(city)return {...base,title:city.names[locale]||city.name,entityType:selected!.startsWith('city:')?'city':'capital',summary:`${countryMetadata[city.countryIso2]?.name[locale]??city.countryName} · ${city.lat.toFixed(4)}°, ${city.lon.toFixed(4)}°`};
    const event=events.find(event=>'event:'+event.id===selected);
    if(event)return {...base,title:event.title,entityType:'event',summary:event.summary,biography:event.description};
    return null;
  }
  return {manager,catalog,events:filteredEvents,years:[...new Set(events.map(event=>event.yearStart).filter(year=>year!==null))].sort((a,b)=>a-b),year,setYear,error,selectionDetails};
}
