import * as THREE from 'three';
import { countryBorderPositions } from './country-borders';
import { latLngToVector3 } from './geography';
import type { Country, Position } from './countries';

/** Triangulate each independent polygon with holes, then subdivide in geographic
 * coordinates. Fine spherical triangles follow curvature instead of a flat cap. */
export function createCountryHighlight(country: Country) {
  const vertices: number[] = [];
  const maxEdge = 1; // degrees; sagitta safely below the 0.35% surface offset
  const emit = (a:Position,b:Position,c:Position,depth=0) => {
    const length = (p:Position,q:Position)=>Math.hypot((p[0]-q[0])*Math.cos((p[1]+q[1])*Math.PI/360),p[1]-q[1]);
    const edges=[length(a,b),length(b,c),length(c,a)];
    const longest=Math.max(...edges);
    if(longest>maxEdge && depth<24){
      const mid=(p:Position,q:Position):Position=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
      const i=edges.indexOf(longest);
      if(i===0){const m=mid(a,b);emit(a,m,c,depth+1);emit(m,b,c,depth+1);}
      else if(i===1){const m=mid(b,c);emit(a,b,m,depth+1);emit(a,m,c,depth+1);}
      else {const m=mid(c,a);emit(a,b,m,depth+1);emit(m,b,c,depth+1);}
      return;
    }
    for(const [lon,lat] of [a,b,c]) {const p=latLngToVector3(lat,lon,1.0035);vertices.push(p.x,p.y,p.z);}
  };
  for(const polygon of country.polygons){
    const rings=polygon.rings.map(r=>r.slice(0,-1).map(([x,y])=>new THREE.Vector2(x,y)));
    const points=rings.flat();
    const faces=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1));
    for(const [a,b,c] of faces) emit(points[a].toArray() as Position,points[b].toArray() as Position,points[c].toArray() as Position);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeBoundingSphere();
  const fill=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xcfa958,transparent:true,opacity:0.16,depthTest:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false}));
  fill.material.forceSinglePass=true;
  const outlineGeometry=new THREE.BufferGeometry();
  const positions=countryBorderPositions({type:'FeatureCollection',features:[country.feature]});
  for(let i=0;i<positions.length;i++)positions[i]*=1.0044;
  outlineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const outline=new THREE.LineSegments(outlineGeometry,new THREE.LineBasicMaterial({color:0xf1d397,transparent:true,opacity:0.92,depthTest:true,depthWrite:false,toneMapped:false}));
  const anchor=new THREE.Mesh(new THREE.SphereGeometry(0.0035,10,8),new THREE.MeshBasicMaterial({color:0xf4d793,depthTest:true,toneMapped:false}));
  anchor.position.copy(latLngToVector3(country.point.latitude,country.point.longitude,1.008));
  const group=new THREE.Group();group.name=`CountryHighlight:${country.info.code}`;group.add(fill,outline,anchor);
  return {group,fill,outline,anchor};
}
export type CountryHighlight = ReturnType<typeof createCountryHighlight>;
export function disposeCountryHighlight(highlight:CountryHighlight){
  for(const object of [highlight.fill,highlight.outline,highlight.anchor]){object.geometry.dispose();object.material.dispose();}
}
