import { ActiveThreatContext } from '../types';
import { IStorageAdapter, ChromeSessionStorageAdapter } from './adapters/storage.adapter';

export const CONTEXT_STORAGE_KEY = 'tainted_context_window';
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 хвилин життя контексту

export class ContextManager {
  constructor(private storage: IStorageAdapter) {}

  /**
   * Запис активного вікна загрози (Tainted Context Window)
   */
  public async setTaintedContext(
    context: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'>,
    customTtlMs: number = DEFAULT_TTL_MS
  ): Promise<ActiveThreatContext> {
    const fullContext: ActiveThreatContext = {
      ...context,
      timestamp: Date.now(),
      ttlMs: customTtlMs,
    };

    await this.storage.set(CONTEXT_STORAGE_KEY, fullContext);
    console.log('[ThreatShield:Context] Активовано Tainted Context Window:', fullContext);
    return fullContext;
  }

  /**
   * Отримання поточного активного контексту з перевіркою валідності TTL
   */
  public async getActiveTaintedContext(): Promise<ActiveThreatContext | null> {
    try {
      const context = await this.storage.get<ActiveThreatContext>(CONTEXT_STORAGE_KEY);
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
  public async clearTaintedContext(): Promise<void> {
    await this.storage.remove(CONTEXT_STORAGE_KEY);
  }
}

// Singleton for production use
export const contextManager = new ContextManager(new ChromeSessionStorageAdapter());
