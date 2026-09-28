import { isWhitelisted } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { PersonalVaultManager } from '../src/core/personal-vault';
import { SecurityFriction } from '../src/ui/friction';
import { DebuggerOverlay } from '../src/ui/debugger-overlay';
import { ActiveThreatContext } from '../src/types';
import { GlobalInputInterceptor } from '../src/heuristics/input-interceptor';
import { ChatChannelMonitor } from '../src/heuristics/chat-channel';
import { ProactiveFormScanner, HiddenFieldInspector } from '../src/heuristics/hidden-field-inspector';
import { FormAnalysisPipeline } from '../src/detectors/form-analysis-pipeline';
import { FormSubmitInterceptor } from '../src/interceptors/form-submit.interceptor';
import { ChatSubmitInterceptor } from '../src/interceptors/chat-submit.interceptor';
import { ClipboardInterceptor } from '../src/interceptors/clipboard.interceptor';
import { ProactiveFieldProtector } from '../src/heuristics/proactive-field-protector';

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
    const formPipeline = new FormAnalysisPipeline();

    // Await storage to prevent race condition when restoring context
    try {
      const res = await chrome.storage.local.get(['debugModeEnabled']);
      debugMode = !!res.debugModeEnabled;
      ChatChannelMonitor.debugMode = debugMode;
      if (debugMode) DebuggerOverlay.show();
    } catch (e) {}

    // Базові менеджери користувацького стану: обов'язковий await,
    // щоб кеш білого списку був заповнений ДО першого сканування форм!
    await Promise.all([
      UserWhitelistManager.init(),
      PersonalVaultManager.init()
    ]).catch((e) => console.error('[ThreatShield] UserWhitelist/PersonalVault init error:', e));

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.debugModeEnabled) {
        debugMode = changes.debugModeEnabled.newValue;
        ChatChannelMonitor.debugMode = debugMode;
        if (debugMode) {
          DebuggerOverlay.show();
          if (activeContext && activeContext.sessionId) {
            DebuggerOverlay.setSession(activeContext.sessionId, activeContext.threatLevel);
          }
          const primaryForm = document.querySelector('form');
          if (primaryForm) {
            FormSubmitInterceptor.auditForm(primaryForm, true);
          }
        } else {
          DebuggerOverlay.hide();
        }
      }

      if (changes.threat_shield_user_whitelist) {
        const newList: string[] = changes.threat_shield_user_whitelist.newValue || [];
        const cleanHost = UserWhitelistManager.normalizeDomain(currentHost);
        const isAllowedNow =
          newList.some((d) => {
            const norm = UserWhitelistManager.normalizeDomain(d);
            return cleanHost === norm || cleanHost.endsWith(`.${norm}`);
          }) || isWhitelisted(currentHost);

        if (isAllowedNow) {
          console.log('[ThreatShield:Content] Сайт додано до білого списку. Знімаємо банери та відновлюємо форми.');
          SecurityFriction.removeHiddenFieldTrapBanner();
          SecurityFriction.removeContextWarningBanner();
          document.querySelectorAll('form').forEach((form) => {
            HiddenFieldInspector.restoreForm(form);
          });
          ProactiveFieldProtector.unsealAll();
        } else {
          console.log('[ThreatShield:Content] Сайт видалено з білого списку. Запускаємо повторний аудит форм.');
          ProactiveFormScanner.resetScannedForms();
          ProactiveFormScanner.scanCurrentDocument();
          ProactiveFieldProtector.scanAndProtect();
        }
      }
    });

    console.log('[ThreatShield:Content] Ініціалізація на сайті:', currentHost || 'local file');

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
        DebuggerOverlay.log(
          'Зшивання Сесій (Context)',
          `${sessionLabel}Успадковано загрозу з: ${ctx.sourcePlatform} (+35 штрафних балів до наступних форм)`,
          '#EF4444'
        );
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
            DebuggerOverlay.log('Зшивання Сесій (Context)', 'Контекст очищено через іншу вкладку', '#22C55E');
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
          DebuggerOverlay.log('Зшивання Сесій (Context)', 'Контекст очищено', '#22C55E');
        }
        SecurityFriction.removeContextWarningBanner();
        console.log('[ThreatShield:Content] Tainted Context Window примусово очищено.');
        window.postMessage({ type: 'THREAT_SHIELD_CONTEXT_CLEARED' }, '*');
      }

      if (event.data.type === 'THREAT_SHIELD_TRIGGER_LURE') {
        triggerLureContext(
          event.data.suspiciousUrl || event.data.text || '',
          event.data.keywords || ['olx доставка', 'отримати кошти'],
          true,
          'Спроба переведення в сторонній месенджер',
          event.data.text || '',
          'UNKNOWN',
          85
        );
      }
    });

    const triggerLureContext = (
      suspiciousUrl: string,
      keywords: string[],
      offPlatformLure: boolean,
      bannerSubtitle: string,
      rawTextToScan?: string,
      intentType: string = 'UNKNOWN',
      confidence?: number
    ) => {
      const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const localContext: ActiveThreatContext = {
        sessionId,
        sourcePlatform: currentHost,
        scenario: intentType !== 'UNKNOWN' ? intentType : 'UNKNOWN',
        threatLevel: 'HIGH',
        detectedKeywords: keywords,
        offPlatformLure,
        timestamp: Date.now(),
        ttlMs: 15 * 60 * 1000,
        targetSuspiciousUrl: suspiciousUrl,
      };

      activeContext = localContext;

      if (debugMode) {
        DebuggerOverlay.setSession(sessionId, 'HIGH');
        DebuggerOverlay.log('Чат: Аналіз Намірів (NLP)', `Виявлено: ${intentType}`, '#EF4444');
      }

      if (confidence && confidence >= 50) {
        GlobalInputInterceptor.setHardLock(localContext);
      }

      SecurityFriction.showContextWarningBanner(localContext, bannerSubtitle, rawTextToScan, intentType, () => {
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

    // 1. Моніторинг діалогових вікон та чатів
    ChatChannelMonitor.init(currentHost, (event) => {
      let subtitle = 'У повідомленні виявлено підозрілий вміст';
      if (event.intentType === 'IDENTITY_PROBING') {
        subtitle = 'Співрозмовник випитує персональні банківські маркери (ІПН / Дівоче прізвище)';
      } else if (event.intentType === 'PAYMENT_CREDENTIAL_THEFT') {
        subtitle = 'Співрозмовник запитує конфіденційні реквізити (CVV / SMS-пароль)';
      } else if (event.isOffPlatformLure) {
        subtitle = 'У повідомленні виявлено перенаправлення на інший месенджер';
      } else if (event.suspiciousUrls && event.suspiciousUrls.length > 0) {
        subtitle = 'У повідомленні виявлено підозріле посилання';
      }

      triggerLureContext(
        (event.suspiciousUrls && event.suspiciousUrls[0]) || event.text,
        event.keywords,
        event.isOffPlatformLure,
        subtitle,
        event.text,
        event.intentType || 'UNKNOWN',
        event.confidence
      );
    });

    // 2. Проактивний сканер прихованих полів (Autofill Phishing Traps)
    ProactiveFormScanner.init(
      {
        onTrapDetected: (scan, form) => {
          console.warn('[ThreatShield:Content] ⚠️ Виявлено приховані поля у формі (Autofill Phishing)!', scan);
          SecurityFriction.showHiddenFieldTrapBanner(scan, form);
          if (debugMode) {
            DebuggerOverlay.log(
              'Форма: Приховані Поля (Trap)',
              `Виявлено та деактивовано ${scan.flaggedInputs.length} прихованих полів (${scan.flaggedTypes.join(', ')}). Техніка: ${scan.flaggedInputs.map((i) => i.cloakingReason).join('; ')}`,
              '#EF4444'
            );
          }
        },
        isDomainAllowed: (domain) => {
          if (!domain) return false;
          return (
            isAccreditedPaymentGateway(domain) ||
            UserWhitelistManager.isDomainAllowedSync(domain) ||
            isWhitelisted(domain)
          );
        },
      },
      currentHost
    );

    // 3. Проактивний захист чутливих полів (Sanctuary Sealed Apertures)
    ProactiveFieldProtector.init(currentHost);

    // 4. Модульні перехоплювачі форм, чатів та буфера обміну
    FormSubmitInterceptor.init({
      pipeline: formPipeline,
      getCurrentHost: () => currentHost,
      getActiveContext: () => activeContext,
      getDebugMode: () => debugMode,
    });

    if (debugMode) {
      const primaryForm = document.querySelector('form');
      if (primaryForm) {
        FormSubmitInterceptor.auditForm(primaryForm, true);
      }
    }

    ChatSubmitInterceptor.init({
      getActiveContext: () => activeContext,
    });

    ClipboardInterceptor.init({
      getDebugMode: () => debugMode,
      onLureDetected: triggerLureContext,
    });
  },
});
