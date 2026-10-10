import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THREAT_TAXONOMY } from '../../../src/ai/cloud/threat-taxonomy';
import { OutboundDataSanitizer } from '../../../src/privacy/outbound-data-sanitizer';

describe('Paired Groq cohort and shared class definitions', () => {
  const cohort = JSON.parse(readFileSync('training/groq-prompts/cohort-v1.json', 'utf8'));
  it('freezes 40 unique examples with balanced safe controls and four threat classes', () => {
    expect(cohort.cases).toHaveLength(40);
    expect(new Set(cohort.cases.map((c: any) => c.id)).size).toBe(40);
    expect(cohort.cases.filter((c: any) => !c.expected.detected)).toHaveLength(16);
    for (const label of ['VERIFICATION_PHISHING', 'PAYMENT_CREDENTIAL_THEFT',
      'MILITARY_SABOTAGE_RECRUITMENT', 'OFF_PLATFORM_REDIRECT']) {
      expect(cohort.cases.filter((c: any) => c.expected.intentType === label)).toHaveLength(6);
    }
    expect(cohort.cases.filter((c: any) => c.messages.length > 1)).toHaveLength(6);
    expect(cohort.cases.filter((c: any) => c.annotationReview)).toHaveLength(3);
    expect(cohort.cases.some((c: any) => ['safe2-reg-016', 'reg-verification-001',
      'pilot-lead-10-safe', 'pilot-media-09-threat'].includes(c.id))).toBe(false);
  });
  it('uses the same purpose-based taxonomy in both compared prompts without a per-case label', () => {
    const payload = OutboundDataSanitizer.sanitize('Будь ласка, поясніть мету.');
    for (const variant of ['observations', 'compact'] as const) {
      const prompt = OutboundDataSanitizer.buildCloudPrompt(payload, undefined, variant);
      expect(prompt).toContain(THREAT_TAXONOMY);
      const evidence = JSON.parse(prompt.split('EVIDENCE_JSON:\n')[1]);
      expect(evidence.expected).toBeUndefined();
      expect(evidence.intentType).toBeUndefined();
    }
  });
});
