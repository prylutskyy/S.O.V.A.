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

function generate(history: object[], report = record(history.length)) {
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
    return readFileSync(resolve(directory, 'index.html'), 'utf8');
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
    const labels = [...html.matchAll(/data-axis-label="(\d+)"/g)].map((match) => match[1]);
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(labels[0]).toBe('0');
    expect(labels.at(-1)).toBe('49');
    expect(html).toContain('fill="var(--muted)"');
    expect(html).toContain('class="chart-legend"');
    expect(html).toContain('stroke-dasharray="8 4"');
  });
});
