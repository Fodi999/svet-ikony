import type { Church, Dashboard, GospelReading, Icon, Prayer, QrPage, Saint, SeoPage } from './types';

const now = new Date().toISOString();

export const icons: Icon[] = [
  {
    id: 'icon-kazan',
    slug: 'kazan-icon',
    title: 'Казанская икона Божией Матери',
    shortDescription: 'Перед Казанской иконой молятся о помощи семье, мире и укреплении в вере.',
    fullDescription: 'Казанская икона Божией Матери почитается православными христианами как образ материнского заступничества и духовной поддержки. Материалы на странице помогают спокойно прочитать молитву, историю образа и связанные духовные тексты.',
    imageUrl: '/images/kazan-icon.svg',
    qrCodeUrl: '/images/qr-code.svg',
    category: 'Богородичные',
    saintName: 'Пресвятая Богородица',
    prayerText: 'Пресвятая Богородице, помоги нам обратиться к Богу с миром, покаянием и надеждой.',
    gospelText: 'Евангелие дня представлено для внимательного чтения и размышления.',
    lifeText: 'Почитание образа связано с молитвенной традицией Церкви и историей помощи верующим.',
    historyText: 'История Казанского образа напоминает о бережном отношении к святыне и молитве.',
    status: 'published',
    seoTitle: 'Казанская икона Божией Матери: молитва и история образа',
    seoDescription: 'Молитва, история и духовные материалы к Казанской иконе Божией Матери.',
    seoKeywords: 'Казанская икона, молитва, Богородица',
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'icon-nikolay',
    slug: 'nikolay-chudotvorets',
    title: 'Икона святителя Николая Чудотворца',
    shortDescription: 'Перед образом святителя Николая молятся о помощи в пути, семье и трудных обстоятельствах.',
    fullDescription: 'Страница собирает молитву, краткое житие, историю почитания и материалы для духовной поддержки перед иконой святителя Николая.',
    imageUrl: '/images/nikolay-icon.svg',
    qrCodeUrl: '/images/qr-code.svg',
    category: 'Святые',
    saintName: 'Святитель Николай',
    prayerText: 'Святителю отче Николае, моли Бога о нас и помоги укрепиться в добрых делах.',
    gospelText: 'Чтение дня помогает соединить молитву у иконы с евангельским словом.',
    lifeText: 'Святитель Николай известен милосердием, заботой о людях и верностью Христу.',
    historyText: 'Почитание святителя Николая распространено во всем православном мире.',
    status: 'published',
    seoTitle: 'Икона Николая Чудотворца: молитва, житие и помощь в чтении',
    seoDescription: 'Православная страница иконы святителя Николая с молитвой, житием и QR-доступом.',
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'icon-panteleimon',
    slug: 'panteleimon-celitel',
    title: 'Икона великомученика Пантелеимона',
    shortDescription: 'Перед иконой молятся о помощи болящим и укреплении терпения.',
    fullDescription: 'Материалы представлены для молитвенного чтения, знакомства с житием святого и спокойного обращения к Богу.',
    imageUrl: '/images/panteleimon-icon.svg',
    qrCodeUrl: '/images/qr-code.svg',
    category: 'Святые целители',
    saintName: 'Великомученик Пантелеимон',
    prayerText: 'Святый великомучениче и целителю Пантелеимоне, моли Бога о болящих и нуждающихся.',
    gospelText: 'Евангельское слово помогает сохранять надежду и трезвение.',
    lifeText: 'Святой Пантелеимон почитается как врач и милостивый помощник болящим.',
    historyText: 'Образ святого часто находится в домах и храмах рядом с молитвами о здравии.',
    status: 'published',
    seoTitle: 'Икона Пантелеимона Целителя: молитва о здравии',
    seoDescription: 'Молитва и духовные материалы перед иконой великомученика Пантелеимона.',
    createdAt: now,
    updatedAt: now
  }
];

export const saints: Saint[] = [
  {
    id: 'saint-nikolay',
    slug: 'nikolay-chudotvorets',
    name: 'Святитель Николай Чудотворец',
    shortDescription: 'Святой, почитаемый за милосердие, помощь нуждающимся и верность Евангелию.',
    biography: 'Святитель Николай был архипастырем, заботившимся о людях, защищавшим слабых и направлявшим верующих к жизни во Христе.',
    feastDay: '19 декабря',
    imageUrl: '/images/nikolay-icon.svg',
    relatedIcons: ['nikolay-chudotvorets'],
    prayers: ['molitva-nikolayu'],
    seoTitle: 'Святитель Николай Чудотворец: житие и молитвы',
    seoDescription: 'Краткое житие святителя Николая, день памяти и связанные молитвы.',
    status: 'published'
  }
];

