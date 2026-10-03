// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { HiddenFieldInspector } from '../../../src/heuristics/hidden-field-inspector';
import { HiddenFieldDetector } from '../../../src/detectors/hidden-field.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';

describe('Adversarial Suite: CSS & DOM Cloaking Evasion Resistance', () => {
  let form: HTMLFormElement;
  const dummyContext: FormDetectorContext = {
    currentHost: 'checkout.target.ua',
    whitelistedDomains: [],
  };

  beforeEach(() => {
    form = document.createElement('form');
    document.body.innerHTML = '';
    document.body.appendChild(form);
  });

  describe('CSS Transform-based Micro-Scaling & Offsets', () => {
    it('detects sensitive CVV cloaked via scale(0)', () => {
      const input = document.createElement('input');
      input.name = 'cvv';
      input.type = 'text';
      input.style.transform = 'scale(0)';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('transform');
    });

    it('detects card input cloaked with matrix(0, 0, 0, 0, 0, 0)', () => {
      const input = document.createElement('input');
      input.name = 'card_number';
      input.type = 'text';
      input.style.transform = 'matrix(0, 0, 0, 0, 0, 0)';
      form.appendChild(input);

      const detector = new HiddenFieldDetector();
      const results = detector.scan(form, dummyContext);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].severity).toBe('CRITICAL');
      expect(results[0].scoreContribution).toBe(60);
    });

    it('detects off-screen translation via transform translateX(-9999px)', () => {
      const input = document.createElement('input');
      input.name = 'security_code';
      input.autocomplete = 'cc-csc';
      input.style.transform = 'translateX(-9999px)';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('-9999px');
    });
  });

  describe('CSS Clip & Clip-Path Geometry Masking', () => {
    it('detects cloaking using legacy CSS clip: rect(0, 0, 0, 0)', () => {
      const input = document.createElement('input');
      input.name = 'cardnumber';
      input.style.position = 'absolute';
      input.style.clip = 'rect(0, 0, 0, 0)';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('clip: rect(0');
    });

    it('detects cloaking using modern CSS clip-path: circle(0)', () => {
      const input = document.createElement('input');
      input.name = 'cvv';
      input.style.clipPath = 'circle(0px at 0 0)';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('clip-path: circle(0');
    });
  });

  describe('Zero-Font & Filter Opacity Cloaking', () => {
    it('detects input rendered with font-size: 0px to hide text and bounds', () => {
      const input = document.createElement('input');
      input.name = 'password';
      input.type = 'password';
      input.style.fontSize = '0px';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toBe('font-size: 0px');
    });

    it('detects input cloaked via CSS filter: opacity(0)', () => {
      const input = document.createElement('input');
      input.name = 'cvv';
      input.style.filter = 'opacity(0)';
      form.appendChild(input);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('filter: opacity(0)');
    });
  });

  describe('Parent Container Cloaking Propagation', () => {
    it('detects sensitive field whose parent container is hidden via display: none', () => {
      const hiddenContainer = document.createElement('div');
      hiddenContainer.style.display = 'none';

      const input = document.createElement('input');
      input.name = 'card_cvv';
      input.type = 'text';

      hiddenContainer.appendChild(input);
      form.appendChild(hiddenContainer);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('parent container cloaked');
    });

    it('detects sensitive field inside parent container positioned off-screen (left: -9999px)', () => {
      const offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.left = '-9999px';

      const input = document.createElement('input');
      input.name = 'cc_number';
      input.type = 'text';

      offscreenContainer.appendChild(input);
      form.appendChild(offscreenContainer);

      const scan = HiddenFieldInspector.scanForm(form);
      expect(scan.hasTrap).toBe(true);
      expect(scan.flaggedInputs[0].cloakingReason).toContain('offscreen');
    });
  });

  describe('Just-In-Time (JIT) Dynamic DOM Injection', () => {
    it('reacts dynamically to sensitive inputs injected into DOM right before scan', () => {
      // Normal visible username input
      const visibleUser = document.createElement('input');
      visibleUser.name = 'username';
      visibleUser.type = 'text';
      form.appendChild(visibleUser);

      // Initially no traps
      expect(HiddenFieldInspector.scanForm(form).hasTrap).toBe(false);

      // Malicious script dynamically injects hidden CVV & Card inputs
      const trapCard = document.createElement('input');
      trapCard.name = 'cc_num';
      trapCard.style.display = 'none';

      const trapCvv = document.createElement('input');
      trapCvv.name = 'cvv';
      trapCvv.style.opacity = '0';

      form.appendChild(trapCard);
      form.appendChild(trapCvv);

      // Re-scan detects newly injected phishing traps
      const updatedScan = HiddenFieldInspector.scanForm(form);
      expect(updatedScan.hasTrap).toBe(true);
      expect(updatedScan.flaggedInputs).toHaveLength(2);
      expect(updatedScan.flaggedTypes).toContain('CARD_NUMBER');
      expect(updatedScan.flaggedTypes).toContain('CVV');
    });
  });

  describe('Formless Containers (SPA / React Modals without <form>)', () => {
    it('correctly assesses sensitivity and cloaking of elements without a parent <form>', () => {
      const modal = document.createElement('div');
      modal.className = 'spa-checkout-modal';

      const input = document.createElement('input');
      input.name = 'pan';
      input.autocomplete = 'cc-number';
      input.style.display = 'none';

      modal.appendChild(input);
      document.body.appendChild(modal);

      const sensitivity = HiddenFieldInspector.isFieldSensitive(input);
      expect(sensitivity.isSensitive).toBe(true);
      expect(sensitivity.fieldType).toBe('CARD_NUMBER');

      const cloakCheck = HiddenFieldInspector.isElementCloaked(input);
      expect(cloakCheck.isCloaked).toBe(true);
      expect(cloakCheck.cloakingTechnique).toBe('DISPLAY_NONE');
    });
  });
});
