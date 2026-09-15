export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ThreatContext {
  sourcePlatform?: string;
  scenario?: string;
  threatLevel: RiskLevel;
  detectedKeywords: string[];
  offPlatformLure: boolean;
  timestamp: number;
  ttlMs: number;
}

export interface HeuristicResult {
  name: string;
  triggered: boolean;
  severity: RiskLevel;
  scoreContribution: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface ThreatAssessment {
  score: number;
  level: RiskLevel;
  triggers: HeuristicResult[];
  timestamp: number;
}
