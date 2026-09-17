import { AILureVerifier } from './heuristics/ai-verifier';
import { ChromeBuiltinAIProvider } from './heuristics/chrome-ai-provider';
import { ChatSimulatorEngine } from './heuristics/chat-simulator';

console.log('[ThreatShield:Offscreen] Offscreen document started for Gemini Nano API');

let currentAbortController: AbortController | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'ABORT_AI') {
    if (currentAbortController) {
      console.warn('[ThreatShield:Offscreen] Aborting AI verification...');
      currentAbortController.abort();
      currentAbortController = null;
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'AI_VERIFY') {
    console.log('[ThreatShield:Offscreen] Processing AI_VERIFY task...', message.payload);
    
    // Cancel any ongoing request before starting a new one
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    
    const { text, intentType, triggerWord, heuristicContext } = message.payload;
    const aiVerifier = new AILureVerifier(new ChromeBuiltinAIProvider(currentAbortController.signal));
    
    aiVerifier.verifyIntent(text, intentType, triggerWord, heuristicContext).then((aiResult) => {
      console.log('[ThreatShield:Offscreen] AI Result:', aiResult);
      if (currentAbortController?.signal.aborted) return;
      currentAbortController = null;
      sendResponse({ aiResult });
    }).catch((e) => {
      if (e.name === 'AbortError' || currentAbortController?.signal.aborted) {
        console.warn('[ThreatShield:Offscreen] AI Verification Aborted!');
      } else {
        console.error('[ThreatShield:Offscreen] AI Verification Error:', e);
      }
      currentAbortController = null;
      sendResponse({ aiResult: null });
    });
    return true;
  }
    
  if (message.type === 'SIMULATE_CHAT_REPLY') {
    const { persona, history, latestUserMessage, itemContext, customGoal } = message.payload || {};
    
    const hasWindowAi = typeof (window as any).ai !== 'undefined' && typeof (window as any).ai.languageModel !== 'undefined';
    
    if (hasWindowAi) {
      (async () => {
        try {
          const systemPrompt = ChatSimulatorEngine.buildSystemPrompt(persona, itemContext, customGoal);
          const fullPrompt = ChatSimulatorEngine.buildPromptWithHistory(persona, history || [], latestUserMessage, itemContext, customGoal);
          
          const session = await (window as any).ai.languageModel.create({
            systemPrompt
          });
          
          let reply = await session.prompt(fullPrompt);
          reply = reply.replace(/^\[(?:Співрозмовник|Покупець|Шахрай)\]:\s*/i, '').replace(/^["']|["']$/g, '').trim();
          sendResponse({ reply, engine: 'gemini-nano' });
        } catch (err) {
          console.warn('[ThreatShield:Offscreen] Gemini Nano simulation failed, falling back to rule engine:', err);
          const reply = ChatSimulatorEngine.generateFallbackReply(persona, history || [], latestUserMessage);
          sendResponse({ reply, engine: 'fallback-rules' });
        }
      })();
      return true;
    } else {
      const reply = ChatSimulatorEngine.generateFallbackReply(persona, history || [], latestUserMessage);
      sendResponse({ reply, engine: 'fallback-rules' });
      return true;
    }
  }

  return false;
});
