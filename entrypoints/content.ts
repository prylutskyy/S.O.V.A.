import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
  FormSensitiveState,
} from '../src/heuristics/input-detector';
import { scanTextForLures } from '../src/heuristics/lure-detector';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { PopoverUI } from '../src/ui/popover-ui';
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const currentHost = window.location.hostname.toLowerCase();
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;

    // Фонова асинхронна ініціалізація кешів
    UserWhitelistManager.init().catch((e) => console.error('[ThreatShield] UserWhitelist init error:', e));

    try {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' }).then((response) => {
        if (response && response.context) {
          activeContext = response.context;
          console.log('[ThreatShield:Content] Отримано активний контекст загрози:', activeContext);

          const isUserAllowed = UserWhitelistManager.isDomainAllowedSync(currentHost);
          if (!isWhitelisted(currentHost) && !isUserAllowed && currentHost !== activeContext.sourcePlatform) {
            SecurityFriction.showContextWarningBanner(activeContext);
          }
        }
      }).catch(() => {});
    } catch {
      // background worker ще стартує
    }

    // =========================================================================
    // СИНХРОННА ОЦІНКА ФОРМИ
    // =========================================================================
    const evaluateFormThreat = (
      form: HTMLFormElement
    ): { assessment: ThreatAssessment; formState: FormSensitiveState; targetHost: string } => {
      const rawAction = form.getAttribute('action') || form.action;
      let targetHost = currentHost;
      try {
        if (rawAction && rawAction !== '#') {
          targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
        }
      } catch {}

      const formState = getFormFilledState(form);
      const heuristics: HeuristicResult[] = [];

      heuristics.push(checkFormActionMismatch(form));
      heuristics.push(...checkSensitiveAndHiddenInputs(form));

      if (formState.hasFilledCard) {
        heuristics.push({
          name: 'luhn_card_number_detected',
          triggered: true,
          severity: 'CRITICAL',
          scoreContribution: 40,
          message: 'У формі введено номер банківської картки!',
        });
      }

      let contextBonus = 0;
      if (activeContext && !isWhitelisted(currentHost)) {
        contextBonus = 35;
        heuristics.push({
          name: 'tainted_context_window_active',
          triggered: true,
          severity: 'HIGH',
          scoreContribution: 35,
          message: `Зшивання розірваних сесій: перехід після підозрілої активності на ${activeContext.sourcePlatform}.`,
        });
      }

      const assessment = RiskEngine.evaluate(
        heuristics,
        {
          action: 'submit',
          hasFilledSensitive: formState.hasFilledAnySensitive,
          isEntirelyEmpty: formState.isEntirelyEmpty,
        },
        contextBonus
      );

      if (activeContext) {
        assessment.contextActive = true;
      }

      return { assessment, formState, targetHost };
    };

    const shouldBlock = (assessment: ThreatAssessment, formState: FormSensitiveState, targetHost: string): boolean => {
      if (UserWhitelistManager.isDomainAllowedSync(targetHost)) return false;
      if (isAccreditedPaymentGateway(targetHost)) return false;

      // Блокуємо якщо CRITICAL або HIGH при заповнених чутливих даних
      return assessment.level === 'CRITICAL' || (assessment.level === 'HIGH' && formState.hasFilledAnySensitive);
    };

    // =========================================================================
    // 1. РІВЕНЬ 1: Клік по кнопці відправки форми (до події submit)
    // =========================================================================
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const submitBtn = target.closest<HTMLButtonElement | HTMLInputElement>(
          'button[type="submit"], input[type="submit"], button:not([type])'
        );
        if (!submitBtn) return;

        const form = submitBtn.closest('form');
        if (!form) return;

        if (form.dataset.threatShieldApproved === 'true') {
          return;
        }

        const { assessment, formState, targetHost } = evaluateFormThreat(form);
        console.log('[ThreatShield:ClickIntercept] Оцінка форми перед кліком:', { assessment, formState });

        if (shouldBlock(assessment, formState, targetHost)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Відображаємо плаваючий Popover над самою кнопкою
          SecurityFriction.apply(form, assessment, submitBtn);
        }
      },
      true
    );

    // =========================================================================
    // 2. РІВЕНЬ 2: Натискання Enter у полях форми
    // =========================================================================
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement;
          if (target && target.tagName === 'INPUT') {
            const form = target.closest('form');
            if (!form || form.dataset.threatShieldApproved === 'true') return;

            const { assessment, formState, targetHost } = evaluateFormThreat(form);
            if (shouldBlock(assessment, formState, targetHost)) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();

              SecurityFriction.apply(form, assessment, target);
            }
          }
        }
      },
      true
    );

    // =========================================================================
    // 3. РІВЕНЬ 3: Подія submit на формі (capture фаза)
    // =========================================================================
    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement;
        if (!form || !(form instanceof HTMLFormElement)) return;

        if (form.dataset.threatShieldApproved === 'true') {
          console.log('[ThreatShield:Content] Сабміт форми дозволено (усвідомлене розблокування).');
          delete form.dataset.threatShieldApproved;
          return;
        }

        const { assessment, formState, targetHost } = evaluateFormThreat(form);

        if (shouldBlock(assessment, formState, targetHost)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          SecurityFriction.apply(form, assessment);

          try {
            chrome.runtime.sendMessage({
              type: 'THREAT_DETECTED',
              payload: { url: window.location.href, assessment },
            });
          } catch {}
        }
      },
      true
    );

    // =========================================================================
    // 4. ЗАХИСТ ВІД ВИТОКУ ДАНИХ У ЧАТІ (ВЕРХНІЙ ПЛАВАЮЧИЙ ТОСТ)
    // =========================================================================
    const handleChatInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
      const text = target.value || '';
      const leakage = checkOutboundChatLeakage(text);

      if (leakage.isLeaking) {
        target.style.outline = '3px solid #ef4444';
        target.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';

        // Показуємо закріплений плаваючий банер у самому верху сторінки (не ламає верстку!)
        PopoverUI.showTopToast(
          leakage.warningMessage ||
            'Ви намагаєтеся надіслати реквізити банківської картки у відкритому чаті! Продавцю для отримання коштів CVV та повні реквізити картки ніколи не потрібні.'
        );
      } else {
        target.style.outline = '';
        target.style.backgroundColor = '';
        PopoverUI.hideTopToast();
      }
    };

    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        handleChatInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    });

    // Блокування Enter у чаті при спробі відправити реквізити (БЕЗ alert!)
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            const leakage = checkOutboundChatLeakage((target as HTMLInputElement).value || '');
            if (leakage.isLeaking) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();

              // Замість alert виводимо акцентований верхній тост
              PopoverUI.showTopToast(
                '🛑 ВІДПРАВКУ ЗАБЛОКОВАНО: Видаліть номер банківської картки або CVV з тексту повідомлення перед відправленням!'
              );
            }
          }
        }
      },
      true
    );

    // =========================================================================
    // 5. ДЕТЕКЦІЯ СОЦІНЖЕНЕРІЇ ТА ВИВЕДЕННЯ В МЕСЕНДЖЕРИ
    // =========================================================================
    const isPlatform = isMonitoredPlatform(currentHost) || window.location.protocol === 'file:';

    if (isPlatform) {
      document.addEventListener(
        'click',
        (event) => {
          const target = (event.target as HTMLElement).closest('a');
          if (target && target.href) {
            const scan = scanTextForLures(target.href + ' ' + target.innerText);
            if (scan.detected) {
              try {
                chrome.runtime.sendMessage({
                  type: 'LURE_DETECTED',
                  payload: {
                    sourcePlatform: currentHost || 'marketplace-chat',
                    keywords: scan.keywords,
                    offPlatformLure: scan.isOffPlatformLure,
                    suspiciousUrl: target.href,
                  },
                });
              } catch {}
            }
          }
        },
        true
      );

      document.addEventListener('copy', () => {
        const selection = window.getSelection()?.toString() || '';
        if (selection) {
          const scan = scanTextForLures(selection);
          if (scan.detected) {
            try {
              chrome.runtime.sendMessage({
                type: 'LURE_DETECTED',
                payload: {
                  sourcePlatform: currentHost || 'marketplace-chat',
                  keywords: scan.keywords,
                  offPlatformLure: scan.isOffPlatformLure,
                },
              });
            } catch {}
          }
        }
      });
    }

    // Моніторинг фокусу на чутливих полях
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (target && target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.type === 'password' || /(card|cvv|pin)/i.test(input.name || input.id)) {
          if (activeContext && !isWhitelisted(currentHost)) {
            input.style.border = '2px solid #ea580c';
          }
        }
      }
    });
  },
});
