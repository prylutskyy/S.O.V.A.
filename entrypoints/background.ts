import { contextManager } from '../src/core/context-manager';
import { isWhitelisted } from '../src/core/whitelist';

export default defineBackground(() => {
  console.log('[ThreatShield:Background] Service Worker активовано');

  // Слухач повідомлень від Content Scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    if (message.type === 'LURE_DETECTED') {
      if (!tabId) {
        sendResponse({ success: false });
        return false;
      }
      
      const { sourcePlatform, keywords, offPlatformLure, suspiciousUrl } = message.payload;
      console.warn(`[ThreatShield:Background] Отримано сигнал небезпеки на вкладці ${tabId}:`, message.payload);

      contextManager.setTaintedContext(tabId, {
        sourcePlatform: sourcePlatform || (sender.tab?.url ? new URL(sender.tab.url).hostname : 'unknown'),
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'HIGH',
        detectedKeywords: keywords,
        offPlatformLure,
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
      contextManager.clearTaintedContext(tabId).then(() => {
        if (chrome.action) {
          chrome.action.setBadgeText({ text: '', tabId });
        }
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'THREAT_DETECTED') {
      console.warn(`[ThreatShield:Background] Критична дія заблокована на вкладці ${tabId}:`, sender.tab?.url);
      if (chrome.action && tabId) {
        chrome.action.setBadgeText({ text: 'ERR', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId });
      }
      sendResponse({ status: 'ACKNOWLEDGED' });
      return true;
    }

    return false;
  });

  // Автоматична перевірка при зміні вкладок
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
