export function comparisonMetrics(rows: Array<{ expected: string; actual: string }>) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of rows) {
    if (row.actual === 'ABSTAIN') continue;
    const positive = row.expected !== 'SAFE', detected = row.actual !== 'SAFE';
    if (positive && detected) tp++; else if (detected) fp++; else if (positive) fn++; else tn++;
  }
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  const labels = [...new Set(rows.map(row => row.expected))];
  const perClass = labels.map(label => {
    const correct = rows.filter(row => row.expected === label && row.actual === label).length;
    const p = correct / (rows.filter(row => row.actual === label).length || 1);
    const r = correct / (rows.filter(row => row.expected === label).length || 1);
    return { label, precision: p, recall: r, f1: 2 * p * r / (p + r || 1) };
  });
  return { n: rows.length, correct: rows.filter(row => row.expected === row.actual).length,
    exact: rows.filter(row => row.expected === row.actual).length / (rows.length || 1),
    coverage: rows.filter(row => row.actual !== 'ABSTAIN').length / (rows.length || 1), tp, fp, fn, tn, precision, recall,
    recallIncludingAbstentions: tp / (rows.filter(row => row.expected !== 'SAFE').length || 1),
    f1: 2 * precision * recall / (precision + recall || 1),
    macroF1: perClass.reduce((sum, entry) => sum + entry.f1, 0) / (labels.length || 1), perClass };
}
