import { HeuristicResult } from '../types';

/**
 * Перевірка розбіжності цільового домену форми (Form action mismatch).
 * Якщо форма на поточному сайті відправляє дані на сторонній підозрілий хост — це високий фактор загрози.
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

    // Якщо хости повністю збігаються
    if (actionHost === currentHost) {
      return {
        name: 'form_action_mismatch',
        triggered: false,
        severity: 'LOW',
        scoreContribution: 0,
        message: 'Цільовий домен форми збігається з поточним хостом.',
      };
    }

    // Перевірка споріднених субдоменів (наприклад auth.olx.ua та olx.ua)
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

    // Якщо хости різні - спрацьовує евристика
    return {
      name: 'form_action_mismatch',
      triggered: true,
      severity: 'HIGH',
      scoreContribution: 45,
      message: `Виявлено підміну цільового хосту! Сторінка (${currentHost}) намагається відправити дані форми на сторонній ресурс (${actionHost}).`,
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
