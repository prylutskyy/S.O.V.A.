import { ScamIntentType } from './intent-classifier';

export type ThreatMitigationAction = 'ALLOW' | 'WARN' | 'LOCK_INPUT';

const INPUT_LOCK_INTENTS = new Set<ScamIntentType>([
  'MILITARY_SABOTAGE_RECRUITMENT',
  'SEED_PHRASE_THEFT',
  'CRYPTO_WALLET_COMPROMISE',
]);

const ADVISORY_INTENTS = new Set<string>([
  'ESCROW_DELIVERY_SCAM', 'OFF_PLATFORM_REDIRECT', 'VERIFICATION_PHISHING',
  'PAYMENT_CREDENTIAL_THEFT', 'IDENTITY_PROBING', 'URGENCY_PRESSURE',
]);

/** Called only for a formed local intent, after arbitration is unavailable/inconclusive. */
export function getLocalFallbackAction(
  intentType: string,
  score?: number
): ThreatMitigationAction {
  if (score === undefined || !Number.isFinite(score) || score <= 0) return 'ALLOW';
  if (INPUT_LOCK_INTENTS.has(intentType as ScamIntentType)) {
    return score >= 75 ? 'LOCK_INPUT' : 'ALLOW';
  }
  if (ADVISORY_INTENTS.has(intentType)) return 'WARN';
  return score >= 75 ? 'WARN' : 'ALLOW';
}

/** Shared local policy for translating a detected intent into user impact. */
export function getThreatMitigationAction(
  detected: boolean,
  intentType?: ScamIntentType | string | null
): ThreatMitigationAction {
  if (!detected || !intentType) return 'ALLOW';
  return INPUT_LOCK_INTENTS.has(intentType as ScamIntentType) ? 'LOCK_INPUT' : 'WARN';
}
