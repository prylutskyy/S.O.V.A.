import { ToastNotifier } from '../ui/toast-notifier';
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

    // Скануємо на Vault маркери
    const vaultScan = VaultScanner.scanFormSync(form, targetHost);
    if (vaultScan.matches.length > 0) {
      const labels = Array.from(new Set(vaultScan.matches.map(m => m.matchedItem.label))).join(', ');
      return {
        shouldBlock: true,
        reason: `Форма запитує або містить персональні конфіденційні маркери з Private Vault: ${labels}!`,
      };
    }

    // Скануємо поля форми на CVV / Expiry / Passwords
    const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
    for (const input of inputs) {
      const val = input.value?.trim() || '';
      if (!val) continue;

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
      // Якщо немає блокувань — пропускаємо
      if (!this.isSoftLocked && !this.hardLockContext) return;

      const target = e.target as HTMLElement;
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
          isSubmission = true;
          // Спробуємо знайти пов'язане поле введення поруч (наприклад, у чаті або у формі)
          if (closestForm) {
            // Перевіряємо форму
            const formCheck = this.evaluateFormSensitiveAssets(closestForm);
            if (formCheck.shouldBlock) {
              e.preventDefault();
              e.stopImmediatePropagation();
              this.showBlockModal(closestForm, formCheck.reason);
              return;
            } else {
              // Форма безпечна — ДОЗВОЛЯЄМО
              return;
            }
          }

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
            isSubmission = true;
            targetInputElement = target;
            submissionText = this.extractInputText(target);

            if (closestForm) {
              const formCheck = this.evaluateFormSensitiveAssets(closestForm);
              if (formCheck.shouldBlock) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.showBlockModal(target, formCheck.reason);
                return;
              }
            }
          }
        }
      }

      if (isSubmission) {
        if (this.isSoftLocked) {
          e.preventDefault();
          e.stopImmediatePropagation();
          ToastNotifier.show('Зачекайте, штучний інтелект перевіряє безпеку чату...', 'warning', 2000);
          return;
        }

        if (this.hardLockContext) {
          // ── СЕЛЕКТИВНИЙ АНАЛІЗ ВИХІДНОГО ТЕКСТУ (GUARDED MODE) ──────────────
          // Отримуємо розблоковані елементи з Vault, якщо сховище розблоковано
          const unlockedVaultItems = PersonalVaultManager.isLocked() ? [] : PersonalVaultManager.getItemsSync();

          const assessment = SensitiveAssetDetector.evaluateOutboundPayload({
            text: submissionText,
            unlockedVaultItems,
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
      if (this.hardLockContext && form) {
        const formCheck = this.evaluateFormSensitiveAssets(form);
        if (formCheck.shouldBlock) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.showBlockModal(form, formCheck.reason);
        }
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
          ToastNotifier.show('Дозвіл надано. Повторіть відправку.', 'info', 4000);
        },
        onCancel: () => {},
      });
    });
  }
}
