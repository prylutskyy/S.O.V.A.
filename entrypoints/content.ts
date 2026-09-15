import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
  FormSensitiveState,
} from '../src/heuristics/input-detector';
import { scanTextForLures } from '../src/heuristics/lure-detector';
import { ChatChannelMonitor } from '../src/heuristics/chat-channel';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { PersonalVaultManager } from '../src/core/personal-vault';
import { VaultScanner } from '../src/heuristics/vault-scanner';
import { UrgencyDetector } from '../src/heuristics/urgency-detector';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { PopoverUI } from '../src/ui/popover-ui';
import { TextHighlighter } from '../src/ui/text-highlighter';
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const currentHost = window.location.hostname.toLowerCase();
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;

    // Фонова асинхронна ініціалізація кешів
    UserWhitelistManager.init().catch((e) => console.error('[ThreatShield] UserWhitelist init error:', e));
    PersonalVaultManager.init().catch((e) => console.error('[ThreatShield] PersonalVault init error:', e));

    try {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' }).then((response) => {
        if (response && response.context) {
          const ctx = response.context as ActiveThreatContext;
          activeContext = ctx;
          console.log('[ThreatShield:Content] Отримано активний контекст загрози:', ctx);

          const isUserAllowed = UserWhitelistManager.isDomainAllowedSync(currentHost);
          if (!isWhitelisted(currentHost) && !isUserAllowed && currentHost !== ctx.sourcePlatform) {
            SecurityFriction.showContextWarningBanner(ctx);
          }
        }
      }).catch(() => {});
    } catch {}

    // Маркування сторінки та створення каналу зв'язку для тестових сторінок
    document.documentElement.setAttribute('data-threat-shield-loaded', 'true');
    window.postMessage({ type: 'THREAT_SHIELD_READY', version: '0.2.0' }, '*');

    window.addEventListener('message', async (event) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'THREAT_SHIELD_PING') {
        window.postMessage({ type: 'THREAT_SHIELD_PONG', version: '0.2.0' }, '*');
      }

      if (event.data.type === 'THREAT_SHIELD_CLEAR_WHITELIST') {
        await UserWhitelistManager.clearAll();
        console.log('[ThreatShield:Content] Персональний білий список користувача успішно очищено.');
        window.postMessage({ type: 'THREAT_SHIELD_WHITELIST_CLEARED' }, '*');
      }

      if (event.data.type === 'THREAT_SHIELD_CLEAR_CONTEXT') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            await chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
          }
        } catch {}
        activeContext = null;
        document.getElementById('threat-shield-context-banner')?.remove();
        console.log('[ThreatShield:Content] Tainted Context Window успішно очищено.');
        window.postMessage({ type: 'THREAT_SHIELD_CONTEXT_CLEARED' }, '*');
      }

      if (event.data.type === 'THREAT_SHIELD_TRIGGER_LURE') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const resp = await chrome.runtime.sendMessage({
              type: 'LURE_DETECTED',
              payload: {
                sourcePlatform: event.data.platform || 'olx.ua',
                keywords: event.data.keywords || ['olx доставка', 'отримати кошти', 'оплата замовлення'],
                offPlatformLure: true,
                suspiciousUrl: event.data.suspiciousUrl || 'https://novaposhta-pay.fake.com/order123',
              },
            });
            if (resp && resp.context) {
              const ctx = resp.context as ActiveThreatContext;
              activeContext = ctx;
              SecurityFriction.showContextWarningBanner(ctx);
            }
          }
        } catch {}
        console.log('[ThreatShield:Content] Імітація соцінженерної приманки успішно активована.');
        window.postMessage({ type: 'THREAT_SHIELD_LURE_TRIGGERED' }, '*');
      }
    });

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

      // DLP: Інспекція полів форми на конфіденційні маркери з Vault
      const vaultScan = VaultScanner.scanFormSync(form);
      if (vaultScan.triggers.length > 0) {
        heuristics.push(...vaultScan.triggers);
        formState.hasFilledAnySensitive = true;
      }

      // Перевірка на штучну терміновість та фіктивні таймери (Dark Patterns: +20)
      const urgencyResults = UrgencyDetector.scanUrgencySync(form);
      if (urgencyResults.length > 0) {
        heuristics.push(...urgencyResults);
      }

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

          // Відображаємо модальне вікно безпеки з XAI
          SecurityFriction.apply(form, assessment, submitBtn, undefined, activeContext);
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

              SecurityFriction.apply(form, assessment, target, undefined, activeContext);
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

          SecurityFriction.apply(form, assessment, undefined, undefined, activeContext);

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
    // 4. ДЕТЕКЦІЯ ТА ПІДСВІЧУВАННЯ ТЕКСТУ (GRAMMARLY-STYLE GHOST OVERLAY)
    // =========================================================================
    const handleTextInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
      TextHighlighter.update(target);
    };

    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        handleTextInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    });

    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        handleTextInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    });

    // =========================================================================
    // Блокування відправки в чаті (Enter або кнопка Надіслати) із викликом модального вікна
    // =========================================================================
    const interceptChatSend = (inputElement: HTMLInputElement | HTMLTextAreaElement, event: Event) => {
      if (inputElement.dataset.threatShieldApproved === 'true') {
        console.log('[ThreatShield:Content] Відправка повідомлення в чаті дозволена (усвідомлене розблокування).');
        delete inputElement.dataset.threatShieldApproved;
        return;
      }

      const outbound = ChatChannelMonitor.checkOutbound(inputElement.value || '');
      const vaultScan = VaultScanner.scanTextSync(inputElement.value || '');
      const isLeaking = outbound.hasCard || outbound.hasCvv || vaultScan.matchedItems.length > 0;

      if (isLeaking) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        SecurityFriction.applyToChat(
          inputElement,
          {
            hasCard: outbound.hasCard,
            hasCvv: outbound.hasCvv,
            cards: outbound.cards,
          },
          () => {
            // При усвідомленому підтвердженні:
            inputElement.dataset.threatShieldApproved = 'true';
            inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          },
          undefined,
          activeContext
        );
      }
    };

    // 1. Натискання Enter у полі чату
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            if (!target.closest('form')) {
              interceptChatSend(target as HTMLInputElement | HTMLTextAreaElement, event);
            }
          }
        }
      },
      true
    );

    // 2. Клік по кнопці відправки чату (поза формою)
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement>('button, input[type="button"]');
        if (!btn || btn.closest('form')) return;

        // Пошук зв'язаного інпуту чату
        const container = btn.closest('.chat-box, .message-input, div');
        const chatInput = container?.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"]');
        if (chatInput && (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT')) {
          interceptChatSend(chatInput, event);
        }
      },
      true
    );

    // =========================================================================
    // 5. ДЕТЕКЦІЯ СОЦІНЖЕНЕРІЇ ТА РОЗМЕЖУВАННЯ ВХІДНИХ/ВИХІДНИХ ПОВІДОМЛЕНЬ ЧАТУ
    // =========================================================================
    const isPlatform = isMonitoredPlatform(currentHost) || window.location.protocol === 'file:';

    if (isPlatform) {
      ChatChannelMonitor.init(
        currentHost || 'marketplace-chat',
        (lureEvent) => {
          try {
            chrome.runtime.sendMessage({
              type: 'LURE_DETECTED',
              payload: {
                sourcePlatform: lureEvent.sourcePlatform,
                keywords: lureEvent.keywords,
                offPlatformLure: lureEvent.isOffPlatformLure,
                suspiciousUrl: lureEvent.suspiciousUrls[0] || undefined,
              },
            }).then((resp) => {
              if (resp && resp.context) {
                activeContext = resp.context as ActiveThreatContext;
                console.log('[ThreatShield:ChatChannel] Tainted Context активовано через вхідне повідомлення:', activeContext);
              }
            }).catch(() => {});
          } catch {}
        }
      );

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
  },
});
