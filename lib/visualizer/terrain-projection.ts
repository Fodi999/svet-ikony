import * as THREE from 'three';
import type { TerrainManifest } from '../terrain/contract';
import type { TerrainCoordinates } from './terrain-alignment';
/** One shared TerrainRoot projection. The source stores AEQD arc distances;
 * the globe needs chord distances. Files and tile transforms stay intact.
 * The equivalent projection is baked once into the decoded runtime buffers. */
export function projectTerrainPoint(point:THREE.Vector3,radiusUnits:number) {
  const angle=Math.hypot(point.x,point.z)/radiusUnits;
  const factor=angle<1e-7?1:Math.sin(angle)/angle;
  const height=point.y-radiusUnits*(Math.cos(angle)-1);
  const radial=1+height/radiusUnits;
  return new THREE.Vector3(point.x*factor*radial,(radiusUnits+height)*Math.cos(angle)-radiusUnits,point.z*factor*radial);
}
export function bakeTerrainGeometry(root:THREE.Object3D,manifest:TerrainManifest) {
  const c=manifest.coordinateSystem as TerrainCoordinates,R=c.earthRadiusMeters/c.metersPerUnit;
  const source=new THREE.Vector3(),v=new THREE.Vector3(),jacobian=new THREE.Matrix3(),normalMatrix=new THREE.Matrix3();
  root.traverse(node=>{const mesh=node as THREE.Mesh;const geometry=mesh.geometry;if(!geometry||geometry.userData.terrainProjected)return;
    const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),tangents=geometry.getAttribute('tangent');
    for(let i=0;i<positions.count;i++){
      source.fromBufferAttribute(positions,i);const x=source.x,z=source.z,r=Math.hypot(x,z),angle=r/R,sin=Math.sin(angle),cos=Math.cos(angle),f=angle<1e-5?1:sin/angle;
      const h=source.y-R*(cos-1),radial=1+h/R,df=angle<1e-5?0:(angle*cos-sin)/(angle*angle*R),wx=r<1e-5?0:x/r,wz=r<1e-5?0:z/r,k=df*radial+f*sin/R,ax=k*wx,az=k*wz,ay=f/R,a=f*radial;
      jacobian.set(a+x*ax,x*ay,x*az,sin*(cos-radial)*wx,cos,sin*(cos-radial)*wz,z*ax,z*ay,a+z*az);
      positions.setXYZ(i,x*f*radial,(R+h)*cos-R,z*f*radial);
      if(normals){normalMatrix.copy(jacobian).invert().transpose();v.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();normals.setXYZ(i,v.x,v.y,v.z);}
      if(tangents){v.fromBufferAttribute(tangents,i).applyMatrix3(jacobian).normalize();tangents.setXYZ(i,v.x,v.y,v.z);}
    }
    positions.needsUpdate=true;if(normals)normals.needsUpdate=true;if(tangents)tangents.needsUpdate=true;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.terrainProjected=true;mesh.frustumCulled=true;
  });
}
export function applyTerrainProjection(root:THREE.Object3D,manifest:TerrainManifest) {
  bakeTerrainGeometry(root,manifest);
  const c=manifest.coordinateSystem as TerrainCoordinates;
  const radius={value:c.earthRadiusMeters/c.metersPerUnit};
  const materials=new Set<THREE.Material>();
  root.traverse(node=>{const mat=(node as THREE.Mesh).material;if(mat)for(const m of Array.isArray(mat)?mat:[mat])materials.add(m);});
  for(const tile of manifest.tiles) {
    const tileRoot=root.getObjectByName(tile.tile_id);
    tileRoot?.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.material)return;mesh.renderOrder=-1;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){mat.userData.terrainTile=tile;mat.userData.terrainFeather=tile.x===0||tile.y===0||tile.x===manifest.grid.countX-1||tile.y===manifest.grid.countY-1;mat.forceSinglePass=true;}});
  }
  for(const material of materials){
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);shader.uniforms.terrainRadius=radius;
      const tile=material.userData.terrainTile as typeof manifest.tiles[number] | undefined;
      if(tile){
        const resolution=(tile.texture_resolution as {color?:number[]}|undefined)?.color??[2048,2048];
        const gutter=Number((manifest.textureStrategy as {gutterPixels?:number}|undefined)?.gutterPixels??0);
        shader.uniforms.terrainTile={value:new THREE.Vector2(tile.x,tile.y)};
        shader.uniforms.terrainGrid={value:new THREE.Vector2(manifest.grid.countX,manifest.grid.countY)};
        shader.uniforms.terrainInset={value:new THREE.Vector2(gutter/resolution[0],gutter/resolution[1])};
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec2 terrainTile;uniform vec2 terrainGrid;uniform vec2 terrainInset;varying vec2 terrainRegionUv;');
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nterrainRegionUv=(terrainTile+clamp((uv-terrainInset)/(1.0-2.0*terrainInset),0.0,1.0))/terrainGrid;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 terrainRegionUv;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\nvec2 terrainEdge=min(terrainRegionUv,1.0-terrainRegionUv);gl_FragColor.a*=smoothstep(0.0,0.035,min(terrainEdge.x,terrainEdge.y));');
      }

    };
    material.customProgramCacheKey=()=> 'terrain-static-projection-feather-v1';material.needsUpdate=true;
  }
}
