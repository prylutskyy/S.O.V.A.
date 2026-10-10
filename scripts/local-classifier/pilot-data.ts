import { readFileSync } from 'node:fs';
import { LOCAL_LABELS, type LocalLabel } from '../../src/heuristics/linear-features';
import { digest, prepareDataset, type TrainingDataset, type TrainingRecord } from './dataset';

export type PilotExpectation = { kind: 'safe' | 'threat' | 'ambiguous'; label: LocalLabel | null; maxAction: 'NONE' | 'WARN' | 'LOCK_INPUT' };
export type PilotCase = { id: string; family: string; topic: 'manager' | 'official' | 'media'; split: 'train' | 'validation' | 'test';
  annotation: { origin: string; reviewStatus: string; rationale: string };
  messages: Array<{ speaker: 'user' | 'interlocutor'; text: string; atMs: number; expected?: PilotExpectation }> };
export type PilotCorpus = { schemaVersion: number; cases: PilotCase[] };
export const PILOT_PATH = 'training/local-intent/social-engineering-pilot.json';

export function validatePilot(corpus: PilotCorpus): void {
  if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.cases)) throw new Error('Invalid pilot schema');
  const ids = new Set<string>(); const families = new Map<string, PilotCase[]>();
  for (const entry of corpus.cases) {
    if (typeof entry.id !== 'string' || !entry.id.trim() || typeof entry.family !== 'string' || !entry.family.trim() ||
      !Array.isArray(entry.messages) || !entry.messages.length || !entry.annotation?.reviewStatus) throw new Error('Invalid pilot scenario');
    if (ids.has(entry.id)) throw new Error('Duplicate pilot ID'); ids.add(entry.id);
    if (!['train', 'validation', 'test'].includes(entry.split) || !['manager', 'official', 'media'].includes(entry.topic)) throw new Error('Invalid pilot split/topic');
    families.set(entry.family, [...families.get(entry.family) ?? [], entry]);
    let at = -1;
    for (const message of entry.messages) {
      if (!Number.isFinite(message.atMs) || message.atMs < at || typeof message.text !== 'string' || !message.text.trim()) throw new Error('Invalid chronological message');
      at = message.atMs;
      if (message.speaker === 'user') { if (message.expected) throw new Error('Outgoing text cannot be threat evidence'); continue; }
      if (message.speaker !== 'interlocutor' || !message.expected) throw new Error('Missing inbound annotation');
      const expected = message.expected;
      if (!['NONE', 'WARN', 'LOCK_INPUT'].includes(expected.maxAction)) throw new Error('Invalid action expectation');
      if (expected.kind === 'ambiguous') { if (expected.label !== null || expected.maxAction === 'LOCK_INPUT') throw new Error('Ambiguous cannot train as SAFE or require lock'); }
      else if (expected.kind === 'safe') { if (expected.label !== 'SAFE' || expected.maxAction !== 'NONE') throw new Error('Invalid safe expectation'); }
      else if (expected.kind !== 'threat' || expected.label === 'SAFE' || !LOCAL_LABELS.includes(expected.label!)) throw new Error('Invalid threat label');
    }
    if (!entry.messages.at(-1)?.expected) throw new Error('Final message must be annotated inbound');
  }
  for (const entries of families.values()) {
    if (new Set(entries.map(entry => entry.split)).size !== 1 || new Set(entries.map(entry => entry.topic)).size !== 1) throw new Error('Family leakage');
    const kinds = entries.map(entry => entry.messages.at(-1)!.expected!.kind);
    if (entries.length !== 3 || new Set(kinds).size !== 3) throw new Error('Each family requires safe/ambiguous/threat contrasts');
  }
}

export function readPilot(): PilotCorpus {
  const corpus = JSON.parse(readFileSync(PILOT_PATH, 'utf8')) as PilotCorpus;
  validatePilot(corpus); return corpus;
}

/** Matches the shadow runtime: last four inbound messages, no older than 60 seconds. */
export function pilotContext(entry: PilotCase, index: number): string[] {
  const now = entry.messages[index].atMs;
  return entry.messages.slice(0, index + 1).filter(message => message.speaker === 'interlocutor' && now - message.atMs <= 60_000).slice(-4).map(message => message.text);
}

export function preparePilotDataset(corpus = readPilot()): TrainingDataset {
  validatePilot(corpus);
  const baseline = prepareDataset();
  if (JSON.stringify(baseline) !== JSON.stringify(JSON.parse(readFileSync('training/local-intent/dataset.json', 'utf8')))) throw new Error('Original dataset or split changed');
  const records = new Map<string, TrainingRecord>();
  for (const entry of corpus.cases.filter(entry => entry.split === 'train')) {
    entry.messages.forEach((message, index) => {
      if (!message.expected || message.expected.kind === 'ambiguous') return;
      const messages = pilotContext(entry, index);
      // Shared benign prefixes in a contrast family are one example, not three votes.
      const key = `${entry.family}:${JSON.stringify(messages)}`;
      const previous = records.get(key);
      if (previous && previous.label !== message.expected.label) throw new Error('Conflicting prefix labels');
      if (!previous) records.set(key, { id: `${entry.id}:step-${index}`, source: 'social-engineering-pilot',
        group: `pilot:${entry.family}`, split: 'train', label: message.expected.label!, messages });
    });
  }
  const additions = [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const all = [...baseline.records, ...additions];
  if (new Set(all.map(record => record.id)).size !== all.length) throw new Error('Training ID collision');
  return { ...baseline, sourceHash: digest(JSON.stringify({ baseline: baseline.sourceHash, additions })),
    grouping: baseline.grouping + ' Pilot training families only; original split frozen; ambiguous targets excluded; benign prefixes deduplicated per family.', records: all };
}
