/** Conservative button zoom; native Cesium collision remains authoritative. */
export function terrainZoomDistance(action: 'in' | 'out', height: number, terrainHeight: number | undefined, targetDistance?: number): number {
  if (!Number.isFinite(height)) return 0;
  const ground = terrainHeight != null && Number.isFinite(terrainHeight) ? terrainHeight : 0;
  const clearance = Math.max(0, height - ground);
  const distance = targetDistance != null && Number.isFinite(targetDistance) && targetDistance >= 0
    ? Math.min(clearance, targetDistance) : clearance;
  if (action === 'out') return Math.max(10, distance * 0.5);
  return Math.max(0, Math.min(distance * 0.35, clearance - 10));
}
