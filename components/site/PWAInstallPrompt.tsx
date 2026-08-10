'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'ikona-pwa-install-dismissed-at';
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 14;
const SERVICE_WORKER_VERSION = '2026-07-31-cache-install-v2';

const text = {
  uk: {
    title: 'Встановити застосунок',
    body: 'Відкривайте молитви без браузерної панелі та з офлайн-доступом.',
    ios: 'На iPhone натисніть “Поділитися” → “На екран Домой”.',
    install: 'Встановити',
    close: 'Не зараз'
  },
  ru: {
    title: 'Установить приложение',
    body: 'Открывайте молитвы без браузерной строки и с офлайн-доступом.',
    ios: 'На iPhone нажмите “Поделиться” → “На экран Домой”.',
    install: 'Установить',
    close: 'Не сейчас'
  },
  en: {
    title: 'Install app',
    body: 'Open prayers without the browser bar and with offline access.',
    ios: 'On iPhone, tap Share → Add to Home Screen.',
    install: 'Install',
    close: 'Not now'
  }
} as const;

function currentLocale() {
  if (typeof window === 'undefined') return 'uk';
  const match = window.location.pathname.match(/^\/(uk|ru|en)(?=\/|$)/);
  return (match?.[1] || document.documentElement.lang || 'uk') as keyof typeof text;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebKit = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIos && isWebKit;
}

function wasRecentlyDismissed() {
  try {
    const value = window.localStorage.getItem(DISMISS_KEY);
    return Boolean(value && Date.now() - Number(value) < DISMISS_TTL);
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);
  const locale = useMemo(currentLocale, []);
  const copy = text[locale] || text.uk;

  useEffect(() => {
    const canRegister = 'serviceWorker' in navigator && (window.isSecureContext || window.location.hostname === 'localhost');
    if (!canRegister) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);

      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ikona-')).map((key) => caches.delete(key))))
          .catch(() => undefined);
      }
      return;
    }

    navigator.serviceWorker.register(`/sw.js?v=${SERVICE_WORKER_VERSION}`, { scope: '/', updateViaCache: 'none' }).catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }, []);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 3500);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (isIosSafari()) {
      window.setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 4500);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const close = () => {
    rememberDismiss();
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      rememberDismiss();
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible || (!deferredPrompt && !showIosHint)) return null;

  const sharedButtonClass =
    "inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md border px-3 text-[12px] font-black tracking-[.06em] uppercase leading-[1.15] text-center whitespace-nowrap cursor-pointer transition-[border-color,background,color,transform] duration-[180ms] ease-brand max-[900px]:w-full";

  return (
    <aside
      className="fixed right-[clamp(12px,3vw,28px)] bottom-[calc(clamp(12px,3vw,28px)+env(safe-area-inset-bottom))] z-[1200] w-[min(420px,calc(100vw-24px))] grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 items-center border border-[rgba(214,168,79,.52)] rounded-[8px] bg-[linear-gradient(135deg,rgba(214,168,79,.16),rgba(11,11,10,.92)_42%),rgba(11,11,10,.96)] shadow-lg p-3.5 text-foreground [backdrop-filter:blur(18px)_saturate(1.08)] max-[900px]:left-3 max-[900px]:right-3 max-[900px]:grid-cols-1"
      aria-live="polite"
    >
      <div>
        <strong className="block mb-1 text-gold-light text-[14px] font-black leading-[1.15] uppercase">{copy.title}</strong>
        <p className="m-0 text-muted-foreground font-serif text-[14px] leading-[1.35]">{showIosHint && !deferredPrompt ? copy.ios : copy.body}</p>
      </div>
      <div className="inline-flex gap-2 items-center max-[900px]:grid max-[900px]:grid-cols-2">
        {deferredPrompt ? (
          <button className={`${sharedButtonClass} border-gold bg-gold text-canvas`} type="button" onClick={install}>
            {copy.install}
          </button>
        ) : null}
        <button
          className={`${sharedButtonClass} border-gold/28 bg-gold/8 text-gold-light hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas`}
          type="button"
          onClick={close}
        >
          {copy.close}
        </button>
      </div>
    </aside>
  );
}
