import { LureDetectionResult } from '../types';

/**
 * Маркери виведення жертви в сторонні месенджери (Off-Platform Lure)
 */
const MESSENGER_PATTERNS = [
  /(t\.me\/[a-z0-9_]+)/i,
  /(telegram|телеграм|телеге|тг)[:\s@]+([a-z0-9_]+)/i,
  /(viber|вайбер)[:\s]+([+0-9\s-]+)/i,
  /(whatsapp|ватсап|воцап)[:\s]+([+0-9\s-]+)/i,
  /(wa\.me\/[0-9]+)/i,
  /(\+?380\s?\(?\d{2}\)?\s?\d{3}\s?\d{2}\s?\d{2})/g,
];

/**
 * Лінгвістичні маркери соціальної інженерії та фінансової спокуси
 */
const SCAM_KEYWORD_PATTERNS = [
  { regex: /(оплатив|оплачено|кошти переведено|успішна оплата)/i, tag: 'підтвердження_оплати' },
  { regex: /(отримати кошти|зарахування коштів|підтвердити отримання|забрати гроші)/i, tag: 'отримання_коштів' },
  { regex: /(olx[-_]доставка|олх[-_]доставка|безпечна угода)/i, tag: 'імітація_доставки' },
  { regex: /(перейдіть за посиланням|перейдіть за цим посиланням|тисніть сюди)/i, tag: 'заклик_до_переходу' },
  { regex: /(верифікувати|верифікація картки|підтвердження профілю)/i, tag: 'підміна_верифікації' },
  { regex: /(терміново|протягом \d+ хвилин|залишилось мало часу)/i, tag: 'штучна_терміновість' },
  { regex: /(виплата|компенсація|єпідтримка|виграш)/i, tag: 'фінансова_приманка' },
];

/**
 * Пошук сторонніх посилань та доменів у повідомленні
 */
const URL_REGEX = /(?:https?:\/\/[^\s]+|t\.me\/[a-z0-9_]+|wa\.me\/[0-9]+|\b(?:[a-z0-9-]+\.)+(?:com|ua|org|net|fake|site|online|top|me|to)(?:\/[^\s]*)?)/gi;

export function scanTextForLures(text: string): LureDetectionResult {
  const foundKeywords: string[] = [];
  let isOffPlatformLure = false;
  const suspiciousUrls: string[] = [];

  if (!text || text.trim().length < 4) {
    return { detected: false, keywords: [], isOffPlatformLure: false, suspiciousUrls: [] };
  }

  // 1. Перевірка на виведення в месенджери
  for (const pattern of MESSENGER_PATTERNS) {
    if (pattern.test(text)) {
      isOffPlatformLure = true;
      foundKeywords.push('виведення_в_месенджер');
      break;
    }
  }

  // 2. Перевірка на ключові маркери соціальної інженерії
  for (const { regex, tag } of SCAM_KEYWORD_PATTERNS) {
    if (regex.test(text)) {
      foundKeywords.push(tag);
    }
  }

  // 3. Екстракція посилань
  const urls = text.match(URL_REGEX);
  if (urls) {
    for (const rawUrl of urls) {
      const normalizedUrl = rawUrl.startsWith('http')
        ? rawUrl
        : rawUrl.startsWith('t.me')
        ? `https://${rawUrl}`
        : `https://${rawUrl}`;

      try {
        const parsed = new URL(normalizedUrl);
        // Якщо домен містить слова olx, nova, delivery, verify, pay, але не є офіційним
        if (
          /(olx|dostavka|pay|verify|nova|poshta)/i.test(parsed.hostname) &&
          !parsed.hostname.endsWith('olx.ua') &&
          !parsed.hostname.endsWith('novaposhta.ua')
        ) {
          suspiciousUrls.push(rawUrl);
          foundKeywords.push('підозрілий_фішинговий_домен');
        } else {
          suspiciousUrls.push(rawUrl);
        }
      } catch {
        suspiciousUrls.push(rawUrl);
      }
    }
  }

  // Детекція вважається позитивною, якщо є виведення в месенджер, підозрілий URL або ключовий маркер
  const detected = isOffPlatformLure || suspiciousUrls.length > 0 || foundKeywords.length >= 1;

  return {
    detected,
    keywords: [...new Set(foundKeywords)],
    isOffPlatformLure,
    suspiciousUrls,
  };
}
