/**
 * Journeys ("Подорожі") of the Apostle Paul after the Acts of the Apostles.
 * Stops and their order follow Acts; coordinates are the ancient sites
 * (modern town where the ancient one is not located). Legs between stops are
 * drawn as straight lines over land and dashed lines at sea: schematic, not
 * the exact roads or sailing courses.
 */
type Text={uk:string;ru:string;en:string};
export type JourneyStop={id:string;name:Text;lat:number;lon:number;acts:string;
  /** How Paul reached this stop from the previous one. */
  by?:'land'|'sea'};
export type Journey={id:string;title:Text;period:Text;acts:string;stops:JourneyStop[]};

const place={
  antioch:{name:{uk:'Антіохія Сирійська',ru:'Антиохия Сирийская',en:'Antioch in Syria'},lat:36.2021,lon:36.1606},
  seleucia:{name:{uk:'Селевкія',ru:'Селевкия',en:'Seleucia Pieria'},lat:36.1236,lon:35.9225},
  salamis:{name:{uk:'Саламін, Кіпр',ru:'Саламин, Кипр',en:'Salamis, Cyprus'},lat:35.1856,lon:33.9003},
  paphos:{name:{uk:'Пафос, Кіпр',ru:'Пафос, Кипр',en:'Paphos, Cyprus'},lat:34.7564,lon:32.4064},
  perga:{name:{uk:'Перга',ru:'Пергия',en:'Perga'},lat:36.9614,lon:30.8539},
  pisidia:{name:{uk:'Антіохія Пісидійська',ru:'Антиохия Писидийская',en:'Antioch of Pisidia'},lat:38.3061,lon:31.1892},
  iconium:{name:{uk:'Іконія',ru:'Иконий',en:'Iconium'},lat:37.8714,lon:32.4846},
  lystra:{name:{uk:'Лістра',ru:'Листра',en:'Lystra'},lat:37.5781,lon:32.4542},
  derbe:{name:{uk:'Дервія',ru:'Дервия',en:'Derbe'},lat:37.3500,lon:33.3600},
  attalia:{name:{uk:'Атталія',ru:'Атталия',en:'Attalia'},lat:36.8850,lon:30.7040},
  tarsus:{name:{uk:'Тарс',ru:'Тарс',en:'Tarsus'},lat:36.9180,lon:34.8950},
  troas:{name:{uk:'Троада',ru:'Троада',en:'Troas'},lat:39.7550,lon:26.1600},
  samothrace:{name:{uk:'Самофракія',ru:'Самофракия',en:'Samothrace'},lat:40.4830,lon:25.5300},
  neapolis:{name:{uk:'Неаполь (Кавала)',ru:'Неаполь (Кавала)',en:'Neapolis (Kavala)'},lat:40.9370,lon:24.4120},
  philippi:{name:{uk:'Филипи',ru:'Филиппы',en:'Philippi'},lat:41.0130,lon:24.2860},
  amphipolis:{name:{uk:'Амфіполь',ru:'Амфиполь',en:'Amphipolis'},lat:40.8200,lon:23.8400},
  apollonia:{name:{uk:'Аполлонія',ru:'Аполлония',en:'Apollonia'},lat:40.6300,lon:23.4900},
  thessalonica:{name:{uk:'Солунь',ru:'Фессалоники',en:'Thessalonica'},lat:40.6401,lon:22.9444},
  berea:{name:{uk:'Верія',ru:'Верия',en:'Berea'},lat:40.5240,lon:22.2020},
  athens:{name:{uk:'Афіни',ru:'Афины',en:'Athens'},lat:37.9715,lon:23.7257},
  corinth:{name:{uk:'Коринф',ru:'Коринф',en:'Corinth'},lat:37.9060,lon:22.8800},
  cenchreae:{name:{uk:'Кенхреї',ru:'Кенхреи',en:'Cenchreae'},lat:37.8840,lon:22.9940},
  ephesus:{name:{uk:'Ефес',ru:'Ефес',en:'Ephesus'},lat:37.9395,lon:27.3417},
  caesarea:{name:{uk:'Кесарія Приморська',ru:'Кесария Приморская',en:'Caesarea Maritima'},lat:32.5000,lon:34.8920},
  jerusalem:{name:{uk:'Єрусалим',ru:'Иерусалим',en:'Jerusalem'},lat:31.7780,lon:35.2350},
  assos:{name:{uk:'Асс',ru:'Асс',en:'Assos'},lat:39.4880,lon:26.3370},
  mitylene:{name:{uk:'Мітілена, Лесбос',ru:'Митилена, Лесбос',en:'Mitylene, Lesbos'},lat:39.1100,lon:26.5550},
  chios:{name:{uk:'Хіос',ru:'Хиос',en:'Chios'},lat:38.3680,lon:26.1360},
  samos:{name:{uk:'Самос',ru:'Самос',en:'Samos'},lat:37.6900,lon:26.9400},
  miletus:{name:{uk:'Мілет',ru:'Милет',en:'Miletus'},lat:37.5300,lon:27.2780},
  cos:{name:{uk:'Кос',ru:'Кос',en:'Cos'},lat:36.8930,lon:27.2880},
  rhodes:{name:{uk:'Родос',ru:'Родос',en:'Rhodes'},lat:36.4340,lon:28.2170},
  patara:{name:{uk:'Патара',ru:'Патара',en:'Patara'},lat:36.2600,lon:29.3150},
  tyre:{name:{uk:'Тир',ru:'Тир',en:'Tyre'},lat:33.2700,lon:35.1960},
  ptolemais:{name:{uk:'Птолемаїда (Акко)',ru:'Птолемаида (Акко)',en:'Ptolemais (Acre)'},lat:32.9230,lon:35.0700},
  sidon:{name:{uk:'Сидон',ru:'Сидон',en:'Sidon'},lat:33.5630,lon:35.3690},
  myra:{name:{uk:'Міри Лікійські',ru:'Миры Ликийские',en:'Myra'},lat:36.2590,lon:29.9850},
  cnidus:{name:{uk:'Кнід',ru:'Книд',en:'Cnidus'},lat:36.6860,lon:27.3730},
  fairHavens:{name:{uk:'Добрі Пристані, Крит',ru:'Хорошие Пристани, Крит',en:'Fair Havens, Crete'},lat:34.9330,lon:24.8000},
  malta:{name:{uk:'Мальта (Меліта)',ru:'Мальта (Мелит)',en:'Malta (Melita)'},lat:35.9500,lon:14.4000},
  syracuse:{name:{uk:'Сиракузи',ru:'Сиракузы',en:'Syracuse'},lat:37.0750,lon:15.2870},
  rhegium:{name:{uk:'Регій',ru:'Ригия',en:'Rhegium'},lat:38.1110,lon:15.6470},
  puteoli:{name:{uk:'Путеоли',ru:'Путеолы',en:'Puteoli'},lat:40.8230,lon:14.1220},
  appius:{name:{uk:'Аппієва площа',ru:'Аппиева площадь',en:'Forum of Appius'},lat:41.4500,lon:13.0500},
  taverns:{name:{uk:'Три Готелі',ru:'Три Гостиницы',en:'Three Taverns'},lat:41.5900,lon:12.8300},
  rome:{name:{uk:'Рим',ru:'Рим',en:'Rome'},lat:41.8930,lon:12.4830},
} satisfies Record<string,{name:Text;lat:number;lon:number}>;
type PlaceKey=keyof typeof place;
const stop=(key:PlaceKey,acts:string,by:'land'|'sea'='land'):JourneyStop=>({id:key,...place[key],acts,by});
const start=(key:PlaceKey,acts:string):JourneyStop=>({id:key,...place[key],acts});

