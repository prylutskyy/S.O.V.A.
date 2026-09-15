import { RiskLevel } from './index';

export interface AttackChainStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  sourceNode: string;
  targetNode?: string;
  severity: RiskLevel;
  timestamp: number;
  icon: string;
  evidence?: string;
}

export interface XaiRiskFactor {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  label: string;
  description: string;
  details: string[];
}

export interface XaiRiskBreakdown {
  technical: XaiRiskFactor;   // R_tech
  contextual: XaiRiskFactor;  // C_env
  userAction: XaiRiskFactor;  // A_user
  totalScore: number;
  formula: string;
}

export interface XaiExplanation {
  summary: string;
  riskLevel: RiskLevel;
  totalScore: number;
  diagnosis: string;
  attackScenario: string;
  chain: AttackChainStep[];
  breakdown: XaiRiskBreakdown;
  plainLanguageExplanation: string;
  countermeasures: string[];
  educationalTip: string;
  engineType: 'chrome-builtin-ai' | 'adaptive-contextual-xai';
}
