import { ICloudLLMDriver, CloudVerificationRequest, CloudVerificationResponse } from '../types';

export class GeminiDriver implements ICloudLLMDriver {
  public async verifyThreat(request: CloudVerificationRequest): Promise<CloudVerificationResponse> {
    const startTime = performance.now();
    const model = request.model || 'gemini-1.5-flash';
    const baseUrl = request.customBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawReply);
    } catch {
      // Regex fallback
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
  }
}
