import {
  ICloudLLMDriver,
  CloudVerificationRequest,
  CloudVerificationResponse,
  CloudTextGenerationRequest,
  CloudTextGenerationResponse,
  ModelInfo,
} from '../types';

export class OpenRouterDriver implements ICloudLLMDriver {
  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const model = request.model || 'google/gemini-2.0-flash-exp:free';
    const baseUrl = (request.customBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a cybersecurity arbiter protecting THE USER ([Ви]) from social engineering and phishing attacks directed at them. Classify whether [Ви] is actively being targeted as a victim (isScam: true) or if this is safe/meta-discussion/quoting (isScam: false). Respond strictly with valid JSON with keys: "isScam" (boolean), "confidence" (number 0-100), "scamType" (string), "reasoning" (concise explanation in Ukrainian, max 35 words).',
        },
        {
          role: 'user',
          content: request.sanitizedPrompt,
        },
      ],
      temperature: 0.1,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
        'HTTP-Referer': 'https://sanctuary-prism.local',
        'X-Title': 'Sanctuary Prism',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter API error (${response.status}): ${errText.slice(0, 200)}`);
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
    const model = request.model || 'google/gemini-2.0-flash-exp:free';
    const baseUrl = (request.customBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
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
        'HTTP-Referer': 'https://sanctuary-prism.local',
        'X-Title': 'Sanctuary Prism',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter Text Generation error (${response.status}): ${errText.slice(0, 200)}`);
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

  public async listModels(apiKey: string, customBaseUrl?: string): Promise<ModelInfo[]> {
    return OpenRouterDriver.listModels(apiKey, customBaseUrl);
  }

  public static async listModels(apiKey: string, customBaseUrl?: string): Promise<ModelInfo[]> {
    const baseUrl = (customBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/models`;
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://sanctuary-prism.local',
        'X-Title': 'Sanctuary Prism',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || `OpenRouter API error (${res.status})`);
    }
    const data = await res.json();
    const models: any[] = data?.data || [];
    return models
      .map((m) => ({
        id: m.id,
        label: m.name ? `${m.name} (${m.id})` : m.id,
        description: m.description,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
