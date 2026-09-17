import { HeuristicResult } from '../types';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { getFormFilledState } from '../heuristics/input-detector';

export class CardCvvDetector implements IFormDetector {
  public readonly id = 'card_cvv';
  public readonly name = 'Payment Card & CVV Exposure Detector';

  public scan(form: HTMLFormElement, _context: FormDetectorContext): HeuristicResult[] {
    const results: HeuristicResult[] = [];
    const formState = getFormFilledState(form);

    if (formState.hasFilledCard) {
      results.push({
        name: 'luhn_card_number_detected',
        triggered: true,
        severity: 'MEDIUM',
        scoreContribution: 40,
        message: 'У формі знайдено номер банківської картки!',
      });
    }

    if (formState.hasFilledCvv) {
      results.push({
        name: 'cvv_code_detected',
        triggered: true,
        severity: 'CRITICAL',
        scoreContribution: 40,
        message: 'У формі введено секретний код безпеки банківської картки (CVV/CVC)!',
      });
    }

    return results;
  }
}
