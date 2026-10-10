import { ActiveThreatContext } from '../types';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { DebuggerOverlay } from '../ui/debugger-overlay';
import { OutboundDataSanitizer } from '../privacy/outbound-data-sanitizer';
import { ChatSessionState } from '../heuristics/chat-session-state';
import { UrlExtractor } from '../heuristics/url-extractor';
import type { AICheckResult } from '../ui/ai-check-history';
import { PseudonymizationContext } from '../privacy/pseudonymization-context';

export interface AIArbiterVerifyOptions {
  context: ActiveThreatContext;
  rawTextToScan?: string;
  intentType?: string;
  confidence?: number;
}

export interface AIArbiterVerifyResult extends AICheckResult {
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
  private static privacySession = new PseudonymizationContext();
  private static privacySessionKey = '';
  static {
    ChatSessionState.onReset(() => {
      this.privacySession.clear();
      this.privacySessionKey = '';
    });
  }
  private static inflightRequest: {
    key: string;
    requestId: number;
    abortController: AbortController;
    promise: Promise<AIArbiterVerifyResult | null>;
  } | null = null;

  private static requestCounter = 0;
  private static cache = new Map<string, { result: AIArbiterVerifyResult; expiresAt: number; checkId: string }>();
  public static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 хвилин
  public static readonly REQUEST_TIMEOUT_MS = 15_000;

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
    this.privacySession.clear();
    this.privacySessionKey = '';
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
      const result: AIArbiterVerifyResult = {
        isScam: true,
        confidence: 99,
        reasoning: 'Автоматичний карантин: чат вже визнано небезпечним (ШІ)',
        provider: 'session-quarantine'
      };
      const id = DebuggerOverlay.beginAICheck({ sessionId: options.context.sessionId || null,
        source: 'session-quarantine', intent: options.intentType || options.context.scenario });
      DebuggerOverlay.finishAICheck(id, 'completed', result);
      return result;
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
      const id = DebuggerOverlay.beginAICheck({ sessionId: options.context.sessionId || null,
        source: 'cache', originalCheckId: cached.checkId,
        intent: options.intentType || options.context.scenario });
      DebuggerOverlay.finishAICheck(id, 'completed', cached.result);
      return cached.result;
    }

    // 2. Дедуплікація запитів (Request Coalescing): якщо точно такий самий запит уже виконується
    if (this.inflightRequest && this.inflightRequest.key === cacheKey) {
      return this.inflightRequest.promise;
    }

    // 3. Single-Flight: якщо контекст змінився (нові символи/прапорці), скасовуємо попередній запит
    if (this.inflightRequest) {
      this.inflightRequest.abortController.abort();
      this.inflightRequest = null;
    }

    const currentRequestId = ++this.requestCounter;
    const abortController = new AbortController();

    // Preparation failures must never fall back to sending the original text.
    const executionPromise = this.executeInference(options, currentRequestId, abortController, cacheKey, chatDialogue)
      .catch(() => null);

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
    const privacyKey = `${ChatSessionState.sessionRevision}:${context.sessionId || ''}`;
    if (this.privacySessionKey !== privacyKey) {
      this.privacySession.clear();
      this.privacySessionKey = privacyKey;
    }
    const privacyOptions = { privacySession: this.privacySession };
    const sanitizedDialogue = OutboundDataSanitizer.sanitize(chatDialogue, privacyOptions);
    const sanitizedScan = OutboundDataSanitizer.sanitize(scanText, privacyOptions);

    const sanitizedPrompt = OutboundDataSanitizer.buildCloudPrompt(sanitizedScan, {
      privacySession: this.privacySession,
      sourcePlatform: context.sourcePlatform,
      targetHost,
      dialogueHistory: sanitizedDialogue.sanitizedText,
      dialogueMessages: ChatSessionState.getRecentMessages().map(message => ({
        speaker: message.direction === 'outbound' ? 'user' as const : 'interlocutor' as const,
        text: OutboundDataSanitizer.sanitize(message.rawText, privacyOptions).sanitizedText,
        observedAgeMs: Math.max(0, Date.now() - message.timestamp),
      })),
      detectedKeywords: context.detectedKeywords || [],
      suspiciousUrls,
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

    const checkId = DebuggerOverlay.beginAICheck({ sessionId: context.sessionId || null,
      text: sanitizedScan.sanitizedText, dialogue: sanitizedDialogue.sanitizedText,
      intent: intentLabel, flags: raisedFlags, preparedPrompt: sanitizedPrompt,
      redactedCount: sanitizedScan.telemetry.totalSensitiveAssetsRedacted
        + sanitizedDialogue.telemetry.totalSensitiveAssetsRedacted });

    return new Promise((resolve) => {
      if (abortController.signal.aborted) {
        DebuggerOverlay.finishAICheck(checkId, 'cancelled', undefined, 'Контекст змінився або перевірку скинуто.');
        resolve(null);
        return;
      }

      let settled = false;
      const finish = (result: AIArbiterVerifyResult | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        abortController.signal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      const onAbort = () => {
        DebuggerOverlay.finishAICheck(checkId, 'cancelled', undefined, 'Контекст змінився або перевірку скинуто.');
        finish(null);
      };
      const timeout = setTimeout(() => {
        DebuggerOverlay.finishAICheck(checkId, 'timeout', undefined,
          'Час очікування вичерпано. Діє локальна політика захисту.');
        finish(null);
      }, this.REQUEST_TIMEOUT_MS);
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
            if (settled) return;

            // Якщо запит було скасовано або перекрито іншим
            if (abortController.signal.aborted || this.requestCounter !== requestId ||
                ChatSessionState.sessionRevision !== sessionRevision) {
              DebuggerOverlay.finishAICheck(checkId, 'cancelled', undefined, 'Відповідь стосується попереднього контексту.');
              finish(null);
              return;
            }

            const aiResult = response?.aiResult as AIArbiterVerifyResult | undefined;
            if (!aiResult) {
              DebuggerOverlay.finishAICheck(checkId, 'error', undefined, 'ШІ не повернув придатної відповіді.');
              finish(null);
            } else {
              AIArbiterService.cache.set(cacheKey, {
                result: aiResult,
                expiresAt: Date.now() + AIArbiterService.CACHE_TTL_MS,
                checkId,
              });

              // SAFE records the latest verdict only; reuse is controlled by the exact cache.
              if (aiResult.isScam && aiResult.confidence >= 75) {
                ChatSessionState.sessionLlmVerdict = 'SCAM';
              } else if (!aiResult.isScam) {
                ChatSessionState.sessionLlmVerdict = 'SAFE';
                ChatSessionState.sessionLlmImmunityPeakScore = confidence || (context.threatLevel === 'HIGH' ? 75 : (context.threatLevel === 'MEDIUM' ? 50 : 25));
              }

              DebuggerOverlay.finishAICheck(checkId, 'completed', aiResult);
              finish(aiResult);
            }
          }
        );
      } catch (e) {
        console.error(e);
        DebuggerOverlay.finishAICheck(checkId, 'error', undefined, 'Не вдалося передати запит диспетчеру ШІ.');
        finish(null);
      }
    });
  }
}
