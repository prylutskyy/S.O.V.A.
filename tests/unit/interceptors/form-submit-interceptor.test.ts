// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormSubmitInterceptor } from '../../../src/interceptors/form-submit.interceptor';
import { ThreatAssessment } from '../../../src/types';
import { FormSensitiveState } from '../../../src/heuristics/input-detector';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';

describe('FormSubmitInterceptor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('shouldBlock logic', () => {
    const emptyFormState: FormSensitiveState = {
      hasFilledCard: false,
      hasFilledPassword: false,
      hasFilledCvv: false,
      hasFilledAnySensitive: false,
      isEntirelyEmpty: true,
      filledInputCount: 0,
    };

    const benignFilledFormState: FormSensitiveState = {
      hasFilledCard: false,
      hasFilledPassword: false,
      hasFilledCvv: false,
      hasFilledAnySensitive: false,
      isEntirelyEmpty: false,
      filledInputCount: 2,
    };

    const sensitiveFilledFormState: FormSensitiveState = {
      hasFilledCard: false,
      hasFilledPassword: false,
      hasFilledCvv: true,
      hasFilledAnySensitive: true,
      isEntirelyEmpty: false,
      filledInputCount: 1,
    };

    it('NEVER blocks an entirely empty form even if threat assessment level is CRITICAL', () => {
      const criticalAssessment: ThreatAssessment = {
        score: 95,
        level: 'CRITICAL',
        triggers: [{ name: 'fake_trap', triggered: true, severity: 'CRITICAL', scoreContribution: 95, message: 'Trap' }],
        timestamp: Date.now(),
      };

      const blocked = FormSubmitInterceptor.shouldBlock(
        criticalAssessment,
        emptyFormState,
        'untrusted-phishing.com',
        'untrusted-phishing.com'
      );

      expect(blocked).toBe(false);
    });

    it('NEVER blocks a form with benign / fake / decoy data at MEDIUM risk level', () => {
      const mediumAssessment: ThreatAssessment = {
        score: 45,
        level: 'MEDIUM',
        triggers: [{ name: 'vault_probe', triggered: true, severity: 'MEDIUM', scoreContribution: 45, message: 'Probing' }],
        timestamp: Date.now(),
      };

      const blocked = FormSubmitInterceptor.shouldBlock(
        mediumAssessment,
        benignFilledFormState,
        'untrusted-phishing.com',
        'untrusted-phishing.com'
      );

      expect(blocked).toBe(false);
    });

    it('does not block HIGH risk level if no sensitive data has been filled', () => {
      const highAssessment: ThreatAssessment = {
        score: 65,
        level: 'HIGH',
        triggers: [{ name: 'tainted_context', triggered: true, severity: 'HIGH', scoreContribution: 65, message: 'Context' }],
        timestamp: Date.now(),
      };

      const blocked = FormSubmitInterceptor.shouldBlock(
        highAssessment,
        benignFilledFormState,
        'untrusted-phishing.com',
        'untrusted-phishing.com'
      );

      expect(blocked).toBe(false);
    });

    it('BLOCKS when sensitive data has been filled and assessment is HIGH or CRITICAL', () => {
      const criticalAssessment: ThreatAssessment = {
        score: 85,
        level: 'CRITICAL',
        triggers: [{ name: 'cvv_leak', triggered: true, severity: 'CRITICAL', scoreContribution: 85, message: 'CVV' }],
        timestamp: Date.now(),
      };

      const blocked = FormSubmitInterceptor.shouldBlock(
        criticalAssessment,
        sensitiveFilledFormState,
        'untrusted-phishing.com',
        'untrusted-phishing.com'
      );

      expect(blocked).toBe(true);
    });
  });

  describe('DebuggerOverlay integration', () => {
    it('updates DebuggerOverlay assessment score and severity via setAssessment', () => {
      DebuggerOverlay.setAssessment(45, 'MEDIUM');
      expect(DebuggerOverlay['state'].score).toBe(45);
      expect(DebuggerOverlay['state'].severity).toBe('MEDIUM');

      DebuggerOverlay.setAssessment(85, 'CRITICAL');
      expect(DebuggerOverlay['state'].score).toBe(85);
      expect(DebuggerOverlay['state'].severity).toBe('CRITICAL');

      DebuggerOverlay.setAssessment(0, 'LOW');
      expect(DebuggerOverlay['state'].score).toBe(0);
      expect(DebuggerOverlay['state'].severity).toBe('LOW');
    });
  });

  describe('Real-time input telemetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      FormSubmitInterceptor.destroy();
    });

    afterEach(() => {
      vi.useRealTimers();
      FormSubmitInterceptor.destroy();
    });

    it('triggers debounced form analysis on input event and updates DebuggerOverlay assessment', () => {
      const mockPipeline = {
        analyze: vi.fn().mockReturnValue({
          formState: { isEntirelyEmpty: false, hasFilledAnySensitive: true },
          assessment: { score: 75, level: 'HIGH', triggers: [] },
          vaultMatches: [],
        }),
      };

      FormSubmitInterceptor.init({
        pipeline: mockPipeline as any,
        getCurrentHost: () => 'phishing-site.test',
        getActiveContext: () => null,
        getDebugMode: () => true,
      });

      const form = document.createElement('form');
      const input = document.createElement('input');
      input.name = 'test_field';
      form.appendChild(input);
      document.body.appendChild(form);

      input.value = 'sensitive data';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Before debounce timer fires
      expect(mockPipeline.analyze).not.toHaveBeenCalled();

      // Fast-forward debounce timer (150ms)
      vi.advanceTimersByTime(150);

      expect(mockPipeline.analyze).toHaveBeenCalledWith(form, 'phishing-site.test', null);
      expect(DebuggerOverlay['state'].score).toBe(75);
      expect(DebuggerOverlay['state'].severity).toBe('HIGH');
    });
  });
});
