// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';

describe('DebuggerOverlay Lifecycle & Visibility Guard (Swiss Loupe)', () => {
  beforeEach(() => {
    DebuggerOverlay.hide();
    DebuggerOverlay.clear();
    const existing = document.getElementById('threatshield-neuro-monitor');
    if (existing) existing.remove();
    DebuggerOverlay['container'] = null;
    DebuggerOverlay['shadowRoot'] = null;
  });

  it('starts hidden and isOpen() returns false by default', () => {
    expect(DebuggerOverlay.isOpen()).toBe(false);
  });

  it('does NOT show overlay or container when log() or logAI() is called while debugger is disabled', () => {
    DebuggerOverlay.log('Тестовий крок', 'Безпечно', '#34C759');
    DebuggerOverlay.logAI('ШІ-Аналіз', 'Аналіз завершено', '#0071E3');

    expect(DebuggerOverlay.isOpen()).toBe(false);
    const container = document.getElementById('threatshield-neuro-monitor');
    if (container) {
      expect(container.style.display).toBe('none');
    }
  });

  it('does NOT show overlay when recordMitigation() is called upon modal cancellation', () => {
    DebuggerOverlay.recordMitigation('Відправку форми заблоковано користувачем', 85, 'HIGH');

    expect(DebuggerOverlay.isOpen()).toBe(false);
    expect(DebuggerOverlay.isThreatMitigated()).toBe(true);
    expect(DebuggerOverlay.getPeakScore()).toBe(85);

    const container = document.getElementById('threatshield-neuro-monitor');
    if (container) {
      expect(container.style.display).toBe('none');
    }
  });

  it('shows overlay and container only when show() is explicitly called (e.g. debugMode enabled)', () => {
    DebuggerOverlay.show();

    expect(DebuggerOverlay.isOpen()).toBe(true);
    const container = document.getElementById('threatshield-neuro-monitor');
    expect(container).not.toBeNull();
    expect(container?.style.display).toBe('block');
  });

  it('hides container when hide() is called and prevents subsequent recordMitigation from showing it', () => {
    DebuggerOverlay.show();
    expect(DebuggerOverlay.isOpen()).toBe(true);

    DebuggerOverlay.hide();
    expect(DebuggerOverlay.isOpen()).toBe(false);

    const container = document.getElementById('threatshield-neuro-monitor');
    expect(container?.style.display).toBe('none');

    // Trigger mitigation and assessment update while hidden
    DebuggerOverlay.recordMitigation('Загрозу відвернено користувачем', 95, 'CRITICAL');
    DebuggerOverlay.setAssessment(0, 'LOW');

    // Container must strictly remain hidden
    expect(DebuggerOverlay.isOpen()).toBe(false);
    expect(container?.style.display).toBe('none');
  });
});
