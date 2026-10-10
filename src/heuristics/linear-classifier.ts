import artifact from './models/local-intent-v1.json';
import { boundedLocalMessages, extractLinearFeatures, SUPPORTED_FEATURE_DIMENSIONS, SUPPORTED_FEATURE_VERSIONS, LOCAL_LABELS, type LocalInput, type LocalLabel } from './linear-features';
import { requestContextGate } from './request-signals';

export type LinearModel = typeof artifact & { abstentionPolicy?: 'request-context-v1' };

export interface LocalPrediction {
  mode: 'shadow';
  actionApplied: false;
  status: 'ok' | 'abstain' | 'timeout' | 'unavailable';
  candidate?: LocalLabel;
  decision: LocalLabel | 'ABSTAIN';
  score: number;
  margin: number;
  elapsedMs: number;
  truncated: boolean;
  datasetHash: string;
  abstentionReason?: string;
}

/** A learned linear model, not a generative LLM. Never authorizes protection actions. */
export class LinearIntentClassifier {
  private weights?: Float32Array;
  constructor(private model: LinearModel = artifact) {}

  private decode(): Float32Array {
    if (this.weights) return this.weights;
    const m = this.model;
    if (m.schemaVersion !== 1 || !SUPPORTED_FEATURE_VERSIONS.includes(m.featureVersion as 1 | 2) || !SUPPORTED_FEATURE_DIMENSIONS.includes(m.dimensions as typeof SUPPORTED_FEATURE_DIMENSIONS[number]) ||
      (m.abstentionPolicy !== undefined && (m.abstentionPolicy !== 'request-context-v1' || m.featureVersion !== 2)) ||
      m.encoding !== 'int16-le-base64' || JSON.stringify(m.labels) !== JSON.stringify(LOCAL_LABELS) ||
      !Number.isFinite(m.scale) || m.scale <= 0 || m.bias.length !== LOCAL_LABELS.length ||
      m.bias.some(value => !Number.isFinite(value)) || !Number.isFinite(m.minScore) || m.minScore < 0 || m.minScore > 1 ||
      !Number.isFinite(m.minMargin) || m.minMargin < 0 || m.minMargin > 1) throw new Error('Invalid model');
    const bytes = atob(m.weights);
    const size = m.dimensions * LOCAL_LABELS.length;
    if (bytes.length !== size * 2) throw new Error('Invalid model size');
    const weights = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const unsigned = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
      weights[i] = (unsigned >= 32768 ? unsigned - 65536 : unsigned) * m.scale;
    }
    return this.weights = weights;
  }

  predict(input: LocalInput, budgetMs = 500): LocalPrediction {
    const started = performance.now();
    const bounded = boundedLocalMessages(input.messages);
    const result: LocalPrediction = { mode: 'shadow', actionApplied: false, status: 'abstain', decision: 'ABSTAIN',
      score: 0, margin: 0, elapsedMs: 0, truncated: bounded.truncated, datasetHash: this.model.datasetHash };
    try {
      if (budgetMs <= 0) throw new Error('deadline');
      const weights = this.decode();
      const deadline = started + Math.min(budgetMs, 500);
      const features = extractLinearFeatures({ messages: bounded.messages, frames: input.frames }, deadline, this.model.dimensions, this.model.featureVersion);
      if (performance.now() > deadline) throw new Error('deadline');
      const logits = LOCAL_LABELS.map((_, label) => features.reduce((sum, [index, value]) => sum + weights[label * this.model.dimensions + index] * value, this.model.bias[label]));
      const max = Math.max(...logits);
      const exp = logits.map(logit => Math.exp(logit - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      const ranked = exp.map((value, label) => ({ label: LOCAL_LABELS[label], score: value / sum })).sort((a, b) => b.score - a.score);
      result.candidate = ranked[0].label;
      result.score = ranked[0].score;
      result.margin = ranked[0].score - ranked[1].score;
      if (performance.now() > deadline) throw new Error('deadline');
      if (features.length && !bounded.truncated && result.score >= this.model.minScore && result.margin >= this.model.minMargin) {
        result.status = 'ok'; result.decision = ranked[0].label;
      }
      if (this.model.abstentionPolicy) {
        result.abstentionReason = !features.length ? 'empty' : bounded.truncated ? 'truncated'
          : requestContextGate(bounded.messages, ranked[0].label)
          ?? (result.score < this.model.minScore ? 'low_score' : result.margin < this.model.minMargin ? 'low_margin' : undefined);
        if (result.abstentionReason) { result.status = 'abstain'; result.decision = 'ABSTAIN'; }
      }
      if (performance.now() > deadline) throw new Error('deadline');
    } catch (error) {
      result.status = error instanceof Error && /deadline/.test(error.message) ? 'timeout' : 'unavailable';
      result.decision = 'ABSTAIN';
      if (this.model.abstentionPolicy) result.abstentionReason = result.status;
    }
    result.elapsedMs = performance.now() - started;
    return result;
  }
}

export const shadowIntentClassifier = new LinearIntentClassifier();
