'use client';

import { useEffect, useState } from 'react';
import { AssetButton } from '@/components/site/AssetButton';
import { useI18n } from '@/components/site/LanguageProvider';
import { publicApi } from '@/lib/api';
import type { ChurchProductDto } from '@/lib/types';

type OrderModalCopy = {
  trigger: string;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  contactMethodLabel: string;
  contactPhone: string;
  contactEmail: string;
  contactValueLabel: string;
  countryLabel: string;
  cityLabel: string;
  optionsLabel: string;
  consecrationLabel: string;
  channelLabel: string;
  channelPlaceholder: string;
  commentLabel: string;
  commentPlaceholder: string;
  consentLabel: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successText: string;
  closeLabel: string;
  errorGeneric: string;
  errorRateLimited: string;
  requiredError: string;
};

const copy: Record<'uk' | 'ru' | 'en', OrderModalCopy> = {
  uk: {
    trigger: 'Замовити',
    title: 'Оформлення замовлення',
    nameLabel: 'Імʼя',
    namePlaceholder: 'Як до вас звертатися',
    contactMethodLabel: 'Спосіб звʼязку',
    contactPhone: 'Телефон',
    contactEmail: 'Email',
    contactValueLabel: 'Ваш контакт',
    countryLabel: 'Країна',
    cityLabel: 'Місто',
    optionsLabel: 'Супутні товари',
    consecrationLabel: 'Освятити в храмі',
    channelLabel: 'Зручний канал звʼязку',
    channelPlaceholder: 'Viber, Telegram, дзвінок...',
    commentLabel: 'Коментар',
    commentPlaceholder: 'Побажання щодо замовлення',
    consentLabel: 'Погоджуюсь на обробку персональних даних',
    submit: 'Надіслати замовлення',
    submitting: 'Надсилаємо...',
    successTitle: 'Дякуємо за замовлення!',
    successText: 'Номер вашого замовлення: {number}. Ми звʼяжемося з вами найближчим часом.',
    closeLabel: 'Закрити',
    errorGeneric: 'Не вдалося надіслати замовлення. Перевірте поля та спробуйте ще раз.',
    errorRateLimited: 'Забагато спроб. Спробуйте, будь ласка, за хвилину.',
    requiredError: 'Заповніть імʼя, контакт і погодьтесь на обробку даних.'
  },
  ru: {
    trigger: 'Заказать',
    title: 'Оформление заказа',
    nameLabel: 'Имя',
    namePlaceholder: 'Как к вам обращаться',
    contactMethodLabel: 'Способ связи',
    contactPhone: 'Телефон',
    contactEmail: 'Email',
    contactValueLabel: 'Ваш контакт',
    countryLabel: 'Страна',
    cityLabel: 'Город',
    optionsLabel: 'Сопутствующие товары',
    consecrationLabel: 'Освятить в храме',
    channelLabel: 'Удобный канал связи',
    channelPlaceholder: 'Viber, Telegram, звонок...',
    commentLabel: 'Комментарий',
    commentPlaceholder: 'Пожелания к заказу',
    consentLabel: 'Согласен(на) на обработку персональных данных',
    submit: 'Отправить заказ',
    submitting: 'Отправляем...',
    successTitle: 'Спасибо за заказ!',
    successText: 'Номер вашего заказа: {number}. Мы свяжемся с вами в ближайшее время.',
    closeLabel: 'Закрыть',
    errorGeneric: 'Не удалось отправить заказ. Проверьте поля и попробуйте ещё раз.',
    errorRateLimited: 'Слишком много попыток. Попробуйте, пожалуйста, через минуту.',
    requiredError: 'Заполните имя, контакт и согласие на обработку данных.'
  },
  en: {
    trigger: 'Order',
    title: 'Place an order',
    nameLabel: 'Name',
    namePlaceholder: 'How should we address you',
    contactMethodLabel: 'Contact method',
    contactPhone: 'Phone',
    contactEmail: 'Email',
    contactValueLabel: 'Your contact',
    countryLabel: 'Country',
    cityLabel: 'City',
    optionsLabel: 'Related products',
    consecrationLabel: 'Have it consecrated at the church',
    channelLabel: 'Preferred contact channel',
    channelPlaceholder: 'Viber, Telegram, phone call...',
    commentLabel: 'Comment',
    commentPlaceholder: 'Any special requests',
    consentLabel: 'I agree to the processing of my personal data',
    submit: 'Send order',
    submitting: 'Sending...',
    successTitle: 'Thank you for your order!',
    successText: 'Your order number: {number}. We will contact you shortly.',
    closeLabel: 'Close',
    errorGeneric: 'Could not submit the order. Please check the fields and try again.',
    errorRateLimited: 'Too many attempts. Please try again in a minute.',
    requiredError: 'Please fill in your name, a contact, and give consent.'
  }
};

