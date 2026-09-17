import { ActiveThreatContext } from '../types';
import { AILureVerifier } from '../heuristics/ai-verifier';
import { ScamIntentType } from '../heuristics/intent-classifier';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { DebuggerOverlay } from '../ui/debugger-overlay';

export interface AIArbiterVerifyOptions {
  context: ActiveThreatContext;
  rawTextToScan?: string;
  intentType?: string;
  confidence?: number;
}

export interface AIArbiterVerifyResult {
  isScam: boolean;
  confidence: number;
  reasoning: string;
  rawResponse?: string;
}

export class AIArbiterService {
  public static async verify(
    options: AIArbiterVerifyOptions
  ): Promise<AIArbiterVerifyResult | null> {
    const { context, rawTextToScan, intentType, confidence } = options;

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return null;
    }

    const scanText = rawTextToScan || context.targetSuspiciousUrl || '';
    const intentLabel =
      intentType && intentType !== 'UNKNOWN' ? intentType : context.scenario || 'UNKNOWN';
    const triggerWord = context.detectedKeywords?.[0];

    const contextRules =
      AILureVerifier.intentContextRules[intentLabel as ScamIntentType] ||
      'Analyze for social engineering, phishing, and payment credential theft.';

    const systemPrompt = `You are a cybersecurity expert specializing in detecting phishing, payment credential theft, and social engineering attacks on online marketplaces and chats.

IMPORTANT RULES:
1. Respond ONLY with a valid JSON object. Do NOT include markdown blocks or any conversational text.
2. JSON keys MUST strictly be: "isScam", "confidence", "reasoning".
3. Write "reasoning" in English: concise, direct explanation (1-2 sentences, max 30 words).

Required JSON schema:
{
  "isScam": boolean,
  "confidence": number (0-100),
  "reasoning": string (concise explanation in English)
}`;

    const raisedFlags: string[] = [
      `Виявлено загрозу: ${intentLabel}`,
      `Платформа-джерело: ${context.sourcePlatform}`,
      context.offPlatformLure
        ? 'Спроба переведення в сторонній месенджер'
        : 'Підозріле посилання у тексті',
      ...(context.detectedKeywords || []).map((k) => `Ключове слово: "${k}"`),
    ];

    let targetHost: string | undefined;
    try {
      if (context.targetSuspiciousUrl) {
        targetHost = new URL(context.targetSuspiciousUrl).hostname;
      }
    } catch {}

    const chatDialogue = ChatChannelMonitor.getDialogueHistory();

    const heuristicContext = {
      intentType: intentLabel,
      detectedKeywords: context.detectedKeywords || [],
      suspiciousUrls: context.targetSuspiciousUrl ? [context.targetSuspiciousUrl] : [],
      triggeredClusters: context.offPlatformLure ? ['off_platform'] : [],
      nlpConfidence: confidence || (context.threatLevel === 'HIGH' ? 75 : 25),
      raisedFlags,
      chatDialogue,
      sourcePlatform: context.sourcePlatform,
      targetHost,
    };

    const aiLogId = DebuggerOverlay.logAI(
      'ШІ Арбітр → Аналіз',
      '⏳ Запит відправлено, очікую відповідь...',
      '#3B82F6',
      {
        systemPrompt,
        contextRules,
        textSent: scanText,
        chatDialogue,
        raisedFlags,
      }
    );

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'AI_VERIFY',
            payload: {
              text: scanText,
              intentType: intentLabel,
              triggerWord,
              heuristicContext,
            },
          },
          (response) => {
            const aiResult = response?.aiResult as AIArbiterVerifyResult | undefined;
            if (!aiResult) {
              DebuggerOverlay.logAI(
                'ШІ Арбітр → Аналіз',
                '❌ Gemini Nano не зміг обробити запит.',
                '#EF4444',
                undefined,
                aiLogId
              );
              resolve(null);
            } else if (aiResult.isScam) {
              DebuggerOverlay.logAI(
                'ШІ Арбітр → Аналіз',
                `🔴 СКАМ підтверджено (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`,
                '#EF4444',
                { rawResponse: aiResult.rawResponse },
                aiLogId
              );
              resolve(aiResult);
            } else {
              DebuggerOverlay.logAI(
                'ШІ Арбітр → Аналіз',
                `🟢 Загрозу спростовано (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`,
                '#22C55E',
                { rawResponse: aiResult.rawResponse },
                aiLogId
              );
              resolve(aiResult);
            }
          }
        );
      } catch (e) {
        console.error(e);
        resolve(null);
      }
    });
  }
}
