import {expect,it} from 'vitest';
import {uniquePlotEdges} from './plot-edges';
import {generateSacredPlots,pointInPolygon,type TerritoryGeometry} from './sacred-plots';
const geometry:TerritoryGeometry={type:'Polygon',coordinates:[[[30,50],[30.001,50],[30.001,50.001],[30,50.001],[30,50]]]};
it('deduplicates shared hex edges without removing exterior edges',()=>{
  const plots=generateSacredPlots({territoryPolygon:geometry,sacredPlaceId:'test'});
  const first=plots[0],neighbor=plots.find(plot=>plot!==first&&uniquePlotEdges([first,plot]).length===11)!;
  expect(neighbor).toBeDefined();expect(uniquePlotEdges([first]).length).toBe(6);
  expect(uniquePlotEdges([first,neighbor])).toHaveLength(11);
  expect(uniquePlotEdges([neighbor,first])).toHaveLength(11);
});
it('rejects positions outside the territory and in holes',()=>{
  expect(pointInPolygon(30.0005,50.0005,geometry)).toBe(true);
  expect(pointInPolygon(29.999,50.0005,geometry)).toBe(false);
  const holed:TerritoryGeometry={type:'Polygon',coordinates:[geometry.coordinates[0],[[30.0004,50.0004],[30.0006,50.0004],[30.0006,50.0006],[30.0004,50.0006],[30.0004,50.0004]]]};
  expect(pointInPolygon(30.0005,50.0005,holed)).toBe(false);
});
