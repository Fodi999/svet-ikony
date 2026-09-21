import type {CalendarGeoItem} from '@/lib/d1/repositories/calendarGeo';

/** Explicit local-only visual fixtures, never imported or persisted as calendar facts. */
export function sacredDemo(params:URLSearchParams,hostname:string){
  if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1'].includes(hostname)||!params.has('sacredDemo'))return null;
  const types=['saint','church','icon','pilgrimage_route','monastery','major_sacred_place'];
  const places=[['Rome',12.4964,41.9028],['Jerusalem',35.2137,31.7683],['Istanbul',28.9784,41.0082],['Alexandria',29.9187,31.2001],['Damascus',36.2765,33.5138],['Athos',24.2444,40.1578]] as const;
  const count=params.get('sacredDemo')==='places'?6:Math.max(1,Math.min(25,Number(params.get('sacredDemo'))||6));
  const items:CalendarGeoItem[]=Array.from({length:count},(_,i)=>{
    const place=places[i%places.length],spread=params.get('sacredDemo')!=='places';
    return {entityId:`demo:sacred-${i}`,entityType:types[i%6],title:`LOCAL ${types[i%6]}`,placeId:`demo:place-${i}`,placeTitle:spread?'Rome test grid':place[0],
      lat:spread?41.9+Math.floor(i/5)*.12:place[2],lon:spread?12.5+(i%5)*.16:place[1],relationType:'test_fixture',markerPriority:90,thumbnail:null,matchStatus:'local_fixture'};
  });
  return {items};
}
