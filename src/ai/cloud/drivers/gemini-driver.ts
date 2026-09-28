import {
  ICloudLLMDriver,
  CloudVerificationRequest,
  CloudVerificationResponse,
  CloudTextGenerationRequest,
  CloudTextGenerationResponse,
} from '../types';

export class GeminiDriver implements ICloudLLMDriver {
  public static readonly CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];

  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const primaryModel = request.model || 'gemini-3.8-flash';
    const baseUrl = request.customBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';

    const modelsToTry = [primaryModel, ...GeminiDriver.CANDIDATE_MODELS.filter((m) => m !== primaryModel)];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      const endpoint = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(request.apiKey)}`;
      const body = {
        contents: [
          {
            parts: [{ text: request.sanitizedPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      };

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: request.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (response.status === 404 || errText.includes('NOT_FOUND') || errText.includes('is not found')) {
            console.warn(`[ThreatShield:Gemini] Модель ${model} недоступна (404), спроба наступної моделі...`);
            lastError = new Error(`Gemini API 404: ${model} not found`);
            continue;
          }
          throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 200)}`);
        }

        const latencyMs = Math.round(performance.now() - startTime);
        const data = await response.json();
        const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        let parsed: any = null;
        try {
          parsed = JSON.parse(rawReply);
        } catch {
          const clean = rawReply.replace(/```json/gi, '').replace(/```/g, '').trim();
          const first = clean.indexOf('{');
          const last = clean.lastIndexOf('}');
          if (first !== -1 && last !== -1) {
            parsed = JSON.parse(clean.substring(first, last + 1));
          }
        }

        const isScam = !!(parsed?.isScam ?? parsed?.is_scam ?? false);
        const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : (isScam ? 90 : 15);
        const scamType = parsed?.scamType || parsed?.scam_type || (isScam ? 'SUSPICIOUS_LURE' : undefined);
        const reasoning = parsed?.reasoning || (isScam ? 'Виявлено ознаки шахрайства' : 'Ознак загрози не виявлено');

        return {
          isScam,
          confidence: Math.max(0, Math.min(100, confidence)),
          scamType,
          reasoning,
          rawResponse: rawReply,
          latencyMs,
          provider: 'gemini',
          modelUsed: model,
        };
      } catch (err: any) {
        if (err?.name === 'AbortError' || request.signal?.aborted) throw err;
        lastError = err;
        if (!err?.message?.includes('404')) throw err;
      }
    }

    throw lastError || new Error('All Gemini candidate models failed.');
  }

  public async generateText(request: CloudTextGenerationRequest): Promise<CloudTextGenerationResponse> {
    const startTime = performance.now();
    const primaryModel = request.model || 'gemini-3.8-flash';
    const baseUrl = request.customBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';

    const modelsToTry = [primaryModel, ...GeminiDriver.CANDIDATE_MODELS.filter((m) => m !== primaryModel)];
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      const endpoint = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(request.apiKey)}`;
      const body: any = {
        contents: [
          {
            parts: [{ text: request.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.7,
        },
      };

      if (request.systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: request.systemPrompt }],
        };
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: request.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (response.status === 404 || errText.includes('NOT_FOUND') || errText.includes('is not found')) {
            console.warn(`[ThreatShield:Gemini] Модель ${model} недоступна (404), спроба наступної...`);
            lastError = new Error(`Gemini Text Gen 404: ${model} not found`);
            continue;
          }
          throw new Error(`Gemini Text Generation error (${response.status}): ${errText.slice(0, 200)}`);
        }

        const latencyMs = Math.round(performance.now() - startTime);
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return {
          text: rawText.trim(),
          latencyMs,
          provider: 'gemini',
          modelUsed: model,
        };
      } catch (err: any) {
        if (err?.name === 'AbortError' || request.signal?.aborted) throw err;
        lastError = err;
        if (!err?.message?.includes('404')) throw err;
      }
    }

    throw lastError || new Error('All Gemini candidate models failed for text generation.');
  }

  /**
   * Швидка перевірка валідності API ключа та зв'язку з Gemini
   */
  public static async testKey(
    apiKey: string,
    model: string = 'gemini-3.8-flash',
    baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta'
  ): Promise<{ success: boolean; modelUsed?: string; latencyMs?: number; error?: string }> {
    const startTime = performance.now();
    const modelsToTry = [model, ...GeminiDriver.CANDIDATE_MODELS.filter((m) => m !== model)];

    for (const m of modelsToTry) {
      try {
        const endpoint = `${baseUrl}/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with OK' }] }],
          }),
        });

        if (res.ok) {
          const latencyMs = Math.round(performance.now() - startTime);
          return { success: true, modelUsed: m, latencyMs };
        }

        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;

        if (res.status === 404 || errMsg.includes('not found')) {
          continue; // Спробувати наступну модель
        }

        return { success: false, error: errMsg };
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
      }
    }

    return { success: false, error: 'Жодна з тестових моделей Gemini не відповіла (404 Not Found)' };
  }
}
