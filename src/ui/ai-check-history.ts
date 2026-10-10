export type AICheckStatus = 'pending' | 'completed' | 'cancelled' | 'timeout' | 'error';
export type AICheckSource = 'inference' | 'cache' | 'session-quarantine';
export interface AIRequestMessage { role: string; content: string }
export interface AICheckResult {
  isScam: boolean;
  confidence: number;
  reasoning: string;
  scamType?: string;
  provider?: string;
  modelUsed?: string;
  latencyMs?: number;
  rawResponse?: string;
  requestMessages?: AIRequestMessage[];
}
export interface AICheckInput {
  sessionId: string | null;
  source?: AICheckSource;
  originalCheckId?: string;
  text?: string;
  dialogue?: string;
  intent?: string;
  flags?: string[];
  preparedPrompt?: string;
  redactedCount?: number;
}
export interface AICheck extends AICheckInput {
  id: string;
  number: number;
  source: AICheckSource;
  status: AICheckStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  result?: AICheckResult;
  message?: string;
}

/** Bounded diagnostic history. Terminal records cannot be rewritten by late responses. */
export class AICheckHistory {
  private records: AICheck[] = [];
  private sequence = 0;
  public revision = 0;
  constructor(private readonly limit = 150) {}

  public begin(input: AICheckInput): AICheck {
    const number = ++this.sequence;
    const record: AICheck = { ...structuredClone(input), id: `ai-${number}`, number,
      source: input.source || 'inference', status: 'pending', startedAt: Date.now() };
    this.records.push(record);
    if (this.records.length > this.limit) this.records.shift();
    this.revision++;
    return structuredClone(record);
  }

  public finish(id: string, status: Exclude<AICheckStatus, 'pending'>,
    result?: AICheckResult, message?: string): AICheck | null {
    const record = this.records.find(item => item.id === id);
    if (!record || record.status !== 'pending') return null;
    record.status = status;
    record.finishedAt = Date.now();
    record.durationMs = Math.max(0, record.finishedAt - record.startedAt);
    record.result = result ? structuredClone(result) : undefined;
    record.message = message;
    this.revision++;
    return structuredClone(record);
  }

  public snapshot(): AICheck[] { return structuredClone(this.records); }
  public clear(): void { this.records = []; this.revision++; }
}
