import type {LonLat, SacredPlot} from './sacred-plots';

/** Quantize below a millimeter to merge the same edge from adjacent cells. */
export function uniquePlotEdges(plots: SacredPlot[]): [LonLat, LonLat][] {
  const edges=new Map<string,[LonLat,LonLat]>();
  const key=([lon,lat]:LonLat)=>`${lon.toFixed(9)},${lat.toFixed(9)}`;
  for(const plot of plots)for(let i=1;i<plot.boundary.length;i++){
    const a=plot.boundary[i-1],b=plot.boundary[i],ka=key(a),kb=key(b);
    edges.set(ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,[a,b]);
  }
  return [...edges.values()];
}
