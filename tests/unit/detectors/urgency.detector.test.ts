// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { UrgencyPatternDetector } from '../../../src/detectors/urgency.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';

describe('UrgencyPatternDetector - Dedicated Unit Tests', () => {
  let detector: UrgencyPatternDetector;
  let form: HTMLFormElement;
  const dummyContext: FormDetectorContext = { currentHost: 'site.ua', targetHost: 'site.ua' };

  beforeEach(() => {
    detector = new UrgencyPatternDetector();
    document.body.innerHTML = '';
    form = document.createElement('form');
    document.body.appendChild(form);
  });

  it('identifies itself with correct ID and name', () => {
    expect(detector.id).toBe('urgency_dark_patterns');
    expect(detector.name).toBe('Artificial Urgency & Countdown Pressure Detector');
  });

  it('returns empty array when form has normal calm text and labels', () => {
    form.innerHTML = `
      <label for="address">Адреса доставки:</label>
      <input id="address" type="text" name="address" value="м. Київ, вул. Хрещатик 1" />
      <button type="submit">Зберегти</button>
    `;

    const results = detector.scan(form, dummyContext);
    expect(results).toEqual([]);
  });

  it('detects a visual countdown timer by class and regex time pattern (04:59)', () => {
    form.innerHTML = `
      <div class="countdown-timer">04:59</div>
      <input type="text" name="name" />
      <button type="submit">Підтвердити</button>
    `;

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('urgency_scarcity_manipulation');
    expect(results[0].triggered).toBe(true);
    expect(results[0].severity).toBe('MEDIUM');
    expect(results[0].scoreContribution).toBe(20);
    expect(results[0].details?.hasCountdownTimer).toBe(true);
    expect(results[0].details?.timerText).toBe('04:59');
  });

  it('detects psychological cancellation threats in form text', () => {
    form.innerHTML = `
      <div class="warning-box">
        Увага! Якщо ви не підтвердите оплату зараз, замовлення буде анульовано, а гроші будуть повернуті відправнику!
      </div>
      <input type="text" name="code" />
    `;

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(true);
    expect(results[0].scoreContribution).toBe(20);

    const tags = results[0].details?.matchedTags as string[];
    expect(tags).toContain('погроза_анулювання');
    expect(tags).toContain('погроза_повернення_коштів');
  });

  it('detects English urgency pressure and scarcity patterns', () => {
    form.innerHTML = `
      <p>Hurry up! Payment will be cancelled if not confirmed in 5 minutes!</p>
      <button type="submit">Pay Now</button>
    `;

    const results = detector.scan(form, dummyContext);
    expect(results).toHaveLength(1);
    expect(results[0].triggered).toBe(true);

    const tags = results[0].details?.matchedTags as string[];
    expect(tags).toContain('en_urgency_pressure');
  });
});
