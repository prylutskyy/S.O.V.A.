// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedFrictionModal } from '../../../src/ui/unified-modal';
import { ThreatAssessment } from '../../../src/types';
import { ShadowHost } from '../../../src/ui/shadow-host';

describe('UnifiedFrictionModal (Apple HIG & Sensory Hold)', () => {
  const mockAssessment: ThreatAssessment = {
    score: 95,
    level: 'CRITICAL',
    triggers: [
      {
        name: 'payment_inversion_cvv',
        triggered: true,
        severity: 'CRITICAL',
        scoreContribution: 50,
        message: 'Виявлено спробу викрадення CVV коду',
      },
    ],
    timestamp: Date.now(),
  };

  beforeEach(() => {
    UnifiedFrictionModal.close();
  });

  it('should render contrast capsule, title, and hold-to-unlock button', async () => {
    let proceedCalled = false;
    let cancelCalled = false;

    await UnifiedFrictionModal.show({
      type: 'form',
      title: 'Підробка доставки',
      badgeText: 'CRITICAL',
      contextLabel: 'Цільовий сервер',
      contextValue: 'scam-delivery-portal.xyz',
      triggers: mockAssessment.triggers,
      assessment: mockAssessment,
      onProceed: () => { proceedCalled = true; },
      onCancel: () => { cancelCalled = true; },
    });

    const root = ShadowHost.getRoot();
    const modal = root.getElementById('threat-shield-unified-modal');
    expect(modal).not.toBeNull();

    // Check contrast capsule presence
    expect(modal?.innerHTML).toContain('modalIntendedActionTitle');
    expect(modal?.innerHTML).toContain('modalHiddenThreatTitle');

    // Check primary action
    const primaryBtn = modal?.querySelector('#ts-primary-btn') as HTMLButtonElement;
    expect(primaryBtn).not.toBeNull();
    expect(primaryBtn.textContent).toContain('modalBtnReturnToSafety');

    // Check Hold-to-Unlock sensory element
    const holdBtn = modal?.querySelector('#ts-hold-btn') as HTMLElement;
    expect(holdBtn).not.toBeNull();
    expect(holdBtn.textContent).toContain('modalHoldBtnDefault');

    // Click primary button -> should cancel and close
    primaryBtn.click();
    expect(cancelCalled).toBe(true);
    expect(root.getElementById('threat-shield-unified-modal')).toBeNull();
  });

  it('dismisses modal when Escape key is pressed', async () => {
    let cancelCalled = false;
    await UnifiedFrictionModal.show({
      type: 'form',
      title: 'Підробка доставки',
      badgeText: 'CRITICAL',
      contextLabel: 'Цільовий сервер',
      contextValue: 'scam-delivery-portal.xyz',
      triggers: mockAssessment.triggers,
      assessment: mockAssessment,
      onProceed: () => {},
      onCancel: () => { cancelCalled = true; },
    });

    const root = ShadowHost.getRoot();
    expect(root.getElementById('threat-shield-unified-modal')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelCalled).toBe(true);
    expect(root.getElementById('threat-shield-unified-modal')).toBeNull();
  });

  it('renders remember domain checkbox directly in action area when enabled', async () => {
    await UnifiedFrictionModal.show({
      type: 'form',
      title: 'Підробка доставки',
      badgeText: 'CRITICAL',
      contextLabel: 'Цільовий сервер',
      contextValue: 'scam-delivery-portal.xyz',
      triggers: mockAssessment.triggers,
      assessment: mockAssessment,
      allowRememberDomain: true,
      domainToRemember: 'scam-delivery-portal.xyz',
      onProceed: () => {},
      onCancel: () => {},
    });

    const root = ShadowHost.getRoot();
    const modal = root.getElementById('threat-shield-unified-modal');
    const checkbox = modal?.querySelector('#ts-remember-domain') as HTMLInputElement;

    expect(checkbox).not.toBeNull();
    expect(modal?.innerHTML).toContain('scam-delivery-portal.xyz');
  });

  it('renders redesigned Apple HIG XAI inspector with 3-factor telemetry and toggles visibility', async () => {
    await UnifiedFrictionModal.show({
      type: 'form',
      title: 'Підробка доставки',
      badgeText: 'CRITICAL',
      contextLabel: 'Цільовий сервер',
      contextValue: 'scam-delivery-portal.xyz',
      triggers: mockAssessment.triggers,
      assessment: mockAssessment,
      onProceed: () => {},
      onCancel: () => {},
    });

    const root = ShadowHost.getRoot();
    const modal = root.getElementById('threat-shield-unified-modal');
    expect(modal).not.toBeNull();

    const inspectBtn = modal?.querySelector('#ts-inspect-btn') as HTMLButtonElement;
    const inspector = modal?.querySelector('#ts-inspector') as HTMLElement;
    const inspectText = modal?.querySelector('#ts-inspect-text') as HTMLElement;

    expect(inspectBtn).not.toBeNull();
    expect(inspector).not.toBeNull();
    expect(inspector.style.display).toBe('none');
    expect(inspectText.textContent).toBe('modalInspectDetails');

    // Click to expand
    inspectBtn.click();
    expect(inspector.style.display).toBe('flex');
    expect(inspectBtn.classList.contains('expanded')).toBe(true);
    expect(inspectBtn.getAttribute('aria-expanded')).toBe('true');
    expect(inspectText.textContent).toBe('modalHideDetails');

    // Telemetry header
    const header = inspector.querySelector('.ts-xai-header');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('modalThreatScore');

    // 3-factor telemetry grid
    const telemetry = inspector.querySelector('.ts-xai-telemetry');
    expect(telemetry).not.toBeNull();
    expect(telemetry?.textContent).toContain('modalFactorFormServer');
    expect(telemetry?.textContent).toContain('modalFactorSessionContext');
    expect(telemetry?.textContent).toContain('modalFactorUserAction');

    // Inset grouped list
    const list = inspector.querySelector('.ts-xai-list');
    expect(list).not.toBeNull();
    const items = list?.querySelectorAll('.ts-xai-item');
    expect(items && items.length > 0).toBe(true);

    const firstItem = items![0];
    expect(firstItem.querySelector('.ts-xai-icon-box')).not.toBeNull();
    expect(firstItem.querySelector('.ts-xai-item-title')).not.toBeNull();

    // Click again to collapse
    inspectBtn.click();
    expect(inspector.style.display).toBe('none');
    expect(inspectBtn.classList.contains('expanded')).toBe(false);
    expect(inspectBtn.getAttribute('aria-expanded')).toBe('false');
    expect(inspectText.textContent).toBe('modalInspectDetails');
  });

  it('renders civic defense / sabotage recruitment modal with official action and without hold slider', async () => {
    let cancelCalled = false;
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await UnifiedFrictionModal.show({
      type: 'chat',
      title: 'Спроба ворожого вербування або диверсії',
      badgeText: 'CRITICAL',
      contextLabel: 'Платформа',
      contextValue: 'telegram.org',
      triggers: [
        {
          name: 'military_sabotage_recruitment',
          severity: 'CRITICAL',
          message: 'Спроба вербування до диверсій на залізниці',
        },
      ],
      intentType: 'MILITARY_SABOTAGE_RECRUITMENT',
      onProceed: () => {},
      onCancel: () => { cancelCalled = true; },
    });

    const root = ShadowHost.getRoot();
    const modal = root.getElementById('threat-shield-unified-modal');
    expect(modal).not.toBeNull();

    // Primary action button should be civic-themed
    const primaryBtn = modal?.querySelector('#ts-primary-btn') as HTMLButtonElement;
    expect(primaryBtn).not.toBeNull();
    expect(primaryBtn.classList.contains('civic')).toBe(true);
    expect(primaryBtn.textContent).toContain('Обірвати зв\'язок та заблокувати');

    // Official єВорог button must be present
    const evorogBtn = modal?.querySelector('#ts-evorog-modal-btn') as HTMLButtonElement;
    expect(evorogBtn).not.toBeNull();
    expect(evorogBtn.textContent).toContain('Повідомити в СБУ (єВорог)');

    // Hold-to-unlock button and remember-domain checkbox must NOT be present
    expect(modal?.querySelector('#ts-hold-btn')).toBeNull();
    expect(modal?.querySelector('#ts-remember-domain')).toBeNull();

    // Click official reporting button
    evorogBtn.click();
    expect(windowOpenSpy).toHaveBeenCalledWith('https://t.me/evorog_bot', '_blank');

    // Click primary button
    primaryBtn.click();
    expect(cancelCalled).toBe(true);
    expect(root.getElementById('threat-shield-unified-modal')).toBeNull();
  });
});

