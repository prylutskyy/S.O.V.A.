export default defineBackground(() => {
  console.log('[ThreatShield] Background Service Worker ініціалізовано');

  // Слухач повідомлень від Content Scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'THREAT_DETECTED') {
      console.warn('[ThreatShield] Отримано сигнал загрози від сторінки:', sender.tab?.url, message.payload);
      sendResponse({ status: 'ACKNOWLEDGED' });
    }
    return true;
  });
});
