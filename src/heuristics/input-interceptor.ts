import { ToastNotifier } from '../ui/toast-notifier';
import { ChatLivePill } from '../ui/chat-live-pill';
import { FieldLivePill } from '../ui/field-live-pill';
import { ActiveThreatContext } from '../types';
import { SensitiveAssetDetector } from './sensitive-asset-detector';
import { PersonalVaultManager } from '../core/personal-vault';
import { VaultScanner } from './vault-scanner';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { UserWhitelistManager } from '../core/user-whitelist';
import { isWhitelisted } from '../core/whitelist';

export class GlobalInputInterceptor {
  private static isSoftLocked = false;
  private static hardLockContext: ActiveThreatContext | null = null;
  private static realtimeDebounceTimer: any = null;

  public static setSoftLock(locked: boolean) {
    this.isSoftLocked = locked;
  }

  /**
   * Встановлення контексту загрози для селективної інспекції вихідних даних (Guarded Mode).
   * Більше НЕ блокує дії наосліп!
   */
  public static setHardLock(context: ActiveThreatContext | null) {
    this.hardLockContext = context;
  }

  /**
   * Перевірка, чи має поточний домен апріорний імунітет (державні портали, білі списки, шлюзи)
   */
  public static isCurrentHostImmune(): boolean {
    if (typeof window === 'undefined' || !window.location) return false;
    const protocol = (window.location.protocol || '').toLowerCase();
    if (protocol === 'chrome-extension:' || protocol === 'moz-extension:') return true;

    let host = (window.location.hostname || '').toLowerCase().trim();
    if (!host && protocol === 'file:') {
      const parts = (window.location.pathname || '').split('/');
      host = 'file://' + (parts[parts.length - 1] || 'local-file');
    }
    if (!host) return false;

    return (
      isWhitelisted(host) ||
      host.endsWith('.gov.ua') ||
      isAccreditedPaymentGateway(host) ||
      UserWhitelistManager.isDomainAllowedSync(host)
    );
  }

  /**
   * Фоновий вартовий: перевірка введеного тексту на наявність чутливих комбінацій з Private Vault
   */
  private static checkRealtimeVaultLeakage(target: HTMLElement, text: string): void {
    if (this.isCurrentHostImmune()) return;
    if (!text || text.trim().length < 2) return;
    if (target.dataset?.threatShieldApproved === 'true') return;

    const items = PersonalVaultManager.getItemsSync();
    if (!items || items.length === 0) return;

    const vaultScan = VaultScanner.scanTextSync(text);
    if (!vaultScan.matchedItems || vaultScan.matchedItems.length === 0) {
      if (target.dataset?.threatShieldHasVaultWarning === 'true') {
        if (target.style.outline && (target.style.outline.includes('rgb(220, 38, 38)') || target.style.outline.includes('rgb(217, 119, 6)') || target.style.outline.toLowerCase().includes('dc2626') || target.style.outline.toLowerCase().includes('d97706'))) {
          target.style.outline = '';
          target.style.outlineOffset = '';
        }
        delete target.dataset.threatShieldHasVaultWarning;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          FieldLivePill.clearVaultAlert(target);
        }
        ChatLivePill.hide();
      }
      return;
    }

    target.dataset.threatShieldHasVaultWarning = 'true';

    // Гарантуємо, що рамка інпуту завжди залишається чистою та нативною (Apple-grade Silence)
    if (target.style.outline && (target.style.outline.includes('rgb(220, 38, 38)') || target.style.outline.includes('rgb(217, 119, 6)') || target.style.outline.toLowerCase().includes('dc2626') || target.style.outline.toLowerCase().includes('d97706'))) {
      target.style.outline = '';
      target.style.outlineOffset = '';
    }

