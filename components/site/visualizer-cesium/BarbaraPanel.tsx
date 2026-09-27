'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ChevronUp,MapPin,X} from 'lucide-react';
import styles from './barbara-panel.module.css';
import {SaintProducts} from './SaintProducts';
import {markerFallback} from '@/lib/cesium/photo-marker';
type Prayer={text:string;audioUrl?:string;language:string;source?:string};
const copy={
 ru:{title:'Святая великомученица Варвара',tabs:['О святой','Молитвы','Места','Коллекция'],feast:'4 декабря по новому стилю; 4 декабря юлианского календаря = 17 декабря гражданского (1900–2099).',bio:'По церковному преданию, Варвара исповедовала христианскую веру и приняла мученическую смерть. Её почитают за верность Христу и мужество перед страданиями.',full:'Читать полностью',connection:'Связь с этим местом',place:'Владимирский собор, Киев',relation:'В соборе почитаются мощи святой Варвары. Метка указывает на здание собора, а не на место её рождения или мученичества.',open:'Открыть место',back:'К святой',empty:'Связанные коллекционные иконы пока не добавлены.',original:'Текст на языке оригинала: украинский',loading:'Загрузка молитвы…',error:'Молитва недоступна. Попробуйте открыть карточку снова.',close:'Закрыть',expand:'Развернуть карточку'},
 uk:{title:'Свята великомучениця Варвара',tabs:['Про святу','Молитви','Місця','Колекція'],feast:'4 грудня за новим стилем; 4 грудня юліанського календаря = 17 грудня цивільного (1900–2099).',bio:'За церковним переданням, Варвара сповідувала християнську віру та прийняла мученицьку смерть. Її шанують за вірність Христу й мужність перед стражданнями.',full:'Читати повністю',connection:'Зв’язок із цим місцем',place:'Володимирський собор, Київ',relation:'У соборі шанують мощі святої Варвари. Позначка вказує на будівлю собору, а не місце її народження чи мучеництва.',open:'Відкрити місце',back:'До святої',empty:'Пов’язані колекційні ікони поки не додані.',original:'Мова оригіналу: українська',loading:'Завантаження молитви…',error:'Молитва недоступна. Спробуйте відкрити картку знову.',close:'Закрити',expand:'Розгорнути картку'},
 en:{title:'Holy Great Martyr Barbara',tabs:['About','Prayers','Places','Collection'],feast:'December 4, New Calendar; December 4 Julian = December 17 civil calendar (1900–2099).',bio:'According to Church tradition, Barbara confessed the Christian faith and suffered martyrdom. She is venerated for her faithfulness to Christ and courage in suffering.',full:'Read more',connection:'Connection to this place',place:'St Volodymyr’s Cathedral, Kyiv',relation:'Saint Barbara’s relics are venerated in this cathedral. The marker locates the cathedral building, not her birthplace or martyrdom site.',open:'Open place',back:'Back to saint',empty:'No linked collectible icons have been added.',original:'Original language: Ukrainian',loading:'Loading prayer…',error:'Prayer unavailable. Please reopen the panel to retry.',close:'Close',expand:'Expand panel'}
};
export function BarbaraPanel({locale,onClose,onPlace,onCalendar,imageUrl}:{locale:'ru'|'uk'|'en';onClose:()=>void;onPlace:()=>void;onCalendar:()=>void;imageUrl?:string}){
 return <BarbaraPanelContent key={locale} locale={locale} onClose={onClose} onPlace={onPlace} onCalendar={onCalendar} imageUrl={imageUrl}/>;
}
function BarbaraPanelContent({locale,onClose,onPlace,onCalendar,imageUrl}:{locale:'ru'|'uk'|'en';onClose:()=>void;onPlace:()=>void;onCalendar:()=>void;imageUrl?:string}){
 const [iconGroup,setIconGroup]=useState<string|null>(null);
 const t=copy[locale];const [tab,setTab]=useState(0),[place,setPlace]=useState(false),[expanded,setExpanded]=useState(false),[prayer,setPrayer]=useState<Prayer|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();void (async()=>{
  const url='/api/church/prayers/molytva-do-sviatoi-velykomuchenytsi-varvary?language=';
  type Payload={prayer?:Prayer;icon?:{translationGroupId:string}};
  let response=await fetch(url+locale,{signal:controller.signal});if(!response.ok)throw new Error();let data=await response.json() as Payload|null;
  if(!data?.prayer&&locale!=='uk'){response=await fetch(url+'uk',{signal:controller.signal});if(!response.ok)throw new Error();data=await response.json() as Payload|null;}
  if(!data?.prayer?.text)throw new Error();if(controller.signal.aborted)return;setPrayer(data.prayer);setIconGroup(data.icon?.translationGroupId??null);
 })().catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[locale]);
 return <aside className={`${styles.panel} ${expanded?styles.expanded:''}`} aria-label={t.title} data-testid="saint-panel">
  <header><span>{place?t.place:t.title}</span><button onClick={onClose} aria-label={t.close}><X size={20}/></button></header>
  <button className={styles.expand} onClick={()=>setExpanded(v=>!v)} aria-label={t.expand} aria-expanded={expanded}><ChevronUp size={18}/></button>
  {place?<div className={styles.body}><button onClick={()=>setPlace(false)}><ArrowLeft size={16}/>{t.back}</button><h2>{t.place}</h2><p>{t.relation}</p><p>50.444939°, 30.508719°</p><button onClick={onPlace}><MapPin size={16}/>{t.open}</button><p><a href="https://www.katedral.org.ua/svjatyni/115-varvara.html" target="_blank" rel="noreferrer">katedral.org.ua</a></p></div>:<>
  <img className={styles.image} src={imageUrl??markerFallback('saint')} alt={t.title} onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=markerFallback('saint');}}/>
  <div className={styles.body}><h2>{t.title}</h2><p className={styles.meta}>{t.feast}</p>
  <button onClick={onCalendar}>{locale==='ru'?'Показать в календаре':locale==='uk'?'Показати в календарі':'Show in calendar'}</button>
  <div className={styles.tabs} role="tablist">{t.tabs.map((title,index)=><button key={title} role="tab" id={`barbara-tab-${index}`} aria-selected={tab===index} aria-controls="barbara-content" onClick={()=>setTab(index)}>{index===3?{ru:'Иконы',uk:'Ікони',en:'Icons'}[locale]:title}</button>)}</div>
  <section id="barbara-content" role="tabpanel" aria-labelledby={`barbara-tab-${tab}`}>
   {tab===0?<><p>{t.bio}</p><a href="https://www.katedral.org.ua/svjatyni/115-varvara.html" target="_blank" rel="noreferrer">{t.full}</a></>:null}
   {tab===1?prayer?<>{prayer.language!==locale?<small>{t.original}</small>:null}<p className={styles.prayer}>{prayer.text}</p>{prayer.audioUrl&&/^https:\/\//.test(prayer.audioUrl)?<audio controls preload="none" src={prayer.audioUrl}/>:null}<small>{prayer.source}</small></>:<p role="status">{error?t.error:t.loading}</p>:null}
   {tab===2?<><h3>{t.place}</h3><p>{t.relation}</p><button onClick={()=>{setPlace(true);onPlace();}}><MapPin size={16}/>{t.open}</button></>:null}
   {tab===3?<SaintProducts groupId={iconGroup} locale={locale}/>:null}
  </section><section className={styles.connection}><h3>{t.connection}</h3><strong>{t.place}</strong><p>{t.relation}</p><button onClick={()=>setPlace(true)}><MapPin size={16}/>{t.open}</button></section>
  </div></>}
 </aside>;
}
