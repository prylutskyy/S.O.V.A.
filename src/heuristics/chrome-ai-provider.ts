import { IAIProvider, AIValidationResult, AIHeuristicContext } from './ai-provider.interface';
import '../types/ai.d.ts';

export function getChromeAiLanguageModel(): any {
  const globalObj = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
  if (!globalObj) return null;
  if ((globalObj as any).LanguageModel) return (globalObj as any).LanguageModel;
  if ((globalObj as any).ai?.languageModel) return (globalObj as any).ai.languageModel;
  if ((globalObj as any).ai?.assistant) return (globalObj as any).ai.assistant;
  return null;
}

export async function isGeminiAiAvailable(): Promise<{ available: boolean; status: string }> {
  const provider = getChromeAiLanguageModel();
  if (!provider) return { available: false, status: 'no-provider' };
  try {
    if (typeof provider.capabilities === 'function') {
      const capabilities = await provider.capabilities();
      const avail = capabilities?.available === 'readily' || capabilities?.available === 'after-download';
      return { available: avail, status: capabilities?.available || 'unknown' };
    }
    return { available: typeof provider.create === 'function', status: 'ready-create' };
  } catch (e: any) {
    console.warn('[ThreatShield:AI] provider.capabilities() threw:', e);
    return { available: typeof provider.create === 'function', status: `capabilities-threw: ${e?.message || e}` };
  }
}

export async function createAiSession(systemPrompt?: string, temperature: number = 0.5, signal?: AbortSignal): Promise<any> {
  const provider = getChromeAiLanguageModel();
  if (!provider) throw new Error('Gemini Nano provider not found in current execution context');

  if (systemPrompt) {
    try {
      const opts: any = { systemPrompt, temperature };
      if (signal) opts.signal = signal;
      return await provider.create(opts);
    } catch (e1) {
      console.warn('[ThreatShield:AI] create({ systemPrompt }) failed, trying initialPrompts...', e1);
    }

    try {
      const opts: any = {
        initialPrompts: [{ role: 'system', content: systemPrompt }],
        temperature
      };
      if (signal) opts.signal = signal;
      return await provider.create(opts);
    } catch (e2) {
      console.warn('[ThreatShield:AI] create({ initialPrompts }) failed, falling back to bare create()...', e2);
    }
  }

  const bareOpts: any = {};
  if (signal) bareOpts.signal = signal;
  return await provider.create(bareOpts);
}

export class ChromeBuiltinAIProvider implements IAIProvider {
  private abortSignal?: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.abortSignal = signal;
  }

  private getProvider(): any {
    return getChromeAiLanguageModel();
  }

  public async isAvailable(): Promise<boolean> {
    const res = await isGeminiAiAvailable();
    return res.available;
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
      // ── System Prompt (English for maximum performance & consistency) ─────
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
}

Example 1 (Malicious):
{"isScam": true, "confidence": 95, "reasoning": "Phishing lure impersonating marketplace delivery to steal payment card credentials."}

