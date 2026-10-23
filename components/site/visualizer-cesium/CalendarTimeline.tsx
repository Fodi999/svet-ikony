'use client';
import {useMemo,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {Pause,Play} from 'lucide-react';
import type {CalendarGeoYearDay} from '@/lib/d1/repositories/calendarGeo';
import styles from './calendar-timeline.module.css';

const DAY=86_400_000;
const utc=(date:string)=>Date.parse(date+'T00:00:00Z');
const iso=(time:number)=>new Date(time).toISOString().slice(0,10);
export function daysInYear(year:number){return (Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/DAY;}
export function dayIndex(date:string){return Math.round((utc(date)-Date.UTC(Number(date.slice(0,4)),0,1))/DAY);}
export function dateAt(year:number,index:number){return iso(Date.UTC(year,0,1)+Math.min(daysInYear(year)-1,Math.max(0,index))*DAY);}
/** The next day after `date` with mappable events, or null at the end of the year. */
export function nextEventDay(days:CalendarGeoYearDay[],date:string){return days.find(day=>day.date>date)?.date??null;}

type Props={
  date:string;today:string;days:CalendarGeoYearDay[];locale:string;playing:boolean;
  labels:{play:string;pause:string;timeline:string;noEvents:string;events:string};
  onChange:(date:string)=>void;onTogglePlay:()=>void;
};
/** One civil year as a scrubbable strip: months, a dot per day with events on the map, today and the chosen day. */
export function CalendarTimeline({date,today,days,locale,playing,labels,onChange,onTogglePlay}:Props) {
  const year=Number(date.slice(0,4)),total=daysInYear(year);
  const track=useRef<HTMLDivElement>(null);
  const [preview,setPreview]=useState<string|null>(null);
  const shown=preview??date;
  const months=useMemo(()=>Array.from({length:12},(_,month)=>({
    start:dayIndex(iso(Date.UTC(year,month,1))),
    label:new Intl.DateTimeFormat(locale,{month:'short',timeZone:'UTC'}).format(Date.UTC(year,month,1)).replace('.',''),
  })),[year,locale]);
  const maxCount=Math.max(1,...days.map(day=>day.count));
  const current=days.find(day=>day.date===shown);
  const position=(index:number)=>`${(index+.5)/total*100}%`;
  const fromPointer=(event:PointerEvent<HTMLDivElement>)=>{
    const rect=track.current!.getBoundingClientRect();
    return dateAt(year,Math.floor((event.clientX-rect.left)/rect.width*total));
  };
  // Snap to a nearby day with events (within ~4px) so short taps land on the dots.
  const snap=(value:string)=>{
    const width=track.current?.clientWidth??total,radius=Math.max(1,Math.round(4/(width/total)));
    const index=dayIndex(value);
    return days.reduce<{date:string;distance:number}|null>((best,day)=>{
      const distance=Math.abs(dayIndex(day.date)-index);
      return distance<=radius&&(!best||distance<best.distance)?{date:day.date,distance}:best;
    },null)?.date??value;
  };
  const down=(event:PointerEvent<HTMLDivElement>)=>{event.currentTarget.setPointerCapture(event.pointerId);setPreview(snap(fromPointer(event)));};
  const move=(event:PointerEvent<HTMLDivElement>)=>{if(event.currentTarget.hasPointerCapture(event.pointerId))setPreview(snap(fromPointer(event)));};
  const up=(event:PointerEvent<HTMLDivElement>)=>{
    if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const value=snap(fromPointer(event));setPreview(null);if(value!==date)onChange(value);
  };
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{
    const index=dayIndex(date);
    const step:Record<string,number>={ArrowLeft:-1,ArrowRight:1,PageUp:-30,PageDown:30};
    let next:string|null=null;
    if(event.key in step)next=dateAt(year,index+step[event.key]);
    else if(event.key==='Home')next=dateAt(year,0);
    else if(event.key==='End')next=dateAt(year,total-1);
    if(!next)return;
    event.preventDefault();if(next!==date)onChange(next);
  };
  const title=new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',timeZone:'UTC'}).format(utc(shown));
  return <section className={styles.timeline} aria-label={labels.timeline} data-calendar-timeline data-playing={playing}>
    <button type="button" className={styles.play} aria-label={playing?labels.pause:labels.play} title={playing?labels.pause:labels.play} aria-pressed={playing} onClick={onTogglePlay}>
      {playing?<Pause size={18}/>:<Play size={18}/>}
    </button>
    <div className={styles.body}>
      <p className={styles.caption} aria-live="polite">
        <strong>{title}</strong>
        <span>{current?current.titles.join(' · ')+(current.count>current.titles.length?` +${current.count-current.titles.length}`:''):labels.noEvents}</span>
      </p>
      <div ref={track} className={styles.track} role="slider" tabIndex={0} aria-label={labels.timeline}
        aria-valuemin={1} aria-valuemax={total} aria-valuenow={dayIndex(shown)+1} aria-valuetext={`${title}${current?`, ${current.count} ${labels.events}`:''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>setPreview(null)} onKeyDown={key}>
        {months.map(month=><span key={month.start} className={styles.month} style={{left:`${month.start/total*100}%`}}>{month.label}</span>)}
        {days.map(day=><i key={day.date} className={styles.day} data-active={day.date===shown||undefined}
          style={{left:position(dayIndex(day.date)),height:`${6+Math.round(day.count/maxCount*10)}px`}}/>)}
        {today.slice(0,4)===String(year)?<b className={styles.today} style={{left:position(dayIndex(today))}} aria-hidden/>:null}
        <b className={styles.cursor} style={{left:position(dayIndex(shown))}} aria-hidden/>
      </div>
    </div>
  </section>;
}
