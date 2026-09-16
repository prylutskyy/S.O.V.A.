import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
  FormSensitiveState,
} from '../src/heuristics/input-detector';
import { IntentClassifier } from '../src/heuristics/intent-classifier';
import { AILureVerifier } from '../src/heuristics/ai-verifier';
import { ChromeBuiltinAIProvider } from '../src/heuristics/chrome-ai-provider';
import { ChatChannelMonitor } from '../src/heuristics/chat-channel';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { PersonalVaultManager } from '../src/core/personal-vault';
import { VaultScanner } from '../src/heuristics/vault-scanner';
import { UrgencyDetector } from '../src/heuristics/urgency-detector';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { DebuggerOverlay } from '../src/ui/debugger-overlay';
import { PopoverUI } from '../src/ui/popover-ui';
import { TextHighlighter } from '../src/ui/text-highlighter';
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const currentHost = window.location.hostname.toLowerCase();
      const aiVerifier = new AILureVerifier(new ChromeBuiltinAIProvider());
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;
      let debugMode = false;
      chrome.storage.local.get(['debugModeEnabled'], (res) => { debugMode = !!res.debugModeEnabled; });
      chrome.storage.onChanged.addListener((changes) => { if (changes.debugModeEnabled) debugMode = changes.debugModeEnabled.newValue; });

    // Фонова асинхронна ініціалізація кешів
    UserWhitelistManager.init().catch((e) => console.error('[ThreatShield] UserWhitelist init error:', e));
    PersonalVaultManager.init().catch((e) => console.error('[ThreatShield] PersonalVault init error:', e));

    const shouldDisplayContextBanner = (ctx: ActiveThreatContext): boolean => {
      if (UserWhitelistManager.isDomainAllowedSync(currentHost) || isWhitelisted(currentHost)) {
        return false;
      }
      return true;
    };

    try {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' }).then((response) => {
        if (response && response.context) {
          const ctx = response.context as ActiveThreatContext;
          activeContext = ctx;
          console.log('[ThreatShield:Content] Отримано активний контекст загрози:', ctx);

          if (shouldDisplayContextBanner(ctx)) {
            SecurityFriction.showContextWarningBanner(ctx);
          }
        }
      }).catch(() => {});
    } catch {}

    // Слухач сповіщень від background worker (скидання або оновлення контексту на всіх вкладках)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'CONTEXT_CLEARED') {
          activeContext = null;
          SecurityFriction.removeContextWarningBanner();
        } else if (msg && msg.type === 'CONTEXT_UPDATED' && msg.context) {
          activeContext = msg.context as ActiveThreatContext;
          if (shouldDisplayContextBanner(activeContext)) {
            SecurityFriction.showContextWarningBanner(activeContext);
          }
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

      if (formState.hasFilledCvv) {
        heuristics.push({
          name: 'cvv_code_detected',
          triggered: true,
          severity: 'CRITICAL',
          scoreContribution: 40,
          message: 'У формі введено секретний код безпеки банківської картки (CVV/CVC)!',
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
    // Блокування відправки в чаті та формах (Enter, клік на кнопку або submit форми)
    // =========================================================================
    const isFieldCvv = (input: HTMLInputElement | HTMLTextAreaElement): boolean => {
      const descriptor = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
      const val = input.value?.trim() || '';
      const digitsOnly = val.replace(/\D/g, '');
      const isCvvDescriptor = /(cvv|cvc|csc|pin|безпек)/i.test(descriptor);
      const isLengthMatch = (digitsOnly.length === 3 || digitsOnly.length === 4) || (val.length >= 3 && val.length <= 4);
      return isCvvDescriptor && isLengthMatch;
    };

    const ACTIVE_INPUTS_SELECTOR =
      'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea';

    const interceptChatSend = (
      inputElement: HTMLInputElement | HTMLTextAreaElement,
      event: Event,
      detectedCvv: boolean = false
    ) => {
      if (inputElement.dataset.threatShieldApproved === 'true') {
        console.log('[ThreatShield:Content] Відправка повідомлення дозволена (усвідомлене розблокування).');
        delete inputElement.dataset.threatShieldApproved;
        return;
      }

      const outbound = ChatChannelMonitor.checkOutbound(inputElement.value || '');
      const hasCvv = outbound.hasCvv || detectedCvv || isFieldCvv(inputElement);
      const vaultScan = VaultScanner.scanTextSync(inputElement.value || '');
      const isLeaking = outbound.hasCard || hasCvv || vaultScan.matchedItems.length > 0;

      if (isLeaking) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        SecurityFriction.applyToChat(
          inputElement,
          {
            hasCard: outbound.hasCard,
            hasCvv,
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

    const isFormWhitelisted = (form: HTMLFormElement | null): boolean => {
      if (!form) return false;
      const rawAction = form.getAttribute('action') || form.action;
      let targetHost = currentHost;
      try {
        if (rawAction && rawAction !== '#' && !rawAction.startsWith('javascript:')) {
          targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
        }
      } catch {}
      return (
        isAccreditedPaymentGateway(targetHost) ||
        UserWhitelistManager.isDomainAllowedSync(targetHost) ||
        isWhitelisted(targetHost)
      );
    };

    document.addEventListener(
      'click',
      async (event) => {
        const target = event.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement | HTMLInputElement>(
          'button, input[type="submit"], input[type="button"]'
        );
        if (!btn) return;

        // Пошук зв'язаних текстових полів (у формі або в спільному контейнері чату)
        const form = btn.closest('form');
        let textInputs: (HTMLInputElement | HTMLTextAreaElement)[] = [];
        if (form) {
          textInputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(ACTIVE_INPUTS_SELECTOR));
        } else {
          const container = btn.closest('.chat-box, .message-input, .columns, div');
          if (container) {
            textInputs = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(ACTIVE_INPUTS_SELECTOR));
          }
        }

        // Перевіряємо, чи є в полі витік реквізитів картки, CVV або маркерів Vault
        if (!isFormWhitelisted(form)) {
          for (const input of textInputs) {
            if (input.dataset.threatShieldApproved === 'true') continue;
            const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
            const hasCvv = outbound.hasCvv || isFieldCvv(input);
            const vaultScan = VaultScanner.scanTextSync(input.value || '');
            if (outbound.hasCard || hasCvv || vaultScan.matchedItems.length > 0) {
              interceptChatSend(input, event, hasCvv);
              return;
            }
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
            const form = input.closest('form');
            if (!isFormWhitelisted(form)) {
              const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
              const hasCvv = outbound.hasCvv || isFieldCvv(input);
              const vaultScan = VaultScanner.scanTextSync(input.value || '');
              if (outbound.hasCard || hasCvv || vaultScan.matchedItems.length > 0) {
                interceptChatSend(input, event, hasCvv);
                return;
              }
            }

            // 2. Якщо поле всередині традиційної форми
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

        // Перевіряємо поля форми на витік платіжних або Vault даних
        if (!isFormWhitelisted(form)) {
          const textInputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(ACTIVE_INPUTS_SELECTOR);
          for (const input of Array.from(textInputs)) {
            if (input.dataset.threatShieldApproved === 'true') continue;
            const outbound = ChatChannelMonitor.checkOutbound(input.value || '');
            const hasCvv = outbound.hasCvv || isFieldCvv(input);
            const vaultScan = VaultScanner.scanTextSync(input.value || '');
            if (outbound.hasCard || hasCvv || vaultScan.matchedItems.length > 0) {
              interceptChatSend(input, event, hasCvv);
              return;
            }
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

    const triggerLureContext = (
      suspiciousUrl: string,
      keywords: string[],
      offPlatformLure: boolean,
      bannerSubtitle: string
    ) => {
      const localContext: ActiveThreatContext = {
        sourcePlatform: currentHost || 'web-chat',
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'HIGH',
        detectedKeywords: keywords,
        offPlatformLure,
        targetSuspiciousUrl: suspiciousUrl,
        timestamp: Date.now(),
        ttlMs: 15 * 60 * 1000,
      };

      activeContext = localContext;
      SecurityFriction.showContextWarningBanner(localContext, bannerSubtitle);

      try {
        chrome.runtime.sendMessage({
          type: 'LURE_DETECTED',
          payload: {
            sourcePlatform: currentHost || 'web-chat',
            keywords,
            offPlatformLure,
            suspiciousUrl,
          },
        });
      } catch {}
    };

    const getCopiedText = (): string => {
      let text = window.getSelection()?.toString() || '';
      if (!text && document.activeElement) {
        const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number' && el.value) {
          text = el.value.substring(el.selectionStart, el.selectionEnd);
        }
      }
      return text.trim();
    };

    document.addEventListener(
      'click',
      async (event) => {
        const target = event.target as HTMLElement;
        const a = target.closest('a');
        let textToScan = '';
        let targetUrl = '';

        if (a && a.href) {
          targetUrl = a.href;
          textToScan = `${a.href} ${a.innerText || ''}`;
        } else {
          // Для чатів (як otr.to), де посилання рендеряться звичайним текстом у тегах span/div
          const clickedText = (target.innerText || target.textContent || '').trim();
          const urlMatch = clickedText.match(/(?:https?:\/\/[^\s]+|t\.me\/[a-z0-9_]+|wa\.me\/[0-9]+|\b(?:[a-z0-9-]+\.)+(?:com|ua|fake|net|org|site|online|top|me|to)(?:\/[^\s]*)?)/i);
          if (urlMatch) {
            targetUrl = urlMatch[0];
            textToScan = clickedText;
          }
        }

        if (textToScan) {
          const scan = IntentClassifier.classify(textToScan);
          if (debugMode) {
            DebuggerOverlay.log('Input Text (Click)', textToScan, '#9CA3AF');
            if (scan.clustersDetected.length > 0) DebuggerOverlay.log('Clusters', scan.clustersDetected, '#EAB308');
          }
          if (scan.hasFormedIntent) {
            const isOffPlatformLure = scan.clustersDetected.includes('off_platform');
            triggerLureContext(
              targetUrl || (scan.suspiciousUrls && scan.suspiciousUrls[0]) || textToScan,
              scan.matchedSpans.map(s => s.text),
              isOffPlatformLure,
              isOffPlatformLure
                ? 'Зафіксовано виведення в месенджер'
                : 'Зафіксовано перехід за підозрілим посиланням'
            );
          }
        }
      },
      true
    );

    document.addEventListener('copy', async () => {
      const selection = getCopiedText();
      if (selection) {
        const scan = IntentClassifier.classify(selection);
          if (debugMode) {
            DebuggerOverlay.log('Input Text (Copy)', selection, '#9CA3AF');
            if (scan.clustersDetected.length > 0) DebuggerOverlay.log('Clusters', scan.clustersDetected, '#EAB308');
          }
        if (scan.hasFormedIntent) {
          const isOffPlatformLure = scan.clustersDetected.includes('off_platform');
          triggerLureContext(
            (scan.suspiciousUrls && scan.suspiciousUrls[0]) || selection,
            scan.matchedSpans.map(s => s.text),
            isOffPlatformLure,
            isOffPlatformLure
              ? 'Зафіксовано виведення в месенджер'
              : 'Зафіксовано копіювання підозрілого посилання'
          );
        }
      }
    });
  },
});








