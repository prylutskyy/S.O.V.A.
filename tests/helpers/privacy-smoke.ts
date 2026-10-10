import { OutboundDataSanitizer as Sanitizer } from '../../src/privacy/outbound-data-sanitizer';
import { PseudonymizationContext } from '../../src/privacy/pseudonymization-context';
export type PrivacySmokeCase = { id: string; messages: Array<{ speaker: string; text: string }>; forbidden: string[]; preserved: string[]; expected: { detected: boolean; type: string | null } };
export function preparePrivacySmoke(c: PrivacySmokeCase) {
  const privacySession = new PseudonymizationContext();
  const dialogueHistory = Sanitizer.sanitize(c.messages.map(m => `${m.speaker === 'user' ? '[Ви]' : '[Співрозмовник]'}: ${m.text}`).join('\n'), { privacySession }).sanitizedText;
  const latest = c.messages.filter(m => m.speaker === 'interlocutor').at(-1)!.text;
  const payload = Sanitizer.sanitize(latest, { privacySession });
  const prompt = Sanitizer.buildCloudPrompt(payload, { privacySession, dialogueHistory, sourcePlatform: 'synthetic-privacy-smoke' }, 'compact');
  const leaks = c.forbidden.filter(value => prompt.includes(value));
  const missingMeaning = c.preserved.filter(value => !prompt.includes(value));
  return { prompt, leaks, missingMeaning };
}
