import { VaultItem } from '../types/vault';

export interface OutboundAssetDetectionResult {
  hasCard: boolean;
  cards: string[];
  hasCvv: boolean;
  cvv?: string;
  hasExpiry: boolean;
  expiry?: string;
  hasOtp: boolean;
  otp?: string;
  vaultMatches: VaultItem[];
}

export interface OutboundAssessment {
  shouldBlock: boolean;
  action: 'ALLOW' | 'BLOCK';
  riskLevel: 'SAFE' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason?: string;
  detectedAssets: OutboundAssetDetectionResult;
}

export interface OutboundEvaluationPayload {
  text: string;
  unlockedVaultItems?: VaultItem[];
  isUntrustedDomain?: boolean;
}

/**
 * Валідація за алгоритмом Луна (Luhn algorithm) для номера банківської картки
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
 * Регулярні вирази для чутливих авторизаційних даних (SAD)
 */
export const CVV_REGEX = /(?:^|[^\p{L}\p{N}])(?:cvv|cvc|cvv2|cvc2|свв|свс|код\s*безпеки|код\s*картки|три\s*цифри\s*(?:ззаду|на\s*звороті)|код\s*ззаду|security\s*code)[\s\p{L}:=_-]{0,20}?([0-9]{3,4})(?:$|[^\p{L}\p{N}])/iu;

export const EXPIRATION_CONTEXT_REGEX = /(?:діє\s*до|термін(?:\s*дії)?|exp(?:ir(?:y|ation))?|valid\s*thru)[\s:=_-]*([0-1][0-9][\/\.-](?:20)?[2-3][0-9])/iu;
export const EXPIRATION_STANDALONE_REGEX = /(?:^|\s)([0-1][0-9]\/[2-3][0-9])(?:\s|$|[,\.])/;

export const OTP_REGEX = /(?:код\s*з\s*смс|пароль\s*підтвердження|код\s*підтвердження|sms\s*code|otp\s*code|otp)[\s\p{L}:=_-]{0,25}?([0-9]{4,8})(?:$|[^\p{L}\p{N}])/iu;

