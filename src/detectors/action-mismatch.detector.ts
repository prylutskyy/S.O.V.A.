import { HeuristicResult } from '../types';
import { IFormDetector, FormDetectorContext } from './contracts/form-detector.interface';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { checkFormActionMismatch } from '../heuristics/form-action';

export class ActionMismatchDetector implements IFormDetector {
  public readonly id = 'action_mismatch';
  public readonly name = 'Action Mismatch Detector';

  public scan(form: HTMLFormElement, context: FormDetectorContext): HeuristicResult[] {
    const rawAction = form.getAttribute('action') || form.action;

    if (!rawAction || rawAction === '#' || rawAction.startsWith('javascript:')) {
      return [
        {
          name: 'form_action_mismatch',
          triggered: false,
          severity: 'LOW',
          scoreContribution: 0,
          message: 'Цільовий URL форми є локальним або відносним.',
        },
      ];
    }

    const { currentHost, targetHost } = context;

    if (currentHost && targetHost && currentHost === targetHost) {
      return [
        {
          name: 'form_action_mismatch',
          triggered: false,
          severity: 'LOW',
          scoreContribution: 0,
          message: 'Цільовий домен форми збігається з поточним хостом.',
        },
      ];
    }

    if (isAccreditedPaymentGateway(targetHost)) {
      return [
        {
          name: 'form_action_mismatch',
          triggered: false,
          severity: 'LOW',
          scoreContribution: 0,
          message: `Форма використовує сертифікований платіжний шлюз (${targetHost}).`,
          details: { actionHost: targetHost, isPaymentGateway: true },
        },
      ];
    }

    // Делегування детальних перевірок субдоменів
    return [checkFormActionMismatch(form)];
  }
}
