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
 * Пошук номерів банківських карток у довільному тексті (наприклад, у повідомленні чату)
 */
export function extractCardNumbersFromText(text: string): string[] {
  if (!text || text.length < 13) return [];

  // Шукаємо послідовності з 13-19 цифр, можливо розділених пробілами або дефісами
  const potentialMatches = text.match(/(?:\d[ -]*?){13,19}/g);
  if (!potentialMatches) return [];

  const validCards: string[] = [];
  for (const match of potentialMatches) {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && passesLuhnCheck(digitsOnly)) {
      validCards.push(digitsOnly);
    }
  }

  return [...new Set(validCards)];
}

export const CVV_IN_TEXT_REGEX = /(?:^|[^\p{L}\p{N}])(?:cvv|cvc|cvv2|cvc2|свв|свс|код\s*безпеки|код\s*картки|security\s*code)[\s:=_-]*([0-9]{3,4})(?:$|[^\p{L}\p{N}])/iu;

/**
 * Комплексний аналіз вихідного тексту (повідомлення чату) на витік платіжних даних
 */
export function checkOutboundChatLeakage(text: string): {
  isLeaking: boolean;
  hasCard: boolean;
  hasCvv: boolean;
  cards: string[];
  warningMessage?: string;
} {
  const cards = extractCardNumbersFromText(text);
  const hasCard = cards.length > 0;
  const hasCvv = CVV_IN_TEXT_REGEX.test(text);

  if (hasCard || hasCvv) {
    let reason = '';
    if (hasCard && hasCvv) {
      reason = 'номер банківської картки та секретний CVV/CVC код';
    } else if (hasCard) {
      reason = 'номер банківської картки';
    } else {
      reason = 'секретний код безпеки CVV/CVC';
    }

    return {
      isLeaking: true,
      hasCard,
      hasCvv,
      cards,
      warningMessage: `🛑 [СПРОБА ВИТОКУ ДАНИХ У ЧАТІ]: Ви намагаєтеся надіслати ${reason} у відкритому чаті! Продавцю для отримання коштів CVV та повні реквізити картки ніколи не потрібні.`,
    };
  }

  return { isLeaking: false, hasCard: false, hasCvv: false, cards: [] };
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

export interface FormSensitiveState {
  hasFilledCard: boolean;
  hasFilledPassword: boolean;
  hasFilledCvv: boolean;
  hasFilledAnySensitive: boolean;
  isEntirelyEmpty: boolean;
  filledInputCount: number;
}

/**
 * Оцінка поточного стану заповненості полів форми
 */
export function getFormFilledState(form: HTMLFormElement): FormSensitiveState {
  const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

  let hasFilledCard = false;
  let hasFilledPassword = false;
  let hasFilledCvv = false;
  let filledInputCount = 0;

  inputs.forEach((input) => {
    const val = input.value?.trim() || '';
    if (val.length > 0) {
      filledInputCount++;
      const descriptor = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete}`.toLowerCase();
      const digitsOnly = val.replace(/\D/g, '');

      // 1. Поля паролів
      if (input.type === 'password' || /(pass|pwd|secret|auth)/i.test(descriptor)) {
        hasFilledPassword = true;
      }

      // 2. Поля CVV / CVC / Pin / Код безпеки
      const hasCvvInText = CVV_IN_TEXT_REGEX.test(val);
      const isCvvDescriptor = /(cvv|cvc|csc|pin|безпек)/i.test(descriptor);
      if ((isCvvDescriptor && (digitsOnly.length === 3 || digitsOnly.length === 4 || val.length >= 2)) || hasCvvInText) {
        hasFilledCvv = true;
      }

      // 3. Поля банківської картки (валідація за Луна, виявлення картки в тексті АБО картковий дескриптор)
      const hasCardInText = extractCardNumbersFromText(val).length > 0;
      const isCardDescriptor = /(card|карт|pan|cc-number|cc-num)/i.test(descriptor);
      if (hasCardInText || passesLuhnCheck(val) || (isCardDescriptor && digitsOnly.length >= 12)) {
        hasFilledCard = true;
      }
    }
  });

  const hasFilledAnySensitive = hasFilledCard || hasFilledPassword || hasFilledCvv;
  const isEntirelyEmpty = filledInputCount === 0;

  return {
    hasFilledCard,
    hasFilledPassword,
    hasFilledCvv,
    hasFilledAnySensitive,
    isEntirelyEmpty,
    filledInputCount,
  };
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

  // Присутність полів у розмітці враховується, але з меншою вагою (базова технічна ознака)
  if (sensitiveCount > 0) {
    results.push({
      name: 'sensitive_fields_present',
      triggered: true,
      severity: 'LOW',
      scoreContribution: 10,
      message: `Форма містить розмітку чутливих полів введення (${sensitiveCount} шт.).`,
      details: { sensitiveCount },
    });
  }

  return results;
}
