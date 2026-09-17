import { IAIProvider, AIValidationResult, AIHeuristicContext } from './ai-provider.interface';
import '../types/ai.d.ts';

export class ChromeBuiltinAIProvider implements IAIProvider {
  private abortSignal?: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.abortSignal = signal;
  }

  private getProvider(): any {
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    if (!globalObj) return null;
    if ((globalObj as any).LanguageModel) return (globalObj as any).LanguageModel;
    if ((globalObj as any).ai?.languageModel) return (globalObj as any).ai.languageModel;
    return null;
  }

  public async isAvailable(): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;
    try {
      if (typeof provider.capabilities === 'function') {
        const capabilities = await provider.capabilities();
        return capabilities?.available === 'readily' || capabilities?.available === 'after-download';
      }
      return typeof provider.create === 'function';
    } catch (e) {
      console.warn('[ThreatShield:AI] provider.capabilities() threw:', e);
      return typeof provider.create === 'function';
    }
  }

  public async verifyIntent(
    text: string,
    contextRules: string,
    triggerWord?: string,
    heuristicContext?: AIHeuristicContext
  ): Promise<AIValidationResult | null> {
    const provider = this.getProvider();
    if (!provider || !(await this.isAvailable())) return null;

    let session;
    try {
      // ── System Prompt ─────────────────────────────────────────────────────
      const systemPrompt = `Ти — експерт з кібербезпеки та соціальної інженерії, що спеціалізується на виявленні фішингу, крадіжки платіжних даних та шахрайства в українських маркетплейсах (OLX, Prom) і соціальних мережах.

ВАЖЛИВО: Відповідай ВИКЛЮЧНО валідним JSON-об'єктом. Мова пояснення (поле reasoning) — ТІЛЬКИ українська. Не використовуй англійську мову.
Обов'язкова схема JSON:
{
  "isScam": true або false,
  "confidence": число від 0 до 100,
  "reasoning": "Пояснення виключно українською мовою (1-2 речення): чому це небезпечно або безпечно"
}

Приклад для загрози:
{"isScam": true, "confidence": 95, "reasoning": "Фішингове посилання під виглядом безпечної оплати OLX для викрадення даних картки."}

Приклад для безпечного тексту:
{"isScam": false, "confidence": 90, "reasoning": "Звичайне повідомлення без ознак маніпуляцій, посилань чи збору платіжних даних."}`;

      try {
        const createOptions: any = { systemPrompt, temperature: 0.05 };
        if (this.abortSignal) createOptions.signal = this.abortSignal;
        session = await provider.create(createOptions);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] create(options) failed, falling back...', e);
        session = await provider.create();
      }

      // ── Sliding Window з розширенням після тригера ────────────────────────
      const MAX_LEN = 600;
      let truncatedText = text;

      if (text.length > MAX_LEN) {
        if (triggerWord && text.includes(triggerWord)) {
          const triggerIndex = text.lastIndexOf(triggerWord);
          const triggerEnd = triggerIndex + triggerWord.length;

          // Знаходимо речення після останнього тригера
          const afterTrigger = text.substring(triggerEnd);
          const sentenceMatches = Array.from(afterTrigger.matchAll(/[.!?\n]+/g));
          let extraAfter = 200;
          if (sentenceMatches.length >= 2 && sentenceMatches[1].index !== undefined) {
            extraAfter = sentenceMatches[1].index + sentenceMatches[1][0].length;
          } else if (sentenceMatches.length === 1 && sentenceMatches[0].index !== undefined) {
            extraAfter = Math.min(afterTrigger.length, sentenceMatches[0].index + sentenceMatches[0][0].length + 100);
          } else {
            extraAfter = Math.min(afterTrigger.length, 250);
          }

          const wantedEnd = Math.min(text.length, triggerEnd + extraAfter);
          const wantedStart = Math.max(0, wantedEnd - MAX_LEN);
          const actualEnd = Math.min(text.length, wantedStart + MAX_LEN);

          truncatedText =
            (wantedStart > 0 ? '...' : '') +
            text.substring(wantedStart, actualEnd) +
            (actualEnd < text.length ? '...' : '');
        } else {
          truncatedText = text.substring(0, MAX_LEN) + '...';
        }
      }

      // ── Формуємо секцію з флагами та технічними даними ─────────────────────
      let flagsSection = '';
      if (heuristicContext) {
        const flagLines: string[] = [];
        if (heuristicContext.sourcePlatform || heuristicContext.targetHost) {
          flagLines.push(`- Маршрут: ${heuristicContext.sourcePlatform || 'невідомо'} ➔ ${heuristicContext.targetHost || 'поточна сторінка'}`);
        }
        if (heuristicContext.intentType && heuristicContext.intentType !== 'UNKNOWN') {
          flagLines.push(`- Виявлений тип загрози (NLP): ${heuristicContext.intentType}`);
        }
        if (heuristicContext.detectedKeywords?.length > 0) {
          flagLines.push(`- Ключові слова-тригери: ${heuristicContext.detectedKeywords.slice(0, 8).join(', ')}`);
        }
        if (heuristicContext.suspiciousUrls?.length > 0) {
          flagLines.push(`- Підозрілі посилання: ${heuristicContext.suspiciousUrls.join(', ')}`);
        }
        if (heuristicContext.triggeredClusters?.length > 0) {
          flagLines.push(`- Активовані кластери загроз: ${heuristicContext.triggeredClusters.join(', ')}`);
        }
        if (heuristicContext.raisedFlags && heuristicContext.raisedFlags.length > 0) {
          flagLines.push(`- Зафіксовані евристичні прапорці:\n  * ${heuristicContext.raisedFlags.join('\n  * ')}`);
        }
        if (heuristicContext.formDetails) {
          flagLines.push(`- Заповнені поля форми:\n  ${heuristicContext.formDetails.split('\n').join('\n  ')}`);
        }
        if (heuristicContext.nlpConfidence > 0) {
          flagLines.push(`- Оцінка ризику першого рівня: ${heuristicContext.nlpConfidence}/100`);
        }

        if (flagLines.length > 0) {
          flagsSection = `\nКонтекст загрози та технічні дані (евристики):\n${flagLines.join('\n')}\n`;
        }
      }

      // ── Фінальний промпт ──────────────────────────────────────────────────
      const prompt = `Проаналізуй на фішинг або шахрайство (соціальна інженерія, викрадення платіжних даних).

Критерії та правила: ${contextRules}
${flagsSection}
Аналізований текст / дані дії:
"""
${truncatedText}
"""

Відповідай ТІЛЬКИ валідним JSON-об'єктом. Мова reasoning — ТІЛЬКИ українська.`;

      let responseText = '';
      try {
        responseText = await session.prompt(prompt, this.abortSignal ? { signal: this.abortSignal } : undefined);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] session.prompt(options) failed, retrying without options...');
        responseText = await session.prompt(prompt);
      }

      console.log('[ThreatShield:AI] Raw response:', responseText);

      // ── Парсинг ────────────────────────────────────────────────────────────
      let parsed: any = { isScam: false, confidence: 0, reasoning: '' };

      try {
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        parsed = JSON.parse(cleanJson);
      } catch (parseError) {
        console.warn('[ThreatShield:AI] JSON parse failed, trying regex. Raw:', responseText);

        const lower = responseText.toLowerCase();
        if (
          lower.includes('"isscam":true') || lower.includes('"isscam": true') ||
          lower.includes('"is_scam":true') || lower.includes('"is_scam": true') ||
          lower.includes('"scam":true') || lower.includes('"scam": true')
        ) {
          parsed.isScam = true;
        }

        const confMatch = responseText.match(/"confidence"\s*:\s*(\d+)/i);
        if (confMatch) parsed.confidence = parseInt(confMatch[1], 10);
        else parsed.confidence = parsed.isScam ? 85 : 15;

        const reasonMatch = responseText.match(/"reasoning"\s*:\s*"([\s\S]*?)"\s*[,}]/i);
        if (reasonMatch && reasonMatch[1]) {
          parsed.reasoning = reasonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        }
      }

      // Перевірка всіх можливих варіантів вердикту (isScam, is_scam, scam тощо)
      const rawScam = parsed.isScam ?? parsed.is_scam ?? parsed.scam ?? parsed.isPhishing ?? parsed.is_phishing;
      let isScam = rawScam === true || String(rawScam).toLowerCase() === 'true' || String(rawScam).toLowerCase() === 'yes';

      let confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, parsed.confidence)) : (isScam ? 85 : 15);
      let reasoning = (parsed.reasoning || '').trim();

      // Семантичний контроль: якщо пояснення явно свідчить про шахрайство
      const lowerReasoning = reasoning.toLowerCase();
      const threatKeywords = ['шахрай', 'фішинг', 'викраденн', 'небезпечн', 'scam', 'phishing', 'fraud', 'злодій', 'підробк', 'фальшив', 'lure'];
      const safeKeywords = ['безпечн', 'легітимн', 'немає ознак', 'нормальн', 'safe', 'legitimate'];

      const containsThreatKeyword = threatKeywords.some(w => lowerReasoning.includes(w));
      const containsSafeKeyword = safeKeywords.some(w => lowerReasoning.includes(w));

      if (containsThreatKeyword && !containsSafeKeyword) {
        isScam = true;
        if (confidence < 50) confidence = 85;
      } else if (containsSafeKeyword && !containsThreatKeyword && !isScam) {
        if (confidence > 50) confidence = 20;
      }

      if (!reasoning) {
        reasoning = isScam
          ? 'ШІ виявив патерни шахрайства та спробу збору конфіденційних даних.'
          : 'Повідомлення або форма не містять виражених ознак шахрайства.';
      }

      return {
        isScam,
        confidence,
        reasoning,
        rawResponse: responseText
      };

    } catch (e) {
      console.error('[ThreatShield:AI] Помилка верифікації:', e);
      return null;
    } finally {
      if (session && typeof session.destroy === 'function') session.destroy();
    }
  }
}
