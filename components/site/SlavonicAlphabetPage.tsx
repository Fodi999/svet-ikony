'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/site/LanguageProvider';

type AudioState = 'checking' | 'ready' | 'missing';


type SlavonicPageCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  note: string;
  messageButton: string;
  lettersCount: string;
  gridAria: string;
  messageEyebrow: string;
  messageTitle: string;
  messageText: string;
  modalEyebrow: string;
  soundLabel: string;
  meaningLabel: string;
  closeLabel: string;
  listen: string;
  checkingAudio: string;
  audioSoon: string;
  numberLabel: string;
};

const slavonicCopy: Record<'uk' | 'ru' | 'en', SlavonicPageCopy> = {
  uk: {
    eyebrow: 'Давня книжність',
    title: 'Старословʼянська азбука',
    lead: 'Літери, що несли звук, число і сенс',
    note: 'Показано розширений набір із 46 знаків: основний ранній склад і варіативні книжні знаки.',
    messageButton: 'Послання азбуки',
    lettersCount: '46 літер',
    gridAria: 'Інтерактивна сітка літер',
    messageEyebrow: 'Азбука як послання',
    messageTitle: 'Аз Буки Веди Глаголи Добро Есть',
    messageText: 'Я знаю букви: говори добро, добро існує.',
    modalEyebrow: 'Літера азбуки',
    soundLabel: 'Сучасне звучання',
    meaningLabel: 'Сенс',
    closeLabel: 'Закрити',
    listen: 'Слухати',
    checkingAudio: 'Перевіряємо аудіо',
    audioSoon: 'Аудіо скоро',
    numberLabel: 'Номер'
  },
  ru: {
    eyebrow: 'Древняя книжность',
    title: 'Старославянская азбука',
    lead: 'Буквы, которые несли звук, число и смысл',
    note: 'Показан расширенный набор из 46 знаков: основной ранний состав и вариативные книжные знаки.',
    messageButton: 'Послание азбуки',
    lettersCount: '46 букв',
    gridAria: 'Интерактивная сетка букв',
    messageEyebrow: 'Азбука как послание',
    messageTitle: 'Аз Буки Веди Глаголи Добро Есть',
    messageText: 'Я знаю буквы: говори добро, добро существует.',
    modalEyebrow: 'Буква азбуки',
    soundLabel: 'Современное звучание',
    meaningLabel: 'Смысл',
    closeLabel: 'Закрыть',
    listen: 'Слушать',
    checkingAudio: 'Проверяем аудио',
    audioSoon: 'Аудио скоро',
    numberLabel: 'Номер'
  },
  en: {
    eyebrow: 'Ancient book culture',
    title: 'Old Slavonic Alphabet',
    lead: 'Letters that carried sound, number, and meaning',
    note: 'An extended set of 46 signs is shown: the early core alphabet plus variant book signs.',
    messageButton: 'Alphabet message',
    lettersCount: '46 letters',
    gridAria: 'Interactive letter grid',
    messageEyebrow: 'Alphabet as a message',
    messageTitle: 'Az Buki Vedi Glagoli Dobro Est',
    messageText: 'I know the letters: speak good; goodness exists.',
    modalEyebrow: 'Alphabet letter',
    soundLabel: 'Modern sound',
    meaningLabel: 'Meaning',
    closeLabel: 'Close',
    listen: 'Listen',
    checkingAudio: 'Checking audio',
    audioSoon: 'Audio soon',
    numberLabel: 'Number'
  }
};

type SlavonicLetter = {
  letter: string;
  name: string;
  sound: string;
  meaning: string;
  explanation: string;
  audio: string;
  tone: 'red' | 'blue';
};