    // Відображаємо виключно невагому капсулу (без зміни рамки і без спливаючих тостів-попапів)
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable || target.getAttribute('role') === 'textbox') {
      const firstLabel = vaultScan.matchedItems[0].label;

      // Singular Presence: Якщо поле вже має FieldLivePill, морфуємо його і НЕ створюємо другий бейдж!
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        FieldLivePill.hasPill(target)
      ) {
        ChatLivePill.hide();
        FieldLivePill.morphToVaultAlert(target, firstLabel);
        return;
      }

      ChatLivePill.show(target as any, {
        shouldBlock: true,
        reason: `Виявлено введення конфіденційного маркера: «${firstLabel}».`,
        riskLevel: 'CRITICAL',
        score: 85,
        triggers: vaultScan.triggers,
        leakage: {
          hasCard: false,
          hasCvv: false,
          hasExpiry: false,
          hasOtp: false,
          cards: [],
          isCrossMessage: false,
        },
        vaultMatches: vaultScan.matchedItems,
      });
    }
  }

  /**
   * Допоміжний метод для отримання тексту з елемента введення
   */
  private static extractInputText(element: HTMLElement): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || '';
    }
    if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
      return element.innerText || element.textContent || '';
    }
    return '';
  }

  /**
   * Селективна оцінка форми: перевіряє, чи форма містить критичні дані (CVV, Expiry, Vault)
   */
  private static evaluateFormSensitiveAssets(form: HTMLFormElement): { shouldBlock: boolean; reason?: string } {
    const rawAction = form.getAttribute('action') || form.action || '';
    let targetHost = window.location.hostname.toLowerCase();
    try {
      if (rawAction && rawAction !== '#' && !rawAction.startsWith('javascript:')) {
        targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
      }
    } catch {}

    // Якщо домен форми акредитований або в білому списку — пропускаємо
    if (isAccreditedPaymentGateway(targetHost) || UserWhitelistManager.isDomainAllowedSync(targetHost) || isWhitelisted(targetHost)) {
      return { shouldBlock: false };
    }

    const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
    const filledInputs = inputs.filter((inp) => inp.value?.trim());
    // Якщо форма порожня — ніякого витоку немає, не блокуємо
    if (filledInputs.length === 0) {
      return { shouldBlock: false };
    }

    // Скануємо на Vault маркери: блокуємо ТІЛЬКИ при реальному витоку значення (VALUE_MATCH)
    const vaultScan = VaultScanner.scanFormSync(form, targetHost);
    const valueMatches = vaultScan.matches.filter((m) => m.matchType === 'VALUE_MATCH');
    if (valueMatches.length > 0) {
      const labels = Array.from(new Set(valueMatches.map(m => m.matchedItem.label))).join(', ');
      return {
        shouldBlock: true,
        reason: `У формі введено дійсний конфіденційний маркер безпеки з Private Vault: ${labels}!`,
      };
    }

    // Скануємо поля форми на CVV / Expiry
    for (const input of filledInputs) {
      const val = input.value.trim();
      const descriptor = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
      const isCvvField = /(cvv|cvc|csc|код\s*безпеки|код\s*картки)/i.test(descriptor);
      const digitsOnly = val.replace(/\D/g, '');

      if (isCvvField && (digitsOnly.length === 3 || digitsOnly.length === 4)) {
        return {
          shouldBlock: true,
          reason: 'У формі на сторонньому неакредитованому сайті введено секретний CVV/CVC код картки!',
        };
      }

      // Перевірка терміну дії в полі
      const isExpField = /(exp|термін|діє)/i.test(descriptor);
      if (isExpField && /^[0-1]?[0-9][\/\.-][2-3][0-9]$/.test(val)) {
        return {
          shouldBlock: true,
          reason: 'У формі на сторонньому сайті введено термін дії банківської картки (MM/YY)!',
        };
      }
    }

    return { shouldBlock: false };
  }

  public static init() {
    const intercept = (e: Event) => {
      const target = e.target as HTMLElement;

      // Якщо немає блокувань — пропускаємо
      if (!this.isSoftLocked && !this.hardLockContext) return;
      if (!target) return;

      // Пропуск, якщо користувач вже свідомо надав дозвіл цьому елементу чи формі
      const closestForm = target.closest('form');
      if (target.dataset?.threatShieldApproved === 'true' || (closestForm && closestForm.dataset?.threatShieldApproved === 'true')) {
        return;
      }

      // Визначення, чи це дія відправки (Клік на кнопку або Enter у полі введення)
      let isSubmission = false;
      let submissionText = '';
      let targetInputElement: HTMLElement | null = null;
      
      if (e.type === 'click') {
        const closestA = target.closest('a');
        const isNavigationLink = closestA && closestA.hasAttribute('href') && closestA.getAttribute('href') !== '#' && !closestA.getAttribute('href')?.startsWith('javascript:');
        
        if (isNavigationLink) {
          isSubmission = false;
        } else if (
          target.tagName === 'BUTTON' || 
          target.closest('button') || 
          target.getAttribute('role') === 'button' ||
          (closestA && closestA.getAttribute('role') === 'button')
        ) {
          // Якщо клік відбувається у формі — делегуємо FormSubmitInterceptor
          if (closestForm) {
            return;
          }

          isSubmission = true;

          // Пошук інпуту чату поруч з кнопкою
          const container = target.closest('[data-testid="conversation-layout"], .chat, .messenger, .chat-box, body');
          if (container) {
            const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
              'input:not([type="submit"]):not([type="button"]):not([type="hidden"]), textarea, [role="textbox"], [contenteditable="true"]'
            );
            if (input) {
              targetInputElement = input;
              submissionText = this.extractInputText(input);
            }
          }
        }
      } else if (e.type === 'keydown') {
        const kbEvent = e as KeyboardEvent;
        if (kbEvent.key === 'Enter' && !kbEvent.shiftKey) {
          if (
            target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' || 
            target.isContentEditable || 
            target.getAttribute('role') === 'textbox'
          ) {
            if (closestForm) {
              // Відправку форми по Enter обробляє FormSubmitInterceptor
              return;
            }

            isSubmission = true;
            targetInputElement = target;
            submissionText = this.extractInputText(target);
          }
        }
      }

      if (isSubmission) {
        if (this.isSoftLocked) {
          e.preventDefault();
          e.stopImmediatePropagation();
          ToastNotifier.show('Аналіз безпеки повідомлення в чаті...', 'info', 2000);
          return;
        }

        if (this.hardLockContext) {
          // ── СЕЛЕКТИВНИЙ АНАЛІЗ ВИХІДНОГО ТЕКСТУ (GUARDED MODE) ──────────────
          // Отримуємо оперативні елементи з Vault (Zero-Knowledge захист діє 24/7)
          const operationalVaultItems = PersonalVaultManager.getItemsSync();

          const assessment = SensitiveAssetDetector.evaluateOutboundPayload({
            text: submissionText,
            unlockedVaultItems: operationalVaultItems,
          });

          // Якщо вихідне навантаження безпечне (звичайне повідомлення або ТІЛЬКИ номер картки):
          if (!assessment.shouldBlock) {
            // НЕ блокуємо! Дозволяємо браузеру надіслати повідомлення або виконати дію!
            return;
          }

          // ── ВИЯВЛЕНО КРИТИЧНИЙ АКТИВ (CVV, Expiry, OTP, Vault Secret) ─────────
          e.preventDefault();
          e.stopImmediatePropagation();

          this.showBlockModal(targetInputElement || target, assessment.reason);
        }
      }
    };

    // Приєднуємося на фазі захоплення (capture phase: true)
    window.addEventListener('click', intercept, true);
    window.addEventListener('keydown', intercept, true);
    window.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form && form.dataset?.threatShieldApproved === 'true') {
        return; // Дозволити схвалені форми
      }
      if (this.isSoftLocked) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Відправка форм централізовано обробляється FormSubmitInterceptor
    }, true);

    // Безперервний фоновий моніторинг введення (Background Zero-Trust Input Sentinel)
    window.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const text = this.extractInputText(target);
      if (this.realtimeDebounceTimer) {
        window.clearTimeout(this.realtimeDebounceTimer);
      }
      this.realtimeDebounceTimer = window.setTimeout(() => {
        this.checkRealtimeVaultLeakage(target, text);
      }, 300);
    }, true);

    window.addEventListener('paste', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const clipboardData = (e as ClipboardEvent).clipboardData;
      const pastedText = clipboardData ? clipboardData.getData('text') : '';
      if (pastedText) {
        this.checkRealtimeVaultLeakage(target, pastedText);
      }
    }, true);
  }

  private static showBlockModal(targetElement: HTMLElement, reason?: string) {
    import('../ui/unified-modal').then(({ UnifiedFrictionModal }) => {
      UnifiedFrictionModal.show({
        type: 'chat',
        title: 'Витік чутливих даних заблоковано',
        badgeText: 'Чутливі дані',
        badgeLevel: 'CRITICAL',
        contextLabel: 'Платформа',
        contextValue: window.location.hostname,
        triggers: [
          {
            message: reason || 'Виявлено спробу передачі секретних платіжних даних (CVV/код безпеки/термін дії) або маркерів із Private Vault.',
            severity: 'CRITICAL',
          },
        ],
        activeContext: this.hardLockContext,
        onProceed: () => {
          targetElement.dataset.threatShieldApproved = 'true';
          const closestForm = targetElement.closest('form');
          if (closestForm) closestForm.dataset.threatShieldApproved = 'true';
          ToastNotifier.show('Дію підтверджено. Тепер ви можете безпечно надіслати повідомлення.', 'info', 4000);
        },
        onCancel: () => {},
      });
    });
  }
}
