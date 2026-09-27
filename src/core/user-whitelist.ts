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
   * Нормалізує домен (прибирає протоколи, порти, www, пробіли)
   */
  public static normalizeDomain(hostname: string): string {
    if (!hostname) return '';
    let host = hostname.toLowerCase().trim();
    if (host.includes('://')) {
      try {
        host = new URL(host).hostname;
      } catch {}
    }
    // Прибираємо порт, якщо вказаний (localhost:3000 -> localhost)
    host = host.split(':')[0].trim();
    // Прибираємо www.
    return host.replace(/^www\./, '');
  }

  /**
   * Ініціалізація кешу при завантаженні контентного скрипта
   */
  public static async init(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await chrome.storage.local.get(USER_WHITELIST_KEY);
        const list: string[] = res[USER_WHITELIST_KEY] || [];
        this.cachedDomains = new Set(list.map((d) => this.normalizeDomain(d)).filter(Boolean));
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
    const cleanHost = this.normalizeDomain(hostname);
    if (!cleanHost) return false;

    if (this.cachedDomains.has(cleanHost)) return true;

    for (const domain of this.cachedDomains) {
      if (cleanHost === domain || cleanHost.endsWith(`.${domain}`)) {
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
    const cleanHost = this.normalizeDomain(hostname);
    if (!cleanHost) return;
    this.cachedDomains.add(cleanHost);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [USER_WHITELIST_KEY]: Array.from(this.cachedDomains) });
    }
  }

  /**
   * Отримання списку всіх дозволених доменів
   */
  public static async getDomains(): Promise<string[]> {
    if (!this.isInitialized) {
      await this.init();
    }
    return Array.from(this.cachedDomains);
  }

  public static async clearAll(): Promise<void> {
    this.cachedDomains.clear();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(USER_WHITELIST_KEY);
    }
  }

  public static async removeDomain(hostname: string): Promise<void> {
    const cleanHost = this.normalizeDomain(hostname);
    this.cachedDomains.delete(cleanHost);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [USER_WHITELIST_KEY]: Array.from(this.cachedDomains) });
    }
  }
}

// Автоматична синхронізація кешу між вкладками та Popup вікном
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes['threat_shield_user_whitelist']) {
      const list: string[] = changes['threat_shield_user_whitelist'].newValue || [];
      UserWhitelistManager['cachedDomains'] = new Set(
        list.map((d) => UserWhitelistManager.normalizeDomain(d)).filter(Boolean)
      );
    }
  });
}
