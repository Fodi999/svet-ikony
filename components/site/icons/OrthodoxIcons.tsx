import {forwardRef,type SVGProps} from 'react';
import {orthodoxGlyphs,type OrthodoxGlyph} from '@/lib/icons/orthodox';

export type OrthodoxIconProps=Omit<SVGProps<SVGSVGElement>,'ref'>&{size?:number|string;strokeWidth?:number|string};
/** Same props as a lucide-react icon, so the two sets are interchangeable in the UI. */
function create(name:OrthodoxGlyph,displayName:string){
  const Icon=forwardRef<SVGSVGElement,OrthodoxIconProps>(({size=24,strokeWidth=1.6,color='currentColor',className,...props},ref)=>
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={props['aria-label']?undefined:true} data-orthodox-icon={name} {...props}>
      {orthodoxGlyphs[name].map((d,index)=><path key={index} d={d}/>)}
    </svg>);
  Icon.displayName=displayName;
  return Icon;
}
export const CrossIcon=create('cross','CrossIcon');
export const GlobeIcon=create('globe','GlobeIcon');
export const CalendarIcon=create('calendar','CalendarIcon');
export const SaintIcon=create('saint','SaintIcon');
export const ChurchIcon=create('church','ChurchIcon');
export const MonasteryIcon=create('monastery','MonasteryIcon');
export const LampadaIcon=create('lampada','LampadaIcon');
export const FeastIcon=create('feast','FeastIcon');
export const IconBoardIcon=create('icon','IconBoardIcon');
export const GospelIcon=create('gospel','GospelIcon');
export const ScrollIcon=create('scroll','ScrollIcon');
export const JourneyIcon=create('journey','JourneyIcon');
export const TriptychIcon=create('triptych','TriptychIcon');
export const CandleIcon=create('candle','CandleIcon');
