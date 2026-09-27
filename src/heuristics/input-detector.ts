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

import { SensitiveAssetDetector } from './sensitive-asset-detector';

/**
 * Комплексний аналіз вихідного тексту (повідомлення чату) на витік платіжних та авторизаційних даних (SAD)
 * Передача лише номера картки (PAN) дозволена для P2P-розрахунків!
 */
export function checkOutboundChatLeakage(text: string): {
  isLeaking: boolean;
  hasCard: boolean;
  hasCvv: boolean;
  hasExpiry?: boolean;
  hasOtp?: boolean;
  cards: string[];
  warningMessage?: string;
} {
  const assessment = SensitiveAssetDetector.evaluateOutboundPayload({ text });
  const assets = assessment.detectedAssets;

  if (assessment.shouldBlock) {
    return {
      isLeaking: true,
      hasCard: assets.hasCard,
      hasCvv: assets.hasCvv,
      hasExpiry: assets.hasExpiry,
      hasOtp: assets.hasOtp,
      cards: assets.cards,
      warningMessage: `[СПРОБА ВИТОКУ ЧУТЛИВИХ ДАНИХ]: ${assessment.reason}`,
    };
  }

  return {
    isLeaking: false,
    hasCard: assets.hasCard,
    hasCvv: false,
    hasExpiry: false,
    hasOtp: false,
    cards: assets.cards,
  };
}

import { HiddenFieldInspector } from './hidden-field-inspector';

/**
 * Перевірка, чи є поле введення прихованим (техніка крадіжки даних через autofill phishing)
 */
export function isFieldHidden(element: HTMLElement): boolean {
  return HiddenFieldInspector.isElementCloaked(element).isCloaked;
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

      const sensitivity = HiddenFieldInspector.isFieldSensitive(input);

      // 1. Поля паролів
      if (input.type === 'password' || sensitivity.fieldType === 'PASSWORD') {
        hasFilledPassword = true;
      }

      // 2. Поля CVV / CVC / Pin / Код безпеки
      const hasCvvInText = CVV_IN_TEXT_REGEX.test(val);
      const isCvvDescriptor = sensitivity.fieldType === 'CVV';
      if ((isCvvDescriptor && (digitsOnly.length === 3 || digitsOnly.length === 4 || val.length >= 2)) || hasCvvInText) {
        hasFilledCvv = true;
      }

      // 3. Поля банківської картки (валідація за Луна, виявлення картки в тексті АБО картковий дескриптор)
      const hasCardInText = extractCardNumbersFromText(val).length > 0;
      const isCardDescriptor = sensitivity.fieldType === 'CARD_NUMBER';
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
  const scan = HiddenFieldInspector.scanForm(form);
  const results: HeuristicResult[] = [];

  if (scan.hasTrap) {
    results.push(scan.heuristicResult);
  }

  const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
  let sensitiveCount = 0;
  inputs.forEach((input) => {
    if (HiddenFieldInspector.isFieldSensitive(input).isSensitive) {
      sensitiveCount++;
    }
  });

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
