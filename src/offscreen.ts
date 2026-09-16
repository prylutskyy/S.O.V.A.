import { AILureVerifier } from './heuristics/ai-verifier';
import { ChromeBuiltinAIProvider } from './heuristics/chrome-ai-provider';

console.log('[ThreatShield:Offscreen] Offscreen document started for Gemini Nano API');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'AI_VERIFY') {
    console.log('[ThreatShield:Offscreen] Processing AI_VERIFY task...', message.payload);
    
    const { text, intentType } = message.payload;
    const aiVerifier = new AILureVerifier(new ChromeBuiltinAIProvider());
    
    aiVerifier.verifyIntent(text, intentType).then((aiResult) => {
      console.log('[ThreatShield:Offscreen] AI Result:', aiResult);
      sendResponse({ aiResult });
    }).catch((e) => {
      console.error('[ThreatShield:Offscreen] AI Verification Error:', e);
      sendResponse({ aiResult: null });
    });
    
    return true; // Keep message channel open for async response
  }

  return false;
});
