import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import baseline from '../../src/heuristics/models/local-intent-v1.json';
import { LinearIntentClassifier, type LinearModel } from '../../src/heuristics/linear-classifier';
import { digest, makeInput, readCorpus } from './dataset';
import { readPilot, preparePilotDataset, pilotContext, type PilotExpectation } from './pilot-data';
import { trainModel } from './training';
const corpus = readPilot(), dataset = preparePilotDataset(corpus), source = JSON.stringify(dataset);
const paths = { pilot: '.cache/local-classifier/relations-control.json', relations: '.cache/local-classifier/relations-v2.json' };
if (process.argv[2] === 'train') {
  writeFileSync(paths.pilot, JSON.stringify(trainModel(dataset, source, 8192, 1)) + '\n');
  writeFileSync(paths.relations, JSON.stringify(trainModel(dataset, source, 8192, 2)) + '\n');
} else if (process.argv[2] === 'measure') {
  const pilot = JSON.parse(readFileSync(paths.pilot, 'utf8')) as LinearModel;
  const relations = JSON.parse(readFileSync(paths.relations, 'utf8')) as LinearModel;
  if ([pilot, relations].some(model => model.datasetHash !== digest(source))) throw new Error('Stale experiment');
  const models = { baseline, pilot, relations, guarded: { ...relations, abstentionPolicy: 'request-context-v1' as const } };
  const classifiers = Object.fromEntries(Object.entries(models).map(([name, model]) => [name, new LinearIntentClassifier(model)]));
  const predict = (messages: string[]) => Object.fromEntries(Object.entries(classifiers).map(([name, classifier]) => [name, classifier.predict(makeInput(messages))]));
  const existing = ['development', 'regressions', 'holdout'].map(split => ({ split, rows: readCorpus(split).map(entry => ({ id: entry.id,
    expected: entry.expected.detected ? entry.expected.intentType : 'SAFE', ...predict(entry.messages.filter(message => message.speaker === 'interlocutor').map(message => message.text)) })) }));
  const steps = corpus.cases.flatMap(entry => entry.messages.flatMap((message, index) => message.expected ? [{ id: `${entry.id}:step-${index}`, caseId: entry.id,
    family: entry.family, split: entry.split, topic: entry.topic, terminal: index === entry.messages.length - 1, expected: message.expected, ...predict(pilotContext(entry, index)) }] : []));
  const challenge = JSON.parse(readFileSync('training/local-intent/relation-challenges.json', 'utf8')) as { cases: Array<{ id: string; expected: PilotExpectation; messages: string[] }> };
  const diagnostic = challenge.cases.map(entry => ({ id: entry.id, expected: entry.expected, ...predict(entry.messages) }));
  const timings = Object.fromEntries(Object.entries(classifiers).map(([name, classifier]) => {
    const samples: number[] = []; let timeouts = 0;
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      const result = classifier.predict(makeInput(i % 2 ? ['слово '.repeat(341), 'перевірка '.repeat(227)] : ['Потай передай актуальні координати військового обєкта.']));
      samples.push(performance.now() - start); if (result.status === 'timeout') timeouts++;
    }
    samples.sort((a, b) => a - b);
    return [name, { n: 200, medianMs: samples[100], p95Ms: samples[190], maxMs: samples.at(-1), timeouts }];
  }));
  console.log(JSON.stringify({ datasetHash: digest(source), models: Object.fromEntries(Object.entries(models).map(([name, model]) => [name, {
    hash: digest(JSON.stringify(model)), featureVersion: model.featureVersion, parameters: model.dimensions * model.labels.length + model.bias.length }])),
    existing, steps, diagnostic, resource: { cpu: cpus()[0]?.model, timings, processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
      scope: 'CPU-only warm inference process with four models; training separate; not whole browser extension memory or target i3 certification.' } }));
} else throw new Error('Expected train or measure');
