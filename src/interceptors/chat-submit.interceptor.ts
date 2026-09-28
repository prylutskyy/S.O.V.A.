import { ActiveThreatContext } from '../types';
import { SecurityFriction } from '../ui/friction';
import { ToastNotifier } from '../ui/toast-notifier';
import { DebuggerOverlay } from '../ui/debugger-overlay';
import { SessionOutboundMemory } from '../heuristics/session-outbound-memory';
import { HiddenFieldInspector } from '../heuristics/hidden-field-inspector';

export interface ChatSubmitInterceptorOptions {
  getActiveContext: () => ActiveThreatContext | null;
  getDebugMode?: () => boolean;
}

export class ChatSubmitInterceptor {
  private static options: ChatSubmitInterceptorOptions | null = null;
  private static clickListener: ((e: MouseEvent) => void) | null = null;
  private static keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private static inputListener: ((e: Event) => void) | null = null;
  private static realtimeDebounceTimer: any = null;
  private static lastReportedScore: number | null = null;

  public static readonly ACTIVE_INPUTS_SELECTOR =
    'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="textbox"], [contenteditable="true"]';

  public static init(options: ChatSubmitInterceptorOptions): void {
    this.options = options;
    this.setupListeners();
  }

  public static isFieldCvv(input: HTMLInputElement | HTMLTextAreaElement): boolean {
    const val = input.value?.trim() || '';
    const digitsOnly = val.replace(/\D/g, '');
    const isCvvDescriptor = HiddenFieldInspector.isFieldSensitive(input).fieldType === 'CVV';
    const isLengthMatch = (digitsOnly.length === 3 || digitsOnly.length === 4) || (val.length >= 3 && val.length <= 4);
    return isCvvDescriptor && isLengthMatch;
  }

  /**
   * Прецизійний пошук пов'язаного текстового поля чату для кнопки надсилання.
   * Виключає сторонні інпути (як-от приховані поля налаштувань, бічні панелі чи пошук).
   */
  public static findAssociatedChatInput(
    submitBtn: HTMLElement
  ): HTMLInputElement | HTMLTextAreaElement | null {
    // 1. Пошук у локальній зоні введення (найточніший контекст: .chat-input-area, .composer, footer тощо)
    const inputArea = submitBtn.closest(
      '.chat-input-area, .chat-input, .input-area, .message-input, .composer, footer, .chat-footer, .action-bar, [class*="input"], [class*="composer"]'
    );
    if (inputArea) {
      const inputs = Array.from(inputArea.querySelectorAll(this.ACTIVE_INPUTS_SELECTOR)) as (HTMLInputElement | HTMLTextAreaElement)[];
      const withValue = inputs.find((i) => (i.value || i.innerText || '').trim().length > 0);
      if (withValue) return withValue;
      if (inputs.length > 0) return inputs[0];
    }

    // 2. Безпосередні сусіди кнопки або спільний батьківський вузол
    if (submitBtn.parentElement) {
      const siblings = Array.from(submitBtn.parentElement.querySelectorAll(this.ACTIVE_INPUTS_SELECTOR)) as (HTMLInputElement | HTMLTextAreaElement)[];
      const withValue = siblings.find((i) => (i.value || i.innerText || '').trim().length > 0);
      if (withValue) return withValue;
      if (siblings.length > 0) return siblings[0];
    }

    // 3. Активний елемент у фокусі (якщо користувач щойно друкував у ньому)
    if (
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.getAttribute('role') === 'textbox')
    ) {
      return document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    }

    // 4. Пошук у контейнері діалогу з пріоритетом на видимі елементи з наявним текстом
    const container = submitBtn.closest('[data-testid="conversation-layout"], .chat, .messenger, .conversation, main, body') || document.body;
    const allInputs = Array.from(container.querySelectorAll(this.ACTIVE_INPUTS_SELECTOR)) as (HTMLInputElement | HTMLTextAreaElement)[];

    // Фільтруємо лише видимі елементи
    const visibleInputs = allInputs.filter((el) => {
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      return el.offsetParent !== null && (!style || style.display !== 'none');
    });

    const withValue = visibleInputs.find((i) => (i.value || i.innerText || '').trim().length > 0);
    if (withValue) return withValue;

