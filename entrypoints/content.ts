import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
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
import { AIArbiterService } from '../src/ai/ai-arbiter.service';
import { SpaNavigationDetector } from '../src/core/spa-navigation';

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

    const syncDebugMode = (enabled: boolean) => {
      debugMode = enabled;
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
    };

    // Await storage to prevent race condition when restoring context
    try {
      const res = await chrome.storage.local.get(['debugModeEnabled']);
      syncDebugMode(!!res.debugModeEnabled);
    } catch (e) {}

    // Базові менеджери користувацького стану: обов'язковий await,
    // щоб кеш білого списку був заповнений ДО першого сканування форм!
    await Promise.all([
      UserWhitelistManager.init(),
      PersonalVaultManager.init()
    ]).catch((e) => console.error('[ThreatShield] UserWhitelist/PersonalVault init error:', e));

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if ((!areaName || areaName === 'local') && changes.debugModeEnabled) {
        syncDebugMode(!!changes.debugModeEnabled.newValue);
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
          console.log('[SOVA:Content] Сайт додано до білого списку. Знімаємо банери та відновлюємо форми.');
          SecurityFriction.removeHiddenFieldTrapBanner();
          SecurityFriction.removeContextWarningBanner();
          document.querySelectorAll('form').forEach((form) => {
            HiddenFieldInspector.restoreForm(form);
          });
          ProactiveFieldProtector.unsealAll();
        } else {
          console.log('[SOVA:Content] Сайт видалено з білого списку. Запускаємо повторний аудит форм.');
          ProactiveFormScanner.resetScannedForms();
          ProactiveFormScanner.scanCurrentDocument();
          ProactiveFieldProtector.scanAndProtect();
        }
      }
    });

    console.log('[SOVA:Content] Ініціалізація на сайті:', currentHost || 'local file');

    const shouldDisplayContextBanner = (ctx: ActiveThreatContext): boolean => {
      if (UserWhitelistManager.isDomainAllowedSync(currentHost) || isWhitelisted(currentHost)) {
        return false;
      }
      return true;
    };

    const applyContext = (ctx: ActiveThreatContext) => {
      activeContext = ctx;
      GlobalInputInterceptor.setHardLock(ctx);
      console.log('[SOVA:Content] Отримано спадковий контекст загрози:', ctx);

      if (debugMode) {
        if (ctx.sessionId) DebuggerOverlay.setSession(ctx.sessionId, ctx.threatLevel);
        const sessionLabel = ctx.sessionId ? `[${ctx.sessionId}] ` : '';
        DebuggerOverlay.log(
          'Зшивання Сесій (Context)',
          `${sessionLabel}Успадковано загрозу з: ${ctx.sourcePlatform} (+35 штрафних балів до наступних форм)`,
          '#EF4444'
        );
      }

      if (debugMode && shouldDisplayContextBanner(ctx)) {
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
          FormSubmitInterceptor.resetAuditState();
          DebuggerOverlay.setAssessment(0, 'LOW', true);
          DebuggerOverlay.resetSessionRisk();
          SecurityFriction.removeContextWarningBanner();
          if (debugMode) {
            DebuggerOverlay.setSession(null);
            DebuggerOverlay.log('Зшивання Сесій (Context)', 'Контекст очищено', '#22C55E');
          }
        } else if (msg && msg.type === 'SET_DEBUG_MODE') {
          syncDebugMode(!!msg.enabled);
        } else if (msg && msg.type === 'CONTEXT_UPDATED' && (msg.payload || msg.context)) {
          applyContext((msg.payload || msg.context) as ActiveThreatContext);
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
        console.log('[SOVA:Content] Персональний білий список користувача успішно очищено.');
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
        FormSubmitInterceptor.resetAuditState();
        DebuggerOverlay.resetSessionRisk();
        if (debugMode) {
          DebuggerOverlay.log('Зшивання Сесій (Context)', 'Контекст очищено', '#22C55E');
        }
        SecurityFriction.removeContextWarningBanner();
        console.log('[SOVA:Content] Tainted Context Window примусово очищено.');
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

      if (event.data.type === 'THREAT_SHIELD_GET_AI_STATUS') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const resp = await chrome.runtime.sendMessage({ type: 'GET_AI_STATUS' });
            window.postMessage({
              type: 'THREAT_SHIELD_AI_STATUS_RESPONSE',
              requestId: event.data.requestId,
              status: resp,
            }, '*');
          }
        } catch (e) {
          console.error('[SOVA:Content] Failed to get AI status:', e);
        }
      }

      if (event.data.type === 'THREAT_SHIELD_SIMULATE_CHAT_REPLY') {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const resp = await chrome.runtime.sendMessage({
              type: 'SIMULATE_CHAT_REPLY',
              payload: event.data.payload,
            });
            window.postMessage(
              {
                type: 'THREAT_SHIELD_SIMULATED_REPLY_RESULT',
                requestId: event.data.requestId,
                reply: resp?.reply,
                engine: resp?.engine,
                latencyMs: resp?.latencyMs,
                reason: resp?.reason,
              },
              '*'
            );
          }
        } catch (e) {
          console.error('[SOVA:Content] Помилка прокидання SIMULATE_CHAT_REPLY:', e);
        }
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
      const sessionId = activeContext?.sessionId || ('session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
      const requestUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';

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
        DebuggerOverlay.log(
          'Чат: Аналіз Намірів (NLP)',
          `Попередня евристика: ${intentType} (${confidence || 50}%). Запит до ШІ-Арбітра...`,
          '#F59E0B'
        );
      }

      const clearThreat = () => {
        window.postMessage({ type: 'THREAT_SHIELD_CLEAR_CONTEXT' }, '*');
      };

      const displayThreatAlert = (
        context: ActiveThreatContext,
        subtitle: string,
        threatIntent: ScamIntentType,
        threatScore: number
      ) => {
        const isCritical =
          threatIntent === 'MILITARY_SABOTAGE_RECRUITMENT' ||
          threatIntent === 'SEED_PHRASE_THEFT' ||
          threatIntent === 'CRYPTO_WALLET_COMPROMISE';

        if (isCritical) {
          GlobalInputInterceptor.setHardLock(context);
        }

        SecurityFriction.showContextWarningBanner(
          context,
          subtitle,
          rawTextToScan,
          threatIntent,
          () => {
            if (debugMode) {
              DebuggerOverlay.log(
                'Банер безпеки',
                'Сповіщення приховано користувачем (контекст загрози зберігається у фоні)',
                '#6B7280'
              );
            }
          },
          threatScore,
          clearThreat
        );

        try {
          chrome.runtime.sendMessage({
            type: 'LURE_DETECTED',
            payload: {
              sessionId: context.sessionId,
              sourcePlatform: currentHost,
              scenario: context.scenario || threatIntent,
              keywords: context.detectedKeywords || [],
              offPlatformLure: context.offPlatformLure,
              suspiciousUrl: context.targetSuspiciousUrl,
            },
          });
        } catch {}
      };

      // ── TIER 2: АСИНХРОННИЙ АРБІТРАЖ ШТУЧНОГО ІНТЕЛЕКТУ (LLM ARBITER) ──
      AIArbiterService.verify({
        context: localContext,
        rawTextToScan,
        intentType,
        confidence,
      }).then((aiResult) => {
        if (!aiResult) {
          // Якщо ШІ недоступний (offline / відсутній ключ / збій):
          // Застосовуємо евристичний захист лише при високому рівні впевненості (>= 75%)
          if (confidence && confidence >= 75) {
            displayThreatAlert(
              localContext,
              bannerSubtitle,
              intentType as ScamIntentType,
              confidence
            );
          } else {
            // При помірній впевненості не турбуємо користувача банером без підтвердження
            activeContext = null;
          }
          return;
        }

        // Захист від гонитви (Race Condition / SPA Route Switch):
        // Якщо користувач перейшов в інший чат / змінив URL, або контекст було скинуто:
        const currentUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';
        if (requestUrl && currentUrl !== requestUrl) {
          console.log('[SOVA:Content] ШІ-Арбітр відповів, але діалог/роут уже змінено в SPA. Вердикт відхилено.');
          return;
        }
        if (!activeContext) {
          console.log('[SOVA:Content] ШІ-Арбітр відповів, але контекст уже скинуто. Вердикт відхилено.');
          return;
        }

        if (!aiResult.isScam && (aiResult.confidence === undefined || aiResult.confidence >= 50)) {
          // Якщо ШІ переконливо спростував загрозу (False Positive Mitigation):
          console.log('[SOVA:Content] ШІ-Арбітр спростував евристичну загрозу:', aiResult.reasoning);
          activeContext = null;
          GlobalInputInterceptor.setHardLock(null);
          SecurityFriction.removeContextWarningBanner();
          ChatChannelMonitor.reset();
          FormSubmitInterceptor.resetAuditState();

          // 1. Повідомляємо background про повне зняття тривоги з вкладки (скидає badge "!" та статус у popup)
          try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
              chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
            }
          } catch {}

          // 2. Скидаємо індекс ризику R (до 0) та сесію в DebuggerOverlay
          DebuggerOverlay.setAssessment(0, 'LOW', true);
          DebuggerOverlay.resetSessionRisk();
          DebuggerOverlay.setSession(null);

          if (debugMode) {
            DebuggerOverlay.log(
              'ШІ-Арбітр (Вердикт)',
              `Загрозу спростовано [${aiResult.provider || 'ШІ'}: ${aiResult.modelUsed || ''}]: безпечно — ${aiResult.reasoning} (${aiResult.confidence}%)`,
              '#22C55E'
            );
          }

          window.postMessage({ type: 'THREAT_SHIELD_CONTEXT_CLEARED' }, '*');
        } else if (aiResult.isScam) {
          console.log('[SOVA:Content] ШІ-Арбітр підтвердив загрозу:', aiResult);
          if (debugMode) {
            DebuggerOverlay.log(
              'ШІ-Арбітр (Вердикт)',
              `Загрозу підтверджено [${aiResult.provider || 'ШІ'}: ${aiResult.modelUsed || ''}]: ${aiResult.reasoning} (${aiResult.confidence}%)`,
              '#EF4444'
            );
          }

          // Динамічна ескалація або корекція за вердиктом ШІ
          const isMilitarySabotage =
            aiResult.scamType === 'MILITARY_SABOTAGE_RECRUITMENT' ||
            (aiResult.reasoning && /диверс|вербув|тцк|підпал|військов/i.test(aiResult.reasoning));

          if (isMilitarySabotage) {
            localContext.scenario = 'MILITARY_SABOTAGE_RECRUITMENT';
            localContext.threatLevel = 'HIGH';
            displayThreatAlert(
              localContext,
              'ст. 111-2, 113 ККУ (Вербування / Диверсія)',
              'MILITARY_SABOTAGE_RECRUITMENT',
              aiResult.confidence || 95
            );
          } else if (intentType === 'MILITARY_SABOTAGE_RECRUITMENT') {
            // ШІ підтвердив шахрайство, але спростував вербування/диверсію (наприклад, побутовий фінансовий тиск)
            localContext.scenario = 'SUSPICIOUS_LURE';
            localContext.threatLevel = 'HIGH';
            displayThreatAlert(
              localContext,
              aiResult.reasoning || 'Підозра на шахрайство (соціальна інженерія)',
              'SUSPICIOUS_LURE',
              aiResult.confidence || 90
            );
          } else {
            const confirmedScenario = (aiResult.scamType as ScamIntentType) || (intentType !== 'UNKNOWN' ? (intentType as ScamIntentType) : 'SUSPICIOUS_LURE');
            localContext.scenario = confirmedScenario;
            localContext.threatLevel = 'HIGH';
            displayThreatAlert(
              localContext,
              aiResult.reasoning || bannerSubtitle || 'Виявлено ознаки шахрайства',
              confirmedScenario,
              aiResult.confidence || confidence || 90
            );
          }
        }
      }).catch((err) => {
        console.warn('[SOVA:Content] Помилка фонового ШІ-арбітражу:', err);
        if (confidence && confidence >= 75) {
          displayThreatAlert(
            localContext,
            bannerSubtitle,
            intentType as ScamIntentType,
            confidence
          );
        } else {
          activeContext = null;
        }
      });
    };

    // 1. Моніторинг діалогових вікон та чатів
    ChatChannelMonitor.init(currentHost, (event) => {
      let subtitle = 'У повідомленні виявлено підозрілий вміст';
      if (event.intentType === 'MILITARY_SABOTAGE_RECRUITMENT') {
        subtitle = 'ст. 111-2, 113 ККУ (Вербування / Диверсія)';
      } else if (event.intentType === 'SEED_PHRASE_THEFT' || event.intentType === 'CRYPTO_WALLET_COMPROMISE') {
        subtitle = 'Спроба викрадення мнемонічної seed-фрази або криптогаманця';
      } else if (event.intentType === 'ESCROW_DELIVERY_SCAM') {
        subtitle = 'Імітація фінансової угоди або фейкової кур’єрської виплати';
      } else if (event.intentType === 'IDENTITY_PROBING') {
        subtitle = 'Співрозмовник випитує персональні банківські маркери (ІПН / Дівоче прізвище)';
      } else if (event.intentType === 'PAYMENT_CREDENTIAL_THEFT') {
        subtitle = 'Співрозмовник запитує конфіденційні реквізити (CVV / SMS-пароль)';
      } else if (event.isOffPlatformLure || event.intentType === 'OFF_PLATFORM_REDIRECT') {
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

    // 1b. Автоматична ізоляція чатів та семантичних векторів при зміні роуту в SPA (Telegram, OLX, WhatsApp)
    SpaNavigationDetector.init((changeEvent) => {
      console.log('[SOVA:Content] Виявлено зміну роуту/діалогу в SPA:', changeEvent);
      activeContext = null;
      GlobalInputInterceptor.setHardLock(null);
      ChatChannelMonitor.reset();
      FormSubmitInterceptor.resetAuditState();
      DebuggerOverlay.resetSessionRisk();
      SecurityFriction.removeContextWarningBanner();
      
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
        }
      } catch {}

      if (debugMode) {
        DebuggerOverlay.log(
          'SPA: Зміна Діалогу (Ізоляція)',
          `Маршрут змінено (${changeEvent.trigger}): вектори та пам'ять чату обнулено для нового співрозмовника`,
          '#3B82F6'
        );
      }
    });

    // 2. Проактивний сканер прихованих полів (Autofill Phishing Traps)
    ProactiveFormScanner.init(
      {
        onTrapDetected: (scan, form) => {
          console.warn('[SOVA:Content] ⚠️ Виявлено приховані поля у формі (Autofill Phishing)!', scan);
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
          if (UserWhitelistManager.isDomainAllowedSync(domain)) return true;
          if (isMonitoredPlatform(domain)) return false;
          return (
            isAccreditedPaymentGateway(domain) ||
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
      getDebugMode: () => debugMode,
    });

    ClipboardInterceptor.init({
      getDebugMode: () => debugMode,
      onLureDetected: triggerLureContext,
    });

    // 5. Секретна комбінація клавіш для наукового захисту (Thesis Defense: Ctrl + Shift + D)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.code === 'KeyD')) {
        e.preventDefault();
        e.stopPropagation();
        const nextState = !debugMode;
        syncDebugMode(nextState);
        try {
          chrome.storage.local.set({ debugModeEnabled: nextState });
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'SET_DEBUG_MODE', enabled: nextState }).catch(() => {});
          }
        } catch {}
      }
    }, true);
  },
});

