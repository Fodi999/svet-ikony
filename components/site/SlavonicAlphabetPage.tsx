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
          <span>{letters.length} {copy.lettersCount}</span>
        </div>
      </section>

      <section className="slavonic-grid-section" aria-label={copy.gridAria}>
        <div className="slavonic-grid">
          {letters.map((item) => (
            <Link
              key={item.id}
              href={localeHref(`/staroslavyanskaya-azbuka/${item.slug}`)}
              className="slavonic-tile"
            >
              <span className="slavonic-tile__number" aria-label={`${copy.numberLabel} ${item.sortOrder}`}>
                {String(item.sortOrder).padStart(2, '0')}
              </span>
              <div className={`slavonic-tile__media ${item.cardImageUrl ? '' : 'slavonic-tile__media--glyph'}`}>
                {item.cardImageUrl ? (
                  <img src={item.cardImageUrl} alt={item.name} loading="lazy" />
                ) : (
                  <strong className="slavonic-tile__glyph" style={{ color: item.color || undefined }}>{item.letter}</strong>
                )}
              </div>
              <div className="slavonic-tile__body">
                <strong className="slavonic-tile__name">{item.name}</strong>
                {item.shortDescription ? <p className="slavonic-tile__desc">{item.shortDescription}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {firstLetters.length ? (
        <section className={`slavonic-message ${showMessage ? 'open' : ''}`} aria-labelledby="slavonic-message-title">
          <div>
            <p className="eyebrow">{copy.messageEyebrow}</p>
            <h2 id="slavonic-message-title">{copy.messageTitle}</h2>
            <p>{copy.messageText}</p>
          </div>
          <div className="slavonic-message-letters" aria-label="Первые буквы послания">
            {firstLetters.map((item) => (
              <span key={item.id}><b>{item.letter}</b><small>{item.name}</small></span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
