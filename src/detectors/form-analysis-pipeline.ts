import { ActiveThreatContext, HeuristicResult, ThreatAssessment } from '../types';
import { FormSensitiveState, getFormFilledState } from '../heuristics/input-detector';
import { VaultScanner } from '../heuristics/vault-scanner';
import { RiskEngine } from '../core/risk-engine';
import { isWhitelisted } from '../core/whitelist';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { ActionMismatchDetector } from './action-mismatch.detector';
import { HiddenFieldDetector } from './hidden-field.detector';
import { UrgencyPatternDetector } from './urgency.detector';
import { CardCvvDetector } from './card-cvv.detector';
import { VaultMarkerDetector } from './vault-marker.detector';

export interface FormAnalysisResult {
  assessment: ThreatAssessment;
  formState: FormSensitiveState;
  targetHost: string;
}

export class FormAnalysisPipeline {
  private detectors: IFormDetector[] = [];

  constructor() {
    this.registerDefaultDetectors();
  }

  private registerDefaultDetectors(): void {
    this.detectors.push(
      new ActionMismatchDetector(),
      new HiddenFieldDetector(),
      new VaultMarkerDetector(),
      new UrgencyPatternDetector(),
      new CardCvvDetector()
    );
  }

  public register(detector: IFormDetector): void {
    this.detectors.push(detector);
  }

  public analyze(
    form: HTMLFormElement,
    currentHost: string,
    activeContext?: ActiveThreatContext | null
  ): FormAnalysisResult {
    const rawAction = form.getAttribute('action') || form.action;
    let targetHost = currentHost;
    try {
      if (rawAction && rawAction !== '#' && !rawAction.startsWith('javascript:')) {
        targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
      }
    } catch {}

    const detectorContext: FormDetectorContext = { currentHost, targetHost };
    const formState = getFormFilledState(form);
    const heuristics: HeuristicResult[] = [];

    // Опитування зареєстрованих модульних детекторів
    for (const detector of this.detectors) {
      try {
        const results = detector.scan(form, detectorContext);
        if (results && results.length > 0) {
          heuristics.push(...results);
        }
      } catch (err) {
        console.error(`[FormAnalysisPipeline] Error in detector ${detector.id}:`, err);
      }
    }

    // Перевірка стану Vault (чутливі маркери)
    const vaultScan = VaultScanner.scanFormSync(form, currentHost);
    if (vaultScan.triggers.length > 0) {
      formState.hasFilledAnySensitive = true;
    }

    // Зшивання сесій (Tainted Context Window)
    let contextBonus = 0;
    if (activeContext && !isWhitelisted(currentHost)) {
      contextBonus = 35;
      heuristics.push({
        name: 'tainted_context_window_active',
        triggered: true,
        severity: 'HIGH',
        scoreContribution: 35,
        message: `Зшивання розірваних сесій: перехід після підозрілої активності на ${activeContext.sourcePlatform}.`,
      });
    }

    const assessment = RiskEngine.evaluate(
      heuristics,
      {
        action: 'submit',
        hasFilledSensitive:
          formState.hasFilledCvv ||
          formState.hasFilledPassword ||
          (vaultScan && vaultScan.matches.length > 0),
        isEntirelyEmpty: formState.isEntirelyEmpty,
      },
      contextBonus
    );

    if (activeContext) {
      assessment.contextActive = true;
    }

    return { assessment, formState, targetHost };
  }
}