const meaningTranslations: Record<string, { uk: string; en: string }> = {
  'Я, начало, человек': { uk: 'Я, початок, людина', en: 'I, beginning, person' },
  'Буквы, знание, письмо': { uk: 'Літери, знання, письмо', en: 'Letters, knowledge, writing' },
  'Ведаю, знаю': { uk: 'Відаю, знаю', en: 'I know, I understand' },
  'Говори, слово, речь': { uk: 'Говори, слово, мовлення', en: 'Speak, word, speech' },
  'Добро, благо, доброе дело': { uk: 'Добро, благо, добра справа', en: 'Goodness, blessing, good deed' },
  'Есть, существует, бытие': { uk: 'Є, існує, буття', en: 'Is, exists, being' },
  'Жизнь, живите': { uk: 'Життя, живіть', en: 'Life, live' },
  'Весьма, очень': { uk: 'Вельми, дуже', en: 'Very, greatly' },
  'Земля, мир': { uk: 'Земля, світ', en: 'Earth, world' },
  'Который, тот': { uk: 'Котрий, той', en: 'Which, that one' },
  'И, союз, движение звука': { uk: 'І, сполучник, рух звуку', en: 'And, conjunction, movement of sound' },
  'Как, каким образом': { uk: 'Як, яким чином', en: 'How, in what way' },
  'Люди, народ': { uk: 'Люди, народ', en: 'People, nation' },
  'Мыслите, думайте': { uk: 'Мисліть, думайте', en: 'Think, reflect' },
  'Наш': { uk: 'Наш', en: 'Our' },
  'Он': { uk: 'Він', en: 'He' },
  'Мир, покой': { uk: 'Мир, спокій', en: 'Peace, rest' },
  'Говори, изреки': { uk: 'Говори, промов', en: 'Speak, utter' },
  'Слово': { uk: 'Слово', en: 'Word' },
  'Твердо, крепко': { uk: 'Твердо, міцно', en: 'Firmly, strongly' },
  'Учение, знание': { uk: 'Учення, знання', en: 'Teaching, knowledge' },
  'Буква Ф': { uk: 'Літера Ф', en: 'The letter F' },
  'Буква Х': { uk: 'Літера Х', en: 'The letter Kh' },
  'От, омега, торжественное О': { uk: 'От, омега, урочисте О', en: 'Ot, omega, solemn O' },
  'Буква Ц': { uk: 'Літера Ц', en: 'The letter Ts' },
  'Буква Ч': { uk: 'Літера Ч', en: 'The letter Ch' },
  'Буква Ш': { uk: 'Літера Ш', en: 'The letter Sh' },
  'Буква Щ, сочетание шт': { uk: 'Літера Щ, сполучення шт', en: 'The letter Shch, the sht sound cluster' },
  'Твердый знак, древний редуцированный звук': { uk: 'Твердий знак, давній редукований звук', en: 'Hard sign, an old reduced vowel' },
  'Ы': { uk: 'И', en: 'Y sound' },
  'Мягкий знак, древний редуцированный звук': { uk: 'Мʼякий знак, давній редукований звук', en: 'Soft sign, an old reduced vowel' },
  'Древний звук ѣ': { uk: 'Давній звук ѣ', en: 'Ancient yat sound' },
  'Йотированное А': { uk: 'Йотоване А', en: 'Iotated A' },
  'Йотированное Е': { uk: 'Йотоване Е', en: 'Iotated E' },
  'Йотированное У': { uk: 'Йотоване У', en: 'Iotated U' },
  'Большой носовой гласный': { uk: 'Великий носовий голосний', en: 'Large nasal vowel' },
  'Йотированный большой юс': { uk: 'Йотований великий юс', en: 'Iotated large yus' },
  'Малый носовой гласный': { uk: 'Малий носовий голосний', en: 'Small nasal vowel' },
  'Йотированный малый юс': { uk: 'Йотований малий юс', en: 'Iotated small yus' },
  'Греческая буква кси': { uk: 'Грецька літера ксі', en: 'Greek letter xi' },
  'Греческая буква пси': { uk: 'Грецька літера псі', en: 'Greek letter psi' },
  'Греческая theta': { uk: 'Грецька theta', en: 'Greek theta' },
  'Греческая upsilon': { uk: 'Грецька upsilon', en: 'Greek upsilon' },
  'Коппа, знак числа': { uk: 'Коппа, числовий знак', en: 'Koppa, a numeral sign' },
  'Лигатура омега + твердо': { uk: 'Лігатура омега + твердо', en: 'Ligature omega + tverdo' },
  'Региональный знак южнославянской традиции': { uk: 'Регіональний знак південнословʼянської традиції', en: 'Regional sign of the South Slavic tradition' }
};

function letterMeaning(item: SlavonicLetter, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return item.meaning;
  return meaningTranslations[item.meaning]?.[locale] ?? item.meaning;
}

function letterExplanation(item: SlavonicLetter, locale: 'uk' | 'ru' | 'en', meaning: string) {
  if (locale === 'ru') return item.explanation;
  if (locale === 'uk') {
    return `${item.name} — знак старословʼянської азбуки. Його сенс: ${meaning}. Такі літери зберігали звук, числову памʼять і книжну традицію давнього церковного письма.`;
  }
  return `${item.name} is a sign of the Old Slavonic alphabet. Its meaning: ${meaning}. These letters preserved sound, numerical memory, and the book tradition of early church writing.`;
}

