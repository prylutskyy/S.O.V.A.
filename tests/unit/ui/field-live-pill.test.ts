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

  it('retracts expanded message and morphs pill into Red Alert on continued typing (length >= 2)', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Start filling 1 character -> expanded
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-expanded')).toBe(true);

    // Continue typing (length >= 2) -> collapses back and turns red
    input.value = '45';
    input.dispatchEvent(new Event('input'));

    expect(pill.classList.contains('ts-expanded')).toBe(false);
    expect(pill.classList.contains('ts-pill-red')).toBe(true);
    expect(pill.textContent).toContain('Увага');

    // Has quick clean button inside the red pill
    const cleanBtn = pill.querySelector('.ts-pill-quick-clean-btn');
    expect(cleanBtn).not.toBeNull();
    expect(cleanBtn?.textContent).toContain('Очистити');
  });

  it('restores resting blue pill when field is cleared by user', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Type 3 characters -> red pill
    input.value = '789';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-pill-red')).toBe(true);

    // User hits backspace, clearing the field
    input.value = '';
    input.dispatchEvent(new Event('input'));

    // Pill returns to resting state
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.classList.contains('ts-expanded')).toBe(false);
    expect(pill.textContent).toContain('Захист');
  });

  it('clears field and resets pill to resting state via inline clean button in the pill', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Type CVV -> red alert
    input.value = '999';
    input.dispatchEvent(new Event('input'));
    expect(pill.classList.contains('ts-pill-red')).toBe(true);

    const cleanBtn = pill.querySelector('.ts-pill-quick-clean-btn') as HTMLButtonElement;
    expect(cleanBtn).not.toBeNull();

    cleanBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Field value cleared, pill back to resting blue
    expect(input.value).toBe('');
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
