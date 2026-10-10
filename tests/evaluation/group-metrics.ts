/** Ambiguous labels describe insufficient evidence, not proven negative examples. */
export function summarizeGroup(entries: Array<{
  assessment?: string; expectedDetected: boolean; actualDetected: boolean;
  expectedType: string | null; actualType: string | null;
  expectedAction: string; actualAction: string; exactMatch: boolean;
}>) {
  const labeled = entries.filter(e => e.assessment !== 'ambiguous');
  const ambiguous = entries.filter(e => e.assessment === 'ambiguous');
  const tp = labeled.filter(e => e.expectedDetected && e.actualDetected).length;
  const fp = labeled.filter(e => !e.expectedDetected && e.actualDetected).length;
  const fn = labeled.filter(e => e.expectedDetected && !e.actualDetected).length;
  const tn = labeled.filter(e => !e.expectedDetected && !e.actualDetected).length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const exactMatches = labeled.filter(e => e.exactMatch).length;
  return {
    totalCases: entries.length, scoredCases: labeled.length,
    overall: { n: labeled.length, tp, fp, fn, tn, precision, recall, f1 },
    exactMatches, exactMatchRate: labeled.length ? exactMatches / labeled.length : null,
    actionMismatches: labeled.filter(e => e.expectedAction !== e.actualAction).length,
    falseLockInputs: labeled.filter(e => e.expectedAction !== 'LOCK_INPUT' && e.actualAction === 'LOCK_INPUT').length,
    ambiguous: { n: ambiguous.length, detected: ambiguous.filter(e => e.actualDetected).length,
      locked: ambiguous.filter(e => e.actualAction === 'LOCK_INPUT').length },
  };
}
