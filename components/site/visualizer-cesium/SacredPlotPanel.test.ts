import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {SacredPlot} from '@/lib/cesium/sacred-plots';
import {SacredPlotPanel} from './SacredPlotPanel';

const plot:SacredPlot={plotId:'test',gridType:'axial-hex',gridCellId:'0:0',sacredPlaceId:'lavra',associatedSacredPlaceId:'sobor',areaM2:43.9,status:'available',priceEUR:99,displayNumber:12,center:{lat:50,lon:30},boundary:[]};
describe('informational plot panel',()=>{
 it('shows the disclaimer without an invented sale or icon link',()=>{
  const html=renderToStaticMarkup(React.createElement(SacredPlotPanel,{plot,placeTitle:'Лавра',associatedTitle:'Собор',locale:'ru',onClose:()=>{},onNavigate:()=>{}}));
  expect(html).toContain('Участок #12');
  expect(html).toContain('Цифровая ячейка платформы. Не предоставляет прав на физическую землю.');
  expect(html).toContain('С этой ячейкой пока не связана икона.');
  expect(html).toContain('Смотреть коллекцию');
  expect(html).not.toMatch(/EUR|Купить|disabled=/);
 });
});
