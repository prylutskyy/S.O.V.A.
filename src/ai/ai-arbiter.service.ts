import { ActiveThreatContext } from '../types';
import { AILureVerifier } from '../heuristics/ai-verifier';
import { ScamIntentType } from '../heuristics/intent-classifier';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { DebuggerOverlay } from '../ui/debugger-overlay';
import { OutboundDataSanitizer } from '../privacy/outbound-data-sanitizer';
import { ChatSessionState } from '../heuristics/chat-session-state';
import { UrlExtractor } from '../heuristics/url-extractor';

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
  scamType?: string;
  rawResponse?: string;
  provider?: string;
  modelUsed?: string;
  latencyMs?: number;
}

/**
 * AIArbiterService
 * Високорівневий асинхронний диспетчер взаємодії з локальним ШІ-арбітром (Gemini Nano).
 * Реалізує патерн Single-Flight Queue, AbortController для скасування застарілих запитів
 * та швидке LRU/TTL кешування за відбитком контексту для уникнення навантаження на слабкий CPU/GPU.
 */
export class AIArbiterService {
  private static inflightRequest: {
    key: string;
    requestId: number;
    abortController: AbortController;
    promise: Promise<AIArbiterVerifyResult | null>;
  } | null = null;

  private static requestCounter = 0;
  private static cache = new Map<string, { result: AIArbiterVerifyResult; expiresAt: number }>();
  public static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 хвилин

  /**
   * Генерація стабільного хеш-ключа контексту для кешування
   */
  public static generateCacheKey(
    options: AIArbiterVerifyOptions,
    dialogueHistory = ChatChannelMonitor.getDialogueHistory()
  ): string {
    const { context, rawTextToScan, intentType, confidence } = options;
    // Serialize fields separately so embedded delimiters cannot collide.
    // SAFE is reusable only for this exact evidence, session and dialogue.
    return JSON.stringify({
      sessionRevision: ChatSessionState.sessionRevision,
      sessionId: context.sessionId || '',
      platform: context.sourcePlatform,
      suspiciousUrl: context.targetSuspiciousUrl || '',
      intent: intentType || context.scenario || 'UNKNOWN',
      keywords: [...(context.detectedKeywords || [])].sort(),
      scanText: rawTextToScan || context.targetSuspiciousUrl || '',
      dialogueHistory,
      threatLevel: context.threatLevel,
      confidence: confidence ?? null,
      offPlatformLure: context.offPlatformLure,
    });
  }

  /**
   * Очищення кешу та скасування активного запиту (для тестів або скидання сесії)
   */
  public static clearCache(): void {
    this.cache.clear();
    this.cancelPending();
  }

  /**
   * Скасовує інференс, пов'язаний із контекстом, який більше не активний.
   * Збільшення лічильника також відкидає відповідь, якщо провайдер не встиг
   * коректно перервати мережевий запит.
   */
  public static cancelPending(): void {
    if (this.inflightRequest) {
      this.inflightRequest.abortController.abort();
      this.inflightRequest = null;
      this.requestCounter += 1;
    }
  }

