/**
 * Менеджер довірених доменів, доданих користувачем (User-Defined Whitelist).
 * Зберігається в chrome.storage.local.
 */
const USER_WHITELIST_KEY = 'threat_shield_user_whitelist';

export class UserWhitelistManager {
  public static async getAllowedDomains(): Promise<string[]> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await chrome.storage.local.get(USER_WHITELIST_KEY);
        return res[USER_WHITELIST_KEY] || [];
      }
    } catch (e) {
      console.error('[ThreatShield] Помилка зчитування списку довірених доменів:', e);
    }
    return [];
  }

  public static async isDomainAllowed(hostname: string): Promise<boolean> {
    if (!hostname) return false;
    const cleanHost = hostname.toLowerCase().trim();
    const list = await this.getAllowedDomains();
    return list.includes(cleanHost);
  }

  public static async allowDomain(hostname: string): Promise<void> {
    if (!hostname) return;
    const cleanHost = hostname.toLowerCase().trim();
    const list = await this.getAllowedDomains();
    if (!list.includes(cleanHost)) {
      list.push(cleanHost);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [USER_WHITELIST_KEY]: list });
      }
    }
  }

  public static async removeDomain(hostname: string): Promise<void> {
    const cleanHost = hostname.toLowerCase().trim();
    let list = await this.getAllowedDomains();
    list = list.filter((h) => h !== cleanHost);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [USER_WHITELIST_KEY]: list });
    }
  }
}
