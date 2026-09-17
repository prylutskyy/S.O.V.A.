import { HeuristicResult } from '../types';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { UrgencyDetector } from '../heuristics/urgency-detector';

export class UrgencyPatternDetector implements IFormDetector {
  public readonly id = 'urgency_dark_patterns';
  public readonly name = 'Artificial Urgency & Countdown Pressure Detector';

  public scan(form: HTMLFormElement, _context: FormDetectorContext): HeuristicResult[] {
    return UrgencyDetector.scanUrgencySync(form);
  }
}
