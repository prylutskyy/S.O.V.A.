import { ActiveThreatContext } from '../types';

const CONTEXT_STORAGE_KEY = 'tainted_context_window';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 хвилин життя контексту

export class ContextManager {
  /**
   * Отримання безпечного сховища сесії (chrome.storage.session живе тільки в RAM)
   */
  private static getStorage(): chrome.storage.StorageArea {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      return chrome.storage.session;
    }
    return chrome.storage.local;
  }

  /**
   * Запис активного вікна загрози (Tainted Context Window)
   */
  public static async setTaintedContext(
    context: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'>,
    customTtlMs: number = DEFAULT_TTL_MS
  ): Promise<ActiveThreatContext> {
    const fullContext: ActiveThreatContext = {
      ...context,
      timestamp: Date.now(),
      ttlMs: customTtlMs,
    };

    const storage = this.getStorage();
    await storage.set({ [CONTEXT_STORAGE_KEY]: fullContext });
    console.log('[ThreatShield:Context] Активовано Tainted Context Window:', fullContext);
    return fullContext;
  }

  /**
   * Отримання поточного активного контексту з перевіркою валідності TTL
   */
  public static async getActiveTaintedContext(): Promise<ActiveThreatContext | null> {
    try {
      const storage = this.getStorage();
      const result = await storage.get(CONTEXT_STORAGE_KEY);
      const context: ActiveThreatContext | undefined = result[CONTEXT_STORAGE_KEY];

      if (!context) {
        return null;
      }

      const now = Date.now();
      const elapsed = now - context.timestamp;

      // Перевірка терміну життя (TTL)
      if (elapsed > context.ttlMs) {
        console.log('[ThreatShield:Context] Термін дії контексту минув, очищення...');
        await this.clearTaintedContext();
        return null;
      }

      return context;
    } catch (error) {
      console.error('[ThreatShield:Context] Помилка зчитування контексту:', error);
      return null;
    }
  }

  /**
   * Очищення контекстного вікна
   */
  public static async clearTaintedContext(): Promise<void> {
    const storage = this.getStorage();
    await storage.remove(CONTEXT_STORAGE_KEY);
  }
}
