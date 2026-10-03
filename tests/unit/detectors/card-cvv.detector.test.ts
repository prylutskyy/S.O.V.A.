// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { CardCvvDetector } from '../../../src/detectors/card-cvv.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';

describe('CardCvvDetector - Dedicated Unit Tests', () => {
  let detector: CardCvvDetector;
  let form: HTMLFormElement;
  const dummyContext: FormDetectorContext = { currentHost: 'shop.ua', targetHost: 'shop.ua' };

  beforeEach(() => {
    detector = new CardCvvDetector();
    document.body.innerHTML = '';
    form = document.createElement('form');
    document.body.appendChild(form);
  });

  it('identifies itself with correct ID and name', () => {
    expect(detector.id).toBe('card_cvv');
    expect(detector.name).toBe('Payment Card & CVV Exposure Detector');
  });

  it('returns empty array when form is completely empty of inputs', () => {
    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('returns empty array when form has generic non-payment fields', () => {
    const username = document.createElement('input');
    username.name = 'username';
    username.value = 'john_doe';
    form.appendChild(username);

    const email = document.createElement('input');
    email.name = 'email';
    email.value = 'john@example.com';
    form.appendChild(email);

    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('detects a valid payment card number via Luhn validation and returns MEDIUM severity with +40 score', () => {
    const cardInput = document.createElement('input');
    cardInput.name = 'card_number';
    // Valid test Visa card number passing Luhn algorithm
    cardInput.value = '4532 0150 0000 0008';
    form.appendChild(cardInput);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('luhn_card_number_detected');
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('MEDIUM');
    expect(results[0].scoreContribution).toBe(40);
  });

  it('ignores invalid card number with incorrect Luhn checksum in generic input', () => {
    const cardInput = document.createElement('input');
    cardInput.name = 'tracking_number';
    // 16 digits but fails Luhn check
    cardInput.value = '4532 0150 0000 0005';
    form.appendChild(cardInput);

    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('detects a filled CVV/CVC code and returns CRITICAL severity with +40 score', () => {
    const cvvInput = document.createElement('input');
    cvvInput.name = 'cvv';
    cvvInput.value = '789';
    form.appendChild(cvvInput);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('cvv_code_detected');
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('CRITICAL');
    expect(results[0].scoreContribution).toBe(40);
  });

  it('detects both filled card and CVV simultaneously', () => {
    const cardInput = document.createElement('input');
    cardInput.name = 'card_number';
    cardInput.value = '4532 0150 0000 0008';
    form.appendChild(cardInput);

    const cvvInput = document.createElement('input');
    cvvInput.name = 'card_cvc';
    cvvInput.value = '123';
    form.appendChild(cvvInput);

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(2);

    const cardTrigger = results.find((r) => r.name === 'luhn_card_number_detected');
    const cvvTrigger = results.find((r) => r.name === 'cvv_code_detected');

    expect(cardTrigger).toBeDefined();
    expect(cvvTrigger).toBeDefined();
    expect(cardTrigger?.scoreContribution).toBe(40);
    expect(cvvTrigger?.scoreContribution).toBe(40);
  });
});
