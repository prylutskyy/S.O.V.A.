import { ActiveThreatContext } from '../types';
import { IStorageAdapter, ChromeSessionStorageAdapter } from './adapters/storage.adapter';

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 хвилин життя контексту

export class ContextManager {
  constructor(private storage: IStorageAdapter) {}

  private getStorageKey(tabId: number): string {
    return `tainted_context_${tabId}`;
  }

  /**
   * Запис активного вікна загрози для конкретної вкладки
   */
  public async setTaintedContext(
    tabId: number,
    context: Omit<ActiveThreatContext, 'timestamp' | 'ttlMs'>,
    customTtlMs: number = DEFAULT_TTL_MS
  ): Promise<ActiveThreatContext> {
    const fullContext: ActiveThreatContext = {
      ...context,
      timestamp: Date.now(),
      ttlMs: customTtlMs,
    };

    const key = this.getStorageKey(tabId);
    await this.storage.set(key, fullContext);
    console.log(`[ThreatShield:Context] Активовано Tainted Context для вкладки ${tabId}:`, fullContext);
    return fullContext;
  }

  /**
   * Отримання поточного активного контексту для вкладки з перевіркою валідності TTL
   */
  public async getActiveTaintedContext(tabId: number): Promise<ActiveThreatContext | null> {
    try {
      const key = this.getStorageKey(tabId);
      const context = await this.storage.get<ActiveThreatContext>(key);
      if (!context) {
        return null;
      }

      const now = Date.now();
      const elapsed = now - context.timestamp;

      // Перевірка терміну життя (TTL)
      if (elapsed > context.ttlMs) {
        console.log(`[ThreatShield:Context] Термін дії контексту минув для вкладки ${tabId}, очищення...`);
        await this.clearTaintedContext(tabId);
        return null;
      }

      return context;
    } catch (error) {
      console.error(`[ThreatShield:Context] Помилка зчитування контексту для вкладки ${tabId}:`, error);
      return null;
    }
  }

  /**
   * Очищення контекстного вікна для вкладки
   */
  public async clearTaintedContext(tabId: number): Promise<void> {
    const key = this.getStorageKey(tabId);
    await this.storage.remove(key);
  }

  /**
   * Копіювання контексту з батьківської вкладки у дочірню (Tab Lineage)
   */
  public async propagateContext(sourceTabId: number, targetTabId: number): Promise<boolean> {
    const sourceCtx = await this.getActiveTaintedContext(sourceTabId);
    if (!sourceCtx) return false;

    // Reset TTL for the new tab so the clock starts ticking fresh
    const { timestamp, ttlMs, ...ctxWithoutTime } = sourceCtx;
    await this.setTaintedContext(targetTabId, ctxWithoutTime, ttlMs);
    
    console.log(`[ThreatShield:Context] Контекст перенесено з ${sourceTabId} до ${targetTabId}`);
    return true;
  }
}

// Singleton for production use
export const contextManager = new ContextManager(new ChromeSessionStorageAdapter());
