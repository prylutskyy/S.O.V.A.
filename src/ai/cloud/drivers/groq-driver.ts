import {
  ICloudLLMDriver,
  CloudVerificationRequest,
  CloudVerificationResponse,
  CloudTextGenerationRequest,
  CloudTextGenerationResponse,
  ModelInfo,
} from '../types';

export class GroqDriver implements ICloudLLMDriver {
  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const model = request.model || 'qwen/qwen3.8-27b';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a cybersecurity arbiter protecting THE USER ([Ви]) from social engineering and phishing attacks directed at them. Classify whether [Ви] is actively being targeted as a victim (isScam: true) or if this is safe/meta-discussion/quoting (isScam: false). Respond strictly with valid JSON with keys: "isScam" (boolean), "confidence" (number 0-100), "scamType" (string), "reasoning" (concise explanation in Ukrainian, max 35 words).',
        },
        {
          role: 'user',
          content: request.sanitizedPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `Groq API error (${response.status})`;
      throw new Error(errMsg);
    }

    const data = await response.json();
    const rawReply = data?.choices?.[0]?.message?.content || '';

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawReply);
    } catch {
      try {
        const clean = rawReply.replace(/```json/gi, '').replace(/```/g, '').trim();
        const first = clean.indexOf('{');
        const last = clean.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          parsed = JSON.parse(clean.substring(first, last + 1));
        }
      } catch {
        // Fallback when LLM output is truncated or non-JSON
      }
    }

    const isScam = !!(parsed?.isScam ?? parsed?.is_scam ?? false);
    const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : (isScam ? 90 : 15);
    const rawScamType = String(parsed?.scamType || parsed?.scam_type || '').trim();
    let scamType = rawScamType || (isScam ? 'SUSPICIOUS_LURE' : undefined);
    if (/military|sabotage|recruitment|диверс|верб/i.test(rawScamType)) {
      scamType = 'MILITARY_SABOTAGE_RECRUITMENT';
    }
    const reasoning = parsed?.reasoning || (isScam ? 'Виявлено ознаки шахрайства' : 'Ознак загрози не виявлено');

    return {
      isScam,
      confidence: Math.max(0, Math.min(100, confidence)),
      scamType,
      reasoning,
      rawResponse: rawReply,
      latencyMs,
      provider: 'groq',
      modelUsed: model,
    };
  }

  public async generateText(request: CloudTextGenerationRequest): Promise<CloudTextGenerationResponse> {
    const startTime = performance.now();
    const model = request.model || 'qwen/qwen3.8-27b';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const messages: any[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.userPrompt });

    const body = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `Groq Text Generation error (${response.status})`;
      throw new Error(errMsg);
    }

    const data = await response.json();
    const rawReply = data?.choices?.[0]?.message?.content || '';

    return {
      text: rawReply.trim(),
      latencyMs,
      provider: 'groq',
      modelUsed: model,
    };
  }

  /**
   * Запит списку доступних моделей через офіційний Groq API
   */
  public async listModels(apiKey: string): Promise<ModelInfo[]> {
    return GroqDriver.listModels(apiKey);
  }

  public static async listModels(apiKey: string): Promise<ModelInfo[]> {
    const endpoint = 'https://api.groq.com/openai/v1/models';
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || `Groq API error (${res.status})`);
    }
    const data = await res.json();
    const models: any[] = data?.data || [];
    return models
      .filter((m) => m.active !== false && !m.id.includes('whisper'))
      .map((m) => ({
        id: m.id,
        label: `${m.id}${m.owned_by ? ` [${m.owned_by}]` : ''}`,
        description: `Контекст: ${m.context_window || 'N/A'}`,
      }))
      .sort((a, b) => {
        const aQwen = a.id.toLowerCase().includes('qwen');
        const bQwen = b.id.toLowerCase().includes('qwen');
        if (aQwen && !bQwen) return -1;
        if (!aQwen && bQwen) return 1;
        const aLlama = a.id.includes('llama-3');
        const bLlama = b.id.includes('llama-3');
        if (aLlama && !bLlama) return -1;
        if (!aLlama && bLlama) return 1;
        return a.id.localeCompare(b.id);
      });
  }
}
