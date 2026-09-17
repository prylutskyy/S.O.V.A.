// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { FormAnalysisPipeline } from '../../../src/detectors/form-analysis-pipeline';

describe('FormAnalysisPipeline', () => {
  let pipeline: FormAnalysisPipeline;

  beforeEach(() => {
    pipeline = new FormAnalysisPipeline();
    document.body.innerHTML = '';
  });

  it('should evaluate a clean safe form with low score', () => {
    const form = document.createElement('form');
    form.action = 'https://mysite.com/search';
    const input = document.createElement('input');
    input.name = 'q';
    input.value = 'shoes';
    form.appendChild(input);
    document.body.appendChild(form);

    const result = pipeline.analyze(form, 'mysite.com', null);
    expect(result.assessment.level).toBe('LOW');
    expect(result.assessment.score).toBeLessThan(30);
  });

  it('should detect form action mismatch on suspicious external domain', () => {
    const form = document.createElement('form');
    form.action = 'https://fake-phishing-host.com/login';
    const input = document.createElement('input');
    input.name = 'login';
    input.value = 'user';
    form.appendChild(input);
    document.body.appendChild(form);

    const result = pipeline.analyze(form, 'legit-bank.ua', null);
    expect(result.assessment.triggers.some((t) => t.name === 'form_action_mismatch')).toBe(true);
    expect(result.targetHost).toBe('fake-phishing-host.com');
  });

  it('should add context bonus when active threat context is provided', () => {
    const form = document.createElement('form');
    form.action = 'https://untrusted-site.com/post';
    const input = document.createElement('input');
    input.name = 'comment';
    input.value = 'hello';
    form.appendChild(input);
    document.body.appendChild(form);

    const activeContext = {
      sourcePlatform: 'olx.ua',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH' as const,
      detectedKeywords: ['доставка'],
      offPlatformLure: true,
      timestamp: Date.now(),
      ttlMs: 60000,
    };

    const result = pipeline.analyze(form, 'untrusted-site.com', activeContext);
    expect(result.assessment.triggers.some((t) => t.name === 'tainted_context_window_active')).toBe(true);
    expect(result.assessment.contextActive).toBe(true);
  });
});
