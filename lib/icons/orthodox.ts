/**
 * Svet Ikony icon set: line glyphs on a 24×24 grid, drawn with round caps
 * and joins at a 1.6 stroke, no fills. Each glyph is a list of SVG path
 * data so the same drawing serves the React icons (components/site/icons)
 * and the map markers rendered to SVG strings (lib/cesium/photo-marker.ts).
 *
 * Recurring motifs: the eight-pointed cross (its footrest rising to the
 * viewer's left), onion domes, the halo as a circle around the head.
 */
const circle=(cx:number,cy:number,r:number)=>`M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;
/** Eight-pointed cross centred on (x, y), `s` = half of its height. */
const cross=(x:number,y:number,s:number)=>[
  `M${x} ${y-s}V${y+s}`,
  `M${x-s*.32} ${y-s*.68}H${x+s*.32}`,
  `M${x-s*.6} ${y-s*.25}H${x+s*.6}`,
  `M${x-s*.4} ${y+s*.42}L${x+s*.4} ${y+s*.66}`,
];
/** Onion dome on a drum whose top edge sits at y = base, topped with a cross. */
const dome=(x:number,base:number,w:number)=>[
  `M${x-w} ${base}c${-w*.35} ${-w*1.1} ${w*.25} ${-w*1.7} ${w} ${-w*2.3}c${w*.75} ${w*.6} ${w*1.35} ${w*1.2} ${w} ${w*2.3}`,
  `M${x} ${base-w*2.3}V${base-w*3.6}`,`M${x-w*.45} ${base-w*3.15}H${x+w*.45}`,
];

export const orthodoxGlyphs={
  /** The cross alone: brand mark, feasts of the Cross, "Christian places". */
  cross:cross(12,12,9),
  /** Orb with a cross (держава): the globe / planet section. */
  globe:[circle(12,14.5,6.8),'M5.2 14.5h13.6','M12 7.7c-2.4 2-2.4 11.6 0 13.6','M12 7.7c2.4 2 2.4 11.6 0 13.6','M12 7.7V2.6','M10.2 4.2h3.6'],
  /** Calendar leaf with the cross: the church calendar. */
  calendar:['M5.5 5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z','M3.5 9.5h17','M8 3v3.5','M16 3v3.5',...cross(12,15.3,3.6)],
  /** Haloed saint, half-length. */
  saint:['M6.6 11.2a5.6 5.6 0 1 1 10.8 0',circle(12,10.2,2.7),'M5.6 21v-.8a6.4 6.4 0 0 1 12.8 0v.8'],
  /** Church with an onion dome: churches. */
  church:['M4 21h16','M6.5 21v-8.5h11V21','M9 12.5v-2.6h6v2.6',...dome(12,9.9,2.6),'M10.6 21v-3a1.4 1.4 0 0 1 2.8 0v3'],
  /** Monastery: enclosure wall with towers and a domed church inside. */
  monastery:['M2.5 21h19','M3.5 21v-6.5l1.8-2.2 1.8 2.2V21','M16.9 21v-6.5l1.8-2.2 1.8 2.2V21','M7.1 16.5h9.8','M9.3 16.5v-3h5.4v3',...dome(12,13.5,2.1),'M10.8 21v-2.2a1.2 1.2 0 0 1 2.4 0V21'],
  /** Hanging lampada with its flame: shrines and relics, prayer. */
  lampada:['M12 2.5v2','M12 4.5 7.2 9.5','M12 4.5l4.8 5','M5.8 9.5h12.4a6.2 6.2 0 0 1-12.4 0Z','M12 15.7v2.6',circle(12,19.6,1.3),'M12 8.6c-1.2-1-1-2.2 0-3.1 1 .9 1.2 2.1 0 3.1'],
  /** Radiant cross: great feasts. */
  feast:[...cross(12,12,6.4),'M4 4l2 2','M20 4l-2 2','M4 20l2-2','M20 20l-2-2','M12 1.6v1.2','M1.6 12h1.2','M21.2 12h1.2'],
  /** Icon board with a recessed field (kovcheg) and a haloed face. */
  icon:['M6 2.8h12a1.5 1.5 0 0 1 1.5 1.5v15.4a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V4.3A1.5 1.5 0 0 1 6 2.8Z','M7.5 5.8h9v12.4h-9Z','M9.2 11.4a2.8 2.8 0 1 1 5.6 0',circle(12,11.2,1.5),'M9.3 16.6a2.7 2.7 0 0 1 5.4 0'],
  /** Open Gospel: library, lives, reading. */
  gospel:['M12 6.6C9.5 4.9 6.3 4.6 3 5.6v13c3.3-1 6.5-.7 9 1 2.5-1.7 5.7-2 9-1v-13c-3.3-1-6.5-.7-9 1Z','M12 6.6v13',...cross(16.5,11.6,3)],
  /** Chronicle scroll: church history. */
  scroll:['M6.5 3h11a1.75 1.75 0 0 1 0 3.5h-11a1.75 1.75 0 0 1 0-3.5Z','M7.5 6.5v11','M16.5 6.5v11','M6.5 17.5h11a1.75 1.75 0 0 1 0 3.5h-11a1.75 1.75 0 0 1 0-3.5Z','M10 10h4','M10 13.5h4'],
  /** Pilgrim's way: a dotted road to a cross. */
  journey:['M3.5 20.5h2','M8.2 19.6c1-.6 1.6-1.5 2.1-2.6','M11.7 14.6c.7-1 1.7-1.6 2.9-1.9','M17 11.7c.3-.3.5-.6.6-1',...cross(18,6,3.8)],
  /** Folding triptych (складень): the collection. */
  triptych:['M8.5 4.5h7a.5.5 0 0 1 .5.5v14.5H8V5a.5.5 0 0 1 .5-.5Z','M8 7.2 3.5 8.6v9.6L8 19.5','M16 7.2l4.5 1.4v9.6L16 19.5','M12 7.5v3.6','M10.8 8.8h2.4','M10.2 13.5h3.6','M10.2 16h3.6'],
  /** Candle with its flame: prayers. */
  candle:['M10.3 10.5h3.4v10h-3.4Z','M8 21.2h8','M12 10.5V9','M12 8.6c-1.6-1.4-1.4-3.4 0-5 1.4 1.6 1.6 3.6 0 5','M6.6 6.8l1.2.8','M17.4 6.8l-1.2.8','M5.8 11h1.4','M16.8 11h1.4'],
} satisfies Record<string,string[]>;
export type OrthodoxGlyph=keyof typeof orthodoxGlyphs;

/** One glyph as a standalone SVG string (for canvases, billboards and data URIs). */
export function glyphSvg(name:OrthodoxGlyph,{size=24,color='currentColor',strokeWidth=1.6}:{size?:number;color?:string;strokeWidth?:number}={}){
  const paths=orthodoxGlyphs[name].map(d=>`<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
/** The glyph's paths placed into another SVG: `x`, `y` = top-left corner, `size` = drawn width. */
export function glyphGroup(name:OrthodoxGlyph,x:number,y:number,size:number,color:string,strokeWidth=1.6){
  return `<g transform="translate(${x} ${y}) scale(${size/24})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${orthodoxGlyphs[name].map(d=>`<path d="${d}"/>`).join('')}</g>`;
}
