import { AILureVerifier } from './heuristics/ai-verifier';
import { ChromeBuiltinAIProvider, getChromeAiLanguageModel, isGeminiAiAvailable, createAiSession } from './heuristics/chrome-ai-provider';
import { ChatSimulatorEngine } from './heuristics/chat-simulator';
import { getTransformersPipeline } from './heuristics/neural-embeddings';

console.log('[SOVA:Offscreen] Offscreen document started for Gemini Nano API');

let currentAbortController: AbortController | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'ABORT_AI') {
    if (currentAbortController) {
      console.warn('[SOVA:Offscreen] Aborting AI verification...');
      currentAbortController.abort();
      currentAbortController = null;
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CHECK_AI_STATUS') {
    (async () => {
      try {
        const provider = getChromeAiLanguageModel();
        const { available, status } = await isGeminiAiAvailable();
        sendResponse({
          available,
          status,
          hasProvider: !!provider,
          context: 'offscreen'
        });
      } catch (err: any) {
        sendResponse({ available: false, status: 'error', error: err?.message });
      }
    })();
    return true;
  }

  if (message.type === 'AI_VERIFY') {
    console.log('[SOVA:Offscreen] Processing AI_VERIFY task...', message.payload);
    
    // Cancel any ongoing request before starting a new one
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    
    const { text, intentType, triggerWord, heuristicContext } = message.payload;
    const aiVerifier = new AILureVerifier(new ChromeBuiltinAIProvider(currentAbortController.signal));
    
    aiVerifier.verifyIntent(text, intentType, triggerWord, heuristicContext).then((aiResult) => {
      console.log('[SOVA:Offscreen] AI Result:', aiResult);
      if (currentAbortController?.signal.aborted) return;
      currentAbortController = null;
      sendResponse({ aiResult });
    }).catch((e) => {
      if (e.name === 'AbortError' || currentAbortController?.signal.aborted) {
        console.warn('[SOVA:Offscreen] AI Verification Aborted!');
      } else {
        console.error('[SOVA:Offscreen] AI Verification Error:', e);
      }
      currentAbortController = null;
      sendResponse({ aiResult: null });
    });
    return true;
  }
    
  if (message.type === 'SIMULATE_CHAT_REPLY') {
    const { persona, history, latestUserMessage, itemContext, customGoal } = message.payload || {};
    
    (async () => {
      const startTime = performance.now();
      try {
        const status = await isGeminiAiAvailable();
        console.log('[SOVA:Offscreen] Gemini Nano availability check:', status);
        
        if (!status.available) {
          console.warn('[SOVA:Offscreen] Gemini Nano unavailable, generating fallback reply. Status:', status.status);
          const reply = ChatSimulatorEngine.generateFallbackReply(persona, history || [], latestUserMessage);
          sendResponse({ reply, engine: 'fallback-rules', reason: `AI unavailable (${status.status})` });
          return;
        }

        const systemPrompt = ChatSimulatorEngine.buildSystemPrompt(persona, itemContext, customGoal);
        const fullPrompt = ChatSimulatorEngine.buildPromptWithHistory(persona, history || [], latestUserMessage, itemContext, customGoal);
        
        console.log('[SOVA:Offscreen] Creating AI session with Gemini Nano...');
        const session = await createAiSession(systemPrompt, 0.7);
        
        console.log('[SOVA:Offscreen] Prompting Gemini Nano (prompt length: ' + fullPrompt.length + ')...');
        let rawReply = await session.prompt(fullPrompt);
        console.log('[SOVA:Offscreen] Raw reply from Gemini Nano:', rawReply);

        try {
          if (typeof session.destroy === 'function') session.destroy();
        } catch {}

        let reply = (rawReply || '')
          .replace(/^\[(?:Співрозмовник|Покупець|Шахрай|Продавець|Клієнт)\]:\s*/i, '')
          .replace(/^["'«»]|["'«»]$/g, '')
          .trim();

        // Check for safety refusal or empty response
        if (!reply || /as an ai|cannot fulfill|safety guidelines|unable to/i.test(reply)) {
          console.warn('[SOVA:Offscreen] Model returned empty or refusal, applying smart fallback:', reply);
          reply = ChatSimulatorEngine.generateFallbackReply(persona, history || [], latestUserMessage);
          sendResponse({ reply, engine: 'fallback-rules', reason: 'Model refused or empty' });
          return;
        }

        const latencyMs = Math.round(performance.now() - startTime);
        sendResponse({ reply, engine: 'gemini-nano', latencyMs });
      } catch (err: any) {
        console.warn('[SOVA:Offscreen] Gemini Nano simulation threw error:', err);
        const reply = ChatSimulatorEngine.generateFallbackReply(persona, history || [], latestUserMessage);
        sendResponse({
          reply,
          engine: 'fallback-rules',
          reason: `Execution error: ${err?.message || err}`
        });
      }
    })();
    return true;
  }

  return false;
});

