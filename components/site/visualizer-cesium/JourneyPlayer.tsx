'use client';
import type {KeyboardEvent,PointerEvent} from 'react';
import {useRef} from 'react';
import {Pause,Play,RotateCcw} from 'lucide-react';
import type {Journey,Schedule} from '@/lib/cesium/journeys';
import type {JourneyTick} from '@/lib/cesium/journey-layer';
import styles from './journey-player.module.css';

type Locale='uk'|'ru'|'en';
type Props={
  journeys:Journey[];journey:Journey;schedule:Schedule;tick:JourneyTick;locale:Locale;
  labels:{play:string;pause:string;acts:string;journeys:string;restart:string};
  onSelect:(id:string)=>void;onTogglePlay:()=>void;onSeek:(time:number)=>void;
};
/** Bottom bar of the journeys mode: which journey, play/pause, and a strip of its stops to scrub through. */
export function JourneyPlayer({journeys,journey,schedule,tick,locale,labels,onSelect,onTogglePlay,onSeek}:Props){
  const track=useRef<HTMLDivElement>(null);
  const stop=journey.stops[tick.stop],next=tick.moving?journey.stops[tick.stop+1]:null;
  const at=(value:number)=>`${value/Math.max(1e-6,schedule.total)*100}%`;
  const seekTo=(event:PointerEvent<HTMLDivElement>)=>{const rect=track.current!.getBoundingClientRect();onSeek((event.clientX-rect.left)/rect.width*schedule.total);};
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{
    const index=schedule.stops.findIndex(item=>item.arrive>tick.time+.01);
    const target=event.key==='ArrowRight'?schedule.stops[index===-1?schedule.stops.length-1:index]:event.key==='ArrowLeft'?[...schedule.stops].reverse().find(item=>item.arrive<tick.time-.3)??schedule.stops[0]:null;
    if(!target)return;event.preventDefault();onSeek(target.arrive);
  };
  const ended=tick.time>=schedule.total&&!tick.playing;
  return <section className={styles.player} aria-label={labels.journeys} data-journey-player>
    <nav className={styles.choices} aria-label={labels.journeys}>
      {journeys.map(item=><button key={item.id} type="button" aria-pressed={item.id===journey.id} onClick={()=>onSelect(item.id)}>{item.title[locale]}</button>)}
    </nav>
    <div className={styles.row}>
      <button type="button" className={styles.play} aria-label={tick.playing?labels.pause:ended?labels.restart:labels.play} title={tick.playing?labels.pause:ended?labels.restart:labels.play} aria-pressed={tick.playing} onClick={onTogglePlay}>
        {tick.playing?<Pause size={18}/>:ended?<RotateCcw size={18}/>:<Play size={18}/>}
      </button>
      <div className={styles.body}>
        <p className={styles.caption} aria-live="polite">
          <strong>{next?`${stop.name[locale]} → ${next.name[locale]}`:stop.name[locale]}</strong>
          <span>{labels.acts} {(next??stop).acts} · {journey.period[locale]}</span>
        </p>
        <div ref={track} className={styles.track} role="slider" tabIndex={0} aria-label={journey.title[locale]}
          aria-valuemin={0} aria-valuemax={Math.round(schedule.total)} aria-valuenow={Math.round(tick.time)} aria-valuetext={stop.name[locale]}
          onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);seekTo(event);}}
          onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))seekTo(event);}} onKeyDown={key}>
          <i className={styles.progress} style={{width:at(tick.time)}}/>
          {schedule.stops.map((item,index)=><b key={index} className={styles.stop} data-visited={item.arrive<=tick.time||undefined} style={{left:at(item.arrive)}} title={journey.stops[index].name[locale]}/>)}
          <span className={styles.cursor} style={{left:at(tick.time)}} aria-hidden/>
        </div>
      </div>
    </div>
  </section>;
}
