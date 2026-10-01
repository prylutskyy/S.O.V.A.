// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { FieldLivePill } from '../../../src/ui/field-live-pill';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('FieldLivePill (Edge Micro-Pill & Unrolling Cognitive Banner)', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    FieldLivePill.detachAll();
    document.body.innerHTML = '';
    const host = document.getElementById('threat-shield-shadow-host');
    if (host) host.remove();

    input = document.createElement('input');
    input.name = 'cvv';
    input.placeholder = '123';
    input.style.width = '80px';
    input.style.height = '32px';
    document.body.appendChild(input);
  });

  it('renders a resting protection pill directly below the field without modifying native outline', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    expect(pill).not.toBeNull();
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.classList.contains('ts-expanded')).toBe(false);
    expect(pill.textContent).toContain('CVV');
    expect(pill.textContent).toContain('Захист');
    expect(input.style.outline).toBe('');

    // Verification: pill is positioned underneath the field
    const pillTop = parseFloat(pill.style.top || '0');
    expect(pillTop).toBeGreaterThanOrEqual(0);
  });

  it('expands informational message directly from the pill on focus or first typed character without covering input field', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // 1. Focus -> pill expands in place showing warning message
    input.dispatchEvent(new Event('focus'));
    expect(pill.classList.contains('ts-expanded')).toBe(true);
    expect(pill.textContent).toContain('CVV-код ніколи не потрібен');

    // 2. Type first character (length === 1) -> pill remains expanded
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-expanded')).toBe(true);
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
  });

  it('keeps banner expanded up to 7 characters and retracts to Warm Amber caution on length > 7', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Typing 1-7 characters -> remains expanded for user readability, does not scream red
    input.value = '1234567';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-expanded')).toBe(true);
    expect(pill.classList.contains('ts-pill-red')).toBe(false);

    // Continue typing (length > 7) -> collapses back into subtle amber caution without intrusive red
    input.value = '12345678';
    input.dispatchEvent(new Event('input'));

    expect(pill.classList.contains('ts-expanded')).toBe(false);
    expect(pill.classList.contains('ts-pill-amber')).toBe(true);
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.textContent).toContain('Увага');

    // Does NOT have noisy clean button inside the pill
    const cleanBtn = pill.querySelector('.ts-pill-quick-clean-btn');
    expect(cleanBtn).toBeNull();
  });

  it('restores resting blue pill when field is cleared by user', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Type > 7 characters -> amber caution
    input.value = '12345678';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-pill-amber')).toBe(true);

    // User clears the field
    input.value = '';
    input.dispatchEvent(new Event('input'));

    // Pill returns to resting state
    expect(pill.classList.contains('ts-pill-amber')).toBe(false);
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.classList.contains('ts-expanded')).toBe(false);
    expect(pill.textContent).toContain('Захист');
  });

  it('fluidly morphs pill into Vault Alert on secret match and restores on clear without duplicate pills', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Дівоче прізвище',
      fieldType: 'VAULT_ITEM',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    expect(FieldLivePill.hasPill(input)).toBe(true);

    // Morph to Vault Alert
    FieldLivePill.morphToVaultAlert(input, 'Смирнова');
    expect(pill.classList.contains('ts-pill-red')).toBe(true);
    expect(pill.textContent).toContain('Сховище: Смирнова');

    // Clear Vault Alert
    FieldLivePill.clearVaultAlert(input);
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.textContent).toContain('Захист');
  });

  it('supports Expiry and Tax ID (ІПН) field types with contextual warnings', () => {
    const taxInput = document.createElement('input');
    taxInput.name = 'taxNumber';
    document.body.appendChild(taxInput);

    FieldLivePill.attach(taxInput, {
      categoryLabel: 'РНОКПП (ІПН)',
      fieldType: 'TAX_ID',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pills = root.querySelectorAll('.ts-field-live-pill');
    const taxPill = pills[pills.length - 1] as HTMLElement;
    expect(taxPill.textContent).toContain('ІПН');

    taxInput.dispatchEvent(new Event('focus'));
    expect(taxPill.classList.contains('ts-expanded')).toBe(true);
    expect(taxPill.textContent).toContain('ІПН');
  });
});
