import { ContextManager } from '../src/core/context-manager';
import { isWhitelisted } from '../src/core/whitelist';

export default defineBackground(() => {
  console.log('[ThreatShield:Background] Service Worker активовано');

  // Слухач повідомлень від Content Scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LURE_DETECTED') {
      const { sourcePlatform, keywords, offPlatformLure, suspiciousUrl } = message.payload;

      console.warn('[ThreatShield:Background] Зафіксовано спробу виведення / соцінженерії:', message.payload);

      ContextManager.setTaintedContext({
        sourcePlatform: sourcePlatform || (sender.tab?.url ? new URL(sender.tab.url).hostname : 'unknown'),
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'HIGH',
        detectedKeywords: keywords,
        offPlatformLure,
        targetSuspiciousUrl: suspiciousUrl,
      }).then((ctx) => {
        // Оновлюємо бейдж розширення
        if (chrome.action) {
          chrome.action.setBadgeText({ text: '!' });
          chrome.action.setBadgeBackgroundColor({ color: '#ea580c' });
        }
        sendResponse({ status: 'CONTEXT_RECORDED', context: ctx });
      });

      return true; // Асинхронна відповідь
    }

    if (message.type === 'GET_ACTIVE_CONTEXT') {
      ContextManager.getActiveTaintedContext().then((ctx) => {
        sendResponse({ context: ctx });
      });
      return true;
    }

    if (message.type === 'CLEAR_CONTEXT') {
      ContextManager.clearTaintedContext().then(() => {
        if (chrome.action) {
          chrome.action.setBadgeText({ text: '' });
        }
        sendResponse({ status: 'CLEARED' });
      });
      return true;
    }

    if (message.type === 'THREAT_DETECTED') {
      console.warn('[ThreatShield:Background] Критична дія заблокована на вкладці:', sender.tab?.url);
      if (chrome.action) {
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      }
      sendResponse({ status: 'ACKNOWLEDGED' });
      return true;
    }

    return false;
  });

  // Відстеження відкриття нових вкладок або оновлення URL
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol.startsWith('http')) {
          const activeContext = await ContextManager.getActiveTaintedContext();
          if (activeContext && !isWhitelisted(url.hostname)) {
            console.warn(
              `[ThreatShield:Background] Виявлено відвідування невідомого домену (${url.hostname}) під час активного вікна загрози! Платформа-джерело: ${activeContext.sourcePlatform}`
            );
          }
        }
      } catch {
        // Ігноруємо службові вкладки
      }
    }
  });
});
