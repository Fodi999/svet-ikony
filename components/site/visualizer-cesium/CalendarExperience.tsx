'use client';
import dynamic from 'next/dynamic';
import styles from './calendar-globe.module.css';
const Earth=dynamic(()=>import('./CesiumEarthCanvas').then(module=>module.CesiumEarthCanvas),{ssr:false});
export function CalendarExperience(){
  return <main data-calendar-experience className={styles.experience}><Earth calendarExperience/></main>;
}
