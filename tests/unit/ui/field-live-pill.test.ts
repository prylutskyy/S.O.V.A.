// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldLivePill } from '../../../src/ui/field-live-pill';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('FieldLivePill (Edge Micro-Pill & Unrolling Cognitive Curtain)', () => {
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

  it('renders a resting protection pill at the edge of the field without modifying native outline', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    expect(pill).not.toBeNull();
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(pill.textContent).toContain('CVV');
    expect(pill.textContent).toContain('Захист');
    expect(input.style.outline).toBe('');
  });

  it('unrolls informational banner covering small field on focus or first typed character', () => {
    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();

    // 1. Focus -> unrolls banner curtain
    input.dispatchEvent(new Event('focus'));
    let banner = root.querySelector('.ts-field-banner-curtain') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('CVV-код ніколи не потрібен');

    // 2. Type first character (length === 1) -> banner stays active
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    banner = root.querySelector('.ts-field-banner-curtain') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.classList.contains('ts-retracting')).toBe(false);
  });

  it('retracts banner with Apple easing curve and morphs pill into Red Alert on continued typing', async () => {
    vi.useFakeTimers();

    FieldLivePill.attach(input, {
      categoryLabel: 'Код безпеки (CVV)',
      fieldType: 'PAYMENT_CVV',
      isTierA: true,
    });

    const root = ShadowHost.getRoot();
    const pill = root.querySelector('.ts-field-live-pill') as HTMLElement;

    // Start filling
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    const banner = root.querySelector('.ts-field-banner-curtain') as HTMLElement;
    expect(banner).not.toBeNull();

    // Continue typing (length >= 2)
    input.value = '45';
    input.dispatchEvent(new Event('input'));

    // Banner begins retracting animation
    expect(banner.classList.contains('ts-retracting')).toBe(true);

    // Pill morphs to Red Alert
    expect(pill.classList.contains('ts-pill-red')).toBe(true);
    expect(pill.textContent).toContain('Увага');

    vi.advanceTimersByTime(250);
    expect(root.querySelector('.ts-field-banner-curtain')).toBeNull();

    vi.useRealTimers();
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
    expect(pill.textContent).toContain('Захист');
  });

  it('clears field and resets pill to resting state via popover clean button', () => {
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

    // Click pill to open popover
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const popover = root.querySelector('.ts-field-live-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain('Ризик витоку');

    const cleanBtn = popover.querySelector('#ts-field-clean-btn') as HTMLButtonElement;
    expect(cleanBtn).not.toBeNull();

    cleanBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Field value cleared, pill back to resting blue
    expect(input.value).toBe('');
    expect(pill.classList.contains('ts-pill-red')).toBe(false);
    expect(root.querySelector('.ts-field-live-popover')).toBeNull();
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
    const taxPill = pills[pills.length - 1];
    expect(taxPill.textContent).toContain('ІПН');

    taxInput.dispatchEvent(new Event('focus'));
    const banner = root.querySelector('.ts-field-banner-curtain');
    expect(banner?.textContent).toContain('ІПН');
  });
});
