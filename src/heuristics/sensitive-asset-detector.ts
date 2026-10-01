import { VaultItem } from '../types/vault';
import { PersonalVaultManager } from '../core/personal-vault';


export interface OutboundAssetDetectionResult {
  hasCard: boolean;
  cards: string[];
  hasCvv: boolean;
  cvv?: string;
  hasExpiry: boolean;
  expiry?: string;
  hasOtp: boolean;
  otp?: string;
  hasGps?: boolean;
  gpsMatch?: string;
  hasSabotage?: boolean;
  sabotageMatch?: string;
  hasSeedPhrase?: boolean;
  seedPhraseMatch?: string;
  hasPassword?: boolean;
  passwordMatch?: string;
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
export const CVV_REGEX = /(?:^|[^\p{L}\p{N}])(?:cvv|cvc|cvv2|cvc2|свв|свс|код\s*безпеки|код\s*картки|код\s*перевірки|три\s*цифри\s*(?:ззаду|на\s*звороті)|код\s*ззаду|security\s*code)[\s\p{L}:=_-]{0,15}?([0-9]{3,4})(?:$|[^\p{L}\p{N}])/iu;

export const EXPIRATION_CONTEXT_REGEX = /(?:діє\s*до|термін(?:\s*дії)?|exp(?:ir(?:y|ation))?|valid\s*thru)[\s:=_-]*([0-1][0-9][\/\.-](?:20)?[2-3][0-9])/iu;
export const EXPIRATION_STANDALONE_REGEX = /(?:^|\s)([0-1][0-9]\/[2-3][0-9])(?:\s|$|[,\.])/;

export const OTP_REGEX = /(?:код\s*з\s*смс|пароль\s*підтвердження|код\s*підтвердження|sms\s*code|otp\s*code|otp)[\s\p{L}:=_-]{0,25}?([0-9]{4,8})(?:$|[^\p{L}\p{N}])/iu;

export const GPS_COORDINATES_REGEX = /\b([3-7]\d\.\d{4,8})\s*,\s*([2-4]\d\.\d{4,8})\b|https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)/i;

export const SABOTAGE_RECRUITMENT_REGEX = /(?:релейн[а-яіїє]*\s*шаф|підпал[а-яіїє]*\s*(?:авто|потяг|релейн|шаф|технік)|де\s*стоїть\s*ппо|координат[а-яіїє]*\s*(?:ппо|баз|частин|в\/ч|склад|дислокац)|розташуванн[а-яіїє]*\s*(?:ппо|технік|військ|батаре)|фото\s*(?:підстанц|тец|гес|трансформатор)|плачу\s*(?:за|в)\s*(?:крипт|гривн|фото|відео)\s*(?:шаф|підпал|координат))/iu;

export const SEED_PHRASE_REGEX = /(?:seed\s*phrase|recovery\s*phrase|mnemonic|secret\s*recovery|фраза\s*відновлення|сід-фраза|сід\s*фраза|мнемонічн[а-яіїє]*\s*фраз[а-яіїє]*|12\s*слів|24\s*слова)[\s:=_-]*(?:[a-zA-Z]{3,8}\s+){11,23}[a-zA-Z]{3,8}/iu;
// Шукаємо або 12/24 англійських слова підряд (автономно), або з контекстним словом.
export const STANDALONE_SEED_PHRASE_REGEX = /(?:^|\s)((?:[a-z]{3,8}\s+){11}[a-z]{3,8}|(?:[a-z]{3,8}\s+){23}[a-z]{3,8})(?:\s|$)/i;