Example 2 (Safe):
{"isScam": false, "confidence": 90, "reasoning": "Legitimate communication without malicious links, manipulation, or credential requests."}`;

      try {
        session = await createAiSession(systemPrompt, 0.05, this.abortSignal);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] createAiSession failed, falling back...', e);
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
          flagLines.push(`- Route: ${heuristicContext.sourcePlatform || 'unknown'} -> ${heuristicContext.targetHost || 'current page'}`);
        }
        if (heuristicContext.intentType && heuristicContext.intentType !== 'UNKNOWN') {
          flagLines.push(`- Detected intent type (NLP): ${heuristicContext.intentType}`);
        }
        if (heuristicContext.detectedKeywords?.length > 0) {
          flagLines.push(`- Trigger keywords: ${heuristicContext.detectedKeywords.slice(0, 8).join(', ')}`);
        }
        if (heuristicContext.suspiciousUrls?.length > 0) {
          flagLines.push(`- Suspicious URLs: ${heuristicContext.suspiciousUrls.join(', ')}`);
        }
        if (heuristicContext.triggeredClusters?.length > 0) {
          flagLines.push(`- Activated threat clusters: ${heuristicContext.triggeredClusters.join(', ')}`);
        }
        if (heuristicContext.raisedFlags && heuristicContext.raisedFlags.length > 0) {
          flagLines.push(`- Raised heuristic flags:\n  * ${heuristicContext.raisedFlags.join('\n  * ')}`);
        }
        if (heuristicContext.formDetails) {
          flagLines.push(`- Form input fields filled:\n  ${heuristicContext.formDetails.split('\n').join('\n  ')}`);
        }
        if (heuristicContext.chatDialogue) {
          flagLines.push(`- Multi-turn Chat Dialogue History (Both Parties & Current Draft):\n  ${heuristicContext.chatDialogue.split('\n').join('\n  ')}`);
        }
        if (heuristicContext.nlpConfidence > 0) {
          flagLines.push(`- Tier 1 Risk Score: ${heuristicContext.nlpConfidence}/100`);
        }

        if (flagLines.length > 0) {
          flagsSection = `\nThreat Context & Heuristics:\n${flagLines.join('\n')}\n`;
        }
      }

      // ── Фінальний промпт ──────────────────────────────────────────────────
      const prompt = `Analyze this action/message for phishing or scam (social engineering, payment theft).

Evaluation criteria & context: ${contextRules}
${flagsSection}
Text / action data to analyze:
"""
${truncatedText}
"""

