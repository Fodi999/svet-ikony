export function resolveVisualizerEngine(environment: string | undefined, host: string, requested?: string) {
  return environment === 'development' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) && requested === 'cesium' ? 'cesium' : 'three';
}
