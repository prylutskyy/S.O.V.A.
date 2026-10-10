import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import baseline from '../../../src/heuristics/models/local-intent-v1.json';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { LinearIntentClassifier, shadowIntentClassifier } from '../../../src/heuristics/linear-classifier';
import { digest, prepareDataset } from '../../../scripts/local-classifier/dataset';
import { readPilot, validatePilot, pilotContext, preparePilotDataset } from '../../../scripts/local-classifier/pilot-data';
import { trainModel } from '../../../scripts/local-classifier/training';
import { pilotMetrics, type PilotStep } from '../../../scripts/local-classifier/pilot-metrics';

describe('Social engineering pilot provenance and dialogue checkpoints', () => {
  const corpus = readPilot();
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); ChatSessionState.reset(); });
  it('contains 90 balanced contrasts in 30 intact split-disjoint families', () => {
    expect(corpus.cases).toHaveLength(90);
    expect(new Set(corpus.cases.map(entry => entry.family)).size).toBe(30);
    for (const topic of ['manager', 'official', 'media']) expect(corpus.cases.filter(entry => entry.topic === topic)).toHaveLength(30);
    for (const kind of ['safe', 'ambiguous', 'threat']) expect(corpus.cases.filter(entry => entry.messages.at(-1)!.expected!.kind === kind)).toHaveLength(30);
    expect(corpus.cases.filter(entry => entry.split === 'train')).toHaveLength(54);
    expect(corpus.cases.filter(entry => entry.split === 'validation')).toHaveLength(18);
    expect(corpus.cases.filter(entry => entry.split === 'test')).toHaveLength(18);
  });
  it('rejects split leakage within a contrast family', () => {
    const changed = structuredClone(corpus); changed.cases[0].split = 'test';
    expect(() => validatePilot(changed)).toThrow('Family leakage');
  });
  it('rejects ambiguous SAFE targets and locks', () => {
    const changed = structuredClone(corpus);
    const expected = changed.cases.find(entry => entry.id.endsWith('ambiguous'))!.messages.at(-1)!.expected!;
    expected.label = 'SAFE'; expect(() => validatePilot(changed)).toThrow('Ambiguous');
    expected.label = null; expected.maxAction = 'LOCK_INPUT'; expect(() => validatePilot(changed)).toThrow('Ambiguous');
  });
  it('requires inbound checkpoints and chronological messages', () => {
    const changed = structuredClone(corpus); delete changed.cases[0].messages[0].expected;
    expect(() => validatePilot(changed)).toThrow('Missing inbound');
    const unordered = structuredClone(corpus); unordered.cases[0].messages[2].atMs = 10;
    expect(() => validatePilot(unordered)).toThrow('chronological');
  });
  it('keeps original train/validation records intact and adds only pilot train targets', () => {
    const original = prepareDataset(), pilot = preparePilotDataset(corpus);
    expect(pilot.records.slice(0, original.records.length)).toEqual(original.records);
    const additions = pilot.records.filter(record => record.source === 'social-engineering-pilot');
    expect(additions).toHaveLength(54);
    const allowedFamilies = new Set(corpus.cases.filter(entry => entry.split === 'train').map(entry => `pilot:${entry.family}`));
    expect(additions.every(record => record.split === 'train' && allowedFamilies.has(record.group))).toBe(true);
    expect(additions.some(record => record.id.includes('ambiguous:step-2'))).toBe(false);
    expect(additions.every(record => record.messages.every(text => !text.startsWith('Поясніть, будь ласка')))).toBe(true);
  });
  it('deduplicates innocent prefixes and does not inherit the terminal threat label', () => {
    const dataset = preparePilotDataset(corpus);
    for (const entry of corpus.cases.filter(entry => entry.split === 'train' && entry.id.endsWith('-threat'))) {
      const prefixes = dataset.records.filter(record => record.group === `pilot:${entry.family}` && record.messages.length === 1 && record.messages[0] === entry.messages[0].text);
      expect(prefixes).toHaveLength(1); expect(prefixes[0].label).toBe('SAFE');
      expect(entry.messages[0].expected?.kind).toBe('safe');
    }
  });
  it('uses current runtime inbound direction and time window at each checkpoint', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); const start = 1_800_000_000_000;
    const spy = vi.spyOn(shadowIntentClassifier, 'predict');
    const entry = corpus.cases.find(item => item.family === 'media-09' && item.id.endsWith('-threat'))!;
    ChatSessionState.reset();
    entry.messages.forEach((message, index) => {
      vi.setSystemTime(start + message.atMs);
      ChatSessionState.addMessageAndEvaluate(message.text, message.speaker === 'user' ? 'outbound' : 'inbound');
      if (message.expected) expect(spy.mock.calls.at(-1)![0].messages).toEqual(pilotContext(entry, index));
    });
    expect(pilotContext(entry, 2)).toEqual([entry.messages[2].text]);
  });
  it('never trains on future text when constructing a prefix', () => {
    const entry = corpus.cases.find(item => item.id.endsWith('-threat'))!;
    expect(pilotContext(entry, 0)).toEqual([entry.messages[0].text]);
    expect(pilotContext(entry, 0)).not.toContain(entry.messages[2].text);
  });
  it('trains a separate 65,544-parameter model without touching the runtime file', () => {
    const path = 'src/heuristics/models/local-intent-v1.json', before = digest(readFileSync(path, 'utf8'));
    const dataset = preparePilotDataset(corpus), model = trainModel(dataset, JSON.stringify(dataset));
    expect(model.dimensions).toBe(8192); expect(model.training.examples).toBe(225);
    expect(model.minScore).toBe(baseline.minScore); expect(model.minMargin).toBe(baseline.minMargin);
    expect(model.dimensions * model.labels.length + model.bias.length).toBe(65544);
    const result = new LinearIntentClassifier(model).predict({ messages: ['Надішліть мені seed-фразу вашого гаманця.'], frames: [] });
    expect(result.status).not.toBe('unavailable'); expect(result.actionApplied).toBe(false);
    expect(digest(readFileSync(path, 'utf8'))).toBe(before);
  });
  it('reports ambiguity separately and marks hypothetical excessive locks', () => {
    const prediction = { mode: 'shadow' as const, actionApplied: false as const, status: 'ok' as const, candidate: 'MILITARY_SABOTAGE_RECRUITMENT' as const,
      decision: 'MILITARY_SABOTAGE_RECRUITMENT' as const, score: .9, margin: .8, elapsedMs: 0, truncated: false, datasetHash: 'test' };
    const row: PilotStep = { id: 'test', caseId: 'test', family: 'test', split: 'test', topic: 'media', terminal: true,
      expected: { kind: 'ambiguous', label: null, maxAction: 'WARN' }, baseline: prediction, candidate: prediction };
    const metrics = pilotMetrics([row], 'candidate');
    expect(metrics.candidate.n).toBe(0); expect(metrics.ambiguity.confidentThreat).toBe(1);
    expect(metrics.hypotheticalExcessLocks).toEqual(['test']); expect(metrics.actionsApplied).toBe(0);
  });
});
