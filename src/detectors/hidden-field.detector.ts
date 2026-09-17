import { HeuristicResult } from '../types';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { HiddenFieldInspector } from '../heuristics/hidden-field-inspector';

export class HiddenFieldDetector implements IFormDetector {
  public readonly id = 'hidden_fields';
  public readonly name = 'Hidden Field Cloaking & Autofill Trap Detector';

  public scan(form: HTMLFormElement, _context: FormDetectorContext): HeuristicResult[] {
    const scan = HiddenFieldInspector.scanForm(form);
    if (!scan.hasTrap) {
      return [];
    }

    const fieldSummary = scan.flaggedInputs
      .map((i) => `${i.name || i.type} (${i.fieldType}): ${i.cloakingReason}`)
      .join(', ');

    return [
      {
        name: 'hidden_sensitive_inputs_detected',
        triggered: true,
        severity: 'CRITICAL',
        scoreContribution: 60,
        message: `Виявлено приховані чутливі поля форми (Autofill Phishing Trap): ${fieldSummary}`,
        details: {
          flaggedCount: scan.flaggedInputs.length,
          flaggedTypes: scan.flaggedTypes,
          cloakingTechniques: scan.flaggedInputs.map((i) => i.cloakingReason),
        },
      },
    ];
  }
}