  /**
   * Головна точка входу верифікації загрози ШІ
   */
  public static async verify(
    options: AIArbiterVerifyOptions
  ): Promise<AIArbiterVerifyResult | null> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return null;
    }

    // 0. Session quarantine for a previously confirmed threat.
    if (ChatSessionState.sessionLlmVerdict === 'SCAM') {
      return {
        isScam: true,
        confidence: 99,
        reasoning: 'Автоматичний карантин: чат вже визнано небезпечним (ШІ)',
        provider: 'session-quarantine'
      };
    }
    
    // A safe verdict is a result for a particular request, not session immunity.
    // Reuse the original result via the exact-context TTL cache below.
    if (ChatSessionState.sessionLlmVerdict === 'SAFE') {
      ChatSessionState.sessionLlmVerdict = null;
      ChatSessionState.sessionLlmImmunityPeakScore = 0;
    }
    const chatDialogue = ChatChannelMonitor.getDialogueHistory();
    const cacheKey = this.generateCacheKey(options, chatDialogue);

    // 1. Швидкий кеш: якщо однаковий контекст уже перевірявся — 0 мс затримки, 0% CPU
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      const providerLabel = cached.result.provider ? ` [${cached.result.provider}]` : '';
      DebuggerOverlay.logAI(
        'ШІ Арбітр → Кеш',
        `Результат миттєво взято з пам'яті (0 мс)${providerLabel}\nВпевненість: ${cached.result.confidence}%\nВисновок: "${cached.result.reasoning}"`,
        cached.result.isScam ? '#EF4444' : '#22C55E',
        {
          rawResponse: cached.result.rawResponse,
          provider: cached.result.provider,
          model: cached.result.modelUsed,
          latencyMs: cached.result.latencyMs,
        }
      );
      return cached.result;
    }

    // 2. Дедуплікація запитів (Request Coalescing): якщо точно такий самий запит уже виконується
    if (this.inflightRequest && this.inflightRequest.key === cacheKey) {
      return this.inflightRequest.promise;
    }

    // 3. Single-Flight: якщо контекст змінився (нові символи/прапорці), скасовуємо попередній запит
    if (this.inflightRequest) {
      this.inflightRequest.abortController.abort();
      DebuggerOverlay.logAI(
        'ШІ Арбітр → Оновлення',
        'Попередній інференс скасовано: контекст оновився',
        '#64748B'
      );
      this.inflightRequest = null;
    }

    const currentRequestId = ++this.requestCounter;
    const abortController = new AbortController();

    const executionPromise = this.executeInference(options, currentRequestId, abortController, cacheKey, chatDialogue);

    this.inflightRequest = {
      key: cacheKey,
      requestId: currentRequestId,
      abortController,
      promise: executionPromise,
    };

    try {
      return await executionPromise;
    } finally {
      if (this.inflightRequest?.requestId === currentRequestId) {
        this.inflightRequest = null;
      }
    }
  }

  private static async executeInference(
    options: AIArbiterVerifyOptions,
    requestId: number,
    abortController: AbortController,
    cacheKey: string,
    chatDialogue: string
  ): Promise<AIArbiterVerifyResult | null> {
    const sessionRevision = ChatSessionState.sessionRevision;
    const { context, rawTextToScan, intentType, confidence } = options;
    const scanText = rawTextToScan || context.targetSuspiciousUrl || '';
    const intentLabel =
      intentType && intentType !== 'UNKNOWN' ? intentType : context.scenario || 'UNKNOWN';
    const triggerWord = context.detectedKeywords?.[0];

    const contextRules =
      AILureVerifier.intentContextRules[intentLabel as ScamIntentType] ||
      'Analyze for social engineering, phishing, and payment credential theft.';

    const systemPrompt = `You are a cybersecurity expert acting as an AI Shield Arbiter protecting the current user ([Ви]) from phishing, social engineering, and payment credential theft.

Your primary mission is to determine whether THE CURRENT USER ([Ви]) is being targeted as a victim of social engineering, fraud, or phishing.
If the interlocutor is simply discussing a scheme, quoting a scam script/template ("пишеш повідомлення по типу..."), or joking, and NOT actively trying to defraud or deceive [Ви], classify as SAFE (isScam: false).

IMPORTANT RULES:
1. Respond ONLY with a valid JSON object. Do NOT include markdown blocks or any conversational text.
2. JSON keys MUST strictly be: "isScam", "confidence", "scamType", "reasoning".
3. Write "reasoning" in Ukrainian: concise, direct explanation (max 35 words).
4. "scamType" must be one of: PAYMENT_CREDENTIAL_THEFT, IDENTITY_PROBING, ESCROW_DELIVERY_SCAM, OFF_PLATFORM_REDIRECT, VERIFICATION_PHISHING, URGENCY_PRESSURE, MILITARY_SABOTAGE_RECRUITMENT, CRYPTO_WALLET_COMPROMISE, or SUSPICIOUS_LURE.

Required JSON schema:
{
  "isScam": boolean,
  "confidence": number (0-100),
  "scamType": string,
  "reasoning": string (concise explanation in Ukrainian)
}`;

    // A trigger message is evidence text, never a URL merely because a caller supplied it here.
    let suspiciousUrls = UrlExtractor.extract(context.targetSuspiciousUrl || '');
    try {
      const explicitUrl = new URL(context.targetSuspiciousUrl || '');
      if (['https:', 'http:'].includes(explicitUrl.protocol)) {
        suspiciousUrls = [explicitUrl.href];
      }
    } catch {}
    const raisedFlags: string[] = [
      `Виявлено загрозу: ${intentLabel}`,
      `Платформа-джерело: ${context.sourcePlatform}`,
      ...(context.offPlatformLure ? ['Спроба переведення в сторонній месенджер'] : []),
      ...(suspiciousUrls.length > 0 ? ['Підозріле посилання у тексті'] : []),
      ...(context.detectedKeywords || []).map((k) => `Ключове слово: "${k}"`),
    ];

    let targetHost: string | undefined;
    try {
      if (suspiciousUrls[0]) {
        targetHost = new URL(suspiciousUrls[0]).hostname;
      }
    } catch {}

    // ── ZERO-KNOWLEDGE ПСЕВДОНІМІЗАЦІЯ ДАНИХ ──────────────────────────────
    const sanitizedScan = OutboundDataSanitizer.sanitize(scanText);
    const sanitizedDialogue = OutboundDataSanitizer.sanitize(chatDialogue);

    const sanitizedPrompt = OutboundDataSanitizer.buildCloudPrompt(sanitizedScan, {
      sourcePlatform: context.sourcePlatform,
      targetHost,
      scenarioRule: contextRules,
      intentType: intentLabel,
      dialogueHistory: sanitizedDialogue.sanitizedText,
      detectedKeywords: context.detectedKeywords || [],
      suspiciousUrls,
      raisedFlags,
      offPlatformLure: context.offPlatformLure,
    });

    const heuristicContext = {
      intentType: intentLabel,
      detectedKeywords: context.detectedKeywords || [],
      suspiciousUrls,
      triggeredClusters: context.offPlatformLure ? ['off_platform'] : [],
      nlpConfidence: confidence || (context.threatLevel === 'HIGH' ? 75 : 25),
      raisedFlags,
      chatDialogue: sanitizedDialogue.sanitizedText,
      sourcePlatform: context.sourcePlatform,
      targetHost,
      telemetry: sanitizedScan.telemetry,
    };

    const aiLogId = DebuggerOverlay.logAI(
      'ШІ Арбітр → Аналіз',
      sanitizedScan.telemetry.totalSensitiveAssetsRedacted > 0
        ? `Запит відправлено (Захищено ${sanitizedScan.telemetry.totalSensitiveAssetsRedacted} конфіденційних активів)...`
        : 'Запит відправлено, очікую відповідь...',
      '#3B82F6',
      {
        systemPrompt,
        contextRules,
        textSent: sanitizedScan.sanitizedText,
        chatDialogue: sanitizedDialogue.sanitizedText,
        raisedFlags,
        sanitizedPrompt,
      }
    );

    return new Promise((resolve) => {
      if (abortController.signal.aborted) {
        resolve(null);
        return;
      }

      const onAbort = () => {
        resolve(null);
      };
      abortController.signal.addEventListener('abort', onAbort, { once: true });

      try {
        chrome.runtime.sendMessage(
          {
            type: 'AI_VERIFY',
            payload: {
              text: sanitizedScan.sanitizedText,
              sanitizedPrompt,
              intentType: intentLabel,
              triggerWord,
              heuristicContext,
            },
          },
          (response) => {
            abortController.signal.removeEventListener('abort', onAbort);

            // Якщо запит було скасовано або перекрито іншим
            if (abortController.signal.aborted || this.requestCounter !== requestId ||
                ChatSessionState.sessionRevision !== sessionRevision) {
              resolve(null);
              return;
            }

            const aiResult = response?.aiResult as AIArbiterVerifyResult | undefined;
            if (!aiResult) {
              DebuggerOverlay.logAI(
                'ШІ Арбітр → Аналіз',
                'ШІ-арбітр (LLM) не зміг обробити запит.',
                '#EF4444',
                undefined,
                aiLogId
              );
              resolve(null);
            } else {
              const providerLabel = aiResult.provider
                ? ` [${aiResult.provider}: ${aiResult.modelUsed || ''} (${aiResult.latencyMs || 0}мс)]`
                : '';

              AIArbiterService.cache.set(cacheKey, {
                result: aiResult,
                expiresAt: Date.now() + AIArbiterService.CACHE_TTL_MS,
              });

              // SAFE records the latest verdict only; reuse is controlled by the exact cache.
              if (aiResult.isScam && aiResult.confidence >= 75) {
                ChatSessionState.sessionLlmVerdict = 'SCAM';
              } else if (!aiResult.isScam) {
                ChatSessionState.sessionLlmVerdict = 'SAFE';
                ChatSessionState.sessionLlmImmunityPeakScore = confidence || (context.threatLevel === 'HIGH' ? 75 : (context.threatLevel === 'MEDIUM' ? 50 : 25));
              }

              const verdict = aiResult.isScam
                ? `СКАМ підтверджено${providerLabel} (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`
                : `Загрозу спростовано${providerLabel} (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`;

              DebuggerOverlay.logAI(
                'ШІ Арбітр → Аналіз',
                verdict,
                aiResult.isScam ? '#EF4444' : '#22C55E',
                {
                  rawResponse: aiResult.rawResponse,
                  provider: aiResult.provider,
                  model: aiResult.modelUsed,
                  latencyMs: aiResult.latencyMs,
                },
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
