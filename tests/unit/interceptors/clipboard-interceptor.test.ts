// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClipboardInterceptor } from '../../../src/interceptors/clipboard.interceptor';

describe('ClipboardInterceptor (Self-Immunity & Truthful Lure Detection)', () => {
  let lureDetectedMock: any;

  beforeEach(() => {
    lureDetectedMock = vi.fn();
    ClipboardInterceptor.init({
      getDebugMode: () => false,
      onLureDetected: (...args: any[]) => lureDetectedMock(...args),
    });
  });

  afterEach(() => {
    ClipboardInterceptor.destroy();
  });

  const simulateCopy = (text: string, anchorElement?: HTMLElement) => {
    // Mock window.getSelection
    window.getSelection = vi.fn().mockReturnValue({
      toString: () => text,
      anchorNode: anchorElement || document.body,
      rangeCount: 1,
    } as any);

    document.dispatchEvent(new Event('copy'));
  };

  it('should ignore text containing system phrases (Self-Immunity against self-attack)', () => {
    const systemToastText =
      'Зафіксовано введення конфіденційного маркера: «Дівоче прізвище матері». Сховище рекомендує не передавати його стороннім вебсайтам.';

    simulateCopy(systemToastText);

    expect(lureDetectedMock).not.toHaveBeenCalled();
  });

  it('should ignore copying from inside extension Shadow DOM / sanctuary capsules', () => {
    const shadowHost = document.createElement('div');
    shadowHost.id = 'threat-shield-shadow-host';
    const innerToast = document.createElement('div');
    innerToast.className = 'sanctuary-toast-capsule';
    innerToast.textContent = 'напишіть дівоче прізвище матері';
    shadowHost.appendChild(innerToast);
    document.body.appendChild(shadowHost);

    simulateCopy('напишіть дівоче прізвище матері', innerToast);

    expect(lureDetectedMock).not.toHaveBeenCalled();

    document.body.removeChild(shadowHost);
  });

  it('should ignore regular text without any URL (never invent phantom links)', () => {
    const textWithoutUrl = 'Мій знайомий питав дівоче прізвище матері для анкети';

    simulateCopy(textWithoutUrl);

    expect(lureDetectedMock).not.toHaveBeenCalled();
  });

  it('should trigger lure detection when a real phishing URL is present in copied text', () => {
    const textWithPhishingUrl =
      'Оформляйте олх-доставку і перейдіть за посиланням для отримання коштів https://olx-delivery-payment.xyz/pay/12345';

    simulateCopy(textWithPhishingUrl);

    expect(lureDetectedMock).toHaveBeenCalledTimes(1);
    const [suspiciousUrl, , isOffPlatform, subtitle] = lureDetectedMock.mock.calls[0];
    expect(suspiciousUrl).toContain('https://olx-delivery-payment.xyz/pay/12345');
    expect(isOffPlatform).toBe(false);
    expect(subtitle).toContain('У скопійованому тексті виявлено підозріле посилання');
  });

  it('should trigger lure detection for off-platform messenger lures', () => {
    const offPlatformText = 'Перейдіть у телеграм для зв\'язку t.me/buyer_support';

    simulateCopy(offPlatformText);

    expect(lureDetectedMock).toHaveBeenCalledTimes(1);
    const [, , isOffPlatform, subtitle] = lureDetectedMock.mock.calls[0];
    expect(isOffPlatform).toBe(true);
    expect(subtitle).toContain('У скопійованому тексті виявлено спробу переходу в сторонній месенджер');
  });
});