export const prayers: Prayer[] = [
  {
    id: 'prayer-kazan',
    slug: 'molitva-kazanskoy-ikone',
    title: 'Молитва перед Казанской иконой Божией Матери',
    text: 'Пресвятая Богородице, помоги нам обратиться к Богу с миром, покаянием и надеждой. Укрепи нас в любви, терпении и добрых делах.',
    category: 'Богородичные молитвы',
    relatedIcon: 'kazan-icon',
    seoTitle: 'Молитва перед Казанской иконой Божией Матери',
    seoDescription: 'Текст молитвы перед Казанской иконой и спокойное объяснение для чтения.',
    status: 'published'
  },
  {
    id: 'prayer-nikolay',
    slug: 'molitva-nikolayu',
    title: 'Молитва святителю Николаю',
    text: 'Святителю отче Николае, моли Бога о нас, помоги укрепиться в вере, милосердии и добром устроении жизни.',
    category: 'Молитвы святым',
    relatedSaint: 'nikolay-chudotvorets',
    relatedIcon: 'nikolay-chudotvorets',
    seoTitle: 'Молитва святителю Николаю Чудотворцу',
    seoDescription: 'Краткая молитва святителю Николаю для чтения перед иконой.',
    status: 'published'
  }
];

export const gospelToday: GospelReading = {
  id: 'gospel-today',
  date: new Date().toISOString().slice(0, 10),
  title: 'Евангелие дня',
  reference: 'Мф. 5:14-16',
  text: 'Вы свет мира. Не может укрыться город, стоящий на верху горы.',
  explanation: 'Чтение напоминает о тихом свидетельстве веры через добрые дела, внимательность и любовь к ближним.',
  seoTitle: 'Евангелие дня: чтение и краткое толкование',
  seoDescription: 'Евангельское чтение дня с кратким объяснением для духовной поддержки.',
  status: 'published'
};

export const seoPages: SeoPage[] = [
  {
    id: 'seo-qr-icon',
    slug: 'pravoslavnaya-ikona-s-qr-kodom',
    title: 'Православная икона с QR-кодом',
    h1: 'Православная икона с QR-кодом',
    content: 'QR-код открывает страницу иконы с молитвой, историей образа, Евангелием дня и материалами для спокойного чтения. Такой формат помогает соединить физическую святыню и доступные духовные тексты.',
    pageType: 'landing',
    targetKeyword: 'икона с QR кодом',
    city: 'онлайн',
    language: 'ru',
    imageUrl: '/images/christ-icon.svg',
    blocks: ['Для дома', 'Для храма', 'Для подарка'],
    faq: [
      { question: 'Можно ли создать страницу для конкретной иконы?', answer: 'Да, QR-страница может быть связана с конкретной физической иконой.' },
      { question: 'Можно ли редактировать молитвы и тексты?', answer: 'Да, контент управляется через админ-панель.' }
    ],
    seoTitle: 'Православная икона с QR-кодом: молитва и материалы онлайн',
    seoDescription: 'Интерактивные православные иконы с QR-страницами, молитвами, житиями и духовными материалами.',
    seoKeywords: 'икона с QR кодом, православные иконы онлайн',
    status: 'published',
    createdAt: now,
    updatedAt: now
  }
];

export const qrPages: QrPage[] = [
  {
    id: 'qr-home-001',
    qrId: 'home-001',
    iconId: 'icon-kazan',
    slug: 'home-001',
    title: 'Домашняя Казанская икона',
    ownerName: 'Семейная икона',
    location: 'Домашний киот',
    customPrayer: 'Помяни, Господи, нашу семью и помоги нам жить в мире.',
    active: true,
    scanCount: 128,
    createdAt: now,
    updatedAt: now
  }
];

export const churches: Church[] = [
  {
    id: 'church-demo',
    slug: 'hram-demo',
    title: 'Храмовый QR-комплект',
    city: 'Москва',
    address: 'по запросу',
    description: 'QR-страницы помогают прихожанам читать молитвы, жития и расписание, не перегружая пространство храма печатными материалами.',
    schedule: 'Расписание подключается через админ-панель.',
    donationUrl: '#',
    relatedIcons: ['kazan-icon', 'nikolay-chudotvorets'],
    seoTitle: 'QR-страницы для православных храмов',
    seoDescription: 'Интерактивные страницы икон, молитв и расписания для храмов.',
    status: 'published'
  }
];

export const dashboard: Dashboard = {
  publishedPages: 12,
  icons: icons.length,
  prayers: prayers.length,
  qrPages: qrPages.length,
  qrScans: qrPages.reduce((sum, page) => sum + page.scanCount, 0),
  latestPages: [
    { title: 'Казанская икона Божией Матери', type: 'Икона', status: 'published' },
    { title: 'Православная икона с QR-кодом', type: 'SEO', status: 'published' }
  ],
  seo: [
    { label: 'Published', value: '12' },
    { label: 'Drafts', value: '4' },
    { label: 'QR scans', value: '128' }
  ]
};