function formatMoney(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function productName(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.nameRu || product.nameUk;
  if (locale === 'en') return product.nameEn || product.nameUk;
  return product.nameUk;
}

export function ProductOrderTrigger({ product, related }: { product: ChurchProductDto; related: ChurchProductDto[] }) {
  const { locale } = useI18n();
  const text = copy[locale];
  const [open, setOpen] = useState(false);

  if (product.stockStatus === 'unavailable') return null;

  return (
    <>
      <AssetButton variant="dark" onClick={() => setOpen(true)}>{text.trigger}</AssetButton>
      {open ? <ProductOrderModal product={product} related={related} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ProductOrderModal({ product, related, onClose }: { product: ChurchProductDto; related: ChurchProductDto[]; onClose: () => void }) {
  const { locale } = useI18n();
  const text = copy[locale];

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [contactMethod, setContactMethod] = useState<'phone' | 'email'>('phone');
  const [contactValue, setContactValue] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [consecrationRequested, setConsecrationRequested] = useState(false);
  const [preferredContactChannel, setPreferredContactChannel] = useState('');
  const [comment, setComment] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleOption(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contactValue.trim() || !consentGiven) {
      setError(text.requiredError);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await publicApi.createProductOrder({
        productSlug: product.slug,
        customerName: name,
        contactMethod,
        contactValue,
        preferredContactChannel: preferredContactChannel || undefined,
        country: country || undefined,
        city: city || undefined,
        consecrationRequested,
        comment: comment || undefined,
        consentGiven,
        items: selectedIds.map((productId) => ({ productId })),
        website
      });
      setOrderNumber(response.orderNumber);
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message === 'rate_limited' ? text.errorRateLimited : text.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="icon-order-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="icon-order-modal" role="dialog" aria-modal="true" aria-labelledby="product-order-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="icon-order-close" onClick={onClose} aria-label={text.closeLabel}>×</button>

        {orderNumber ? (
          <div className="icon-order-success">
            <h2>{text.successTitle}</h2>
            <p>{text.successText.replace('{number}', orderNumber)}</p>
            <button type="button" className="icon-order-submit" onClick={onClose}>{text.closeLabel}</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 id="product-order-title">{text.title}</h2>
            <p className="icon-order-icon-name">{productName(product, locale)}</p>
            <dl className="icon-order-meta">
              <div><dt>{formatMoney(product.priceCents, product.currency)}</dt></div>
            </dl>

            <label><span>{text.nameLabel}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={text.namePlaceholder} required /></label>

            <div className="icon-order-contact-method">
              <label><input type="radio" name="contactMethod" checked={contactMethod === 'phone'} onChange={() => setContactMethod('phone')} /><span>{text.contactPhone}</span></label>
              <label><input type="radio" name="contactMethod" checked={contactMethod === 'email'} onChange={() => setContactMethod('email')} /><span>{text.contactEmail}</span></label>
            </div>
            <label><span>{text.contactValueLabel}</span><input value={contactValue} onChange={(event) => setContactValue(event.target.value)} type={contactMethod === 'email' ? 'email' : 'tel'} required /></label>

            <div className="icon-order-grid-2">
              <label><span>{text.countryLabel}</span><input value={country} onChange={(event) => setCountry(event.target.value)} /></label>
              <label><span>{text.cityLabel}</span><input value={city} onChange={(event) => setCity(event.target.value)} /></label>
            </div>

            {related.length ? (
              <fieldset className="icon-order-options">
                <legend>{text.optionsLabel}</legend>
                {related.map((option) => (
                  <label key={option.id} className="icon-order-option">
                    <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => toggleOption(option.id)} />
                    {option.photoUrl ? <img src={option.photoUrl} alt={productName(option, locale)} loading="lazy" /> : null}
                    <span>{productName(option, locale)}</span>
                    <small>{formatMoney(option.priceCents, option.currency)}</small>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {product.consecrationAvailable ? (
              <label className="icon-order-checkbox"><input type="checkbox" checked={consecrationRequested} onChange={(event) => setConsecrationRequested(event.target.checked)} /><span>{text.consecrationLabel}</span></label>
            ) : null}

            <label><span>{text.channelLabel}</span><input value={preferredContactChannel} onChange={(event) => setPreferredContactChannel(event.target.value)} placeholder={text.channelPlaceholder} /></label>
            <label><span>{text.commentLabel}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={text.commentPlaceholder} /></label>

            <label className="icon-order-honeypot" aria-hidden="true">
              <span>Website</span>
              <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
            </label>

            <label className="icon-order-checkbox"><input type="checkbox" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} required /><span>{text.consentLabel}</span></label>

            {error ? <p className="icon-order-error">{error}</p> : null}

            <button type="submit" className="icon-order-submit" disabled={submitting}>{submitting ? text.submitting : text.submit}</button>
          </form>
        )}
      </section>
    </div>
  );
}
