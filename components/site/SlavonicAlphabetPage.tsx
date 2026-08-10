'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n, useLocaleHref } from '@/components/site/LanguageProvider';
import type { ChurchAlphabetLetterDto } from '@/lib/types';

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
  numberLabel: string;
};

const slavonicCopy: Record<'uk' | 'ru' | 'en', SlavonicPageCopy> = {
  uk: {
    eyebrow: 'Давня книжність',
    title: 'Старословʼянська азбука',
    lead: 'Літери, що несли звук, число і сенс',
    note: 'Показано розширений набір знаків: основний ранній склад і варіативні книжні знаки.',
    messageButton: 'Послання азбуки',
    lettersCount: 'літер',
    gridAria: 'Інтерактивна сітка літер',
    messageEyebrow: 'Азбука як послання',
    messageTitle: 'Аз Буки Веди Глаголи Добро Есть',
    messageText: 'Я знаю букви: говори добро, добро існує.',
    numberLabel: 'Номер'
  },
  ru: {
    eyebrow: 'Древняя книжность',
    title: 'Старославянская азбука',
    lead: 'Буквы, которые несли звук, число и смысл',
    note: 'Показан расширенный набор знаков: основной ранний состав и вариативные книжные знаки.',
    messageButton: 'Послание азбуки',
    lettersCount: 'букв',
    gridAria: 'Интерактивная сетка букв',
    messageEyebrow: 'Азбука как послание',
    messageTitle: 'Аз Буки Веди Глаголи Добро Есть',
    messageText: 'Я знаю буквы: говори добро, добро существует.',
    numberLabel: 'Номер'
  },
  en: {
    eyebrow: 'Ancient book culture',
    title: 'Old Slavonic Alphabet',
    lead: 'Letters that carried sound, number, and meaning',
    note: 'An extended set of signs is shown: the early core alphabet plus variant book signs.',
    messageButton: 'Alphabet message',
    lettersCount: 'letters',
    gridAria: 'Interactive letter grid',
    messageEyebrow: 'Alphabet as a message',
    messageTitle: 'Az Buki Vedi Glagoli Dobro Est',
    messageText: 'I know the letters: speak good; goodness exists.',
    numberLabel: 'Number'
  }
};

