'use client';

import { useState } from 'react';
import { AssetButton } from '@/components/site/AssetButton';
import { useI18n } from '@/components/site/LanguageProvider';
import { Dialog, DialogClose, DialogOverlay, DialogPopup, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
    <Dialog open={open} onOpenChange={setOpen}>
      <AssetButton variant="dark" onClick={() => setOpen(true)}>{text.trigger}</AssetButton>
      {open ? <ProductOrderModal product={product} related={related} onClose={() => setOpen(false)} /> : null}
    </Dialog>
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

  const fieldLabelClass = 'grid gap-1.5 text-[13px] font-bold text-muted-foreground';
  // text-base (not text-sm): iOS Safari auto-zooms on focusing any input
  // under 16px, which was happening on every field in this form on mobile.
  const textInputClass = 'rounded-xs border-gold-light/13 bg-black/50 px-3 py-2.5 font-sans text-base text-foreground';
  const checkboxLabelClass = 'flex flex-row items-center gap-2 text-[13px] font-semibold text-muted-foreground';

  return (
    <DialogPortal>
      <DialogOverlay className="bg-black/72 [backdrop-filter:blur(10px)]" />
      <DialogPopup className="w-[min(560px,calc(100vw-36px))] max-h-[min(860px,calc(100dvh-36px))] overflow-y-auto rounded-md border border-gold/28 bg-[#1b1c16] p-[clamp(24px,5vw,40px)] shadow-lg max-[520px]:p-[20px_16px]">
        <DialogClose
          className="absolute top-3.5 right-3.5 z-[2] grid size-[38px] place-items-center rounded-full border border-gold/28 bg-black/78 text-2xl leading-none text-gold-light transition-colors duration-200 ease-linear hover:border-gold hover:text-foreground focus-visible:border-gold focus-visible:text-foreground"
          aria-label={text.closeLabel}
        >
          ×
        </DialogClose>

        {orderNumber ? (
          <div className="grid gap-3.5 py-5">
            <DialogTitle className="mb-1.5 font-serif text-[clamp(22px,3vw,30px)] font-bold text-gold-light">{text.successTitle}</DialogTitle>
            <p className="m-0 text-[15px] leading-normal text-foreground">{text.successText.replace('{number}', orderNumber)}</p>
            <button
              type="button"
              className="cursor-pointer rounded-full border-none bg-gradient-to-br from-gold-light to-gold px-6 py-3 text-sm font-black text-[#1a1305] uppercase transition-[transform,box-shadow] duration-200 ease-brand hover:-translate-y-0.5 hover:shadow-sm"
              onClick={onClose}
            >
              {text.closeLabel}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3.5">
            <DialogTitle className="mb-1.5 font-serif text-[clamp(22px,3vw,30px)] font-bold text-foreground">
              {text.title}
            </DialogTitle>
            <p className="mb-1 font-serif text-[15px] text-gold-light">{productName(product, locale)}</p>
            <dl className="mb-4.5 flex flex-wrap gap-2.5">
              <div className="rounded-xs border border-gold/28 bg-gold/6 px-3 py-2">
                <dt className="mb-0.5 text-[11px] font-bold text-muted-foreground uppercase">{formatMoney(product.priceCents, product.currency)}</dt>
              </div>
            </dl>

            <label className={fieldLabelClass}>
              <span>{text.nameLabel}</span>
              <Input
                className={textInputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={text.namePlaceholder}
                required
              />
            </label>

            <div className="flex gap-4.5">
              <label className={checkboxLabelClass}>
                <input type="radio" name="contactMethod" checked={contactMethod === 'phone'} onChange={() => setContactMethod('phone')} />
                <span>{text.contactPhone}</span>
              </label>
              <label className={checkboxLabelClass}>
                <input type="radio" name="contactMethod" checked={contactMethod === 'email'} onChange={() => setContactMethod('email')} />
                <span>{text.contactEmail}</span>
              </label>
            </div>
            <label className={fieldLabelClass}>
              <span>{text.contactValueLabel}</span>
              <Input
                className={textInputClass}
                value={contactValue}
                onChange={(event) => setContactValue(event.target.value)}
                type={contactMethod === 'email' ? 'email' : 'tel'}
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3.5 max-[520px]:grid-cols-1">
              <label className={fieldLabelClass}>
                <span>{text.countryLabel}</span>
                <Input className={textInputClass} value={country} onChange={(event) => setCountry(event.target.value)} />
              </label>
              <label className={fieldLabelClass}>
                <span>{text.cityLabel}</span>
                <Input className={textInputClass} value={city} onChange={(event) => setCity(event.target.value)} />
              </label>
            </div>

            {related.length ? (
              <fieldset className="grid gap-2 rounded-md border border-gold/28 p-3">
                <legend className="px-1.5 text-[13px] font-extrabold text-gold-light uppercase">{text.optionsLabel}</legend>
                {related.map((option) => (
                  <label key={option.id} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2.5 text-[13px] font-medium text-muted-foreground">
                    <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => toggleOption(option.id)} />
                    {option.photoUrl ? (
                      <img src={option.photoUrl} alt={productName(option, locale)} loading="lazy" className="size-9 rounded-xs object-cover" />
                    ) : null}
                    <span>{productName(option, locale)}</span>
                    <small>{formatMoney(option.priceCents, option.currency)}</small>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {product.consecrationAvailable ? (
              <label className={checkboxLabelClass}>
                <input type="checkbox" checked={consecrationRequested} onChange={(event) => setConsecrationRequested(event.target.checked)} />
                <span>{text.consecrationLabel}</span>
              </label>
            ) : null}

            <label className={fieldLabelClass}>
              <span>{text.channelLabel}</span>
              <Input
                className={textInputClass}
                value={preferredContactChannel}
                onChange={(event) => setPreferredContactChannel(event.target.value)}
                placeholder={text.channelPlaceholder}
              />
            </label>
            <label className={fieldLabelClass}>
              <span>{text.commentLabel}</span>
              <Textarea
                className={`${textInputClass} min-h-[80px]`}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={text.commentPlaceholder}
              />
            </label>

            <label className="absolute h-px w-px overflow-hidden [clip:rect(0,0,0,0)] whitespace-nowrap" aria-hidden="true">
              <span>Website</span>
              <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
            </label>

            <label className={checkboxLabelClass}>
              <input type="checkbox" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} required />
              <span>{text.consentLabel}</span>
            </label>

            {error ? <p className="m-0 text-[13px] font-bold text-[#ff6b6b]">{error}</p> : null}

            <button
              type="submit"
              className="cursor-pointer rounded-full border-none bg-gradient-to-br from-gold-light to-gold px-6 py-3 text-sm font-black text-[#1a1305] uppercase transition-[transform,box-shadow] duration-200 ease-brand hover:-translate-y-0.5 hover:shadow-sm disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? text.submitting : text.submit}
            </button>
          </form>
        )}
      </DialogPopup>
    </DialogPortal>
  );
}
