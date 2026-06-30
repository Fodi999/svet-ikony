'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'ikona-pwa-install-dismissed-at';
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 14;

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

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
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

  return (
    <aside className="pwa-install-prompt" aria-live="polite">
      <div>
        <strong>{copy.title}</strong>
        <p>{showIosHint && !deferredPrompt ? copy.ios : copy.body}</p>
      </div>
      <div className="pwa-install-actions">
        {deferredPrompt ? <button type="button" onClick={install}>{copy.install}</button> : null}
        <button type="button" className="pwa-install-dismiss" onClick={close}>{copy.close}</button>
      </div>
    </aside>
  );
}
