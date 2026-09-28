import {
  ICloudLLMDriver,
  CloudVerificationRequest,
  CloudVerificationResponse,
  CloudTextGenerationRequest,
  CloudTextGenerationResponse,
  ModelInfo,
} from '../types';

export class OpenAIDriver implements ICloudLLMDriver {
  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const model = request.model || (request.provider === 'openai' ? 'gpt-4o-mini' : 'gpt-3.5-turbo');
    const baseUrl = (request.customBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an elite cybersecurity arbiter analyzing online threats. You must respond strictly with valid JSON with keys: "isScam" (boolean), "confidence" (number 0-100), "scamType" (string), "reasoning" (concise explanation in Ukrainian).',
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
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawReply = data?.choices?.[0]?.message?.content || '';

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
      provider: request.provider,
      modelUsed: model,
    };
  }

  public async generateText(request: CloudTextGenerationRequest): Promise<CloudTextGenerationResponse> {
    const startTime = performance.now();
    const model = request.model || (request.provider === 'openai' ? 'gpt-4o-mini' : 'gpt-3.5-turbo');
    const baseUrl = (request.customBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

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
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI Text Generation error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawReply = data?.choices?.[0]?.message?.content || '';

    return {
      text: rawReply.trim(),
      latencyMs,
      provider: request.provider,
      modelUsed: model,
    };
  }

  /**
   * Запит списку доступних моделей через офіційний OpenAI API
   */
  public async listModels(apiKey: string, customBaseUrl?: string): Promise<ModelInfo[]> {
    return OpenAIDriver.listModels(apiKey, customBaseUrl);
  }

  public static async listModels(apiKey: string, customBaseUrl?: string): Promise<ModelInfo[]> {
    const baseUrl = (customBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/models`;
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || `OpenAI API error (${res.status})`);
    }
    const data = await res.json();
    const models: any[] = data?.data || [];
    return models
      .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
      .map((m) => ({
        id: m.id,
        label: m.id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