export const journeys:Journey[]=[
  {id:'paul-1',title:{uk:'Перша місіонерська подорож',ru:'Первое миссионерское путешествие',en:'First missionary journey'},
    period:{uk:'бл. 46–48 рр.',ru:'ок. 46–48 гг.',en:'c. AD 46–48'},acts:'13–14',stops:[
    start('antioch','13:1–3'),stop('seleucia','13:4'),stop('salamis','13:5','sea'),stop('paphos','13:6–12'),stop('perga','13:13','sea'),
    stop('pisidia','13:14–50'),stop('iconium','13:51–14:5'),stop('lystra','14:6–20'),stop('derbe','14:20–21'),
    stop('lystra','14:21–22'),stop('iconium','14:21–22'),stop('pisidia','14:21–23'),stop('perga','14:24–25'),stop('attalia','14:25'),
    stop('antioch','14:26–28','sea')]},
  {id:'paul-2',title:{uk:'Друга місіонерська подорож',ru:'Второе миссионерское путешествие',en:'Second missionary journey'},
    period:{uk:'бл. 49–52 рр.',ru:'ок. 49–52 гг.',en:'c. AD 49–52'},acts:'15:36–18:22',stops:[
    start('antioch','15:36–40'),stop('tarsus','15:41'),stop('derbe','16:1'),stop('lystra','16:1–3'),stop('iconium','16:2–5'),
    stop('troas','16:6–10'),stop('samothrace','16:11','sea'),stop('neapolis','16:11','sea'),stop('philippi','16:12–40'),
    stop('amphipolis','17:1'),stop('apollonia','17:1'),stop('thessalonica','17:1–9'),stop('berea','17:10–14'),
    stop('athens','17:15–34','sea'),stop('corinth','18:1–17'),stop('cenchreae','18:18'),stop('ephesus','18:19–21','sea'),
    stop('caesarea','18:22','sea'),stop('jerusalem','18:22'),stop('antioch','18:22')]},
  {id:'paul-3',title:{uk:'Третя місіонерська подорож',ru:'Третье миссионерское путешествие',en:'Third missionary journey'},
    period:{uk:'бл. 53–57 рр.',ru:'ок. 53–57 гг.',en:'c. AD 53–57'},acts:'18:23–21:17',stops:[
    start('antioch','18:23'),stop('tarsus','18:23'),stop('derbe','18:23'),stop('iconium','18:23'),stop('pisidia','18:23'),
    stop('ephesus','19:1–20:1'),stop('troas','20:1'),stop('philippi','20:1–2','sea'),stop('corinth','20:2–3'),stop('philippi','20:3–6'),
    stop('troas','20:6–12','sea'),stop('assos','20:13'),stop('mitylene','20:14','sea'),stop('chios','20:15','sea'),stop('samos','20:15','sea'),
    stop('miletus','20:15–38','sea'),stop('cos','21:1','sea'),stop('rhodes','21:1','sea'),stop('patara','21:1','sea'),stop('tyre','21:3–6','sea'),
    stop('ptolemais','21:7','sea'),stop('caesarea','21:8–14'),stop('jerusalem','21:15–17')]},
  {id:'paul-rome',title:{uk:'Подорож до Рима',ru:'Путешествие в Рим',en:'Voyage to Rome'},
    period:{uk:'бл. 59–60 рр.',ru:'ок. 59–60 гг.',en:'c. AD 59–60'},acts:'27–28',stops:[
    start('caesarea','27:1–2'),stop('sidon','27:3','sea'),stop('myra','27:4–6','sea'),stop('cnidus','27:7','sea'),stop('fairHavens','27:7–12','sea'),
    stop('malta','27:13–28:10','sea'),stop('syracuse','28:11–12','sea'),stop('rhegium','28:13','sea'),stop('puteoli','28:13–14','sea'),
    stop('appius','28:15'),stop('taverns','28:15'),stop('rome','28:16–31')]},
];