    return visibleInputs[visibleInputs.length - 1] || null;
  }

  /**
   * Перехоплення спроби надсилання повідомлення в чаті
   */
  public static interceptChatSend(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    event: Event,
    activeContext?: ActiveThreatContext | null
  ): boolean {
    if (inputElement.dataset.threatShieldApproved === 'true') {
      console.log('[ThreatShield:Content] Відправка повідомлення дозволена (усвідомлене розблокування).');
      delete inputElement.dataset.threatShieldApproved;
      SessionOutboundMemory.recordSentMessage(inputElement.value || '');
      return false;
    }

    const currentText = inputElement.value || inputElement.innerText || '';
    const evaluation = SessionOutboundMemory.evaluateWithHistory(currentText);

    if (evaluation.shouldBlock) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const triggers = evaluation.triggers.map((t) => ({
        message: t.message,
        severity: t.severity,
      }));

      SecurityFriction.applyToChat(
        inputElement,
        {
          hasCard: evaluation.leakage.hasCard,
          hasCvv: evaluation.leakage.hasCvv,
          hasExpiry: evaluation.leakage.hasExpiry,
          hasOtp: evaluation.leakage.hasOtp,
          cards: evaluation.leakage.cards,
          isCrossMessage: evaluation.leakage.isCrossMessage,
          customReason: evaluation.reason,
          customTriggers: triggers,
        },
        () => {
          inputElement.dataset.threatShieldApproved = 'true';
          SessionOutboundMemory.recordSentMessage(inputElement.value || '');
          ToastNotifier.show('Захист тимчасово призупинено. Натисніть «Надіслати» або Enter.', 'info', 4000);
        },
        () => {
          // При скасуванні залишаємо текст у полі, щоб користувач міг видалити секретні дані
          inputElement.focus();
        },
        activeContext
      );
      return true;
    }

    // Безпечне повідомлення або звичайний P2P-номер картки — фіксуємо в пам'яті сесії
    SessionOutboundMemory.recordSentMessage(currentText);
    return false;
  }

  private static setupListeners(): void {
    if (typeof document === 'undefined') return;

    // 1. Реактивний фоновий моніторинг введення в чаті (Live Telemetry)
    this.inputListener = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.getAttribute('role') !== 'textbox') return;
      if (target.closest('form')) return; // Форми контролює FormSubmitInterceptor

      if (this.realtimeDebounceTimer) {
        clearTimeout(this.realtimeDebounceTimer);
      }

      this.realtimeDebounceTimer = setTimeout(() => {
        const input = target as HTMLInputElement | HTMLTextAreaElement;
        const text = input.value || input.innerText || '';
        const evaluation = SessionOutboundMemory.evaluateWithHistory(text);

        // Оновлюємо Швейцарську Лупу
        if (this.options?.getDebugMode && this.options.getDebugMode()) {
          DebuggerOverlay.setAssessment(evaluation.score, evaluation.riskLevel);
          if (evaluation.riskLevel === 'CRITICAL' && this.lastReportedScore !== evaluation.score) {
            this.lastReportedScore = evaluation.score;
            DebuggerOverlay.log(
              'Чат: Витік Даних (Live)',
              evaluation.reason || 'Виявлено спробу передачі платіжних реквізитів',
              '#EF4444'
            );
          }
        }

        // Проактивне попередження при спробі передачі номера картки + CVV
        const isCardCvvAttempt =
          (evaluation.leakage.hasCard && evaluation.leakage.hasCvv) ||
          (evaluation.leakage.hasCard && /cvv|cvc|код/i.test(text));

        if (evaluation.riskLevel === 'CRITICAL' && isCardCvvAttempt) {
          input.style.outline = '2px solid #EF4444';
          input.style.outlineOffset = '1px';

          const now = Date.now();
          const lastWarn = parseInt(input.dataset?.threatShieldLastCvvWarn || '0', 10);
          if (now - lastWarn > 8000) {
            input.dataset.threatShieldLastCvvWarn = now.toString();
            ToastNotifier.show(
              '⚠️ Зафіксовано спробу передачі номера картки та CVV-коду. Для отримання коштів CVV-код ніколи не потрібен!',
              'error',
              10000
            );
          }
        } else {
          if (input.style.outline.includes('rgb(239, 68, 68)') || input.style.outline.toLowerCase().includes('ef4444')) {
            input.style.outline = '';
            input.style.outlineOffset = '';
          }
        }
      }, 150);
    };

    // 2. Клік на кнопку відправки в інтерфейсах чату
    this.clickListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const submitBtn = target.closest(
        'button[type="submit"], input[type="submit"], [role="button"], button'
      ) as HTMLElement | null;

      if (submitBtn && !submitBtn.closest('form')) {
        const input = this.findAssociatedChatInput(submitBtn);
        if (input && (input.value || input.innerText)) {
          this.interceptChatSend(input, event, this.options?.getActiveContext());
        }
      }
    };

    // 3. Натискання Enter у текстовому полі чату
    this.keydownListener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        if (
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('role') === 'textbox') &&
          !target.closest('form')
        ) {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          this.interceptChatSend(input, event, this.options?.getActiveContext());
        }
      }
    };

    document.addEventListener('input', this.inputListener, true);
    document.addEventListener('change', this.inputListener, true);
    document.addEventListener('click', this.clickListener, true);
    document.addEventListener('keydown', this.keydownListener, true);
  }

  public static destroy(): void {
    if (typeof document !== 'undefined') {
      if (this.inputListener) {
        document.removeEventListener('input', this.inputListener, true);
        document.removeEventListener('change', this.inputListener, true);
        this.inputListener = null;
      }
      if (this.clickListener) document.removeEventListener('click', this.clickListener, true);
      if (this.keydownListener) document.removeEventListener('keydown', this.keydownListener, true);
    }
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
      this.realtimeDebounceTimer = null;
    }
    this.options = null;
  }
}
