// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';

describe('DebuggerOverlay Lifecycle & Visibility Guard (Swiss Loupe)', () => {
  beforeEach(() => {
    DebuggerOverlay.hide();
    DebuggerOverlay.clear();
    const existing = document.getElementById('threatshield-neuro-monitor');
    if (existing) existing.remove();
    DebuggerOverlay['container'] = null;
    DebuggerOverlay['shadowRoot'] = null;
  });

  it('starts hidden and isOpen() returns false by default', () => {
    expect(DebuggerOverlay.isOpen()).toBe(false);
  });

  it('keeps an active warning visible despite cancelled drafts and background context echoes', () => {
    DebuggerOverlay.setSession('chat-1', 'HIGH');
    DebuggerOverlay.setThreatDecision('WARN', 'IDENTITY_PROBING', 45, 'local');
    DebuggerOverlay.recordMitigation('Чернетку видалено', 30, 'MEDIUM');
    DebuggerOverlay.setAssessment(0, 'LOW');
    DebuggerOverlay.setSession('chat-1', 'HIGH');
    DebuggerOverlay.setThreatDecision('WARN', 'IDENTITY_PROBING', 75, 'inherited');
    DebuggerOverlay.show();
    const text = DebuggerOverlay['shadowRoot']!.textContent;
    expect(text).toContain('АКТИВНА ЗАГРОЗА: ПОПЕРЕДЖЕННЯ');
    expect(text).not.toContain('БЕЗПЕЧНО');
    expect(DebuggerOverlay['state'].score).toBe(45);
    const report = JSON.parse(DebuggerOverlay['exportDiagnosticReport']());
    expect(report.activeDecision).toMatchObject({ action: 'WARN', score: 45, source: 'local' });
  });

  it('clears the final action on reset and keeps a hidden debugger hidden', () => {
    DebuggerOverlay.setThreatDecision('LOCK_INPUT', 'CRYPTO_WALLET_COMPROMISE', 85, 'local');
    expect(DebuggerOverlay.isOpen()).toBe(false);
    DebuggerOverlay.show();
    expect(DebuggerOverlay['shadowRoot']!.textContent).toContain('АКТИВНА ЗАГРОЗА: ВВІД ЗАБЛОКОВАНО');
    DebuggerOverlay.resetSessionRisk();
    expect(DebuggerOverlay['shadowRoot']!.textContent).toContain('БЕЗПЕЧНО: ЗАГРОЗ НЕ ВИЯВЛЕНО');
    expect(DebuggerOverlay['state'].activeDecision).toBeNull();
  });

  it('does NOT show overlay or container when log() or logAI() is called while debugger is disabled', () => {
    DebuggerOverlay.log('Тестовий крок', 'Безпечно', '#34C759');
    DebuggerOverlay.logAI('ШІ-Аналіз', 'Аналіз завершено', '#0071E3');

    expect(DebuggerOverlay.isOpen()).toBe(false);
    const container = document.getElementById('threatshield-neuro-monitor');
    if (container) {
      expect(container.style.display).toBe('none');
    }
  });

  it('does NOT show overlay when recordMitigation() is called upon modal cancellation', () => {
    DebuggerOverlay.recordMitigation('Відправку форми заблоковано користувачем', 85, 'HIGH');

    expect(DebuggerOverlay.isOpen()).toBe(false);
    expect(DebuggerOverlay.isThreatMitigated()).toBe(true);
    expect(DebuggerOverlay.getPeakScore()).toBe(85);

    const container = document.getElementById('threatshield-neuro-monitor');
    if (container) {
      expect(container.style.display).toBe('none');
    }
  });

  it('shows overlay and container only when show() is explicitly called (e.g. debugMode enabled)', () => {
    DebuggerOverlay.show();

    expect(DebuggerOverlay.isOpen()).toBe(true);
    const container = document.getElementById('threatshield-neuro-monitor');
    expect(container).not.toBeNull();
    expect(container?.style.display).toBe('block');
  });

  it('hides container when hide() is called and prevents subsequent recordMitigation from showing it', () => {
    DebuggerOverlay.show();
    expect(DebuggerOverlay.isOpen()).toBe(true);

    DebuggerOverlay.hide();
    expect(DebuggerOverlay.isOpen()).toBe(false);

    const container = document.getElementById('threatshield-neuro-monitor');
    expect(container?.style.display).toBe('none');

    // Trigger mitigation and assessment update while hidden
    DebuggerOverlay.recordMitigation('Загрозу відвернено користувачем', 95, 'CRITICAL');
    DebuggerOverlay.setAssessment(0, 'LOW');

    // Container must strictly remain hidden
    expect(DebuggerOverlay.isOpen()).toBe(false);
    expect(container?.style.display).toBe('none');
  });

  it('renders correct prototype chip names in vectors tab without mislabeling sabotage as CVV theft', () => {
    DebuggerOverlay.show();

    DebuggerOverlay.recordVectorTelemetry({
      rawText: 'Поджог военного бусика за 1800 USDT',
      latestMessage: 'Поджог военного бусика за 1800 USDT',
      topPrototypeId: 'MILITARY_SABOTAGE_RECRUITMENT',
      topPrototypeLabel: 'Ознаки ворожого вербування або розвідувально-диверсійної діяльності',
      cosineSimilarity: 0.90,
      hasFormedIntent: true,
      intentType: 'MILITARY_SABOTAGE_RECRUITMENT',
      confidence: 90,
      reason: 'Семантичний збіг: диверсія',
      dimensions: [
        { key: 'reward', labelUk: 'Винагорода', inputWeight: 0.9, prototypeWeight: 0.85, matchedTokens: ['1800 USDT'] },
        { key: 'action', labelUk: 'Дія / Завдання', inputWeight: 0.8, prototypeWeight: 0.9, matchedTokens: ['Поджог'] },
      ],
      allPrototypes: [
        {
          id: 'MILITARY_SABOTAGE_RECRUITMENT',
          labelUk: 'Ознаки ворожого вербування або розвідувально-диверсійної діяльності',
          similarity: 0.90,
          prototypeWeights: { reward: 0.85, action: 0.9 },
        },
        {
          id: 'ESCROW_DELIVERY_SCAM',
          labelUk: 'Імітація фінансової угоди або фейкова курєрська доставка',
          similarity: 0.36,
          prototypeWeights: { reward: 0.75, action: 0.6 },
        },
        {
          id: 'PAYMENT_CREDENTIAL_THEFT',
          labelUk: 'Виманювання платіжних реквізитів або кодів авторизації',
          similarity: 0.31,
          prototypeWeights: { reward: 0.4, action: 0.7 },
        },
      ],
      timestamp: Date.now(),
    });

    DebuggerOverlay['state'].activeTab = 'vectors';
    DebuggerOverlay['render']();

    const shadowRoot = DebuggerOverlay['shadowRoot'];
    expect(shadowRoot).not.toBeNull();

    const chips = shadowRoot!.querySelectorAll('.sc-proto-chip');
    expect(chips.length).toBe(3);

    const chipTexts = Array.from(chips).map((c) => c.textContent?.trim() || '');

    // Chip 1 must be Recruitment / Sabotage, NOT CVV
    expect(chipTexts[0]).toContain('Вербування / Диверсія');
    expect(chipTexts[0]).toContain('90% [ТРИГЕР]');
    expect(chipTexts[0]).not.toContain('Викрадення CVV');

    // Chip 2 must be Escrow
    expect(chipTexts[1]).toContain('Ескроу-доставка');
    expect(chipTexts[1]).toContain('36%');

    // Chip 3 must be CVV theft
    expect(chipTexts[2]).toContain('Викрадення CVV');
    expect(chipTexts[2]).toContain('31%');
  });
});
