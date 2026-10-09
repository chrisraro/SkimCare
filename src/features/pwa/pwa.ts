import { Platform } from 'react-native';

/**
 * Web-only PWA helpers: service worker registration and the iOS "Add to Home Screen" hint.
 * Every function is a no-op off web, so native builds never touch browser globals.
 */

const HINT_KEY = 'skimcare.installHintDismissed';

/** Registers /sw.js (written by scripts/build-sw.mjs) in production web builds only. */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web' || __DEV__) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Gentle updates: a new worker waits, and is only told to take over while the app is
        // hidden. The next launch then runs the new version — never a forced reload mid-review.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden' && reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      })
      .catch(() => {
        // Offline support is best-effort; the app still works online without it.
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** True for Safari on iPhone/iPad (iPadOS reports itself as a Mac with touch). */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(userAgent);
  return ios && /Safari/.test(userAgent) && !otherBrowser;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Whether to show the iOS install hint: web, iOS Safari, not yet installed, not dismissed. */
export function shouldShowInstallHint(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  if (!isIosSafari(navigator.userAgent, navigator.maxTouchPoints) || isStandalone()) return false;
  try {
    return window.localStorage.getItem(HINT_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissInstallHint(): void {
  try {
    window.localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage blocked (private mode): the hint simply comes back next visit.
  }
}
