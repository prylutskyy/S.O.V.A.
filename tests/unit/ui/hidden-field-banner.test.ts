// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityFriction } from '../../../src/ui/friction';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { HiddenFieldScanResult } from '../../../src/heuristics/hidden-field-inspector';

describe('Floating Disarm Capsule (SecurityFriction.showHiddenFieldTrapBanner)', () => {
  let form: HTMLFormElement;
  let hiddenInput1: HTMLInputElement;
  let hiddenInput2: HTMLInputElement;

  const mockScan: HiddenFieldScanResult = {
    hasTrap: true,
    trapType: 'AUTOFILL_CARD_TRAP',
    flaggedTypes: ['CVV', 'CARD_NUMBER'],
    flaggedInputs: [],
    heuristicResult: {
      name: 'HIDDEN_FIELD_TRAP',
      triggered: true,
      severity: 'HIGH',
      scoreContribution: 85,
      message: 'Виявлено приховані чутливі поля',
    },
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    ShadowHost.clear();
    SecurityFriction.removeHiddenFieldTrapBanner();

    form = document.createElement('form');
    hiddenInput1 = document.createElement('input');
    hiddenInput1.type = 'text';
    hiddenInput1.name = 'card_cvv';
    hiddenInput1.style.opacity = '0';

    hiddenInput2 = document.createElement('input');
    hiddenInput2.type = 'hidden';
    hiddenInput2.name = 'card_number';

    form.appendChild(hiddenInput1);
    form.appendChild(hiddenInput2);
    document.body.appendChild(form);

    mockScan.flaggedInputs = [
      {
        element: hiddenInput1,
        fieldType: 'CVV',
        cloakingReason: 'Нульова прозорість (CSS opacity: 0)',
        name: 'card_cvv',
        type: 'text',
      },
      {
        element: hiddenInput2,
        fieldType: 'CARD_NUMBER',
        cloakingReason: 'Винесено за межі екрана (left: -9999px)',
        name: 'card_number',
        type: 'hidden',
      },
    ];
  });

  it('should render the Floating Disarm Capsule with Apple HIG serenity and sapphire aura on form', () => {
    SecurityFriction.showHiddenFieldTrapBanner(mockScan, form);

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-hidden-field-banner');
    expect(banner).not.toBeNull();

    // Verify Jony Ive serene copy
    expect(banner?.innerHTML).toContain('Форму знешкоджено');
    expect(banner?.innerHTML).toContain('Sanctuary Autofill Guard');
    expect(banner?.innerHTML).toContain('Захищено · 2 поля');
    expect(banner?.innerHTML).toContain('Технічний аналіз пастки (2)');

    // Verify NO red dashed outline
    expect(form.style.outline).not.toContain('#D70022');
    expect(form.style.outline).not.toContain('dashed');

    // Verify sapphire aura applied to form
    expect(form.style.boxShadow).toContain('rgba(0, 113, 227');

    // Verify Inset Grouped Telemetry structure (Apple HIG without nested boxes)
    const telemetryRows = banner?.querySelectorAll('.ts-telemetry-row');
    expect(telemetryRows?.length).toBe(2);
    expect(banner?.querySelector('.ts-chevron')).not.toBeNull();
    expect(banner?.innerHTML).toContain('Знешкоджено');
    expect(banner?.innerHTML).not.toContain('🔒'); // No emoji clutter

    // Verify action buttons
    const highlightBtn = banner?.querySelector('#ts-highlight-form-btn') as HTMLButtonElement;
    const dismissBtn = banner?.querySelector('#ts-dismiss-trap-banner-btn') as HTMLButtonElement;
    expect(highlightBtn).not.toBeNull();
    expect(dismissBtn).not.toBeNull();
  });

  it('should dismiss banner and restore form styles when dismiss button is clicked', () => {
    vi.useFakeTimers();

    form.style.boxShadow = 'none';
    SecurityFriction.showHiddenFieldTrapBanner(mockScan, form);

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-hidden-field-banner');
    expect(banner).not.toBeNull();
    expect(form.style.boxShadow).toContain('rgba(0, 113, 227');

    const dismissBtn = banner?.querySelector('#ts-dismiss-trap-banner-btn') as HTMLButtonElement;
    dismissBtn.click();

    // Form box-shadow restored immediately
    expect(form.style.boxShadow).toBe('none');

    // Fast-forward animation timeout
    vi.advanceTimersByTime(250);
    expect(root.getElementById('threat-shield-hidden-field-banner')).toBeNull();

    vi.useRealTimers();
  });

  it('should restore form and parent styles cleanly on removeHiddenFieldTrapBanner', () => {
    form.style.boxShadow = '0 0 4px #ccc';
    SecurityFriction.showHiddenFieldTrapBanner(mockScan, form);

    expect(form.style.boxShadow).toContain('rgba(0, 113, 227');

    SecurityFriction.removeHiddenFieldTrapBanner();

    expect(form.style.boxShadow).toBe('0 0 4px #ccc');
    const root = ShadowHost.getRoot();
    expect(root.getElementById('threat-shield-hidden-field-banner')).toBeNull();
  });
});
