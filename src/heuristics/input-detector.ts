import { HeuristicResult } from '../types';

/**
 * Валідація за алгоритмом Луна (Luhn algorithm) для перевірки на номер банківської картки
 */
export function passesLuhnCheck(value: string): boolean {
  const sanitized = value.replace(/\D/g, '');
  if (sanitized.length < 13 || sanitized.length > 19) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Перевірка, чи є поле введення прихованим (техніка крадіжки даних через autofill phishing)
 */
export function isFieldHidden(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    parseFloat(style.opacity) === 0 ||
    rect.width === 0 ||
    rect.height === 0 ||
    rect.left < -1000 ||
    rect.top < -1000
  ) {
    return true;
  }

  return false;
}

/**
 * Аналіз форми або елемента вводу на приховані чутливі поля та фішинг автозаповнення
 */
export function checkSensitiveAndHiddenInputs(form: HTMLFormElement): HeuristicResult[] {
  const results: HeuristicResult[] = [];
  const inputs = form.querySelectorAll<HTMLInputElement>('input, textarea, select');
  const sensitiveRegex = /(card|cvv|cvc|exp|pass|pwd|token|auth|pin|secure|номер.*карт)/i;

  let hasHiddenSensitiveFields = false;
  let sensitiveCount = 0;
  const flaggedInputs: string[] = [];

  inputs.forEach((input) => {
    const descriptor = `${input.name} ${input.id} ${input.autocomplete} ${input.placeholder}`.toLowerCase();
    const isSensitive = sensitiveRegex.test(descriptor) || input.type === 'password';

    if (isSensitive) {
      sensitiveCount++;
      if (isFieldHidden(input)) {
        hasHiddenSensitiveFields = true;
        flaggedInputs.push(input.name || input.id || input.type);
      }
    }
  });

  if (hasHiddenSensitiveFields) {
    results.push({
      name: 'hidden_sensitive_fields',
      triggered: true,
      severity: 'CRITICAL',
      scoreContribution: 50,
      message: 'Виявлено приховані поля збору чутливих даних (Autofill Phishing)! Форма намагається викрасти паролі або платіжні дані без відома користувача.',
      details: { flaggedInputs },
    });
  }

  if (sensitiveCount > 0) {
    results.push({
      name: 'sensitive_fields_present',
      triggered: true,
      severity: 'MEDIUM',
      scoreContribution: 15,
      message: `Форма містить чутливі поля введення (${sensitiveCount} шт.).`,
      details: { sensitiveCount },
    });
  }

  return results;
}
