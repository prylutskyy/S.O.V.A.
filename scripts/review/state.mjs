export const TYPES = ['ESCROW_DELIVERY_SCAM','OFF_PLATFORM_REDIRECT','VERIFICATION_PHISHING','PAYMENT_CREDENTIAL_THEFT','IDENTITY_PROBING','URGENCY_PRESSURE','MILITARY_SABOTAGE_RECRUITMENT','SEED_PHRASE_THEFT','CRYPTO_WALLET_COMPROMISE','OTHER'];
export const ACTIONS = ['ALLOW','WARN','LOCK_INPUT'];
export function validLabel(label, count) {
  return label && [null,'threat','safe','ambiguous'].includes(label.assessment)
    && (label.intentType === null || TYPES.includes(label.intentType))
    && ACTIONS.includes(label.action) && ['low','medium','high'].includes(label.confidence)
    && typeof label.rationale === 'string' && typeof label.needsDiscussion === 'boolean'
    && Array.isArray(label.evidenceTurns) && new Set(label.evidenceTurns).size === label.evidenceTurns.length
    && label.evidenceTurns.every(n => Number.isInteger(n) && n >= 1 && n <= count)
    && (label.assessment !== null || (label.action === 'ALLOW' && label.intentType === null))
    && (label.assessment !== 'safe' || (label.action === 'ALLOW' && label.intentType === null))
    && (label.assessment !== 'ambiguous' || (label.intentType === null && label.action !== 'LOCK_INPUT'));
}
export function complete(label, count) {
  return validLabel(label,count) && label.assessment !== null && label.rationale.trim().length > 0
    && (label.assessment !== 'threat' || (label.intentType !== null && label.action !== 'ALLOW' && label.evidenceTurns.length > 0));
}
export function importReviews(payload, pack) {
  if (payload.schemaVersion !== 1 || payload.datasetId !== pack.datasetId || payload.datasetSha256 !== pack.datasetSha256) throw new Error('Це інша версія корпусу. Імпорт скасовано.');
  if (!Array.isArray(payload.cases) || (payload.drafts !== undefined && !Array.isArray(payload.drafts))) throw new Error('Немає масиву cases або некоректні drafts.');
  const lookup = new Map(pack.cases.map(c => [c.id,c]));
  const labels = {}; const seen = new Set();
  for (const [items, finished] of [[payload.cases,true],[payload.drafts ?? [],false]]) {
    for (const entry of items) {
      const c = lookup.get(entry.id);
      if (!c || seen.has(entry.id)) throw new Error('Невідомий або повторений ID: '+entry.id);
      const {id,...label} = entry;
      if (!(finished ? complete(label,c.messages.length) : validLabel(label,c.messages.length))) throw new Error('Некоректна відповідь: '+id);
      seen.add(id); labels[id] = label;
    }
  }
  return labels;
}
