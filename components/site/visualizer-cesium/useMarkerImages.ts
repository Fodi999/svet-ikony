'use client';
import {useEffect,useState} from 'react';
import type {MarkerPublication as PublishedImage} from '@/lib/cesium/marker-publication';
const loads=new Map<string,Promise<boolean>>();
function ready(key:string){
 if(!loads.has(key))loads.set(key,new Promise(resolve=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src='/'+key;}));
 return loads.get(key)!;
}
export function useMarkerImages(){
 const [images,setImages]=useState<PublishedImage[]>([]);
 useEffect(()=>{let stopped=false,busy=false,last='';const abort=new AbortController();
  const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{
   const response=await fetch('/api/marker-images',{cache:'no-store',signal:abort.signal});if(!response.ok)return;
   const rows=await response.json() as PublishedImage[];
   const prepared=await Promise.all(rows.map(async row=>row.markerKey&&row.panelKey&&!(await Promise.all([ready(row.markerKey),ready(row.panelKey)])).every(Boolean)?{...row,markerKey:null,panelKey:null}:row));
   const fingerprint=JSON.stringify(prepared);if(!stopped&&fingerprint!==last){last=fingerprint;setImages(prepared);}
  }catch{/* Keep the last publication on a temporary API outage. */}finally{busy=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),5000);window.addEventListener('focus',refresh);return()=>{stopped=true;abort.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[]);return images;
}
