import { describe, expect, it } from 'vitest';
import corpus from '../../fixtures/groq-privacy-smoke.json';
import { preparePrivacySmoke } from '../../helpers/privacy-smoke';
describe('Privacy live-cohort preflight without network', () => {
  it.each(corpus.cases)('$id hides synthetic identifiers and preserves request meaning', c => {
    const { prompt, leaks, missingMeaning } = preparePrivacySmoke(c);
    expect(leaks).toEqual([]);
    expect(missingMeaning).toEqual([]);
    expect(prompt).toContain('[Ви]');
    expect(prompt).toContain('[Співрозмовник]');
    expect(prompt).not.toContain(c.id);
  });
});
