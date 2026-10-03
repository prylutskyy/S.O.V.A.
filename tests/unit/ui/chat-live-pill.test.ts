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
    expect(pill.textContent).toContain('chatPillLabelCvv');
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
    expect(pill.textContent).toContain('chatPillLabelCvv');

    // Hover -> opens multi-item Protection Deck
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.querySelector('#ts-pill-clean-all-btn')).not.toBeNull();

    const rows = popover.querySelectorAll('.ts-deck-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('chatPillLabelCvv');
    expect(rows[1].textContent).toContain('fieldPillVaultMatch: Пароль Приват24');
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
    expect(pill.textContent).toContain('chatPillLabelSecurityMarkers');
    const counter = pill.querySelector('.ts-pill-counter');
    expect(counter?.textContent).toBe('+2');

    // Hover -> Protection Deck displays all 3 sorted by priority
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const rows = popover.querySelectorAll('.ts-deck-row');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('chatPillLabelSecurityMarkers');
    expect(rows[1].textContent).toContain('chatPillLabelGps');
    expect(rows[2].textContent).toContain('chatPillLabelCvv');
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

  it('accurately strips TAX_ID (ІПН) and mother maiden name from input text', () => {
    input.value = 'Ось мій ІПН: 3124567890, а дівоче прізвище матері Коваленко!';

    const evalVault: SessionOutboundEvaluation = {
      shouldBlock: true,
      reason: 'Виявлено конфіденційні маркери зі сховища',
      riskLevel: 'CRITICAL',
      score: 95,
      triggers: [],
      leakage: {
        hasCard: false,
        hasCvv: false,
        hasExpiry: false,
        hasOtp: false,
        cards: [],
        isCrossMessage: false,
      },
      vaultMatches: [
        {
          id: 'v_tax',
          label: 'РНОКПП (ІПН)',
          category: 'TAX_ID',
          realValue: '3124567890',
          decoyValue: '2987654321',
          keywords: ['іпн'],
          createdAt: 0,
        },
        {
          id: 'v_maiden',
          label: 'Дівоче прізвище матері',
          category: 'MOTHER_MAIDEN_NAME',
          realValue: 'Коваленко',
          decoyValue: 'Шевченко',
          keywords: ['прізвище'],
          createdAt: 0,
        },
      ],
    };

    ChatLivePill.show(input, evalVault);
    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-chat-live-pill') as HTMLElement;
    expect(pill).not.toBeNull();

    // Hover -> deck with 2 vault items
    pill.dispatchEvent(new MouseEvent('mouseenter'));
    const popover = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const singleBtns = popover.querySelectorAll('.ts-pill-clean-single-btn');
    expect(singleBtns.length).toBe(2);

    // 1. Remove TAX_ID specifically
    singleBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).not.toContain('3124567890');
    expect(input.value).toContain('Коваленко');

    // Show pill again for maiden name
    const evalSingleVault: SessionOutboundEvaluation = {
      ...evalVault,
      vaultMatches: [evalVault.vaultMatches[1]],
    };
    ChatLivePill.show(input, evalSingleVault);

    // 2. Open single-trigger popover and click clean
    const pill2 = root.querySelector('.ts-chat-live-pill') as HTMLElement;
    pill2.dispatchEvent(new MouseEvent('mouseenter'));
    const popover2 = root.querySelector('.ts-chat-live-popover') as HTMLElement;
    const singleCleanBtn = popover2.querySelector('#ts-pill-clean-btn') as HTMLButtonElement;
    expect(singleCleanBtn).not.toBeNull();

    singleCleanBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).not.toContain('Коваленко');
  });

  it('ensures popover and deck container suppress horizontal scrollbar and button hover scaling', () => {
    const root = ShadowHost.getRoot();
    ChatLivePill.show(input, {
      shouldBlock: true,
      riskLevel: 'CRITICAL',
      score: 80,
      triggers: [],
      leakage: { hasCard: false, hasCvv: true, hasExpiry: false, hasOtp: false, cards: [], isCrossMessage: false },
      vaultMatches: [],
    });

    const styleEl = root.getElementById('ts-chat-live-pill-styles') as HTMLStyleElement;
    expect(styleEl).not.toBeNull();
    const css = styleEl.textContent || '';

    // Must prevent horizontal scrollbar via overflow-x: hidden
    expect(css).toContain('overflow-x: hidden !important');
    expect(css).toContain('.ts-deck-body::-webkit-scrollbar-horizontal');

    // Buttons must NOT scale on hover (which caused the overflow glitch)
    expect(css).not.toContain('.ts-pill-btn-primary:hover {\n        transform: translateY(-1px) scale');
    expect(css).not.toContain('.ts-pill-btn-secondary:hover {\n        background-color: rgba(239, 68, 68, 0.10) !important;\n        color: #DC2626 !important;\n        border-color: rgba(239, 68, 68, 0.25) !important;\n        transform: scale');
  });
});
