import {
  ICloudLLMDriver,
  CloudVerificationRequest,
  CloudVerificationResponse,
  CloudTextGenerationRequest,
  CloudTextGenerationResponse,
} from '../types';

export class GroqDriver implements ICloudLLMDriver {
  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const model = request.model || 'llama-3.3-70b-versatile';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an ultra-fast cybersecurity arbiter analyzing online threats. You must respond strictly with valid JSON with keys: "isScam" (boolean), "confidence" (number 0-100), "scamType" (string), "reasoning" (concise explanation in Ukrainian).',
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
      throw new Error(`Groq API error (${response.status}): ${errText.slice(0, 200)}`);
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
      provider: 'groq',
      modelUsed: model,
    };
  }

  public async generateText(request: CloudTextGenerationRequest): Promise<CloudTextGenerationResponse> {
    const startTime = performance.now();
    const model = request.model || 'llama-3.3-70b-versatile';
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
      const errText = await response.text().catch(() => '');
      throw new Error(`Groq Text Generation error (${response.status}): ${errText.slice(0, 200)}`);
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
}
