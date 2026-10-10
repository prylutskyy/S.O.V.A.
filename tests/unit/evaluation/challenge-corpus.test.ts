import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
const text = readFileSync('tests/evaluation/corpus/challenge-v1.json', 'utf8').replace(/\r\n/g, '\n');
const corpus = JSON.parse(text);
const manifest = JSON.parse(readFileSync('tests/evaluation/challenge-v1.manifest.json', 'utf8'));
describe('Frozen challenge-v1 contrast corpus', () => {
  it('contains 300 unique nine-turn dialogues in 20 unsplit families', () => {
    expect(corpus.cases).toHaveLength(300);
    expect(new Set(corpus.cases.map((c: any) => c.id)).size).toBe(300);
    expect(new Set(corpus.cases.map((c: any) => JSON.stringify(c.messages))).size).toBe(300);
    const families = new Map<string, number>();
    for (const c of corpus.cases) {
      expect(c.messages).toHaveLength(9);
      expect(c.messages.at(-1).speaker).toBe('interlocutor');
      families.set(c.family, (families.get(c.family) ?? 0) + 1);
    }
    expect(families.size).toBe(20);
    expect([...families.values()].every(n => n === 15)).toBe(true);
  });
  it('freezes annotation counts and excludes ambiguity from proven-safe labeling', () => {
    expect(corpus.cases.filter((c: any) => c.assessment === 'threat')).toHaveLength(120);
    expect(corpus.cases.filter((c: any) => c.assessment === 'safe')).toHaveLength(80);
    expect(corpus.cases.filter((c: any) => c.assessment === 'ambiguous')).toHaveLength(100);
    for (const c of corpus.cases) {
      expect(c.expected.detected).toBe(c.assessment === 'threat');
      expect(c.notes.length).toBeGreaterThan(60);
    }
  });
  it('matches the annotation snapshot made before the first evaluation', () => {
    expect(createHash('sha256').update(text).digest('hex')).toBe(manifest.fileSha256);
    expect(manifest.independentReview).toBe('pending');
    expect(manifest.trainingAllowed).toBe(false);
  });
  it('does not duplicate complete dialogues from the old corpus', () => {
    const old = new Set(['development', 'regressions', 'holdout'].flatMap(name =>
      JSON.parse(readFileSync(`tests/evaluation/corpus/${name}.json`, 'utf8')).cases.map((c: any) => JSON.stringify(c.messages))));
    for (const c of corpus.cases) expect(old.has(JSON.stringify(c.messages))).toBe(false);
  });
});
