// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToastNotifier } from '../../../src/ui/toast-notifier';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('ToastNotifier (Deactivated Popup Notifier)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ToastNotifier.clearHistory();
    ShadowHost.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    ToastNotifier.clearHistory();
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

  describe('Zero Floating Popups Guarantee', () => {
    it('should return null and never inject toast containers into Shadow DOM or document', () => {
      const result = ToastNotifier.show('Справжні дані Сховища надійно захищено.', 'info', 4000);
      expect(result).toBeNull();

      const root = ShadowHost.getRoot();
      expect(root.getElementById('threat-shield-toast-container')).toBeNull();
      expect(document.body.querySelector('#threat-shield-toast-container')).toBeNull();
      expect(root.querySelector('.sanctuary-toast-capsule')).toBeNull();
    });

    it('should safely do nothing for warnings and errors without any DOM mutations', () => {
      const warnResult = ToastNotifier.show('Тестове попередження', 'warning');
      const errResult = ToastNotifier.show('Тестова помилка', 'error');

      expect(warnResult).toBeNull();
      expect(errResult).toBeNull();

      const root = ShadowHost.getRoot();
      expect(root.getElementById('threat-shield-toast-container')).toBeNull();
      expect(root.querySelectorAll('.sanctuary-toast-capsule').length).toBe(0);
      expect(document.body.querySelector('#threat-shield-toast-container')).toBeNull();
    });

    it('should allow calling clearHistory safely', () => {
      expect(() => ToastNotifier.clearHistory()).not.toThrow();
    });
  });
});