export function SlavonicAlphabetPage({ letters }: { letters: ChurchAlphabetLetterDto[] }) {
  const { locale } = useI18n();
  const localeHref = useLocaleHref();
  const copy = slavonicCopy[locale];
  const firstLetters = letters.slice(0, 6);
  const [showMessage, setShowMessage] = useState(false);

  return (
    <main className="min-h-screen bg-canvas px-[clamp(18px,5vw,72px)] py-[clamp(42px,5vw,92px)] text-foreground">
      <section className="relative overflow-hidden border-b border-gold-light/15 pb-[clamp(34px,5vw,80px)]" aria-labelledby="slavonic-title">
        <div
          className="pointer-events-none absolute right-[clamp(8px,4vw,72px)] bottom-2 font-serif text-[clamp(92px,20vw,240px)] leading-[0.8] text-gold/8"
          aria-hidden="true"
        >
          Ⰰ
        </div>
        <p className="relative z-10 text-gold-light text-[12px] font-black tracking-[.16em] uppercase max-[520px]:tracking-[.12em]">{copy.eyebrow}</p>
        <h1
          id="slavonic-title"
          className="relative z-10 my-3.5 max-w-[1180px] text-balance font-serif text-[clamp(38px,5.8vw,96px)] leading-[1.02] font-bold text-foreground"
        >
          {copy.title}
        </h1>
        <p className="relative z-10 max-w-[760px] font-serif text-[clamp(18px,2.1vw,28px)] leading-[1.4] text-muted-foreground">{copy.lead}</p>
        <small className="relative z-10 mt-4 block w-fit max-w-[760px] rounded-md border border-gold/28 bg-[rgba(21,19,15,.82)] px-3.5 py-2.5 text-[13px] leading-snug font-bold text-muted-foreground">
          {copy.note}
        </small>
        <div className="relative z-10 mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gold bg-gradient-to-b from-gold-light to-gold px-[18px] text-[13px] leading-[1.15] font-black tracking-[.06em] text-primary-foreground uppercase transition-colors duration-200 ease-brand hover:border-gold-light hover:bg-gold-light"
            onClick={() => setShowMessage((value) => !value)}
          >
            {copy.messageButton}
          </button>
          <span className="inline-flex min-h-11 items-center rounded-full border border-gold/28 bg-[rgba(21,19,15,.82)] px-4 text-[13px] font-black text-gold-light uppercase">
            {letters.length} {copy.lettersCount}
          </span>
        </div>
      </section>

      <section
        className="relative mt-[clamp(28px,4vw,46px)] p-[clamp(14px,2vw,22px)] after:absolute after:inset-3 after:rounded-md after:border after:border-gold/18 after:content-['']"
        aria-label={copy.gridAria}
      >
        <div className="columns-2 gap-[clamp(10px,1.4vw,18px)] min-[521px]:columns-3 min-[821px]:columns-4 min-[1181px]:columns-6">
          {letters.map((item) => (
            <Link
              key={item.id}
              href={localeHref(`/staroslavyanskaya-azbuka/${item.slug}`)}
              className="group relative isolate mb-[clamp(10px,1.4vw,18px)] block w-full min-w-0 overflow-hidden rounded-md border border-gold/28 bg-[rgba(20,18,14,.97)] text-foreground shadow-[0_2px_10px_rgba(0,0,0,.22)] transition-[transform,box-shadow,border-color] duration-200 ease-brand [break-inside:avoid] hover:-translate-y-1.5 hover:border-gold-light hover:shadow-lg hover:ring-1 hover:ring-[rgba(214,168,79,.35)] focus-visible:-translate-y-1.5 focus-visible:border-gold-light"
            >
              <span className="absolute top-3 right-3 z-20 inline-flex h-[26px] min-w-[34px] items-center justify-center rounded-full border border-[rgba(214,168,79,.3)] bg-black/70 font-sans text-[11px] leading-none font-black text-gold-light">
                {String(item.sortOrder).padStart(2, '0')}
              </span>
              <div
                className={`relative z-0 block overflow-hidden bg-gradient-to-br from-[#f8f2e3] to-[#efe5cd] ${
                  item.cardImageUrl ? '' : 'grid aspect-[4/5] place-items-center'
                }`}
              >
                {item.cardImageUrl ? (
                  <img
                    src={item.cardImageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="block h-auto w-full transition-transform duration-300 ease-brand group-hover:scale-105"
                  />
                ) : (
                  <strong className="font-serif text-[clamp(72px,11vw,128px)] leading-[.8]" style={{ color: item.color || undefined }}>
                    {item.letter}
                  </strong>
                )}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 grid translate-y-2 gap-1 bg-gradient-to-t from-black/95 from-[8%] via-black/60 via-[52%] to-transparent px-3.5 pt-8 pb-3.5 text-center opacity-0 transition-[opacity,transform] duration-200 ease-brand group-hover:translate-y-0 group-hover:opacity-100">
                <strong className="font-serif text-[clamp(16px,1.4vw,20px)] font-extrabold text-gold-light">{item.name}</strong>
                {item.shortDescription ? (
                  <p className="m-0 line-clamp-2 font-sans text-[clamp(12px,1vw,13px)] leading-[1.4] text-white/85">{item.shortDescription}</p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {firstLetters.length ? (
        <section
          className={`mt-6 grid grid-cols-1 items-center gap-[clamp(18px,4vw,54px)] p-[clamp(26px,5vw,58px)] min-[821px]:grid-cols-[minmax(0,.9fr)_minmax(280px,1.1fr)] ${showMessage ? '' : 'hidden'}`}
          aria-labelledby="slavonic-message-title"
        >
          <div>
            <p className="text-gold-light text-[12px] font-black tracking-[.16em] uppercase max-[520px]:tracking-[.12em]">{copy.messageEyebrow}</p>
            <h2 id="slavonic-message-title" className="my-2 font-serif text-[clamp(30px,4vw,60px)] leading-[1.02] font-bold text-foreground">
              {copy.messageTitle}
            </h2>
            <p className="font-serif text-[clamp(18px,2vw,25px)] leading-[1.42] text-muted-foreground">{copy.messageText}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-[821px]:grid-cols-6" aria-label="Первые буквы послания">
            {firstLetters.map((item) => (
              <span key={item.id} className="grid place-items-center gap-1 rounded-xs border border-gold/28 bg-gold/8 px-2 py-3.5">
                <b className="font-serif text-[clamp(34px,4vw,54px)] leading-[.9] text-[#d1473d]">{item.letter}</b>
                <small className="font-sans text-xs font-black text-muted-foreground">{item.name}</small>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
