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

    // Verify disarmed form copy
    expect(banner?.innerHTML).toContain('frictionTrapNeutralizedTitle');
    expect(banner?.innerHTML).toContain('frictionTrapDescVault');
    expect(banner?.innerHTML).toContain('frictionTrapProtectedLabel');
    expect(banner?.innerHTML).toContain('frictionTrapTechAnalysis');

    // Verify NO red dashed outline
    expect(form.style.outline).not.toContain('#D70022');
    expect(form.style.outline).not.toContain('dashed');

    // Verify sapphire aura applied to form
    expect(form.style.boxShadow).toContain('rgba(0, 113, 227');

    // Verify Inset Grouped Telemetry structure (Apple HIG without nested boxes)
    const telemetryRows = banner?.querySelectorAll('.ts-telemetry-row');
    expect(telemetryRows?.length).toBe(2);
    expect(banner?.querySelector('.ts-chevron')).not.toBeNull();
    expect(banner?.innerHTML).toContain('frictionTrapNeutralizedBadge');
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

  it('should trigger non-destructive X-Ray highlighting without stripping form classes or styles', () => {
    vi.useFakeTimers();
    form.className = 'original-form-class';
    form.style.background = 'rgb(240, 240, 240)';

    SecurityFriction.showHiddenFieldTrapBanner(mockScan, form);

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-hidden-field-banner');
    const highlightBtn = banner?.querySelector('#ts-highlight-form-btn') as HTMLButtonElement;
    expect(highlightBtn).not.toBeNull();

    highlightBtn.click();

    // Verify form class and styles were NOT stripped
    expect(form.className).toBe('original-form-class');
    expect(form.style.background).toBe('rgb(240, 240, 240)');

    // Verify X-ray badges were injected into Shadow DOM
    const xrayBadges = root.querySelectorAll('.ts-xray-badge');
    expect(xrayBadges.length).toBe(2);
    expect(xrayBadges[0].innerHTML).toContain('frictionXrayBlocked');

    // Fast forward 4 seconds
    vi.advanceTimersByTime(4100);
    expect(root.querySelectorAll('.ts-xray-badge').length).toBe(0);

    vi.useRealTimers();
  });
});
