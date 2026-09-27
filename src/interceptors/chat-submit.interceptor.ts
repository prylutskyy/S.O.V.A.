import { ActiveThreatContext } from '../types';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { VaultScanner } from '../heuristics/vault-scanner';
import { SecurityFriction } from '../ui/friction';
import { ToastNotifier } from '../ui/toast-notifier';

import { HiddenFieldInspector } from '../heuristics/hidden-field-inspector';

export interface ChatSubmitInterceptorOptions {
  getActiveContext: () => ActiveThreatContext | null;
}

export class ChatSubmitInterceptor {
  private static options: ChatSubmitInterceptorOptions | null = null;
  private static clickListener: ((e: MouseEvent) => void) | null = null;
  private static keydownListener: ((e: KeyboardEvent) => void) | null = null;

  public static readonly ACTIVE_INPUTS_SELECTOR =
    'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea';

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

  public static interceptChatSend(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    event: Event,
    activeContext?: ActiveThreatContext | null,
    detectedCvv: boolean = false
  ): boolean {
    if (inputElement.dataset.threatShieldApproved === 'true') {
      console.log('[ThreatShield:Content] Відправка повідомлення дозволена (усвідомлене розблокування).');
      delete inputElement.dataset.threatShieldApproved;
      return false;
    }

    const outbound = ChatChannelMonitor.checkOutbound(inputElement.value || '');
    const hasCvv = outbound.hasCvv || detectedCvv || this.isFieldCvv(inputElement);
    const hasExpiry = outbound.hasExpiry;
    const hasOtp = outbound.hasOtp;
    const vaultScan = VaultScanner.scanTextSync(inputElement.value || '');
    const isLeaking = hasCvv || hasExpiry || hasOtp || vaultScan.matchedItems.length > 0;

    if (isLeaking) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      SecurityFriction.applyToChat(
        inputElement,
        {
          hasCard: outbound.hasCard,
          hasCvv,
          hasExpiry,
          hasOtp,
          cards: outbound.cards,
        },
        () => {
          inputElement.dataset.threatShieldApproved = 'true';
          ToastNotifier.show('Захист тимчасово призупинено. Натисніть «Надіслати» або Enter.', 'info', 4000);
        },
        undefined,
        activeContext
      );
      return true;
    }

    return false;
  }

  private static setupListeners(): void {
    if (typeof document === 'undefined') return;

    this.clickListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const submitBtn = target.closest(
        'button[type="submit"], input[type="submit"], [role="button"], button'
      ) as HTMLElement | null;

      if (submitBtn && !submitBtn.closest('form')) {
        const container = submitBtn.closest('[data-testid="conversation-layout"], .chat, .messenger');
        if (container) {
          const input = container.querySelector(this.ACTIVE_INPUTS_SELECTOR) as HTMLInputElement | HTMLTextAreaElement | null;
          if (input && input.value) {
            this.interceptChatSend(input, event, this.options?.getActiveContext());
          }
        }
      }
    };

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

    document.addEventListener('click', this.clickListener, true);
    document.addEventListener('keydown', this.keydownListener, true);
  }

  public static destroy(): void {
    if (typeof document !== 'undefined') {
      if (this.clickListener) document.removeEventListener('click', this.clickListener, true);
      if (this.keydownListener) document.removeEventListener('keydown', this.keydownListener, true);
    }
    this.options = null;
  }
}
