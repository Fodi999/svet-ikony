export type MarkerPublication={ownerId:string;entityId:string|null;placeId:string|null;versionId:string|null;markerKey:string|null;panelKey:string|null};
export function markerPublication(rows:MarkerPublication[],entityId?:string|null,placeId?:string|null){
 return rows.find(row=>!!entityId&&row.entityId===entityId)??rows.find(row=>!!placeId&&row.placeId===placeId);
}
