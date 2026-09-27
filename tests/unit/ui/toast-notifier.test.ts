// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastNotifier } from '../../../src/ui/toast-notifier';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('ToastNotifier (Sanctuary Dynamic Capsule)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ShadowHost.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    ShadowHost.clear();
  });

  describe('formatPluralUkrainian', () => {
    it('should correctly inflect 1 (one)', () => {
      const res = ToastNotifier.formatPluralUkrainian(
        1,
        'значення',
        'значення',
        'значень'
      );
      expect(res).toBe('1 значення');
    });

    it('should correctly inflect 2, 3, 4 (few)', () => {
      expect(
        ToastNotifier.formatPluralUkrainian(2, 'значення', 'значення', 'значень')
      ).toBe('2 значення');
      expect(
        ToastNotifier.formatPluralUkrainian(3, 'значення', 'значення', 'значень')
      ).toBe('3 значення');
      expect(
        ToastNotifier.formatPluralUkrainian(4, 'значення', 'значення', 'значень')
      ).toBe('4 значення');
    });

    it('should correctly inflect 5, 11, 20 (many)', () => {
      expect(
        ToastNotifier.formatPluralUkrainian(5, 'значення', 'значення', 'значень')
      ).toBe('5 значень');
      expect(
        ToastNotifier.formatPluralUkrainian(11, 'значення', 'значення', 'значень')
      ).toBe('11 значень');
      expect(
        ToastNotifier.formatPluralUkrainian(14, 'значення', 'значення', 'значень')
      ).toBe('14 значень');
      expect(
        ToastNotifier.formatPluralUkrainian(20, 'значення', 'значення', 'значень')
      ).toBe('20 значень');
    });

    it('should correctly handle numbers above 20', () => {
      expect(
        ToastNotifier.formatPluralUkrainian(21, 'значення', 'значення', 'значень')
      ).toBe('21 значення');
      expect(
        ToastNotifier.formatPluralUkrainian(22, 'значення', 'значення', 'значень')
      ).toBe('22 значення');
      expect(
        ToastNotifier.formatPluralUkrainian(25, 'значення', 'значення', 'значень')
      ).toBe('25 значень');
    });
  });

  describe('Toast Rendering in Shadow DOM', () => {
    it('should render capsule inside ShadowHost root, not directly on document.body', () => {
      const toast = ToastNotifier.show('Справжні дані Сховища надійно захищено.', 'info', 4000);
      const root = ShadowHost.getRoot();

      const container = root.getElementById('threat-shield-toast-container');
      expect(container).not.toBeNull();
      expect(container?.contains(toast)).toBe(true);

      // Verify document.body does not have raw unencapsulated container
      expect(document.body.querySelector('#threat-shield-toast-container')).toBeNull();
    });

    it('should include message text, icon, and dismiss button', () => {
      const toast = ToastNotifier.show('Тестове сповіщення безпеки', 'warning', 3000);
      expect(toast.textContent).toContain('Тестове сповіщення безпеки');

      const closeBtn = toast.querySelector('.ts-toast-close') as HTMLElement;
      expect(closeBtn).not.toBeNull();

      // Click dismiss
      closeBtn.click();
      vi.advanceTimersByTime(300);
      expect(toast.parentElement).toBeNull();
    });

    it('should automatically dismiss after specified duration', () => {
      const toast = ToastNotifier.show('Тимчасове повідомлення', 'info', 2000);
      expect(toast.parentElement).not.toBeNull();

      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(300);
      expect(toast.parentElement).toBeNull();
    });
  });
});
