// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatLivePill } from '../../../src/ui/chat-live-pill';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { SessionOutboundEvaluation } from '../../../src/heuristics/session-outbound-memory';

describe('ChatLivePill (Tactile Stack & Multi-Trigger Protection Deck)', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    ChatLivePill.hide();
    input = document.createElement('input');
    document.body.appendChild(input);
  });

  it('renders a single clean capsule when only one trigger is detected', () => {
    const evalSingle: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'CVV виявлено',
      riskLevel: 'CRITICAL',
      score: 85,
      triggers: [{ message: 'CVV виявлено', severity: 'CRITICAL', scoreContribution: 50 }],
      leakage: {
        hasCard: false,
        hasCvv: true,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [],
    };

    ChatLivePill.show(input, evalSingle);

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.classList.contains('ts-has-stack')).toBe(false);
    expect(pill.textContent).toContain('Код безпеки (CVV)');
    expect(pill.querySelector('.ts-pill-counter')).toBeNull();

    // Hover single pill -> opens single-trigger popover
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.querySelector('#ts-pill-clean-btn')).not.toBeNull();
    expect(popover.querySelector('#ts-pill-clean-all-btn')).toBeNull();
  });

  it('renders stacked capsule (One UI / iOS Stack) with +1 badge when two triggers fire', () => {
    const evalTwo: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'Чутливі дані',
      riskLevel: 'CRITICAL',
      score: 95,
      triggers: [],
      leakage: {
        hasCard: false,
        hasCvv: true,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [
        {
          id: 'v1',
          label: 'Пароль Приват24',
          category: 'PASSWORD',
          realValue: 'SecretPass123',
          maskedValue: 'Sec•••••',
        },
      ],
    };

    ChatLivePill.show(input, evalTwo);

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.classList.contains('ts-has-stack')).toBe(true);
    expect(pill.classList.contains('ts-has-stack-multi')).toBe(false);

    // Counter badge shows "+1"
    const counter = pill.querySelector('.ts-pill-counter');
    expect(counter).not.toBeNull();
    expect(counter?.textContent).toBe('+1');

    // Priority order: CVV (priority 3) is shown first ahead of Vault (priority 5)
    expect(pill.textContent).toContain('Код безпеки (CVV)');

    // Hover -> opens multi-item Protection Deck
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.querySelector('#ts-pill-clean-all-btn')).not.toBeNull();

    const rows = popover.querySelectorAll('.ts-deck-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Код безпеки (CVV)');
    expect(rows[1].textContent).toContain('Сховище: Пароль Приват24');
  });

  it('renders multi-stacked layers (+2) with Sabotage taking first priority over GPS and CVV', () => {
    const evalThree: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'Критична загроза',
      riskLevel: 'CRITICAL',
      score: 100,
      triggers: [],
      leakage: {
        hasCard: false,
        hasCvv: true,
        hasGps: true,
        hasSabotage: true,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [],
    };

    ChatLivePill.show(input, evalThree);

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.classList.contains('ts-has-stack')).toBe(true);
    expect(pill.classList.contains('ts-has-stack-multi')).toBe(true);

    // Primary label is Sabotage (highest priority: 1)
    expect(pill.textContent).toContain('Маркери безпеки');
    const counter = pill.querySelector('.ts-pill-counter');
    expect(counter?.textContent).toBe('+2');

    // Hover -> Protection Deck displays all 3 sorted by priority
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const rows = popover.querySelectorAll('.ts-deck-row');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Маркери безпеки');
    expect(rows[1].textContent).toContain('Точні координати');
    expect(rows[2].textContent).toContain('Код безпеки (CVV)');
  });

  it('cleans all sensitive triggers in one click via #ts-pill-clean-all-btn', () => {
    input.value = 'Сплата товару, cvv: 789, мої координати: 50.4501, 30.5234';

    const evalTwo: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'Чутливі дані',
      riskLevel: 'CRITICAL',
      score: 95,
      triggers: [],
      leakage: {
        hasCard: false,
        hasCvv: true,
        hasGps: true,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [],
    };

    ChatLivePill.show(input, evalTwo);
    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;

    // Open deck
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const cleanAllBtn = popover.querySelector('#ts-pill-clean-all-btn') as HTMLButtonElement;
    expect(cleanAllBtn).not.toBeNull();

    cleanAllBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Both CVV and GPS coordinates are stripped
    expect(input.value).not.toContain('789');
    expect(input.value).not.toContain('50.4501, 30.5234');
    expect(input.value).toContain('Сплата товару');
    expect(root.querySelector('.ts-chat-live-pill')).toBeNull();
  });

  it('strips only specific trigger when clicking individual clean button in deck', () => {
    input.value = 'cvv: 999, SecretVaultKey456';

    const evalTwo: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'Чутливі дані',
      riskLevel: 'CRITICAL',
      score: 90,
      triggers: [],
      leakage: {
        hasCard: false,
        hasCvv: true,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [
        {
          id: 'v_key',
          label: 'API Ключ',
          category: 'API_TOKEN',
          realValue: 'SecretVaultKey456',
          maskedValue: 'Sec•••••••••••',
        },
      ],
    };

    ChatLivePill.show(input, evalTwo);
    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;

    // Open deck
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const singleBtns = popover.querySelectorAll('.ts-pill-clean-single-btn');
    expect(singleBtns.length).toBe(2);

    // Click to remove only CVV (first button)
    singleBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // CVV removed, but SecretVaultKey456 preserved
    expect(input.value).not.toContain('999');
    expect(input.value).toContain('SecretVaultKey456');
  });
});
