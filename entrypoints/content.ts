import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
  FormSensitiveState,
} from '../src/heuristics/input-detector';
import { IntentClassifier } from '../src/heuristics/intent-classifier';
import { ChatChannelMonitor } from '../src/heuristics/chat-channel';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { PersonalVaultManager } from '../src/core/personal-vault';
import { VaultScanner } from '../src/heuristics/vault-scanner';
import { UrgencyDetector } from '../src/heuristics/urgency-detector';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { ToastNotifier } from '../src/ui/toast-notifier';
import { DebuggerOverlay } from '../src/ui/debugger-overlay';
import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../src/types';
import { GlobalInputInterceptor } from '../src/heuristics/input-interceptor';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    GlobalInputInterceptor.init();
    
    let currentHost = window.location.hostname.toLowerCase();
    if (!currentHost && window.location.protocol === 'file:') {
      const parts = window.location.pathname.split('/');
      currentHost = 'file://' + (parts[parts.length - 1] || 'local-file');
    }

    let debugMode = false;
    let activeContext: ActiveThreatContext | null = null;
    
    // Await storage to prevent race condition when restoring context
    try {
      const res = await chrome.storage.local.get(['debugModeEnabled']);
      debugMode = !!res.debugModeEnabled; 
      ChatChannelMonitor.debugMode = debugMode;
      if (debugMode) DebuggerOverlay.show();
    } catch (e) {}

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.debugModeEnabled) {
        debugMode = changes.debugModeEnabled.newValue;
        ChatChannelMonitor.debugMode = debugMode;
        if (debugMode) {
          DebuggerOverlay.show();
          if (activeContext && activeContext.sessionId) {
            DebuggerOverlay.setSession(activeContext.sessionId, activeContext.threatLevel);
          }
        } else {
          DebuggerOverlay.hide();
        }
      }
    });

    console.log('[ThreatShield:Content] Ініціалізація на сайті:', currentHost || 'local file');

    // Базові менеджери користувацького стану
    UserWhitelistManager.init().catch((e) => console.error('[ThreatShield] UserWhitelist init error:', e));
    PersonalVaultManager.init().catch((e) => console.error('[ThreatShield] PersonalVault init error:', e));

    const shouldDisplayContextBanner = (ctx: ActiveThreatContext): boolean => {
      if (UserWhitelistManager.isDomainAllowedSync(currentHost) || isWhitelisted(currentHost)) {
        return false;
      }
      return true;
    };

    const applyContext = (ctx: ActiveThreatContext) => {
      activeContext = ctx;
      GlobalInputInterceptor.setHardLock(ctx);
      console.log('[ThreatShield:Content] Отримано спадковий контекст загрози:', ctx);

      if (debugMode) {
        if (ctx.sessionId) DebuggerOverlay.setSession(ctx.sessionId, ctx.threatLevel);
        const sessionLabel = ctx.sessionId ? `[${ctx.sessionId}] ` : '';
        DebuggerOverlay.log('🔗 Зшивання Сесій (Context)', `${sessionLabel}Успадковано загрозу з: ${ctx.sourcePlatform} (+35 штрафних балів до наступних форм)`, '#EF4444');
      }

      if (shouldDisplayContextBanner(ctx)) {
        SecurityFriction.showContextWarningBanner(ctx);
      }
    };

    try {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' }).then((response) => {
        if (response && response.context) {
          applyContext(response.context as ActiveThreatContext);
        }
      }).catch(() => {});
    } catch {}

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'CONTEXT_CLEARED') {
          activeContext = null;
          GlobalInputInterceptor.setHardLock(null);
          ChatChannelMonitor.reset();
          SecurityFriction.removeContextWarningBanner();
          if (debugMode) {
            DebuggerOverlay.setSession(null);
            DebuggerOverlay.log('🔗 Зшивання Сесій (Context)', 'Контекст очищено через іншу вкладку', '#22C55E');
          }
        } else if (msg && msg.type === 'CONTEXT_UPDATED' && msg.context) {
          applyContext(msg.context as ActiveThreatContext);
        } else if (msg && msg.type === 'RECEIVE_BROADCAST_LOG' && debugMode) {
          const { stepKey, data, customColor, isAi, aiContext, logId } = msg.payload;
          DebuggerOverlay.log(stepKey, data, customColor, false, isAi, aiContext, logId);
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
        GlobalInputInterceptor.setHardLock(null);
        ChatChannelMonitor.reset();
        if (debugMode) {
          DebuggerOverlay.log('🔗 Зшивання Сесій (Context)', 'Контекст очищено', '#22C55E');
        }
        SecurityFriction.removeContextWarningBanner();
        console.log('[ThreatShield:Content] Tainted Context Window примусово очищено.');
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

      if (event.data.type === 'THREAT_SHIELD_CHECK_AI_STATUS') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const resp = await chrome.runtime.sendMessage({
              type: 'CHECK_AI_STATUS'
            });
            window.postMessage({
              type: 'THREAT_SHIELD_AI_STATUS_RESULT',
              requestId: event.data.requestId,
              status: resp
            }, '*');
          } else {
            window.postMessage({
              type: 'THREAT_SHIELD_AI_STATUS_RESULT',
              requestId: event.data.requestId,
              status: { available: false, error: 'chrome.runtime not available' }
            }, '*');
          }
        } catch (e: any) {
          window.postMessage({
            type: 'THREAT_SHIELD_AI_STATUS_RESULT',
            requestId: event.data.requestId,
            status: { available: false, error: e?.message }
          }, '*');
        }
      }

      if (event.data.type === 'THREAT_SHIELD_SIMULATE_CHAT_REPLY') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const resp = await chrome.runtime.sendMessage({
              type: 'SIMULATE_CHAT_REPLY',
              payload: event.data.payload
            });
            window.postMessage({
              type: 'THREAT_SHIELD_SIMULATED_REPLY_RESULT',
              requestId: event.data.requestId,
              reply: resp?.reply,
              engine: resp?.engine,
              latencyMs: resp?.latencyMs,
              reason: resp?.reason
            }, '*');
          }
        } catch (e) {
          console.error('[ThreatShield:Content] Failed to bridge SIMULATE_CHAT_REPLY:', e);
        }
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
      const sessionId = `#S-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const localContext: ActiveThreatContext = {
        sessionId,
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
      
      if (debugMode) {
        DebuggerOverlay.setSession(sessionId, localContext.threatLevel);
      }
      
      // If confidence is high (>= 50), we Hard Lock the user from interacting further
      if (confidence && confidence >= 50) {
        GlobalInputInterceptor.setHardLock(localContext);
      }

      SecurityFriction.showContextWarningBanner(localContext, bannerSubtitle, rawTextToScan, intentType, () => {
        // AI Verification successful -> clear the context completely
        window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      });

      try {
        chrome.runtime.sendMessage({
          type: 'LURE_DETECTED',
          payload: {
            sessionId,
            sourcePlatform: currentHost,
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
        event.isOffPlatformLure ? 'У повідомленні виявлено перенаправлення на інший месенджер' : 'У повідомленні виявлено підозріле посилання',
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
          severity: 'MEDIUM',
          scoreContribution: 40,
          message: 'У формі знайдено номер банківської картки!',
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
          hasFilledSensitive: formState.hasFilledCvv || formState.hasFilledPassword || (vaultScan && vaultScan.matches.length > 0),
          isEntirelyEmpty: formState.isEntirelyEmpty,
        },
        contextBonus
      );

      if (activeContext) {
        assessment.contextActive = true;
      }

      if (debugMode) {
        DebuggerOverlay.log('Форма: Оцінка Ризику', `${assessment.score} балів (Рівень: ${assessment.level})`, assessment.score >= 50 ? '#EF4444' : '#F59E0B');
        if (assessment.triggers.length > 0) {
          DebuggerOverlay.log('Форма: Спрацьовані Тригери', assessment.triggers.map(t => `${t.name} (+${t.scoreContribution})`), '#F59E0B');
        } else {
          DebuggerOverlay.log('Форма: Спрацьовані Тригери', 'Немає тригерів', '#22C55E');
        }
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
            // Синтетичні події не працюють в SPA (React), тому просто даємо дозвіл і просимо повторити дію.
            inputElement.dataset.threatShieldApproved = 'true';
            ToastNotifier.show('Блокування знято. Натисніть Відправити або Enter ще раз.', 'info', 4000);
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
        UserWhitelistManager.isDomainAllowedSync(targetHost)
      );
    };

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement;
        const submitBtn = target.closest('button[type="submit"], input[type="submit"], [role="button"], button') as HTMLElement;
        
        if (submitBtn) {
          const form = submitBtn.closest('form');
          if (form) {
            if (isFormWhitelisted(form)) return;
            if (form.dataset.threatShieldApproved === 'true') return;

            const { assessment, formState, targetHost } = evaluateFormThreat(form);
            if (shouldBlock(assessment, formState, targetHost)) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              SecurityFriction.apply(form, assessment, submitBtn, undefined, activeContext);
            }
          } else {
            // Chat Send button check
            const container = submitBtn.closest('[data-testid="conversation-layout"], .chat, .messenger');
            if (container) {
              const input = container.querySelector(ACTIVE_INPUTS_SELECTOR) as HTMLInputElement | HTMLTextAreaElement;
              if (input && input.value) {
                interceptChatSend(input, event, false);
              }
            }
          }
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        const target = event.target as HTMLElement;
        if (event.key === 'Enter' && !event.shiftKey) {
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('role') === 'textbox') {
            const input = target as HTMLInputElement | HTMLTextAreaElement;
            const form = input.closest('form');
            if (form) {
              if (isFormWhitelisted(form)) return;
              if (form.dataset.threatShieldApproved === 'true') return;
              const { assessment, formState, targetHost } = evaluateFormThreat(form);
              if (shouldBlock(assessment, formState, targetHost)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                SecurityFriction.apply(form, assessment, undefined, undefined, activeContext);
              }
            } else {
              interceptChatSend(input, event, false);
            }
          }
        }
      },
      true
    );

    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement;
        if (isFormWhitelisted(form)) return;
        if (form.dataset.threatShieldApproved === 'true') return;

        const { assessment, formState, targetHost } = evaluateFormThreat(form);
        if (shouldBlock(assessment, formState, targetHost)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          SecurityFriction.apply(form, assessment, undefined, undefined, activeContext);
        }
      },
      true
    );

    document.addEventListener('copy', async () => {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        const scan = IntentClassifier.classify(selection);
        if (debugMode) {
          DebuggerOverlay.log('Буфер Обміну (Copy)', selection, '#9CA3AF');
          if (scan.clustersDetected.length > 0) {
            DebuggerOverlay.log('Копіювання: Кластери', scan.clustersDetected, '#EAB308');
          }
          if (scan.matchedSpans && scan.matchedSpans.length > 0) {
            DebuggerOverlay.log('Копіювання: Тригерні Слова', scan.matchedSpans.map(s => s.text), '#F59E0B');
          }
          if (scan.hasFormedIntent) {
            DebuggerOverlay.log('Копіювання: Класифікація', scan.intentType, '#EF4444');
          } else {
            DebuggerOverlay.log('Копіювання: Класифікація', 'Безпечно', '#22C55E');
          }
        }

        if (scan.hasFormedIntent) {
          const isOffPlatformLure = scan.clustersDetected.includes('off_platform');
          triggerLureContext(
            (scan.suspiciousUrls && scan.suspiciousUrls[0]) || selection,
            scan.matchedSpans.map(s => s.text),
            isOffPlatformLure,
            isOffPlatformLure
              ? 'Виявлено спробу переходу в сторонній месенджер'
              : 'У скопійованому тексті виявлено підозріле посилання',
            selection,
            scan.intentType,
            scan.confidence || 75
          );
        }
      }
    });
  },
});







