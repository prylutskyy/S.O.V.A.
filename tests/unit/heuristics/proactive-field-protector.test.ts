// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProactiveFieldProtector } from '../../../src/heuristics/proactive-field-protector';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('ProactiveFieldProtector (Sanctuary Sealed Apertures)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const existingHost = document.getElementById('threat-shield-shadow-host');
    if (existingHost) existingHost.remove();
    ProactiveFieldProtector.reset();
  });

  it('proactively seals secret word / mother maiden name field on untrusted origin', () => {
    const form = document.createElement('form');
    const container = document.createElement('div');
    container.className = 'question';

    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = 'Дівоче прізвище вашої матері *';

    const input = document.createElement('input');
    input.name = 'secretWord';
    input.placeholder = 'Ваша відповідь';

    container.appendChild(title);
    container.appendChild(input);
    form.appendChild(container);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('untrusted-survey-phish.com');

    // Field should be sealed with FieldLivePill without intrusive outline
    expect(input.dataset.sanctuarySealed).toBe('true');
    expect(input.style.outline).toBe('');

    // FieldLivePill should be in Shadow DOM
    const shadowRoot = ShadowHost.getRoot();
    const pill = shadowRoot.querySelector('.ts-field-live-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('Захист');
  });

  it('proactively seals CVV / CVC field on untrusted origin', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'cvv';
    input.placeholder = 'CVV2 / CVC2';
    form.appendChild(input);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('fake-delivery-payment.xyz');

    expect(input.dataset.sanctuarySealed).toBe('true');
    expect(input.dataset.sanctuaryLabel).toContain('CVV');
    const shadowRoot = ShadowHost.getRoot();
    const pill = shadowRoot.querySelector('.ts-field-live-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('CVV');
  });

  it('does NOT seal fields on whitelisted or accredited domains', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'cvv';
    input.placeholder = 'CVV2';
    form.appendChild(input);
    document.body.appendChild(form);

    // Whitelisted banking gateway
    ProactiveFieldProtector.init('privatbank.ua');

    expect(input.dataset.sanctuarySealed).toBeUndefined();

    const shadowRoot = ShadowHost.getRoot();
    expect(shadowRoot.querySelector('.ts-field-live-pill')).toBeNull();
  });

  it('unseals field and restores interactivity when unsealField is called', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'taxId';
    input.placeholder = 'Індивідуальний податковий номер (ІПН)';
    form.appendChild(input);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('fake-job-portal.com');
    expect(input.dataset.sanctuarySealed).toBe('true');

    ProactiveFieldProtector.unsealField(input, true);

    expect(input.dataset.sanctuarySealed).toBeUndefined();
    expect(input.dataset.sanctuaryUnsealed).toBe('true');
    // Crucial: threatShieldApproved must NOT be set, so real-time vault warning remains active!
    expect(input.dataset.threatShieldApproved).toBeUndefined();
    expect(input.style.outline).toBe('');

    const shadowRoot = ShadowHost.getRoot();
    expect(shadowRoot.querySelector('.ts-field-live-pill')).toBeNull();
  });

  it('renders and closes Loupe Tooltip on demand with smooth exit animation', async () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'secretWord';
    input.placeholder = 'Секретне слово';
    form.appendChild(input);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('unknown-phishing.org');
    ProactiveFieldProtector.showTooltipForElement(input);

    const shadowRoot = ShadowHost.getRoot();
    const tooltip = shadowRoot.querySelector('.ts-sanctuary-loupe-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('Поле убезпечено Sanctuary');
    expect(tooltip?.textContent).toContain('Розблокувати поле');

    // Clicking unlock button in tooltip
    const unlockBtn = tooltip?.querySelector('#ts-unlock-btn') as HTMLButtonElement;
    unlockBtn.click();

    expect(input.dataset.sanctuarySealed).toBeUndefined();
    expect(input.readOnly).toBe(false);
    expect(tooltip?.classList.contains('ts-closing')).toBe(true);

    await new Promise((r) => setTimeout(r, 160));
    expect(shadowRoot.querySelector('.ts-sanctuary-loupe-tooltip')).toBeNull();
  });

  it('preserves real-time vault leakage warning on unsealed fields when sensitive data is typed', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'secretWord';
    input.placeholder = 'Секретне слово';
    form.appendChild(input);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('untrusted-site.xyz');
    expect(input.dataset.sanctuarySealed).toBe('true');

    // Unseal field manually
    ProactiveFieldProtector.unsealField(input, true);
    expect(input.dataset.sanctuaryUnsealed).toBe('true');
    // Ensure threatShieldApproved is undefined so checkRealtimeVaultLeakage is NOT bypassed!
    expect(input.dataset.threatShieldApproved).toBeUndefined();
  });

  it('accurately seals fake-survey.html fields (fullName left open, taxId & secretWord sealed)', () => {
    const form = document.createElement('form');
    form.action = '/submit-survey';
    form.method = 'POST';

    // 1. fullName
    const q1 = document.createElement('div');
    q1.className = 'question';
    const t1 = document.createElement('div');
    t1.className = 'q-title';
    t1.textContent = 'Ваше повне ПІБ *';
    const inp1 = document.createElement('input');
    inp1.name = 'fullName';
    inp1.required = true;
    inp1.placeholder = 'Ваша відповідь';
    q1.appendChild(t1);
    q1.appendChild(inp1);
    form.appendChild(q1);

    // 2. taxId
    const q2 = document.createElement('div');
    q2.className = 'question';
    const t2 = document.createElement('div');
    t2.className = 'q-title';
    t2.textContent = 'Індивідуальний податковий номер (ІПН) *';
    const d2 = document.createElement('div');
    d2.className = 'q-desc';
    d2.textContent = 'Необхідно для сплати податків компанією.';
    const inp2 = document.createElement('input');
    inp2.name = 'taxId';
    inp2.required = true;
    inp2.placeholder = 'Ваша відповідь';
    q2.appendChild(t2);
    q2.appendChild(d2);
    q2.appendChild(inp2);
    form.appendChild(q2);

    // 3. secretWord
    const q3 = document.createElement('div');
    q3.className = 'question';
    const t3 = document.createElement('div');
    t3.className = 'q-title';
    t3.textContent = 'Дівоче прізвище вашої матері *';
    const d3 = document.createElement('div');
    d3.className = 'q-desc';
    d3.textContent = 'Використовується як секретне слово для корпоративного акаунту.';
    const inp3 = document.createElement('input');
    inp3.name = 'secretWord';
    inp3.required = true;
    inp3.placeholder = 'Ваша відповідь';
    q3.appendChild(t3);
    q3.appendChild(d3);
    q3.appendChild(inp3);
    form.appendChild(q3);

    document.body.appendChild(form);

    ProactiveFieldProtector.init('file://fake-survey.html');

    // fullName must remain open
    expect(inp1.dataset.sanctuarySealed).toBeUndefined();
    expect(inp1.readOnly).toBe(false);

    // taxId must be sealed
    expect(inp2.dataset.sanctuarySealed).toBe('true');
    expect(inp2.dataset.sanctuaryLabel).toContain('ІПН');

    // secretWord must be sealed
    expect(inp3.dataset.sanctuarySealed).toBe('true');
    expect(inp3.dataset.sanctuaryLabel).toMatch(/Дівоче прізвище|Секретне/i);
  });

  it('proactively seals CVV and Vault fields on monitored platforms like olx.ua (non-immune)', () => {
    const form = document.createElement('form');
    const cvvInput = document.createElement('input');
    cvvInput.name = 'card_cvv';
    cvvInput.placeholder = 'CVV';
    form.appendChild(cvvInput);

    const secretInput = document.createElement('input');
    secretInput.name = 'secretWord';
    secretInput.placeholder = 'Дівоче прізвище матері';
    form.appendChild(secretInput);

    document.body.appendChild(form);

    ProactiveFieldProtector.init('olx.ua');

    // Both CVV and Secret Word MUST be sealed on olx.ua!
    expect(cvvInput.dataset.sanctuarySealed).toBe('true');
    expect(cvvInput.dataset.sanctuaryLabel).toContain('CVV');
    expect(secretInput.dataset.sanctuarySealed).toBe('true');
    expect(secretInput.dataset.sanctuaryLabel).toMatch(/Дівоче прізвище|Секретне/i);
  });

  it('respects manual user whitelist override on olx.ua when added to UserWhitelistManager', () => {
    vi.spyOn(UserWhitelistManager, 'isDomainAllowedSync').mockReturnValue(true);

    const form = document.createElement('form');
    const cvvInput = document.createElement('input');
    cvvInput.name = 'cvv';
    form.appendChild(cvvInput);
    document.body.appendChild(form);

    ProactiveFieldProtector.init('olx.ua');

    expect(cvvInput.dataset.sanctuarySealed).toBeUndefined();
  });
});
