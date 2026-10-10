import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const record = (index: number) => ({
  commit: `commit-${index}`,
  generatedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
  totalCases: 10,
  exactMatchRate: 0.7,
  overall: { precision: 0.9, recall: 0.5, f1: 0.6 },
});

function generate(history: object[], report: object = record(history.length), artifact = 'index.html') {
  const directory = mkdtempSync(resolve(tmpdir(), 'sova-dashboard-'));
  try {
    const reportPath = resolve(directory, 'report.json');
    const historyPath = resolve(directory, 'history.json');
    writeFileSync(reportPath, JSON.stringify(report));
    writeFileSync(historyPath, JSON.stringify(history));
    execFileSync(process.execPath, [
      resolve('scripts/evaluation/generate-dashboard.mjs'),
      '--report', reportPath, '--history', historyPath, '--out', directory,
    ]);
    return readFileSync(resolve(directory, artifact), 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function series(html: string, key: string) {
  return html.match(new RegExp(`<g data-series="${key}">([\\s\\S]*?)</g>`))?.[1] ?? '';
}

describe('Evaluation dashboard history chart', () => {
  it('plots nested binary metrics and the top-level exact match at their actual percentages', () => {
    const html = generate([record(0)]);
    // The plot spans y=30..268: 90%, 50%, 60%, and 70% must not collapse to zero.
    for (const [key, ordinate] of [['precision', 53.8], ['recall', 149], ['f1', 125.2], ['exactMatchRate', 101.4]] as const) {
      const dots = [...series(html, key).matchAll(/cy="([^"]+)"/g)];
      expect(dots).toHaveLength(2);
      for (const dot of dots) expect(Number(dot[1])).toBeCloseTo(ordinate);
    }
  });

  it('leaves a gap for missing metrics while displaying a genuine zero', () => {
    const zero = { ...record(0), overall: { precision: 0, recall: 0, f1: 0 } };
    const missing = { ...record(1), overall: {} };
    const html = generate([zero, missing], record(2));
    const precision = series(html, 'precision');
    expect([...precision.matchAll(/<polyline /g)]).toHaveLength(2);
    expect([...precision.matchAll(/<circle /g)]).toHaveLength(2);
    expect(precision).toContain('cy="268"');
    expect(precision).toContain('Precision 0.0%');
  });

  it('keeps all observations but samples labels for long histories and uses theme colors', () => {
    const html = generate(Array.from({ length: 49 }, (_, index) => record(index)), record(49));
    expect([...series(html, 'precision').matchAll(/<circle /g)]).toHaveLength(50);
    const regressionPanel = html.split('id="regression"')[1].split('id="challenge"')[0];
    const labels = [...regressionPanel.matchAll(/data-axis-label="(\d+)"/g)].map((match) => match[1]);
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(labels[0]).toBe('0');
    expect(labels.at(-1)).toBe('49');
    expect(html).toContain('fill="var(--muted)"');
    expect(html).toContain('class="chart-legend"');
    expect(html).toContain('stroke-dasharray="8 4"');
  });

  it('shows two separate scores and never substitutes old results for an unmeasured new corpus', () => {
    const old = generate([]);
    expect(old).toContain('Ще не виміряно');
    expect(old).toContain('не доводить узагальнення');
    const challenge = { totalCases: 300, scoredCases: 200, overall: { precision: 0.5, recall: 0.2, f1: 0.2857 }, exactMatchRate: 0.1, ambiguous: { n: 100, detected: 7, locked: 2 } };
    const current = { ...record(1), groups: { regression: record(1), challenge } };
    const html = generate([record(0)], current);
    const newPanel = html.split('id="challenge"')[1].split('Результати за частинами')[0];
    expect(newPanel).toContain('28.6%');
    expect(newPanel).toContain('100; локальні спрацьовування: 7; блокування: 2');
    expect(newPanel).toContain('незалежного аудиту ще немає');
    expect(html).toContain('evaluation.json');
  });

  it('breaks history lines when the corpus changes instead of implying algorithm improvement', () => {
    const html = generate([{ ...record(0), corpusSha256: 'old' }], { ...record(1), corpusSha256: 'new' });
    expect([...series(html, 'f1').matchAll(/<polyline /g)]).toHaveLength(2);
  });
  it('uses the pooled score for the top badge and does not reuse old F1 when it is absent', () => {
    const combined = { overall: { f1: 0.924875, recall: 0.90228 } };
    expect(generate([], { ...record(0), combined }, 'badges/combined-f1.svg')).toContain('92.5%');
    expect(generate([], record(0), 'badges/combined-f1.svg')).toContain('—');
    expect(generate([], { ...record(0), combined }, 'badges/combined-recall.svg')).toContain('90.2%');
  });
});
