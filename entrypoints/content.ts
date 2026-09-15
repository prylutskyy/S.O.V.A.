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
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const currentHost = window.location.hostname.toLowerCase();
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;

    // Фонова асинхронна ініціалізація кешів (НЕ блокує реєстрацію обробників подій!)
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
    // 1. РІВЕНЬ ПЕРЕХОПЛЕННЯ 1: Клік по кнопці відправки форми (до події submit!)
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
          return; // Користувач свідомо дозволив відправку
        }

        const { assessment, formState, targetHost } = evaluateFormThreat(form);
        console.log('[ThreatShield:ClickIntercept] Оцінка форми перед кліком:', { assessment, formState });

        if (shouldBlock(assessment, formState, targetHost)) {
          // Зупиняємо клік, щоб браузер навіть не створив подію submit і не викликав inline onsubmit!
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          SecurityFriction.apply(form, assessment);
        }
      },
      true // Capture phase!
    );

    // =========================================================================
    // 2. РІВЕНЬ ПЕРЕХОПЛЕННЯ 2: Натискання Enter у полях форми
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

              SecurityFriction.apply(form, assessment);
            }
          }
        }
      },
      true // Capture phase!
    );

    // =========================================================================
    // 3. РІВЕНЬ ПЕРЕХОПЛЕННЯ 3: Подія submit на формі (capture фаза)
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
        console.log('[ThreatShield:SubmitIntercept] Оцінка форми на submit:', { assessment, formState });

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
      true // Capture phase!
    );

    // =========================================================================
    // 4. ЗАХИСТ ВІД ВИТОКУ ДАНИХ У ЧАТІ
    // =========================================================================
    const handleChatInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
      const text = target.value || '';
      const leakage = checkOutboundChatLeakage(text);

      if (leakage.isLeaking) {
        target.style.outline = '3px solid #ef4444';
        target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';

        let warningBadge = target.parentElement?.querySelector('.threat-shield-chat-warning') as HTMLElement;
        if (!warningBadge && target.parentElement) {
          warningBadge = document.createElement('div');
          warningBadge.className = 'threat-shield-chat-warning';
          warningBadge.style.cssText = `
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #f87171;
            padding: 6px 10px;
            font-size: 12px;
            border-radius: 6px;
            margin-top: 6px;
            font-weight: 500;
          `;
          target.parentElement.appendChild(warningBadge);
        }

        if (warningBadge) {
          warningBadge.innerText = leakage.warningMessage || 'Увага: виявлено реквізити картки в повідомленні!';
        }
      } else {
        target.style.outline = '';
        target.style.backgroundColor = '';
        const warningBadge = target.parentElement?.querySelector('.threat-shield-chat-warning');
        if (warningBadge) warningBadge.remove();
      }
    };

    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        handleChatInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    });

    // Блокування Enter у повідомленні чату при витоку
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
              alert(
                `🛑 [ДІЮ ЗАБЛОКОВАНО: ВИТІК РЕКВІЗИТІВ КАРТКИ В ЧАТІ]\n\n` +
                `Система виявила номер банківської картки або CVV у тексті вашого повідомлення.\n\n` +
                `Пам'ятайте: покупець на маркетплейсі не повинен знати ваш CVV або номер картки для переказу коштів за схемою OLX Доставка.\n` +
                `Очистіть чутливі дані перед відправленням повідомлення!`
              );
            }
          }
        }
      },
      true
    );

    // =========================================================================
    // 5. ДЕТЕКЦІЯ СОЦІНЖЕНЕРІЇ ТА ВИВЕДЕННЯ В МЕСЕНДЖЕРИ НА ПЛАТФОРМАХ
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
              console.warn('[ThreatShield:Content] Клік по маніпулятивному лінку:', target.href);
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