Respond ONLY with valid JSON. Keys: "isScam", "confidence", "reasoning". Language: English.`;

      let responseText = '';
      try {
        responseText = await session.prompt(prompt, this.abortSignal ? { signal: this.abortSignal } : undefined);
      } catch (e) {
        if (this.abortSignal?.aborted) throw e;
        console.warn('[ThreatShield:AI] session.prompt(options) failed, retrying without options...');
        responseText = await session.prompt(prompt);
      }

      console.log('[ThreatShield:AI] Raw response:', responseText);

      // ── Багаторівневий стійкий парсинг відповіді ───────────────────────────
      // 1. Нормалізація лапок і артефактів
      let cleanText = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/[“”]/g, '"')
        .trim();

      let parsed: any = null;

      // 2. Спроба стандартного або виправленого JSON.parse
      try {
        const firstBrace = cleanText.indexOf('{');
        let lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1) {
          if (lastBrace === -1 || lastBrace < firstBrace) {
            let patched = cleanText.substring(firstBrace);
            const quoteCount = (patched.match(/(?<!\\)"/g) || []).length;
            if (quoteCount % 2 !== 0) patched += '"';
            patched += '\n}';
            parsed = JSON.parse(patched);
          } else {
            parsed = JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
          }
        }
      } catch (e) {
        console.warn('[ThreatShield:AI] JSON.parse failed, falling back to multi-regex extraction. Raw:', responseText);
      }

      // 3. Вилучення вердикту (isScam) — підтримка англійських та українських/російських ключів
      let isScam = false;

      if (parsed && typeof parsed === 'object') {
        const rawThreatVal =
          parsed.isScam ??
          parsed.is_scam ??
          parsed.scam ??
          parsed.isPhishing ??
          parsed['загроза'] ??
          parsed['небезпека'] ??
          parsed['ризик'] ??
          parsed['рівень загрози'] ??
          parsed['статус'] ??
          parsed['вердикт'];

        if (rawThreatVal === true || rawThreatVal === false) {
          isScam = rawThreatVal;
        } else if (typeof rawThreatVal === 'string') {
          isScam = /^(висок|критичн|середн|фішинг|шахрай|так|true|yes|high|critical|danger)/i.test(rawThreatVal.trim());
        }

        const rawType = parsed['тип'] ?? parsed['вид'] ?? parsed.type;
        if (typeof rawType === 'string' && /фішинг|шахрай|соціал.*інженер|scam|phishing|fraud/i.test(rawType)) {
          isScam = true;
        }
      }

      // Резервний Regex-пошук вердикту в тексті
      if (!isScam) {
        const threatRegex = /"(?:isScam|is_scam|scam|threat|загроза|небезпека|ризик|рівень загрози)"\s*[:=]\s*["']?([^"',}\n]+)/i;
        const threatMatch = cleanText.match(threatRegex);
        if (threatMatch) {
          const val = threatMatch[1].trim();
          if (/^(висок|критичн|середн|фішинг|шахрай|так|true|yes|high|critical|danger)/i.test(val)) {
            isScam = true;
          }
        }

        const typeRegex = /"(?:тип|вид|type)"\s*[:=]\s*["']?([^"',}\n]+)/i;
        const typeMatch = cleanText.match(typeRegex);
        if (typeMatch) {
          const val = typeMatch[1].trim();
          if (/фішинг|шахрай|соціал.*інженер|scam|phishing|fraud/i.test(val)) {
            isScam = true;
          }
        }
      }

      // 4. Вилучення пояснення (reasoning) — підтримка всіх варіацій ключів
      let reasoning = '';
      if (parsed && typeof parsed === 'object') {
        const rawReason =
          parsed.reasoning ??
          parsed['обґрунтування'] ??
          parsed['обоснование'] ??
          parsed['пояснення'] ??
          parsed['висновок'] ??
          parsed['причина'] ??
          parsed['опис'] ??
          parsed.explanation ??
          parsed.details;

        if (typeof rawReason === 'string') {
          reasoning = rawReason.trim();
        }
      }

      if (!reasoning) {
        const reasonRegex = /"(?:reasoning|обґрунтування|обоснование|пояснення|висновок|причина|explanation|details)"\s*[:=]\s*["']?([\s\S]*?)(?:["']\s*[,}\n]|\n\s*"|\s*$)/i;
        const reasonMatch = cleanText.match(reasonRegex);
        if (reasonMatch && reasonMatch[1]) {
          reasoning = reasonMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, ' ')
            .replace(/["}\]\n]+$/, '')
            .trim();
        }
      }

      // 5. Вилучення впевненості (confidence)
      let confidence = 0;
      if (parsed && typeof parsed === 'object') {
        const rawConf =
          parsed.confidence ??
          parsed['впевненість'] ??
          parsed['ймовірність'] ??
          parsed['рівень'] ??
          parsed['загроза'];

        if (typeof rawConf === 'number') {
          confidence = rawConf;
        } else if (typeof rawConf === 'string') {
          const digits = rawConf.match(/\d+/);
          if (digits) confidence = parseInt(digits[0], 10);
          else if (/висок|критичн|high|critical/i.test(rawConf)) confidence = 95;
          else if (/середн|medium/i.test(rawConf)) confidence = 70;
          else if (/низьк|low/i.test(rawConf)) confidence = 25;
        }
      }

      if (confidence === 0) {
        const confMatch = cleanText.match(/"(?:confidence|впевненість|ймовірність)"\s*[:=]\s*["']?(\d+)/i);
        if (confMatch) confidence = parseInt(confMatch[1], 10);
        else confidence = isScam ? 90 : 15;
      }
      confidence = Math.max(0, Math.min(100, confidence));

      // 6. Семантичний контроль: якщо текст містить явні слова про загрозу
      const fullTextLower = (reasoning + ' ' + responseText).toLowerCase();
      const threatKeywords = [
        'шахрай', 'фішинг', 'викраденн', 'соціальн.*інженер', 'scam', 'phishing',
        'fraud', 'злодій', 'підробк', 'фальшив', 'крадіжк', 'lure', 'небезпечн'
      ];
      const safeKeywords = ['безпечн', 'легітимн', 'немає ознак', 'нормальн', 'safe', 'legitimate'];

      const hasThreat = threatKeywords.some(w => new RegExp(w, 'i').test(fullTextLower));
      const hasSafe = safeKeywords.some(w => new RegExp(w, 'i').test(fullTextLower));

      if (hasThreat && !hasSafe) {
        isScam = true;
        if (confidence < 50) confidence = 90;
      } else if (hasSafe && !hasThreat && !isScam) {
        if (confidence > 50) confidence = 20;
      }

      if (!reasoning) {
        reasoning = isScam
          ? 'Scam pattern detected: deceptive intent to harvest sensitive credentials.'
          : 'No significant indicators of phishing or social engineering detected.';
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
