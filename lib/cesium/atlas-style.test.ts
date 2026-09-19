import {describe,it,expect} from 'vitest';
import * as C from '@cesium/engine';
import {atlasLabel,cityRankAtHeight,saintIcon} from './atlas-style';
describe('native atlas styles',()=>{
  it('rasterizes large fonts and never scales text above its native size',()=>{
    for(const kind of ['country','capital','city','saint'] as const){
      const label=atlasLabel(kind);
      expect(Number(label.font.match(/(\d+)px/)?.[1])).toBeGreaterThanOrEqual(22);
      expect(label.scale).toBeLessThanOrEqual(1);
      expect(label.scaleByDistance.nearValue).toBeLessThanOrEqual(1);
      expect(label.scaleByDistance.farValue).toBeLessThanOrEqual(1);
      expect(label.style).toBe(C.LabelStyle.FILL_AND_OUTLINE);
      expect(label.disableDepthTestDistance).toBe(0);
    }
  });
  it('separates far country labels from cities and Christian labels',()=>{
    expect(atlasLabel('country').distanceDisplayCondition.far).toBeGreaterThan(atlasLabel('capital').distanceDisplayCondition.far);
    expect(atlasLabel('capital').distanceDisplayCondition.far).toBeGreaterThan(atlasLabel('city').distanceDisplayCondition.far);
    expect(atlasLabel('saint',true).distanceDisplayCondition.far).toBeGreaterThan(atlasLabel('saint').distanceDisplayCondition.far);
    expect(cityRankAtHeight(14000000)).toBe(-1);
    expect(cityRankAtHeight(1000000)).toBe(3);
    expect(cityRankAtHeight(10000)).toBe(10);
  });
  it('has distinct selected and holy-place SVG assets',()=>{
    expect(saintIcon(false)).not.toBe(saintIcon(true));
    expect(saintIcon(false)).not.toBe(saintIcon(false,true));
    expect(decodeURIComponent(saintIcon(true))).toContain('width="128"');
  });
  it('confirms native PinBuilder and experimental MVT exports without using a network',()=>{
    expect(typeof C.PinBuilder.prototype.fromText).toBe('function');
    expect(typeof C.MVTDataProvider.fromUrl).toBe('function');
  });
});
