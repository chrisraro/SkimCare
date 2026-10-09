import { describe, expect, it } from '@jest/globals';
import { isIosSafari } from '@/features/pwa/pwa';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

describe('isIosSafari (install hint targeting)', () => {
  it('matches Safari on iPhone', () => expect(isIosSafari(IPHONE_SAFARI)).toBe(true));
  it('skips other iOS browsers', () => expect(isIosSafari(IPHONE_CHROME)).toBe(false));
  it('matches iPadOS reporting as a Mac with touch', () => expect(isIosSafari(IPAD_DESKTOP_MODE, 5)).toBe(true));
  it('skips desktop Mac Safari', () => expect(isIosSafari(IPAD_DESKTOP_MODE, 0)).toBe(false));
  it('skips Android', () => expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false));
});
