/**
 * Which experience /pravoslavna-istoriya renders. The unified Cesium calendar
 * globe is the default in every environment; `?engine=three` (and the older
 * `?view=legacy`) fall back to the previous HistoryVisualizer so the Three.js
 * globe stays reachable as a rollback without deleting any code.
 */
export function resolveHistoryExperience(params: { view?: string; engine?: string }): 'cesium-calendar' | 'legacy' {
  return params.view === 'legacy' || params.engine === 'three' ? 'legacy' : 'cesium-calendar';
}

export function resolveVisualizerEngine(environment: string | undefined, host: string, requested?: string) {
  return environment === 'development' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) && requested === 'cesium' ? 'cesium' : 'three';
}
