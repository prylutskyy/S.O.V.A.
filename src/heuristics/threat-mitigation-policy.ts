import { ScamIntentType } from './intent-classifier';

export type ThreatMitigationAction = 'ALLOW' | 'WARN' | 'LOCK_INPUT';

const INPUT_LOCK_INTENTS = new Set<ScamIntentType>([
  'MILITARY_SABOTAGE_RECRUITMENT',
  'SEED_PHRASE_THEFT',
  'CRYPTO_WALLET_COMPROMISE',
]);

/** Shared local policy for translating a detected intent into user impact. */
export function getThreatMitigationAction(
  detected: boolean,
  intentType?: ScamIntentType | string | null
): ThreatMitigationAction {
  if (!detected || !intentType) return 'ALLOW';
  return INPUT_LOCK_INTENTS.has(intentType as ScamIntentType) ? 'LOCK_INPUT' : 'WARN';
}
