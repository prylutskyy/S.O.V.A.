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
    expect(modal?.innerHTML).toContain('Ваш очікуваний намір');
    expect(modal?.innerHTML).toContain('ПРИХОВАНА ЗАГРОЗА');

    // Check primary action
    const primaryBtn = modal?.querySelector('#ts-primary-btn') as HTMLButtonElement;
    expect(primaryBtn).not.toBeNull();
    expect(primaryBtn.textContent).toContain('Повернутися до безпеки');

    // Check Hold-to-Unlock sensory element
    const holdBtn = modal?.querySelector('#ts-hold-btn') as HTMLElement;
    expect(holdBtn).not.toBeNull();
    expect(holdBtn.textContent).toContain('Утримуйте 2с для переходу');

    // Click primary button -> should cancel and close
    primaryBtn.click();
    expect(cancelCalled).toBe(true);
    expect(root.getElementById('threat-shield-unified-modal')).toBeNull();
  });
});
