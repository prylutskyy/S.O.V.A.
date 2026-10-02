import { contextManager } from '../src/core/context-manager';
import { isWhitelisted } from '../src/core/whitelist';
import { AILureVerifier } from '../src/heuristics/ai-verifier';
import { ChromeBuiltinAIProvider } from '../src/heuristics/chrome-ai-provider';
import { CloudLLMDispatcher } from '../src/ai/cloud/cloud-llm-dispatcher';

export default defineBackground(() => {
  console.log('[SOVA:Background] Service Worker активовано');

  chrome.runtime.onInstalled.addListener(() => {
    // Allow content scripts to read/write to session storage
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(console.error);
    }
  });

  // Слухач повідомлень від Content Scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id || message.tabId;

    if (message.type === 'LURE_DETECTED') {
      if (!tabId) {
        sendResponse({ success: false });
        return false;
      }
      
      const { sessionId, sourcePlatform, keywords, offPlatformLure, suspiciousUrl } = message.payload;
      console.warn(`[SOVA:Background] Отримано сигнал небезпеки на вкладці ${tabId}:`, message.payload);

      contextManager.setTaintedContext(tabId, {
        sessionId,
        sourcePlatform: sourcePlatform || (sender.tab?.url ? new URL(sender.tab.url).hostname : 'unknown'),
        scenario: 'UNKNOWN',
        threatLevel: 'HIGH',
        detectedKeywords: keywords || [],
        offPlatformLure: !!offPlatformLure,
        targetSuspiciousUrl: suspiciousUrl,
      }).then((ctx) => {
        if (chrome.action) {
          chrome.action.setBadgeText({ text: '!', tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#ea580c', tabId });
        }
        chrome.tabs.sendMessage(tabId, { type: 'CONTEXT_UPDATED', payload: ctx }).catch(() => {});
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async
    }

    if (message.type === 'GET_ACTIVE_CONTEXT') {
      if (!tabId) {
        sendResponse({ context: null });
        return false;
      }
      contextManager.getActiveTaintedContext(tabId).then((ctx) => {
        sendResponse({ context: ctx });
      });
      return true;
    }

    if (message.type === 'CLEAR_CONTEXT') {
      if (!tabId) {
        sendResponse({ success: false });
        return false;
      }
      
      contextManager.getActiveTaintedContext(tabId).then(async (ctx) => {
        if (ctx && ctx.sessionId) {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (tab.id) {
              const tabCtx = await contextManager.getActiveTaintedContext(tab.id);
              if (tabCtx && tabCtx.sessionId === ctx.sessionId) {
                await contextManager.clearTaintedContext(tab.id);
                if (chrome.action) chrome.action.setBadgeText({ text: '', tabId: tab.id });
                chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_CLEARED' }).catch(() => {});
              }
            }
          }
        } else {
          await contextManager.clearTaintedContext(tabId);
          if (chrome.action) chrome.action.setBadgeText({ text: '', tabId });
          chrome.tabs.sendMessage(tabId, { type: 'CONTEXT_CLEARED' }).catch(() => {});
        }
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'BROADCAST_LOG') {
      const { sessionId, stepKey, data, customColor } = message.payload;
      chrome.tabs.query({}).then(async (tabs) => {
        for (const tab of tabs) {
          if (tab.id && tab.id !== tabId) {
            const tabCtx = await contextManager.getActiveTaintedContext(tab.id);
            if (tabCtx && tabCtx.sessionId === sessionId) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'RECEIVE_BROADCAST_LOG',
                payload: { stepKey: `${stepKey} (Вкладка ${tabId})`, data, customColor }
              }).catch(() => {});
            }
          }
        }
      });
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'THREAT_DETECTED') {
      console.warn(`[SOVA:Background] Загроза при заповненні на вкладці ${tabId}:`, sender.tab?.url);
      if (chrome.action && tabId) {
        chrome.action.setBadgeText({ text: 'ERR', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId });
      }
      sendResponse({ status: 'ACKNOWLEDGED' });
      return true;
    }

    if (message.type === 'AI_VERIFY') {
      const { text, intentType, triggerWord, heuristicContext, sanitizedPrompt } = message.payload;
      
      (async () => {
        // 1. Перевірка, чи налаштовано та увімкнено хмарний ШІ (Gemini / Groq / OpenAI)
        try {
          if (await CloudLLMDispatcher.isConfigured()) {
            const promptToSend = sanitizedPrompt || text;
            const cloudRes = await CloudLLMDispatcher.verifyThreat(promptToSend);
            if (cloudRes) {
              sendResponse({
                aiResult: {
                  isScam: cloudRes.isScam,
                  confidence: cloudRes.confidence,
                  scamType: cloudRes.scamType,
                  reasoning: cloudRes.reasoning,
                  rawResponse: cloudRes.rawResponse,
                  provider: cloudRes.provider,
                  modelUsed: cloudRes.modelUsed,
                  latencyMs: cloudRes.latencyMs,
                },
              });
              return;
            }
          }
        } catch (e) {
          console.warn('[SOVA:Background] Cloud LLM verification failed, falling back to local LLM:', e);
        }

        // 2. Фолбек на локальний LLM через Offscreen Document
        setupOffscreenDocument('offscreen.html').then(() => {
          const attemptSend = (retries: number) => {
            chrome.runtime.sendMessage({
              target: 'offscreen',
              type: 'AI_VERIFY',
              payload: { text, intentType, triggerWord, heuristicContext }
            }, (response) => {
              if (chrome.runtime.lastError) {
                if (retries > 0) {
                  console.warn(`[SOVA:Background] Offscreen not ready yet, retrying... (${retries} left)`);
                  setTimeout(() => attemptSend(retries - 1), 200);
                } else {
                  console.error('[SOVA:Background] Offscreen failed to receive message:', chrome.runtime.lastError.message);
                  sendResponse({ aiResult: null });
                }
                return;
              }
              sendResponse(response);
            });
          };
          attemptSend(10); // Retry up to 10 times (2 seconds total)
        }).catch(e => {
          console.error('[SOVA:Background] Failed to setup offscreen doc:', e);
          sendResponse({ aiResult: null });
        });
      })();

      return true; // Keep channel open for async
    }

    if (message.type === 'ABORT_AI') {
      console.log('[SOVA:Background] Forwarding ABORT_AI to offscreen...');
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'ABORT_AI' }).catch(() => {});
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'CHECK_AI_STATUS') {
      setupOffscreenDocument('offscreen.html').then(() => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'CHECK_AI_STATUS'
        }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ available: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      }).catch((err) => {
        sendResponse({ available: false, error: err?.message || 'Failed to setup offscreen' });
      });
      return true;
    }

    if (message.type === 'SIMULATE_CHAT_REPLY') {
      (async () => {
        const { persona, history, latestUserMessage, itemContext, customGoal } = message.payload || {};

        // 1. Пріоритет: Хмарна LLM (Gemini 2.5 Flash, Groq, OpenAI), якщо налаштовано та увімкнено
        try {
          const isCloud = await CloudLLMDispatcher.isConfigured();
          if (isCloud) {
            console.log('[SOVA:Background] Запит генерації репліки симулятора через Cloud LLM...');
            const cloudResult = await CloudLLMDispatcher.generateChatReply(
              persona,
              history || [],
              latestUserMessage,
              itemContext,
              customGoal
            );
            if (cloudResult && cloudResult.reply) {
              console.log('[SOVA:Background] Cloud LLM згенерував відповідь:', cloudResult);
              sendResponse({
                reply: cloudResult.reply,
                engine: cloudResult.engine,
                latencyMs: cloudResult.latencyMs,
              });
              return;
            }
          }
        } catch (err) {
          console.warn('[SOVA:Background] Cloud LLM simulation failed, falling back to local/rules:', err);
        }

        // 2. Фолбек на Offscreen Document (Локальна LLM або правила)
        setupOffscreenDocument('offscreen.html').then(() => {
          const attemptSend = (retries: number) => {
            chrome.runtime.sendMessage({
              target: 'offscreen',
              type: 'SIMULATE_CHAT_REPLY',
              payload: message.payload
            }, (response) => {
              if (chrome.runtime.lastError) {
                if (retries > 0) {
                  setTimeout(() => attemptSend(retries - 1), 200);
                } else {
                  console.error('[SOVA:Background] Offscreen failed to receive SIMULATE_CHAT_REPLY:', chrome.runtime.lastError.message);
                  sendResponse({ reply: 'Доброго дня! Чим можу допомогти?', engine: 'error-fallback' });
                }
                return;
              }
              sendResponse(response);
            });
          };
          attemptSend(10);
        }).catch(e => {
          console.error('[SOVA:Background] Failed to setup offscreen for simulation:', e);
          sendResponse({ reply: 'Доброго дня!', engine: 'error-fallback' });
        });
      })();
      return true;
    }

    if (message.type === 'GET_AI_STATUS') {
      (async () => {
        try {
          const config = await SecureKeyStore.getConfig();
          const key = await SecureKeyStore.getApiKey(config.provider);
          sendResponse({
            cloudEnabled: config.enabled,
            cloudProvider: config.provider,
            cloudModel: config.model,
            hasKey: !!key,
          });
        } catch (err: any) {
          sendResponse({
            cloudEnabled: false,
            error: err?.message,
          });
        }
      })();
      return true;
    }

    if (message.type === 'TEST_CLOUD_AI') {
      (async () => {
        try {
          const { provider, apiKey, model } = message.payload || {};
          const result = await CloudLLMDispatcher.testConnection(provider, apiKey, model);
          sendResponse(result);
        } catch (err: any) {
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      })();
      return true;
    }

    if (message.type === 'FETCH_CLOUD_MODELS') {
      (async () => {
        try {
          const { provider, apiKey } = message.payload || {};
          const result = await CloudLLMDispatcher.fetchModels(provider, apiKey);
          sendResponse(result);
        } catch (err: any) {
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      })();
      return true;
    }

    return false;
  });

  // Helper to ensure offscreen document exists
  let creatingOffscreen: Promise<void> | null = null;
  async function setupOffscreenDocument(path: string) {
    if (await chrome.offscreen.hasDocument()) return;
    
    if (creatingOffscreen) {
      await creatingOffscreen;
      return;
    }

    creatingOffscreen = chrome.offscreen.createDocument({
      url: path,
      reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
      justification: 'Accessing DOM-bound local LLM Prompt API',
    });
    
    try {
      await creatingOffscreen;
    } finally {
      creatingOffscreen = null;
    }
  }

  // Обробка оновлення URL для білих списківри зміні вкладок
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol.startsWith('http')) {
          const domain = url.hostname.replace(/^www\./, '');
          if (isWhitelisted(domain)) {
            return;
          }

          const activeContext = await contextManager.getActiveTaintedContext(tabId);
          if (activeContext) {
            console.log(`[ThreatShield] Відвідування ${domain} під час активного Tainted Context на вкладці ${tabId}!`);
            if (chrome.action) {
              chrome.action.setBadgeText({ text: '!', tabId });
              chrome.action.setBadgeBackgroundColor({ color: '#ea580c', tabId });
            }
          }
        }
      } catch {}
    }
  });

  // Tab Lineage: поширюємо контекст на нові вкладки, відкриті з фішингової
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.id && tab.openerTabId) {
      await contextManager.propagateContext(tab.openerTabId, tab.id);
    }
  });
});

