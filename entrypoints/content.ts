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

          // На локальних тестових сторінках (file://) банер відображається виключно при явному запуску симуляції
          if (window.location.protocol !== 'file:') {
            const isUserAllowed = UserWhitelistManager.isDomainAllowedSync(currentHost);
            if (!isWhitelisted(currentHost) && !isUserAllowed && currentHost !== ctx.sourcePlatform) {
              SecurityFriction.showContextWarningBanner(ctx);
            }
          }
        }
      }).catch(() => {});
    } catch {}

    // Слухач сповіщень від background worker (наприклад, скидання контексту на іншій вкладці чи в popup)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'CONTEXT_CLEARED') {
          activeContext = null;
          SecurityFriction.removeContextWarningBanner();
        }
      });
    }

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
        SecurityFriction.removeContextWarningBanner();
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
      const vaultScan = VaultScanner.scanFormSync(form, currentHost);
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
    // Блокування відправки в чаті (Enter, клік на кнопку або submit форми)
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
            const form = inputElement.closest('form');
            if (form) {
              form.dataset.threatShieldApproved = 'true';
              if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
              } else {
                form.submit();
              }
            } else {
              inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            }
          },
          undefined,
          activeContext
        );
      }
    };

    // =========================================================================
    // 1. РІВЕНЬ 1: Клік по кнопці відправки форми або чату (до події submit)
    // =========================================================================
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement | HTMLInputElement>(
          'button, input[type="submit"], input[type="button"]'
        );
        if (!btn) return;

        // Пошук зв'язаних текстових полів (у формі або в спільному контейнері чату)
        const form = btn.closest('form');
        let textInputs: (HTMLInputElement | HTMLTextAreaElement)[] = [];
        if (form) {
          textInputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], input:not([type]), textarea'));
        } else {
          const container = btn.closest('.chat-box, .message-input, .columns, div');
          if (container) {
            textInputs = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input:not([type])'));
          }
        }

        // Перевіряємо, чи є в полі витік реквізитів картки або маркерів Vault
        for (const input of textInputs) {
          if (input.dataset.threatShieldApproved === 'true') continue;
          const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
          const vaultScan = VaultScanner.scanTextSync(input.value || '');
          if (outbound.hasCard || outbound.hasCvv || vaultScan.matchedItems.length > 0) {
            interceptChatSend(input, event);
            return;
          }
        }

        // Класична перевірка форми оплати (якщо це повноцінна форма)
        if (form) {
          if (form.dataset.threatShieldApproved === 'true') return;
          const { assessment, formState, targetHost } = evaluateFormThreat(form);
          if (shouldBlock(assessment, formState, targetHost)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            SecurityFriction.apply(form, assessment, btn, undefined, activeContext);
          }
        }
      },
      true
    );

    // =========================================================================
    // 2. РІВЕНЬ 2: Натискання Enter у полях вводу чату та форм
    // =========================================================================
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            const input = target as HTMLInputElement | HTMLTextAreaElement;
            if (input.dataset.threatShieldApproved === 'true') return;

            // 1. Перевірка на витік картки/CVV/Vault у тексті повідомлення
            const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
            const vaultScan = VaultScanner.scanTextSync(input.value || '');
            if (outbound.hasCard || outbound.hasCvv || vaultScan.matchedItems.length > 0) {
              interceptChatSend(input, event);
              return;
            }

            // 2. Якщо поле всередині традиційної форми
            const form = input.closest('form');
            if (form) {
              if (form.dataset.threatShieldApproved === 'true') return;
              const { assessment, formState, targetHost } = evaluateFormThreat(form);
              if (shouldBlock(assessment, formState, targetHost)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                SecurityFriction.apply(form, assessment, target, undefined, activeContext);
              }
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

        // Перевіряємо текстові інпути форми на витік платіжних або Vault даних
        const textInputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input[type="text"], input:not([type]), textarea'
        );
        for (const input of Array.from(textInputs)) {
          if (input.dataset.threatShieldApproved === 'true') continue;
          const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
          const vaultScan = VaultScanner.scanTextSync(input.value || '');
          if (outbound.hasCard || outbound.hasCvv || vaultScan.matchedItems.length > 0) {
            interceptChatSend(input, event);
            return;
          }
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
    // 5. УНІВЕРСАЛЬНИЙ МОНІТОРИНГ ЧАТІВ ТА СОЦІНЖЕНЕРНИХ ПРИМАНОК (ДІЄ НА ВСІХ САЙТАХ)
    // =========================================================================
    ChatChannelMonitor.init(
      currentHost || 'web-chat',
      (lureEvent) => {
        console.log('[ThreatShield:ChatChannel] Виявлено соцінженерне повідомлення в чаті (пасивний моніторинг):', lureEvent);
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
                  sourcePlatform: currentHost || 'web-chat',
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
                sourcePlatform: currentHost || 'web-chat',
                keywords: scan.keywords,
                offPlatformLure: scan.isOffPlatformLure,
              },
            });
          } catch {}
        }
      }
    });
  },
});
