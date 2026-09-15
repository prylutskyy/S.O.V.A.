/**
 * Білий список довірених доменів (Whitelist).
 * Домени з цього списку мають нульовий базовий технічний ризик.
 */
export const WHITELISTED_DOMAINS = new Set<string>([
  'google.com',
  'www.google.com',
  'olx.ua',
  'www.olx.ua',
  'prom.ua',
  'www.prom.ua',
  'privatbank.ua',
  'next.privat24.ua',
  'monobank.ua',
  'novaposhta.ua',
  'rozetka.com.ua',
  'facebook.com',
  'www.facebook.com',
  'instagram.com',
  'telegram.org',
  'web.telegram.org',
  'viber.com',
  'whatsapp.com',
  'web.whatsapp.com',
  'github.com',
  'diia.gov.ua',
]);

/**
 * Платформи, на яких ведеться комунікація між покупцем і продавцем
 * і де розгортаються сценарії комп'ютерної соціальної інженерії.
 */
export const MONITORED_PLATFORMS = new Set<string>([
  'olx.ua',
  'www.olx.ua',
  'prom.ua',
  'www.prom.ua',
  'facebook.com',
  'www.facebook.com',
  'localhost',
  '127.0.0.1',
]);

export function isWhitelisted(hostname: string): boolean {
  const cleanHost = hostname.toLowerCase().trim();
  if (WHITELISTED_DOMAINS.has(cleanHost)) {
    return true;
  }
  // Перевірка субдоменів
  for (const domain of WHITELISTED_DOMAINS) {
    if (cleanHost.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

export function isMonitoredPlatform(hostname: string): boolean {
  const cleanHost = hostname.toLowerCase().trim();
  if (MONITORED_PLATFORMS.has(cleanHost)) {
    return true;
  }
  for (const platform of MONITORED_PLATFORMS) {
    if (cleanHost.endsWith(`.${platform}`)) {
      return true;
    }
  }
  return false;
}
