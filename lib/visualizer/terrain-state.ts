export type ViewLevel = 'GLOBE' | 'REGION_L1' | 'REGION_L2' | 'LOCAL_L3' | 'HISTORICAL_SCENE';
export type TerrainStatus = { viewLevel: ViewLevel; loading: boolean; error: boolean; loaded: number; total: number; bytes: number; failed: string[]; transform: string; anchors: string };
export const INITIAL_TERRAIN: TerrainStatus = { viewLevel:'GLOBE',loading:false,error:false,loaded:0,total:0,bytes:0,failed:[],transform:'—',anchors:'—' };
export function terrainAllowed(device: { mobile:boolean; memory?:number; cores?:number; saveData?:boolean; usedHeap?:number; heapLimit?:number }, zoomed:boolean) {
  if(device.saveData || (device.memory!==undefined&&device.memory<4) || (device.cores!==undefined&&device.cores<4))return false;
  if(device.usedHeap&&device.heapLimit&&device.usedHeap/device.heapLimit>0.75)return false;
  return !device.mobile||zoomed;
}
export const terrainMessages = {
 uk:{back:'Назад до глобуса',loading:'Завантаження детального рельєфу…',error:'Детальний рельєф тимчасово недоступний'},
 ru:{back:'Назад к глобусу',loading:'Загрузка детального рельефа…',error:'Детальный рельеф временно недоступен'},
 en:{back:'Back to globe',loading:'Loading detailed terrain…',error:'Detailed terrain is temporarily unavailable'},
};