const slavonicLetters: SlavonicLetter[] = [
  { letter: 'А', name: 'Азъ', sound: 'А', meaning: 'Я, начало, человек', explanation: 'Азъ напоминает, что познание начинается с личности и ответственности человека перед Богом, словом и делом.', audio: '/audio/slavonic/az.mp3', tone: 'red' },
  { letter: 'Б', name: 'Буки', sound: 'Б', meaning: 'Буквы, знание, письмо', explanation: 'Буки открывает путь к письменной памяти: через буквы сохранялись молитвы, книги и церковное предание.', audio: '/audio/slavonic/buki.mp3', tone: 'blue' },
  { letter: 'В', name: 'Веди', sound: 'В', meaning: 'Ведаю, знаю', explanation: 'Веди говорит о знании не как о гордости, а как о внимательном ведении истины и смысла.', audio: '/audio/slavonic/vedi.mp3', tone: 'red' },
  { letter: 'Г', name: 'Глаголи', sound: 'Г', meaning: 'Говори, слово, речь', explanation: 'Глаголи напоминает: слово должно быть живым, правдивым и добрым, потому что речь формирует сердце.', audio: '/audio/slavonic/glagoli.mp3', tone: 'blue' },
  { letter: 'Д', name: 'Добро', sound: 'Д', meaning: 'Добро, благо, доброе дело', explanation: 'Добро соединяет знание и поступок: истинное слово должно вести к милосердию и благому делу.', audio: '/audio/slavonic/dobro.mp3', tone: 'red' },
  { letter: 'Є', name: 'Есть', sound: 'Е / Є', meaning: 'Есть, существует, бытие', explanation: 'Есть указывает на бытие и присутствие: добро не только произносится, но существует и становится жизнью.', audio: '/audio/slavonic/est.mp3', tone: 'blue' },
  { letter: 'Ж', name: 'Живете', sound: 'Ж', meaning: 'Жизнь, живите', explanation: 'Живете звучит как призыв жить осмысленно, хранить душу и принимать жизнь как дар.', audio: '/audio/slavonic/zhivete.mp3', tone: 'red' },
  { letter: 'Ѕ', name: 'Зело', sound: 'ДЗ', meaning: 'Весьма, очень', explanation: 'Зело передавало звук дз и усиливало смысл: в древней книжности даже редкие буквы помогали точнее слышать слово.', audio: '/audio/slavonic/dzelo.mp3', tone: 'blue' },
  { letter: 'З', name: 'Земля', sound: 'З', meaning: 'Земля, мир', explanation: 'Земля напоминает о мире, доме и творении, где человек призван трудиться и хранить порядок.', audio: '/audio/slavonic/zemlya.mp3', tone: 'red' },
  { letter: 'И', name: 'Иже', sound: 'И', meaning: 'Который, тот', explanation: 'Иже связывает слова и смыслы, помогая древнему тексту звучать стройно и молитвенно.', audio: '/audio/slavonic/izhe.mp3', tone: 'blue' },
  { letter: 'І', name: 'И', sound: 'И / Й', meaning: 'И, союз, движение звука', explanation: 'Іота сохраняет греческую книжную память и показывает, как славянская азбука соединяла местную речь с церковной традицией.', audio: '/audio/slavonic/i.mp3', tone: 'red' },
  { letter: 'К', name: 'Како', sound: 'К', meaning: 'Как, каким образом', explanation: 'Како задает вопрос о пути: мало знать цель, важно понять, как идти к ней честно.', audio: '/audio/slavonic/kako.mp3', tone: 'blue' },
  { letter: 'Л', name: 'Люди', sound: 'Л', meaning: 'Люди, народ', explanation: 'Люди говорит о соборности: буквы и книги служили не одиночеству, а народу и общине.', audio: '/audio/slavonic/lyudi.mp3', tone: 'red' },
  { letter: 'М', name: 'Мыслете', sound: 'М', meaning: 'Мыслите, думайте', explanation: 'Мыслете призывает к рассуждению, вниманию и духовной трезвости в словах и поступках.', audio: '/audio/slavonic/myslete.mp3', tone: 'blue' },
  { letter: 'Н', name: 'Нашъ', sound: 'Н', meaning: 'Наш', explanation: 'Нашъ хранит чувство принадлежности: вера, язык и память передаются как общее наследие.', audio: '/audio/slavonic/nash.mp3', tone: 'red' },
  { letter: 'О', name: 'Онъ', sound: 'О', meaning: 'Он', explanation: 'Онъ обращает взгляд от себя к Другому, к ближнему и к Богу, перед Которым слово становится ответственным.', audio: '/audio/slavonic/on.mp3', tone: 'blue' },
  { letter: 'П', name: 'Покой', sound: 'П', meaning: 'Мир, покой', explanation: 'Покой напоминает о внутреннем мире, который рождается из молитвы, правды и добрых дел.', audio: '/audio/slavonic/pokoy.mp3', tone: 'red' },
  { letter: 'Р', name: 'Рцы', sound: 'Р', meaning: 'Говори, изреки', explanation: 'Рцы снова возвращает к речи: произнесенное слово должно быть ясным и достойным.', audio: '/audio/slavonic/rtsy.mp3', tone: 'blue' },
  { letter: 'С', name: 'Слово', sound: 'С', meaning: 'Слово', explanation: 'Слово в церковной культуре не просто звук: это смысл, молитва, свидетельство и память.', audio: '/audio/slavonic/slovo.mp3', tone: 'red' },
  { letter: 'Т', name: 'Твердо', sound: 'Т', meaning: 'Твердо, крепко', explanation: 'Твердо говорит о стойкости: доброе знание должно укореняться и выдерживать испытания.', audio: '/audio/slavonic/tverdo.mp3', tone: 'blue' },
  { letter: 'Ꙋ', name: 'Укъ', sound: 'У', meaning: 'Учение, знание', explanation: 'Укъ связан с учением: азбука была дорогой к книге, молитве и пониманию церковного текста.', audio: '/audio/slavonic/uk.mp3', tone: 'red' },
  { letter: 'Ф', name: 'Фертъ', sound: 'Ф', meaning: 'Буква Ф', explanation: 'Фертъ сохраняет особый звук и показывает, как азбука принимала разные пласты книжной традиции.', audio: '/audio/slavonic/fert.mp3', tone: 'blue' },
  { letter: 'Х', name: 'Херъ', sound: 'Х', meaning: 'Буква Х', explanation: 'Херъ передает твердый дыхательный звук, часто встречающийся в греческих и церковных именах.', audio: '/audio/slavonic/her.mp3', tone: 'red' },
  { letter: 'Ѡ', name: 'Отъ', sound: 'О / Омега', meaning: 'От, омега, торжественное О', explanation: 'Омега чаще встречалась в книжных и греческих словах, а также как декоративная торжественная буква.', audio: '/audio/slavonic/omega.mp3', tone: 'blue' },
  { letter: 'Ц', name: 'Цы', sound: 'Ц', meaning: 'Буква Ц', explanation: 'Цы хранит резкий ясный звук, важный для точного чтения древних слов и имен.', audio: '/audio/slavonic/tsy.mp3', tone: 'red' },
  { letter: 'Ч', name: 'Червь', sound: 'Ч', meaning: 'Буква Ч', explanation: 'Червь напоминает, что даже непривычные названия букв были частью живой учебной традиции.', audio: '/audio/slavonic/cherv.mp3', tone: 'blue' },
  { letter: 'Ш', name: 'Ша', sound: 'Ш', meaning: 'Буква Ш', explanation: 'Ша дает мягкую широту звучания, знакомую славянской речи и церковному чтению.', audio: '/audio/slavonic/sha.mp3', tone: 'red' },
  { letter: 'Щ', name: 'Шта', sound: 'Щ / ШТ', meaning: 'Буква Щ, сочетание шт', explanation: 'Шта передает сложный славянский звук и показывает тонкость древней фонетики.', audio: '/audio/slavonic/shta.mp3', tone: 'blue' },
  { letter: 'Ъ', name: 'Еръ', sound: 'Краткий твердый гласный', meaning: 'Твердый знак, древний редуцированный звук', explanation: 'Еръ отмечал особенность звучания и письма, помогая древнему тексту сохранять ритм.', audio: '/audio/slavonic/er.mp3', tone: 'red' },
  { letter: 'Ꙑ', name: 'Еры', sound: 'Ы', meaning: 'Ы', explanation: 'Еры хранит характерный славянский звук, который отличает живую речь от книжной схемы.', audio: '/audio/slavonic/yery.mp3', tone: 'blue' },
  { letter: 'Ь', name: 'Ерь', sound: 'Краткий мягкий гласный', meaning: 'Мягкий знак, древний редуцированный звук', explanation: 'Ерь смягчает звучание и напоминает, что в письме важна не только буква, но и тонкость произношения.', audio: '/audio/slavonic/er-soft.mp3', tone: 'red' },
  { letter: 'Ѣ', name: 'Ять', sound: 'Ѣ', meaning: 'Древний звук ѣ', explanation: 'Ять стала знаком древней книжности: ее история показывает, как менялся язык и сохранялась память.', audio: '/audio/slavonic/yat.mp3', tone: 'blue' },
  { letter: 'Ꙗ', name: 'Я', sound: 'Я', meaning: 'Йотированное А', explanation: 'Древняя буква Ꙗ передавала звук я и позже стала одной из основ современного знака Я.', audio: '/audio/slavonic/ya-iotated.mp3', tone: 'red' },
  { letter: 'Ѥ', name: 'Е йотированное', sound: 'ЙЕ', meaning: 'Йотированное Е', explanation: 'Ѥ помогала передавать начальное или мягкое йотированное звучание е в древних текстах.', audio: '/audio/slavonic/ye.mp3', tone: 'blue' },
  { letter: 'Ю', name: 'Ю', sound: 'Ю', meaning: 'Йотированное У', explanation: 'Ю соединяет мягкость и полноту звучания, завершая ряд букв, близких современному читателю.', audio: '/audio/slavonic/yu.mp3', tone: 'red' },
  { letter: 'Ѫ', name: 'Юс большой', sound: 'О носовое', meaning: 'Большой носовой гласный', explanation: 'Большой юс сохранял древний носовой звук, который позднее исчез из большинства славянских языков.', audio: '/audio/slavonic/big-yus.mp3', tone: 'blue' },
  { letter: 'Ѭ', name: 'Юс большой йотированный', sound: 'ЙО носовое', meaning: 'Йотированный большой юс', explanation: 'Ѭ соединял йотацию и носовой гласный, показывая богатство древней славянской фонетики.', audio: '/audio/slavonic/iotated-big-yus.mp3', tone: 'red' },
  { letter: 'Ѧ', name: 'Юс малый', sound: 'Е носовое', meaning: 'Малый носовой гласный', explanation: 'Малый юс передавал другой носовой звук и помогает увидеть, насколько тонкой была старая письменность.', audio: '/audio/slavonic/little-yus.mp3', tone: 'blue' },
  { letter: 'Ѩ', name: 'Юс малый йотированный', sound: 'ЙЕ носовое', meaning: 'Йотированный малый юс', explanation: 'Ѩ употреблялся в некоторых традициях и показывает, что состав азбуки менялся по времени и регионам.', audio: '/audio/slavonic/iotated-little-yus.mp3', tone: 'red' },
  { letter: 'Ѯ', name: 'Кси', sound: 'КС', meaning: 'Греческая буква кси', explanation: 'Кси использовалась главным образом в греческих заимствованиях и как числовой знак церковной письменности.', audio: '/audio/slavonic/ksi.mp3', tone: 'blue' },
  { letter: 'Ѱ', name: 'Пси', sound: 'ПС', meaning: 'Греческая буква пси', explanation: 'Пси пришла из греческого письма и встречалась в церковных словах, именах и числовой записи.', audio: '/audio/slavonic/psi.mp3', tone: 'red' },
  { letter: 'Ѳ', name: 'Фита', sound: 'Ф / Т', meaning: 'Греческая theta', explanation: 'Фита передавала греческую theta и в славянском чтении часто сближалась с ф или т.', audio: '/audio/slavonic/fita.mp3', tone: 'blue' },
  { letter: 'Ѵ', name: 'Ижица', sound: 'И / В / Ю', meaning: 'Греческая upsilon', explanation: 'Ижица связана с греческой традицией, встречалась в книжных словах и имела числовое значение.', audio: '/audio/slavonic/izhitsa.mp3', tone: 'red' },
  { letter: 'Ҁ', name: 'Коппа', sound: 'Числовой знак', meaning: 'Коппа, знак числа', explanation: 'Коппа почти не имела звуковой роли и главным образом служила числовым знаком в ранней кириллице.', audio: '/audio/slavonic/koppa.mp3', tone: 'blue' },
  { letter: 'Ѿ', name: 'От', sound: 'ОТ', meaning: 'Лигатура омега + твердо', explanation: 'Ѿ появилась как книжная лигатура для от и часто воспринимается как отдельный знак в расширенных азбучных таблицах.', audio: '/audio/slavonic/ot.mp3', tone: 'red' },
  { letter: 'Ꙉ', name: 'Дервь', sound: 'ДЖ / Ђ', meaning: 'Региональный знак южнославянской традиции', explanation: 'Дервь встречался в ранних сербских памятниках; это региональный знак, поэтому именно он делает расширенный набор вариативным.', audio: '/audio/slavonic/djerv.mp3', tone: 'blue' }
];
export function SlavonicAlphabetPage() {
  const { locale } = useI18n();
  const copy = slavonicCopy[locale];
  const [selected, setSelected] = useState<SlavonicLetter | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [audioState, setAudioState] = useState<Record<string, AudioState>>({});
  const activeAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      slavonicLetters.map(async (item) => {
        try {
          const response = await fetch(item.audio, { method: 'HEAD' });
          return [item.audio, response.ok ? 'ready' : 'missing'] as const;
        } catch {
          return [item.audio, 'missing'] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setAudioState(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
      activeAudio.current?.pause();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedAudioState = selected ? audioState[selected.audio] ?? 'checking' : 'checking';
  const selectedMeaning = selected ? letterMeaning(selected, locale) : '';
  const selectedExplanation = selected ? letterExplanation(selected, locale, selectedMeaning) : '';
  const firstLetters = useMemo(() => slavonicLetters.slice(0, 6), []);

  function listen(letter: SlavonicLetter) {
    if ((audioState[letter.audio] ?? 'checking') !== 'ready') return;
    activeAudio.current?.pause();
    const audio = new Audio(letter.audio);
    activeAudio.current = audio;
    void audio.play().catch(() => {
      setAudioState((current) => ({ ...current, [letter.audio]: 'missing' }));
    });
  }

  return (
    <main className="page slavonic-page">
      <section className="slavonic-hero" aria-labelledby="slavonic-title">
        <div className="slavonic-book-mark" aria-hidden="true">Ⰰ</div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="slavonic-title">{copy.title}</h1>
        <p>{copy.lead}</p>
        <small className="slavonic-hero-note">{copy.note}</small>
        <div className="slavonic-hero-actions">
          <button type="button" className="slavonic-primary-action" onClick={() => setShowMessage((value) => !value)}>
            {copy.messageButton}
          </button>
          <span>{copy.lettersCount}</span>
        </div>
      </section>

      <section className="slavonic-grid-section" aria-label={copy.gridAria}>
        <div className="slavonic-grid">
          {slavonicLetters.map((item, index) => (
            <button key={`${item.letter}-${item.name}`} type="button" className={`slavonic-tile ${item.tone}`} onClick={() => setSelected(item)}>
              <span className="slavonic-tile__number" aria-label={`${copy.numberLabel} ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.letter}</strong>
              <small>{item.name}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={`slavonic-message ${showMessage ? 'open' : ''}`} aria-labelledby="slavonic-message-title">
        <div>
          <p className="eyebrow">{copy.messageEyebrow}</p>
          <h2 id="slavonic-message-title">{copy.messageTitle}</h2>
          <p>{copy.messageText}</p>
        </div>
        <div className="slavonic-message-letters" aria-label="Первые буквы послания">
          {firstLetters.map((item) => (
            <span key={item.name}><b>{item.letter}</b><small>{item.name}</small></span>
          ))}
        </div>
      </section>

      {selected ? (
        <div className="slavonic-modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="slavonic-modal" role="dialog" aria-modal="true" aria-labelledby="slavonic-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="slavonic-modal__close" onClick={() => setSelected(null)} aria-label={copy.closeLabel}>×</button>
            <div className={`slavonic-modal__letter ${selected.tone}`}>{selected.letter}</div>
            <div className="slavonic-modal__content">
              <p className="eyebrow">{copy.modalEyebrow}</p>
              <h2 id="slavonic-modal-title">{selected.name}</h2>
              <dl>
                <div><dt>{copy.soundLabel}</dt><dd>{selected.sound}</dd></div>
                <div><dt>{copy.meaningLabel}</dt><dd>{selectedMeaning}</dd></div>
              </dl>
              <p>{selectedExplanation}</p>
              <button type="button" className="slavonic-listen" disabled={selectedAudioState !== 'ready'} onClick={() => listen(selected)}>
                {selectedAudioState === 'ready' ? copy.listen : selectedAudioState === 'checking' ? copy.checkingAudio : copy.audioSoon}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