export class SensitiveAssetDetector {
  /**
   * Витяг номерів банківських карток за алгоритмом Луна
   */
  public static extractCardNumbers(text: string): string[] {
    if (!text || text.length < 13) return [];

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

  /**
   * Перевірка наявності CVV/CVC коду
   */
  public static detectCvv(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    const match = text.match(CVV_REGEX);
    if (match && match[1]) {
      return { detected: true, match: match[1] };
    }
    return { detected: false };
  }

  /**
   * Перевірка наявності терміну дії картки (MM/YY)
   */
  public static detectExpirationDate(text: string, hasCard: boolean = false): { detected: boolean; match?: string } {
    if (!text) return { detected: false };

    // 1. Пошук з явним ключовим словом ("діє до 08/28", "exp: 11/27")
    const contextMatch = text.match(EXPIRATION_CONTEXT_REGEX);
    if (contextMatch && contextMatch[1]) {
      const raw = contextMatch[1].replace('-', '/').replace('.', '/');
      const parts = raw.split('/');
      const month = parseInt(parts[0], 10);
      if (month >= 1 && month <= 12) {
        return { detected: true, match: raw };
      }
    }

    // 2. Якщо є номер картки або згадка exp/cvv, шукаємо автономний патерн MM/YY
    const standaloneMatch = text.match(EXPIRATION_STANDALONE_REGEX);
    if (standaloneMatch && standaloneMatch[1]) {
      const raw = standaloneMatch[1];
      const [mStr, yStr] = raw.split('/');
      const month = parseInt(mStr, 10);
      const year = parseInt(yStr, 10);
      if (month >= 1 && month <= 12 && year >= 24 && year <= 39) {
        return { detected: true, match: raw };
      }
    }

    return { detected: false };
  }

  /**
   * Перевірка наявності одноразового SMS-коду (OTP)
   */
  public static detectOtp(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    const match = text.match(OTP_REGEX);
    if (match && match[1]) {
      return { detected: true, match: match[1] };
    }
    return { detected: false };
  }

  /**
   * Пошук збігів із розблокованим сховищем (Private Vault)
   */
  public static detectVaultMatches(text: string, unlockedItems?: VaultItem[]): VaultItem[] {
    if (!text || !unlockedItems || unlockedItems.length === 0) {
      return [];
    }

    const cleanText = text.toLowerCase();
    const matches: VaultItem[] = [];

    for (const item of unlockedItems) {
      if (!item.enabled && item.enabled !== undefined) continue;
      const realClean = (item.realValue || '').trim().toLowerCase();
      if (!realClean || realClean.length < 3) continue;

      // Нормалізація для номерів телефонів (якщо це фінансовий телефон)
      if (item.category === 'FINANCIAL_PHONE') {
        const digitsText = cleanText.replace(/\D/g, '');
        const digitsReal = realClean.replace(/\D/g, '');
        if (digitsReal.length >= 7 && digitsText.length >= 7 && digitsText.includes(digitsReal.slice(-7))) {
          matches.push(item);
          continue;
        }
      }

      // Текстовий збіг для кодового слова, дівочого прізвища, ІПН, тощо
      if (cleanText.includes(realClean)) {
        matches.push(item);
      }
    }

    return matches;
  }

  /**
   * Головний метод селективної оцінки вихідного навантаження (Outbound Payload)
   */
  public static evaluateOutboundPayload(payload: OutboundEvaluationPayload): OutboundAssessment {
    const text = payload.text || '';
    const cards = this.extractCardNumbers(text);
    const hasCard = cards.length > 0;

    const cvvResult = this.detectCvv(text);
    const expiryResult = this.detectExpirationDate(text, hasCard);
    const otpResult = this.detectOtp(text);
    const vaultMatches = this.detectVaultMatches(text, payload.unlockedVaultItems);

    const detectedAssets: OutboundAssetDetectionResult = {
      hasCard,
      cards,
      hasCvv: cvvResult.detected,
      cvv: cvvResult.match,
      hasExpiry: expiryResult.detected,
      expiry: expiryResult.match,
      hasOtp: otpResult.detected,
      otp: otpResult.match,
      vaultMatches,
    };

    // ── СЦЕНАРІЇ БЛОКУВАННЯ (CRITICAL / HIGH) ────────────────────────────────

    // 1. Секретний код CVV/CVC
    if (cvvResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: 'Виявлено спробу передачі секретного CVV/CVC коду картки. Для отримання коштів цей код ніколи не потрібен!',
        detectedAssets,
      };
    }

    // 2. Одноразовий SMS-пароль підтвердження (OTP)
    if (otpResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: 'Виявлено передачу одноразового SMS-коду безпеки або пароля підтвердження операції!',
        detectedAssets,
      };
    }

    // 3. Прямий витік розблокованих секретів з Private Vault
    if (vaultMatches.length > 0) {
      const labels = vaultMatches.map((v) => v.label).join(', ');
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: `Виявлено спробу передачі персональних банківських маркерів з Private Vault: ${labels}!`,
        detectedAssets,
      };
    }

    // 4. Термін дії картки разом із номером картки або окремо
    if (expiryResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: hasCard ? 'HIGH' : 'MEDIUM',
        reason: 'Виявлено термін дії банківської картки (MM/YY). Разом із номером картки це створює загрозу несанкціонованого списання коштів!',
        detectedAssets,
      };
    }

    // ── СЦЕНАРІЙ БЕЗПЕКИ: ТІЛЬКИ НОМЕР КАРТКИ (PAN) ──────────────────────────
    if (hasCard) {
      return {
        shouldBlock: false,
        action: 'ALLOW',
        riskLevel: 'SAFE',
        reason: 'Номер картки передано для P2P-переказу. CVV та термін дії відсутні — дія безпечна.',
        detectedAssets,
      };
    }

    // ── ЗВИЧАЙНИЙ БЕЗПЕЧНИЙ ТЕКСТ ───────────────────────────────────────────
    return {
      shouldBlock: false,
      action: 'ALLOW',
      riskLevel: 'SAFE',
      detectedAssets,
    };
  }
}
