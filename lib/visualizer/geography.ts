import { Vector3 } from 'three';

/** Public Earth frame: north +Y, Greenwich +Z, east +X.
 * prepareBaseScene applies the GLB's single longitude calibration to this frame. */
export function latLngToVector3(latitude: number, longitude: number, radius: number): Vector3 {
  return new Vector3().setFromSphericalCoords(radius, Math.PI / 2 - latitude * Math.PI / 180, longitude * Math.PI / 180);
}
