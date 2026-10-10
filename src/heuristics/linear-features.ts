import type { RequestFrame } from './request-analyzer';
import { extractRequestSignals } from './request-signals';

export const FEATURE_VERSION = 1;
export const SUPPORTED_FEATURE_VERSIONS = [1, 2] as const;
export const FEATURE_DIMENSIONS = 8192;
export const SUPPORTED_FEATURE_DIMENSIONS = [8192, 16384, 32768] as const;
export const LOCAL_LABELS = ['SAFE', 'OFF_PLATFORM_REDIRECT', 'VERIFICATION_PHISHING', 'PAYMENT_CREDENTIAL_THEFT', 'IDENTITY_PROBING', 'ESCROW_DELIVERY_SCAM', 'MILITARY_SABOTAGE_RECRUITMENT', 'CRYPTO_WALLET_COMPROMISE'] as const;
export type LocalLabel = typeof LOCAL_LABELS[number];
export type LocalInput = { messages: string[]; frames: RequestFrame[] };
export const MAX_LOCAL_CHARACTERS = 4096;
export const MAX_LOCAL_MESSAGES = 4;
export type SparseFeatures = Array<[number, number]>;

export function featureHash(text: string, dimensions = FEATURE_DIMENSIONS): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0) % dimensions;
}

export function boundedLocalMessages(messages: string[]): { messages: string[]; truncated: boolean } {
  const selected: string[] = [];
  let remaining = MAX_LOCAL_CHARACTERS;
  let truncated = false;
  for (const message of messages.slice(-MAX_LOCAL_MESSAGES).reverse()) {
    const length = Math.min(message.length, remaining, 2048);
    selected.unshift(message.slice(0, length));
    truncated ||= length < message.length;
    remaining -= length;
  }
  return { messages: selected, truncated };
}

/** Shared by training and inference. No labels or heuristic verdicts are features. */
export function extractLinearFeatures(input: LocalInput, deadline = Infinity, dimensions = FEATURE_DIMENSIONS, version = FEATURE_VERSION): SparseFeatures {
  if (!SUPPORTED_FEATURE_VERSIONS.includes(version as 1 | 2)) throw new Error('Unsupported feature version');
  if (!SUPPORTED_FEATURE_DIMENSIONS.includes(dimensions as typeof SUPPORTED_FEATURE_DIMENSIONS[number])) throw new Error('Unsupported feature dimensions');
  const counts = new Map<number, number>();
  const add = (name: string, value: number) => {
    const index = featureHash(name, dimensions);
    counts.set(index, (counts.get(index) ?? 0) + value);
  };
  const messages = boundedLocalMessages(input.messages).messages;
  for (let m = 0; m < messages.length; m++) {
    const current = m === messages.length - 1;
    const weight = current ? 1 : 0.35;
    const tokens = messages[m].normalize('NFKC').toLowerCase()
      .replace(/https?:\/\/\S+/gu, ' externalurl ')
      .replace(/[’ʼ']/gu, '')
      .match(/[\p{L}\p{N}]+/gu)?.slice(0, 512) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      if (i % 32 === 0 && performance.now() > deadline) throw new Error('local classifier deadline');
      const token = tokens[i].slice(0, 48);
      add(`word:${token}`, weight);
      if (i > 0) add(`pair:${tokens[i - 1].slice(0, 48)} ${token}`, weight * 0.7);
      const wrapped = `^${token}$`;
      for (const size of [3, 4]) for (let j = 0; j <= wrapped.length - size; j++) add(`char:${wrapped.slice(j, j + size)}`, weight * 0.2);
      if (current) add(`latest:${token}`, 0.5);
    }
  }
  // Only the latest message's actual request frames are used. Limit duplicate evidence.
  for (const frame of input.frames.slice(0, 32)) {
    add(`object:${frame.object}`, 5);
    add(`request:${frame.object}:${frame.purpose}`, 6);
    add(`recipient:${frame.object}:${frame.destination}`, 3);
  }
  if (version === 2) {
    for (let m = 0; m < messages.length; m++) {
      const weight = m === messages.length - 1 ? 1 : .35;
      for (const signal of extractRequestSignals(messages[m])) {
        add(`relation:${signal.stance}:${signal.action}:${signal.object}`, 6 * weight);
        add(`relation-purpose:${signal.stance}:${signal.object}:${signal.purpose}`, 5 * weight);
        add(`relation-recipient:${signal.stance}:${signal.object}:${signal.destination}`, 4 * weight);
        add(`relation-complete:${signal.stance}:${signal.object}:${signal.complete}`, 4 * weight);
        if (signal.concealed) add(`relation-concealed:${signal.stance}:${signal.object}`, 5 * weight);
      }
    }
  }
  const values: SparseFeatures = Array.from(counts, ([index, count]) => [index, Math.log1p(count)]);
  const norm = Math.sqrt(values.reduce((sum, [, value]) => sum + value * value, 0)) || 1;
  return values.map(([index, value]) => [index, value / norm]);
}
