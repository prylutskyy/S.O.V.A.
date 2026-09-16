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
import { PopoverUI } from '../src/ui/popover-ui';
import { ToastNotifier } from '../src/ui/toast-notifier';
import { DebuggerOverlay } from '../src/ui/debugger-overlay';
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';
import { GlobalInputInterceptor } from '../src/heuristics/input-interceptor';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    GlobalInputInterceptor.init();
    const currentHost = window.location.hostname.toLowerCase();
    const aiVerifier = new AILureVerifier(new ChromeBuiltinAIProvider());

    let debugMode = false;
    chrome.storage.local.get(['debugModeEnabled'], (res) => { 
      debugMode = !!res.debugModeEnabled; 
      ChatChannelMonitor.debugMode = debugMode;
    });
    chrome.storage.onChanged.addListener((changes) => { 
      if (changes.debugModeEnabled) {
        debugMode = changes.debugModeEnabled.newValue;
        ChatChannelMonitor.debugMode = debugMode;
      }
    });

    console.log('[ThreatShield:Content] Ініціалізовано на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;

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
          GlobalInputInterceptor.setHardLock(ctx);
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
          GlobalInputInterceptor.setHardLock(null);
          SecurityFriction.removeContextWarningBanner();
        } else if (msg && msg.type === 'CONTEXT_UPDATED' && msg.context) {
          activeContext = msg.context as ActiveThreatContext;
          GlobalInputInterceptor.setHardLock(activeContext);
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
    }); // <--- Correctly close message listener here

    const triggerLureContext = (
      suspiciousUrl: string,
      keywords: string[],
      offPlatformLure: boolean,
      bannerSubtitle: string,
      rawTextToScan?: string,
      intentType?: string,
      confidence?: number
    ) => {
      const localContext: ActiveThreatContext = {
        sourcePlatform: currentHost,
        scenario: intentType || 'UNKNOWN',
        threatLevel: (confidence && confidence >= 50) ? 'HIGH' : 'LOW',
        targetSuspiciousUrl: suspiciousUrl,
        detectedKeywords: keywords,
        offPlatformLure,
        timestamp: Date.now(),
        ttlMs: 15 * 60 * 1000
      };
      activeContext = localContext;
      
      // If confidence is high (>= 50), we Hard Lock the user from interacting further
      if (confidence && confidence >= 50) {
        GlobalInputInterceptor.setHardLock(localContext);
      }

      SecurityFriction.showContextWarningBanner(localContext, bannerSubtitle, rawTextToScan, intentType, () => {
        GlobalInputInterceptor.setHardLock(null);
        activeContext = null;
      });

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

    ChatChannelMonitor.init(currentHost, (event) => {
      triggerLureContext(
        (event.suspiciousUrls && event.suspiciousUrls[0]) || event.text,
        event.keywords,
        event.isOffPlatformLure,
        event.isOffPlatformLure ? 'Зафіксовано спробу виведення в інший месенджер' : 'Зафіксовано спробу переходу за підозрілим посиланням',
        event.text,
        'UNKNOWN',
        event.confidence
      );
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

    document.addEventListener('copy', async () => {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        const scan = IntentClassifier.classify(selection);
        if (debugMode) {
          DebuggerOverlay.log('Input Text (Copy)', selection, '#9CA3AF');
          if (scan.clustersDetected.length > 0) DebuggerOverlay.log('Clusters', scan.clustersDetected, '#EAB308');
        }
        if (scan.hasFormedIntent) {
          if (debugMode) DebuggerOverlay.log('3. Intent Formed!', scan.intentType, '#EF4444');
          GlobalInputInterceptor.setSoftLock(true);
          ToastNotifier.show('ШІ аналізує скопійований текст...', 'info', 2000);
          
          let hasTimedOut = false;
          const timeoutId = setTimeout(() => {
            hasTimedOut = true;
            GlobalInputInterceptor.setSoftLock(false);
            if (debugMode) DebuggerOverlay.log('4. AI Response (Tier 2)', 'Timeout (Took > 30s)', '#EF4444');
          }, 30000);

          const triggerWord = scan.matchedSpans?.[0]?.text;

          chrome.runtime.sendMessage({ type: 'AI_VERIFY', payload: { text: selection, intentType: scan.intentType, triggerWord } }, (response) => {
            if (hasTimedOut) return;
            clearTimeout(timeoutId);
            GlobalInputInterceptor.setSoftLock(false);
            const aiResult = response?.aiResult;
            if (debugMode) DebuggerOverlay.log('4. AI Response (Tier 2)', aiResult || 'Unavailable (Background)', '#A855F7');
            if (aiResult && !aiResult.isScam) {
              console.log('[ThreatShield:AI] AI відхилив тригер (False Positive):', aiResult.reasoning);
              return;
            }

            const isOffPlatformLure = scan.clustersDetected.includes('off_platform');
            triggerLureContext(
              (scan.suspiciousUrls && scan.suspiciousUrls[0]) || selection,
              scan.matchedSpans.map(s => s.text),
              isOffPlatformLure,
              isOffPlatformLure
                ? 'Зафіксовано виведення в месенджер'
                : 'Зафіксовано копіювання підозрілого посилання'
            );
          });
        }
      }
    });
  },
});







