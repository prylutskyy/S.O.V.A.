import { HeuristicResult } from '../types';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';

/**
 * Перевірка розбіжності цільового домену форми (Form action mismatch).
 * Якщо форма відправляє дані на сторонній ресурс, перевіряється,
 * чи є цей ресурс сертифікованим платіжним шлюзом (Stripe, LiqPay, Portmone тощо).
 */
export function checkFormActionMismatch(form: HTMLFormElement): HeuristicResult {
  const currentHost = window.location.hostname.toLowerCase();
  const rawAction = form.getAttribute('action') || form.action;

  if (!rawAction || rawAction === '#' || rawAction.startsWith('javascript:')) {
    return {
      name: 'form_action_mismatch',
      triggered: false,
      severity: 'LOW',
      scoreContribution: 0,
      message: 'Цільовий URL форми є локальним або відносним.',
    };
  }

  try {
    const actionUrl = new URL(rawAction, window.location.href);
    const actionHost = actionUrl.hostname.toLowerCase();

    // 1. Якщо хости повністю збігаються
    if (actionHost === currentHost) {
      return {
        name: 'form_action_mismatch',
        triggered: false,
        severity: 'LOW',
        scoreContribution: 0,
        message: 'Цільовий домен форми збігається з поточним хостом.',
      };
    }

    // 2. Якщо сторонній хост є офіційним акредитованим платіжним шлюзом
    if (isAccreditedPaymentGateway(actionHost)) {
      return {
        name: 'form_action_mismatch',
        triggered: false,
        severity: 'LOW',
        scoreContribution: 0,
        message: `Форма використовує сертифікований платіжний шлюз (${actionHost}).`,
        details: { actionHost, isPaymentGateway: true },
      };
    }

    // 3. Перевірка споріднених субдоменів (наприклад auth.olx.ua та olx.ua)
    const currentBase = currentHost.split('.').slice(-2).join('.');
    const actionBase = actionHost.split('.').slice(-2).join('.');

    if (currentBase && currentBase === actionBase) {
      return {
        name: 'form_action_mismatch',
        triggered: false,
        severity: 'LOW',
        scoreContribution: 5,
        message: `Форма надсилає дані на субдомен того самого ресурсу (${actionHost}).`,
        details: { actionHost, currentHost },
      };
    }

    // 4. Якщо сторонній хост невідомий і не є платіжним шлюзом
    return {
      name: 'form_action_mismatch',
      triggered: true,
      severity: 'HIGH',
      scoreContribution: 45,
      message: `Виявлено сторонній цільовий хост (${actionHost}), який не є акредитованим платіжним шлюзом!`,
      details: { actionHost, currentHost, rawAction },
    };
  } catch (error) {
    return {
      name: 'form_action_mismatch',
      triggered: true,
      severity: 'MEDIUM',
      scoreContribution: 20,
      message: 'Некоректний цільовий URL форми (action URL parse error).',
      details: { rawAction, error: String(error) },
    };
  }
}
