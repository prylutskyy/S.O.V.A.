export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ActiveThreatContext {
  sessionId?: string;
  sourcePlatform: string;
  scenario: string;
  threatLevel: RiskLevel;
  detectedKeywords: string[];
  offPlatformLure: boolean;
  timestamp: number;
  ttlMs: number;
  targetSuspiciousUrl?: string;
}

export interface HeuristicResult {
  id?: string;
  name: string;
  type?: string;
  triggered: boolean;
  severity: RiskLevel;
  scoreContribution: number;
  message: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

export interface ThreatAssessment {
  score: number;
  level: RiskLevel;
  triggers: HeuristicResult[];
  timestamp: number;
  contextActive?: boolean;
}

export interface LureDetectionResult {
  detected: boolean;
  keywords: string[];
  isOffPlatformLure: boolean;
  suspiciousUrls: string[];
}

export * from './xai';
export * from './vault';
