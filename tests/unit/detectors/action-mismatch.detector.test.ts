// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionMismatchDetector } from '../../../src/detectors/action-mismatch.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';

describe('ActionMismatchDetector - Dedicated Unit Tests', () => {
  let detector: ActionMismatchDetector;
  let form: HTMLFormElement;

  beforeEach(() => {
    detector = new ActionMismatchDetector();
    document.body.innerHTML = '';
    form = document.createElement('form');
    document.body.appendChild(form);
  });

  it('identifies itself with correct ID and name', () => {
    expect(detector.id).toBe('action_mismatch');
    expect(detector.name).toBe('Action Mismatch Detector');
  });

  it('returns untriggered result for local, empty, hash, or javascript: action URLs', () => {
    const testActions = ['#', 'javascript:void(0)', 'javascript:submitForm()'];

    for (const act of testActions) {
      form.setAttribute('action', act);
      const context: FormDetectorContext = {
        currentHost: 'example.com',
        targetHost: 'different-host.com',
      };

      const results = detector.scan(form, context);
      expect(results).toHaveLength(1);
      expect(results[0].triggered).toBe(false);
      expect(results[0].severity).toBe('LOW');
      expect(results[0].scoreContribution).toBe(0);
      expect(results[0].message).toContain('Цільовий URL форми є локальним або відносним');
    }
  });

  it('returns untriggered result when currentHost and targetHost are identical', () => {
    form.setAttribute('action', 'https://shop.example.ua/checkout');
    const context: FormDetectorContext = {
      currentHost: 'shop.example.ua',
      targetHost: 'shop.example.ua',
    };

    const results = detector.scan(form, context);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(false);
    expect(results[0].severity).toBe('LOW');
    expect(results[0].scoreContribution).toBe(0);
    expect(results[0].message).toContain('Цільовий домен форми збігається з поточним хостом');
  });

  it('returns untriggered result when targetHost is an accredited payment gateway', () => {
    const gateways = ['pay.liqpay.ua', 'wayforpay.com', 'secure.portmone.com.ua', 'checkout.stripe.com'];

    for (const gw of gateways) {
      form.setAttribute('action', `https://${gw}/pay`);
      const context: FormDetectorContext = {
        currentHost: 'my-store.ua',
        targetHost: gw,
      };

      const results = detector.scan(form, context);
      expect(results).toHaveLength(1);
      expect(results[0].triggered).toBe(false);
      expect(results[0].severity).toBe('LOW');
      expect(results[0].details?.isPaymentGateway).toBe(true);
      expect(results[0].details?.actionHost).toBe(gw);
    }
  });

  it('triggers mismatch when form sends credentials to untrusted third-party host', () => {
    form.setAttribute('action', 'https://suspicious-collector.biz/steal.php');

    // Add password input to trigger checkFormActionMismatch heuristic
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.name = 'pwd';
    passInput.value = 'secret123';
    form.appendChild(passInput);

    const context: FormDetectorContext = {
      currentHost: 'my-store.ua',
      targetHost: 'suspicious-collector.biz',
    };

    const results = detector.scan(form, context);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('HIGH');
    expect(results[0].scoreContribution).toBeGreaterThanOrEqual(40);
  });
});
