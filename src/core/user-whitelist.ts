/**
 * Менеджер довірених доменів, доданих користувачем (User-Defined Whitelist).
 * Зберігається в chrome.storage.local з підтримкою миттєвого синхронного кешування,
 * щоб запобігти асинхронному пропуску подій сабміту.
 */
const USER_WHITELIST_KEY = 'threat_shield_user_whitelist';

export class UserWhitelistManager {
  private static cachedDomains: Set<string> = new Set();
  private static isInitialized: boolean = false;

  /**
   * Ініціалізація кешу при завантаженні контентного скрипта
   */
  public static async init(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await chrome.storage.local.get(USER_WHITELIST_KEY);
        const list: string[] = res[USER_WHITELIST_KEY] || [];
        this.cachedDomains = new Set(list.map((d) => d.toLowerCase().trim()));
        this.isInitialized = true;
      }
    } catch (e) {
      console.error('[ThreatShield] Помилка ініціалізації білого списку користувача:', e);
    }
  }

  /**
   * Миттєва синхронна перевірка домену (критично для обробників подій сабміту)
   */
  public static isDomainAllowedSync(hostname: string): boolean {
    if (!hostname) return false;
    const cleanHost = hostname.toLowerCase().trim();
    if (this.cachedDomains.has(cleanHost)) return true;

    for (const domain of this.cachedDomains) {
      if (cleanHost.endsWith(`.${domain}`)) {
        return true;
      }
    }
    return false;
  }

  public static async isDomainAllowed(hostname: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.isDomainAllowedSync(hostname);
  }

  public static async allowDomain(hostname: string): Promise<void> {
    if (!hostname) return;
    const cleanHost = hostname.toLowerCase().trim();
    this.cachedDomains.add(cleanHost);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [USER_WHITELIST_KEY]: Array.from(this.cachedDomains) });
    }
  }

  public static async removeDomain(hostname: string): Promise<void> {
    const cleanHost = hostname.toLowerCase().trim();
    this.cachedDomains.delete(cleanHost);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [USER_WHITELIST_KEY]: Array.from(this.cachedDomains) });
    }
  }
}