// ---- Playback schedule: constant speed along the legs, a pause at every stop.
const EARTH_RADIUS_KM=6371;
export function distanceKm(a:{lat:number;lon:number},b:{lat:number;lon:number}){
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 2*EARTH_RADIUS_KM*Math.asin(Math.min(1,Math.sqrt(h)));
}
export type Schedule={total:number;stops:{index:number;arrive:number;leave:number}[]};
/** Seconds of playback: legs take time proportional to their length (the whole route lasts about `travel` s), each stop `dwell` s. */
export function journeySchedule(journey:Journey,travel=36,dwell=1.6):Schedule{
  const legs=journey.stops.slice(1).map((stop,index)=>distanceKm(journey.stops[index],stop));
  const totalKm=legs.reduce((sum,km)=>sum+km,0)||1;
  let time=0;const stops:Schedule['stops']=[];
  journey.stops.forEach((_,index)=>{
    if(index>0)time+=legs[index-1]/totalKm*travel;
    stops.push({index,arrive:time,leave:time+dwell});time+=dwell;
  });
  return {total:time,stops};
}
/** Where the traveller is at `time`: the stop being visited, or the leg under way and how far along it. */
export function journeyPosition(journey:Journey,schedule:Schedule,time:number){
  const t=Math.min(schedule.total,Math.max(0,time));
  for(let i=0;i<schedule.stops.length;i++){
    const at=schedule.stops[i];
    if(t<=at.leave)return t>=at.arrive?{stop:i,leg:null,fraction:0}:{stop:i-1,leg:i,fraction:(t-schedule.stops[i-1].leave)/Math.max(1e-6,at.arrive-schedule.stops[i-1].leave)};
  }
  return {stop:journey.stops.length-1,leg:null,fraction:0};
}
/** Great-circle interpolation, so long sea legs curve like a course on the globe. */
export function interpolate(a:{lat:number;lon:number},b:{lat:number;lon:number},f:number){
  const rad=Math.PI/180,toVec=(p:{lat:number;lon:number})=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.cos(p.lat*rad)*Math.sin(p.lon*rad),Math.sin(p.lat*rad)];
  const [va,vb]=[toVec(a),toVec(b)],omega=Math.acos(Math.min(1,Math.max(-1,va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2])));
  if(omega<1e-9)return {lat:a.lat,lon:a.lon};
  const [wa,wb]=[Math.sin((1-f)*omega)/Math.sin(omega),Math.sin(f*omega)/Math.sin(omega)];
  const [x,y,z]=[0,1,2].map(i=>wa*va[i]+wb*vb[i]);
  return {lat:Math.atan2(z,Math.hypot(x,y))/rad,lon:Math.atan2(y,x)/rad};
}
