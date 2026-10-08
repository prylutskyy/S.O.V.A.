// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { HiddenFieldDetector } from '../../../src/detectors/hidden-field.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';

describe('HiddenFieldDetector - Dedicated Unit Tests', () => {
  let detector: HiddenFieldDetector;
  let form: HTMLFormElement;
  const dummyContext: FormDetectorContext = { currentHost: 'site.ua', targetHost: 'site.ua' };

  beforeEach(() => {
    detector = new HiddenFieldDetector();
    document.body.innerHTML = '';
    form = document.createElement('form');
    document.body.appendChild(form);
  });

  it('identifies itself with correct ID and name', () => {
    expect(detector.id).toBe('hidden_fields');
    expect(detector.name).toBe('Hidden Field Cloaking & Autofill Trap Detector');
  });

  it('returns empty array when form has only visible legitimate fields', () => {
    const login = document.createElement('input');
    login.type = 'text';
    login.name = 'login';
    form.appendChild(login);

    const pass = document.createElement('input');
    pass.type = 'password';
    pass.name = 'password';
    form.appendChild(pass);

    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('does not trigger on standard legitimate hidden tokens (CSRF / session_id)', () => {
    const csrf = document.createElement('input');
    csrf.type = 'hidden';
    csrf.name = 'csrf_token';
    csrf.value = 'abc123xyz';
    form.appendChild(csrf);

    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('detects an autofill trap with hidden card input using display: none and returns CRITICAL severity with +60 score', () => {
    const visibleUser = document.createElement('input');
    visibleUser.type = 'text';
    visibleUser.name = 'username';
    form.appendChild(visibleUser);

    const hiddenCard = document.createElement('input');
    hiddenCard.type = 'text';
    hiddenCard.name = 'card_number';
    hiddenCard.autocomplete = 'cc-number';
    hiddenCard.style.display = 'none';
    form.appendChild(hiddenCard);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('hidden_sensitive_inputs_detected');
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('CRITICAL');
    expect(results[0].scoreContribution).toBe(60);
    expect(results[0].message).toContain('Autofill Phishing Trap');
    expect(results[0].details?.flaggedCount).toBe(1);
  });

  it('detects an offscreen cloaked CVV input using position: absolute and left: -9999px', () => {
    const hiddenCvv = document.createElement('input');
    hiddenCvv.type = 'password';
    hiddenCvv.name = 'cvv';
    hiddenCvv.autocomplete = 'cc-csc';
    hiddenCvv.style.position = 'absolute';
    hiddenCvv.style.left = '-9999px';
    form.appendChild(hiddenCvv);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('CRITICAL');
    expect(results[0].scoreContribution).toBe(60);
    expect((results[0].details?.cloakingTechniques as string[])[0]).toContain('offscreen');
  });

  it('detects transparent cloaked input using opacity: 0', () => {
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.name = 'cardnumber';
    hiddenInput.style.opacity = '0';
    form.appendChild(hiddenInput);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(true);
    expect((results[0].details?.cloakingTechniques as string[])[0]).toContain('opacity');
  });
});