export const PASSWORD_REGEX = /(?:password|пароль|pwd|pass)[\s:=_-]+([A-Za-z0-9!@#$%^&*()_+]{6,32})(?:\s|$)/iu;

export class SensitiveAssetDetector {
  /**
   * Детекція точних GPS-координат або посилань на мапи
   */
  public static detectGpsCoordinates(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    const match = text.match(GPS_COORDINATES_REGEX);
    if (match) {
      return { detected: true, match: match[0] };
    }
    return { detected: false };
  }

  /**
   * Детекція лінгвістичних маркерів ворожого рекрутингу та диверсій (Нацспротив)
   */
  public static detectSabotageRecruitment(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    const match = text.match(SABOTAGE_RECRUITMENT_REGEX);
    if (match) {
      return { detected: true, match: match[0] };
    }
    return { detected: false };
  }
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
   * Детекція Seed-фрази від криптогаманця (12 або 24 слова)
   */
  public static detectSeedPhrase(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    
    // Спершу шукаємо з контекстними словами
    let match = text.match(SEED_PHRASE_REGEX);
    if (match) return { detected: true, match: match[0].trim() };
    
    // Потім шукаємо просто 12/24 слова автономно
    match = text.match(STANDALONE_SEED_PHRASE_REGEX);
    if (match) return { detected: true, match: match[1].trim() };
    
    return { detected: false };
  }

  /**
   * Детекція потенційного введення паролю
   */
  public static detectPassword(text: string): { detected: boolean; match?: string } {
    if (!text) return { detected: false };
    const match = text.match(PASSWORD_REGEX);
    if (match) return { detected: true, match: match[1].trim() };
    return { detected: false };
  }

  /**
   * Перевірка наявності CVV/CVC коду.
   * Якщо hasCardContext === true (номер картки є в повідомленні або вже переданий у сесії),
   * розпізнає автономні 3-значні числа як код безпеки.
   */
  public static detectCvv(text: string, hasCardContext: boolean = false): { detected: boolean; match?: string } {
    if (!text) return { detected: false };

    // 1. Пошук за контекстним регулярним виразом
    const match = text.match(CVV_REGEX);
    if (match && match[1]) {
      return { detected: true, match: match[1] };
    }

    // 2. Якщо номер картки вже є в тексті або в історії сесії:
    // (Але якщо текст містить ознаки одноразового SMS-пароля OTP, не плутати з CVV)
    if (hasCardContext && !OTP_REGEX.test(text)) {
      let cleaned = text;

      // Видаляємо всі послідовності картки
      const potentialCards = text.match(/(?:\d[ -]*?){13,19}/g);
      if (potentialCards) {
        for (const c of potentialCards) {
          cleaned = cleaned.replace(c, ' ');
        }
      }

      // Видаляємо термін дії MM/YY
      cleaned = cleaned.replace(/(?:^|\s)[0-1][0-9][\/\.-][2-3][0-9](?:\s|$)/g, ' ');

      // Видаляємо телефонні номери (+380..., 098..., тощо)
      cleaned = cleaned.replace(/(?:\+?38)?\s*0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, ' ');
      cleaned = cleaned.replace(/\b\d{10,12}\b/g, ' ');

      // Видаляємо грошові суми (100 грн, 500 $, 18500 uah тощо)
      cleaned = cleaned.replace(/[0-9]+(?:\s*[.,]\s*[0-9]+)?\s*(?:грн|uah|usd|eur|\$|€|євро|долар|гривень|гривні)/gi, ' ');

      // Шукаємо окремі 3-значні або 4-значні числа
      const candidateMatches = cleaned.match(/(?:^|[^\d])([0-9]{3,4})(?:$|[^\d])/g);
      if (candidateMatches) {
        for (const cand of candidateMatches) {
          const digits = cand.replace(/\D/g, '');
          const num = parseInt(digits, 10);
          // Відсікаємо 4-значні роки (1920-2050)
          if (digits.length === 4 && num >= 1920 && num <= 2050) continue;
          if (digits.length === 3 || digits.length === 4) {
            return { detected: true, match: digits };
          }
        }
      }
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
   * Пошук збігів із сховищем (Private Vault)
   * Підтримує відкриті дані (unlocked) та Zero-Knowledge сліпі сигнатури (locked)
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

      // 1. Пряма перевірка (якщо є відкрите значення realValue)
      if (realClean && realClean.length >= 3) {
        if (item.category === 'FINANCIAL_PHONE') {
          const digitsText = cleanText.replace(/\D/g, '');
          const digitsReal = realClean.replace(/\D/g, '');
          if (digitsReal.length >= 7 && digitsText.length >= 7 && digitsText.includes(digitsReal.slice(-7))) {
            matches.push(item);
            continue;
          }
        }

        if (cleanText.includes(realClean)) {
          matches.push(item);
          continue;
        }
      }

      // 2. Zero-Knowledge Blind Token Matching (для заблокованого сховища з blindTokens)
      if (item.blindTokens && item.blindTokens.length > 0) {
        const matched = PersonalVaultManager.findMatchingVaultItemForValue(text, [item]);
        if (matched) {
          matches.push(matched);
        }
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

    const cvvResult = this.detectCvv(text, hasCard);
    const expiryResult = this.detectExpirationDate(text, hasCard);
    const otpResult = this.detectOtp(text);
    const gpsResult = this.detectGpsCoordinates(text);
    const sabotageResult = this.detectSabotageRecruitment(text);
    const seedResult = this.detectSeedPhrase(text);
    const passwordResult = this.detectPassword(text);
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
      hasGps: gpsResult.detected,
      gpsMatch: gpsResult.match,
      hasSabotage: sabotageResult.detected,
      sabotageMatch: sabotageResult.match,
      hasSeedPhrase: seedResult.detected,
      seedPhraseMatch: seedResult.match,
      hasPassword: passwordResult.detected,
      passwordMatch: passwordResult.match,
      vaultMatches,
    };

    // ── СЦЕНАРІЇ БЛОКУВАННЯ (CRITICAL / HIGH) ────────────────────────────────

    if (seedResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: 'КРИТИЧНО: Виявлено спробу передачі Seed-фрази від криптогаманця. Ніколи і нікому не передавайте ці дані, інакше ви втратите всі свої кошти!',
        detectedAssets,
      };
    }

    if (passwordResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'HIGH',
        reason: 'Виявлено спробу передачі паролю у відкритому вигляді. Ніколи не надсилайте свої паролі в чатах!',
        detectedAssets,
      };
    }

    // 0. Національний спротив: витік геолокації або маркери диверсій
    if (gpsResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: 'Виявлено передачу точних GPS-координат або посилання на картографічні сервіси! Під час воєнного стану це несе пряму загрозу коригування ударів ворога.',
        detectedAssets,
      };
    }

    if (sabotageResult.detected) {
      return {
        shouldBlock: true,
        action: 'BLOCK',
        riskLevel: 'CRITICAL',
        reason: 'Увага! Текст містить маркери вербування до диверсій / підпалів або збору даних про Сили оборони (ст. 111-2, 113 КК України).',
        detectedAssets,
      };
    }

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
