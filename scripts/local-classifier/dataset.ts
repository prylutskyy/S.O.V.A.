import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { boundedLocalMessages, LOCAL_LABELS, type LocalLabel, type LocalInput } from '../../src/heuristics/linear-features';
import { RequestAnalyzer } from '../../src/heuristics/request-analyzer';
import { IdentityRequestDetector } from '../../src/heuristics/identity-request-detector';
import { FastLanguageDetector } from '../../src/heuristics/language-detector';

export type CorpusCase = { id: string; messages: Array<{ speaker: 'user' | 'interlocutor'; text: string }>; expected: { detected: boolean; intentType: string | null; action: string } };
export type TrainingRecord = { id: string; source: string; group: string; split: 'train' | 'validation'; label: LocalLabel; messages: string[] };
export type TrainingDataset = { schemaVersion: 1; sourceHash: string; grouping: string; records: TrainingRecord[] };
export function readCorpus(name: string): CorpusCase[] {
  return JSON.parse(readFileSync(`tests/evaluation/corpus/${name}.json`, 'utf8')).cases;
}
export function makeInput(messages: string[]): LocalInput {
  const bounded = boundedLocalMessages(messages).messages;
  const latest = bounded.at(-1) ?? '';
  return { messages, frames: RequestAnalyzer.analyze(latest, FastLanguageDetector.detect(latest).primary, IdentityRequestDetector.getObjectPattern()) };
}
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function prepareDataset(): TrainingDataset {
  const records = ['development', 'regressions'].flatMap(source => readCorpus(source).map(entry => {
    const label = entry.expected.detected ? entry.expected.intentType : 'SAFE';
    if (!LOCAL_LABELS.includes(label as LocalLabel)) throw new Error(`Unsupported label in ${entry.id}: ${label}`);
    const messages = entry.messages.filter(message => message.speaker === 'interlocutor').map(message => message.text);
    if (!messages.length && label !== 'SAFE') throw new Error(`Threat without inbound messages: ${entry.id}`);
    return { id: entry.id, source, label: label as LocalLabel, messages };
  })).filter(record => record.messages.length > 0).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Duplicate scenario IDs');
  const canonical = records.map(record => boundedLocalMessages(record.messages).messages.join(' ').normalize('NFKC').toLowerCase()
    .replace(/https?:\/\/\S+/gu, ' url ').replace(/\d+/gu, ' number ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
  const grams = canonical.map(text => new Set(Array.from({ length: Math.max(0, text.length - 3) }, (_, i) => text.slice(i, i + 4))));
  const parent = records.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    if (canonical[i] === canonical[j] && records[i].label !== records[j].label) throw new Error(`Conflicting duplicate labels: ${records[i].id}, ${records[j].id}`);
    const intersection = [...grams[i]].filter(gram => grams[j].has(gram)).length;
    const similarity = intersection / (grams[i].size + grams[j].size - intersection || 1);
    if (canonical[i] === canonical[j] || similarity >= 0.8) parent[root(j)] = root(i);
  }
  const groupIds = records.map((_, i) => digest(records[root(i)].id).slice(0, 16));
  const validation = new Set<string>();
  for (const label of LOCAL_LABELS) {
    const groups = [...new Set(records.flatMap((record, i) => record.label === label ? [groupIds[i]] : []))].sort();
    if (groups.length < 2) throw new Error(`Need at least two independent groups for ${label}`);
    for (const group of groups.slice(0, Math.max(1, Math.floor(groups.length * 0.2)))) validation.add(group);
  }
  const output: TrainingRecord[] = records.map((record, i) => ({ ...record, group: groupIds[i], split: validation.has(groupIds[i]) ? 'validation' : 'train' }));
  for (const label of LOCAL_LABELS) if (!output.some(record => record.label === label && record.split === 'train')) throw new Error(`No training examples for ${label}`);
  return { schemaVersion: 1, sourceHash: digest(JSON.stringify(records)), grouping: 'Connected groups: canonical equality or character-4-gram Jaccard >= 0.8; deterministic stratified group split (~20% validation). Holdout excluded.', records: output };
}
