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

    it('should render the optical Light Filament countdown track', () => {
      const toast = ToastNotifier.show('Повідомлення з оптичною ниткою часу', 'info', 3000);
      const filamentTrack = toast.querySelector('.ts-toast-filament-track');
      const filamentBar = toast.querySelector('.ts-toast-filament-bar');

      expect(filamentTrack).not.toBeNull();
      expect(filamentBar).not.toBeNull();
    });

    it('should freeze auto-dismiss on mouseenter and resume on mouseleave (Hover Freeze)', () => {
      const toast = ToastNotifier.show('Важливе спостереження', 'warning', 4000);
      expect(toast.parentElement).not.toBeNull();

      // Advance halfway
      vi.advanceTimersByTime(2000);

      // User moves mouse over toast -> hover freeze activates
      toast.dispatchEvent(new Event('mouseenter'));

      // Even if 5 seconds pass, toast must remain alive because it is paused
      vi.advanceTimersByTime(5000);
      expect(toast.parentElement).not.toBeNull();

      // User moves mouse away -> timer resumes with remaining time
      toast.dispatchEvent(new Event('mouseleave'));

      // Advance remaining time + transition
      vi.advanceTimersByTime(2100);
      vi.advanceTimersByTime(300);
      expect(toast.parentElement).toBeNull();
    });

    it('should automatically calibrate reading duration when durationMs is not provided', () => {
      const errorToast = ToastNotifier.show('Критична загроза виявлена', 'error');
      // For error type baseline is 8500ms
      vi.advanceTimersByTime(7000);
      expect(errorToast.parentElement).not.toBeNull();

      vi.advanceTimersByTime(1600);
      vi.advanceTimersByTime(300);
      expect(errorToast.parentElement).toBeNull();
    });

    it('should automatically dismiss after specified duration when no hover occurred', () => {
      const toast = ToastNotifier.show('Тимчасове повідомлення', 'info', 2000);
      expect(toast.parentElement).not.toBeNull();

      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(300);
      expect(toast.parentElement).toBeNull();
    });
  });
});
