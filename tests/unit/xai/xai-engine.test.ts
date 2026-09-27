import { describe, it, expect } from 'vitest';
import { XaiEngine } from '../../../src/xai/xai-engine';
import { ThreatAssessment } from '../../../src/types';

describe('XaiEngine (Explainable AI)', () => {
  it('should deterministically generate Intent vs Reality contrast for delivery scam', async () => {
    const assessment: ThreatAssessment = {
      score: 90,
      level: 'CRITICAL',
      triggers: [
        {
          name: 'payment_inversion_cvv',
          triggered: true,
          severity: 'CRITICAL',
          scoreContribution: 40,
          message: 'Виявлено спробу введення CVV коду для отримання коштів',
        },
      ],
      timestamp: Date.now(),
    };

    const explanation = await XaiEngine.generateExplanation({
      type: 'form',
      targetHost: 'olx-payments-safe.ua.xyz',
      assessment,
      activeContext: {
        sessionId: 'test-session-1',
        sourcePlatform: 'olx.ua',
        scenario: 'ESCROW_DELIVERY_FRAUD',
        threatLevel: 'HIGH',
        detectedKeywords: ['доставка', 'оплата'],
        offPlatformLure: true,
        timestamp: Date.now() - 60000,
        ttlMs: 300000,
      },
    });

    expect(explanation).toBeDefined();
    expect(explanation.intentVsReality).toBeDefined();
    expect(explanation.intentVsReality?.userIntent).toContain('Вам обіцяли зарахувати');
    expect(explanation.intentVsReality?.hiddenReality).toContain('вимагає секретний код CVV');
    expect(explanation.intentVsReality?.verdict).toContain('секретний тризначний код CVV ніколи не потрібен');
    expect(explanation.intentVsReality?.threatName).toContain('доставкою');
    expect(explanation.breakdown).toBeDefined();
    expect(explanation.breakdown.formula).toContain('RiskScore = f(');
  });

  it('should deterministically generate Intent vs Reality contrast for autofill trap', async () => {
    const assessment: ThreatAssessment = {
      score: 85,
      level: 'CRITICAL',
      triggers: [
        {
          name: 'hidden_sensitive_fields',
          triggered: true,
          severity: 'CRITICAL',
          scoreContribution: 45,
          message: 'Виявлено невидимі поля автозаповнення',
        },
      ],
      timestamp: Date.now(),
    };

    const explanation = await XaiEngine.generateExplanation({
      type: 'form',
      targetHost: 'phishing-login.com',
      assessment,
    });

    expect(explanation.intentVsReality).toBeDefined();
    expect(explanation.intentVsReality?.userIntent).toContain('заповнили лише видимі звичайні поля');
    expect(explanation.intentVsReality?.hiddenReality).toContain('потай викрадає збережені в браузері реквізити');
    expect(explanation.intentVsReality?.verdict).toContain('платіжних реквізитів не потрібне');
    expect(explanation.intentVsReality?.threatName).toContain('автозаповнення');
  });

  it('should deterministically generate contrast for chat leakage', async () => {
    const assessment: ThreatAssessment = {
      score: 95,
      level: 'CRITICAL',
      triggers: [
        {
          name: 'chat_cvv_leak',
          triggered: true,
          severity: 'CRITICAL',
          scoreContribution: 50,
          message: 'У тексті повідомлення виявлено CVV код',
        },
      ],
      timestamp: Date.now(),
    };

    const explanation = await XaiEngine.generateExplanation({
      type: 'chat',
      targetHost: 'olx.ua',
      assessment,
      chatLeakage: { hasCard: true, hasCvv: true },
    });

    expect(explanation.intentVsReality).toBeDefined();
    expect(explanation.intentVsReality?.userIntent).toContain('платіжні реквізити у відкритому чаті');
    expect(explanation.intentVsReality?.hiddenReality).toContain('передача секретного CVV дозволить співрозмовнику списати гроші');
    expect(explanation.intentVsReality?.verdict).toContain('потрібен лише номер картки або IBAN');
  });
});
