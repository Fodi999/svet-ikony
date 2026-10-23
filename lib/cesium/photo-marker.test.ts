import {expect,it} from 'vitest';
import {markerBillboard,markerFallback,markerScale,verifiedMarkerImage} from './photo-marker';
it('only accepts explicitly verified image URLs',()=>{
 expect(verifiedMarkerImage('/photo.png',false)).toBeUndefined();
 expect(verifiedMarkerImage('javascript:bad',true)).toBeUndefined();
 expect(verifiedMarkerImage('/photo.png',true)).toBe('/photo.png');
});
it('bounds marker size and preserves globe depth',()=>{
 const marker=markerBillboard(markerFallback('saint'));
 expect(marker.width).toBe(64);expect(marker.disableDepthTestDistance).toBe(0);
 expect(marker.distanceDisplayCondition).toBeUndefined();
 expect(markerScale().nearValue).toBe(1);expect(markerScale().farValue).toBe(.6);
});
it('distinguishes saints and churches with a consistent pointed frame',()=>{
 expect(markerFallback('saint')).not.toBe(markerFallback('church'));
 expect(decodeURIComponent(markerFallback('saint'))).toContain('L32 70');
 expect(markerFallback('saint',true)).not.toBe(markerFallback('saint'));
});
import {markerGlyph} from './photo-marker';
it('draws each kind of place with its own glyph of the site icon set',()=>{
  expect(['church','cathedral','monastery','shrine','pilgrimage','saint','icon','feast','event','city'].map(markerGlyph))
    .toEqual(['church','church','monastery','lampada','lampada','saint','icon','feast','scroll','cross']);
  expect(decodeURIComponent(markerFallback('monastery'))).toContain('scale(1.5)');
});
