/**
 * SpaNavigationDetector
 * Забезпечує миттєве виявлення переходів між чатами, маршрутами та контактами
 * в односторінкових вебдодатках (SPA: Telegram Web, WhatsApp, OLX, Prom, Discord тощо)
 * без перезавантаження сторінки (No-Reload Navigation).
 *
 * Перехоплює HTML5 History API (pushState, replaceState), слухає події popstate/hashchange
 * та запускає повне очищення контексту, щоб накопичувальні семантичні вектори,
 * спани та кеш тригерів минулого співрозмовника ніколи не перетікали в новий чат.
 */

export interface SpaRouteChangeEvent {
  previousUrl: string;
  currentUrl: string;
  trigger: 'pushState' | 'replaceState' | 'popstate' | 'hashchange' | 'poll' | 'manual';
  isDifferentConversation: boolean;
  timestamp: number;
}

export type SpaRouteCallback = (event: SpaRouteChangeEvent) => void;

export class SpaNavigationDetector {
  private static originalPushState: typeof history.pushState | null = null;
  private static originalReplaceState: typeof history.replaceState | null = null;
  private static popstateListener: ((e: PopStateEvent) => void) | null = null;
  private static hashchangeListener: ((e: HashChangeEvent) => void) | null = null;
  private static callbacks: Set<SpaRouteCallback> = new Set();
  
  private static lastUrl: string = '';
  private static pollInterval: any = null;
  private static isInitialized = false;

  // Захист від шторму навігацій (Router Churn Protection)
  private static pendingEvent: SpaRouteChangeEvent | null = null;
  private static debounceTimer: any = null;
  private static readonly DEBOUNCE_MS = 25; // 25 мс для агрегації мікро-стрибків роутера

  /**
   * Безпечна нормалізація та парсинг URL з захистом від ін'єкцій та збоїв
   */
  public static safeParseUrl(url: string, baseOrigin?: string): URL | null {
    if (!url || typeof url !== 'string') return null;

    // Захист від наддовгих URL (DoS захист)
    if (url.length > 32768) {
      return null;
    }

    try {
      const base = baseOrigin || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost');
      return new URL(url, base);
    } catch {
      return null;
    }
  }

  /**
   * Визначає, чи представляє зміна URL перехід до нового діалогу/співрозмовника/маршруту
   */
  public static isDifferentConversation(oldUrlStr: string, newUrlStr: string): boolean {
    if (!oldUrlStr || !newUrlStr) return true;
    if (oldUrlStr === newUrlStr) return false;

    const oldUrl = this.safeParseUrl(oldUrlStr);
    const newUrl = this.safeParseUrl(newUrlStr);

    if (!oldUrl || !newUrl) return true;

    // 1. Інший хост
    if (oldUrl.host !== newUrl.host) return true;

    // 2. Інший шлях (наприклад, /chat/123 -> /chat/456 або /a/ -> /k/)
    if (oldUrl.pathname !== newUrl.pathname) return true;

    // 3. Інші параметри запиту (наприклад, ?chatId=1 -> ?chatId=2 або ?peer=abc)
    if (oldUrl.search !== newUrl.search) return true;

    // 4. Інший хеш (наприклад, Telegram Web: #-123456 -> #-987654 або #@username1 -> #@username2)
    if (oldUrl.hash !== newUrl.hash) {
      // Ігноруємо порожні хеші
      const cleanOldHash = oldUrl.hash.replace(/^#/, '');
      const cleanNewHash = newUrl.hash.replace(/^#/, '');
      if (cleanOldHash !== cleanNewHash) return true;
    }

    return false;
  }

  /**
   * Ініціалізація перехоплювача History API та слухачів подій
   */
  public static init(callback?: SpaRouteCallback): void {
    if (typeof window === 'undefined') return;

    if (callback) {
      this.callbacks.add(callback);
    }

    if (this.isInitialized) return;
    this.isInitialized = true;

    this.lastUrl = window.location ? window.location.href : '';

    // 1. Перехоплення history.pushState з захистом від рекурсії та циркулярних об'єктів
    if (typeof history !== 'undefined' && history.pushState) {
      this.originalPushState = history.pushState.bind(history);
      history.pushState = (state: any, unused: string, url?: string | URL | null) => {
        try {
          if (this.originalPushState) {
            this.originalPushState(state, unused, url);
          }
        } finally {
          this.handlePotentialUrlChange('pushState');
        }
      };
    }

    // 2. Перехоплення history.replaceState
    if (typeof history !== 'undefined' && history.replaceState) {
      this.originalReplaceState = history.replaceState.bind(history);
      history.replaceState = (state: any, unused: string, url?: string | URL | null) => {
        try {
          if (this.originalReplaceState) {
            this.originalReplaceState(state, unused, url);
          }
        } finally {
          this.handlePotentialUrlChange('replaceState');
        }
      };
    }

    // 3. Слухач події навігації браузера назад/вперед (popstate)
    this.popstateListener = () => {
      this.handlePotentialUrlChange('popstate');
    };
    window.addEventListener('popstate', this.popstateListener);

    // 4. Слухач події зміни хешу (hashchange)
    this.hashchangeListener = () => {
      this.handlePotentialUrlChange('hashchange');
    };
    window.addEventListener('hashchange', this.hashchangeListener);

    // 5. Низькочастотний фолбек-таймер (500 мс) на випадок бібліотек, які обходять History API
    this.pollInterval = setInterval(() => {
      this.handlePotentialUrlChange('poll');
    }, 500);
  }

  /**
   * Реєстрація слухача зміни роуту/діалогу
   */
  public static onConversationChange(callback: SpaRouteCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Обробка потенційної зміни URL з дебаунсингом штормів
   */
  public static handlePotentialUrlChange(
    trigger: 'pushState' | 'replaceState' | 'popstate' | 'hashchange' | 'poll' | 'manual',
    immediate: boolean = false
  ): boolean {
    if (typeof window === 'undefined' || !window.location) return false;

    const current = window.location.href;
    const previous = this.lastUrl;

    if (!current || current === previous) {
      return false;
    }

    const isDifferent = this.isDifferentConversation(previous, current);
    this.lastUrl = current;

    if (!isDifferent) {
      return false;
    }

    const event: SpaRouteChangeEvent = {
      previousUrl: previous,
      currentUrl: current,
      trigger,
      isDifferentConversation: isDifferent,
      timestamp: Date.now(),
    };

    if (immediate) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.dispatchToCallbacks(event);
      return true;
    }

    // Дебаунс для агрегації мікрозмін маршрутизатора
    this.pendingEvent = event;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.pendingEvent) {
        const evt = this.pendingEvent;
        this.pendingEvent = null;
        this.dispatchToCallbacks(evt);
      }
      this.debounceTimer = null;
    }, this.DEBOUNCE_MS);

    return true;
  }

  /**
   * Сповіщення зареєстрованих компонентів про зміну співрозмовника/роуту
   */
  private static dispatchToCallbacks(event: SpaRouteChangeEvent): void {
    for (const cb of this.callbacks) {
      try {
        cb(event);
      } catch (err) {
        console.warn('[SOVA:SpaNavigation] Помилка в обробнику зміни діалогу:', err);
      }
    }
  }

  /**
   * Примусове повідомлення системи про зміну контейнера чату
   * (для випадків, коли SPA змінює співрозмовника в DOM взагалі без зміни URL)
   */
  public static notifyDomChatSwapped(metadata?: string): void {
    const event: SpaRouteChangeEvent = {
      previousUrl: this.lastUrl,
      currentUrl: typeof window !== 'undefined' && window.location ? window.location.href : '',
      trigger: 'manual',
      isDifferentConversation: true,
      timestamp: Date.now(),
    };
    this.dispatchToCallbacks(event);
  }

  /**
   * Повне відновлення початкового стану браузера та очищення
   */
  public static destroy(): void {
    if (typeof history !== 'undefined') {
      if (this.originalPushState) {
        history.pushState = this.originalPushState;
        this.originalPushState = null;
      }
      if (this.originalReplaceState) {
        history.replaceState = this.originalReplaceState;
        this.originalReplaceState = null;
      }
    }

    if (typeof window !== 'undefined') {
      if (this.popstateListener) {
        window.removeEventListener('popstate', this.popstateListener);
        this.popstateListener = null;
      }
      if (this.hashchangeListener) {
        window.removeEventListener('hashchange', this.hashchangeListener);
        this.hashchangeListener = null;
      }
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.callbacks.clear();
    this.pendingEvent = null;
    this.isInitialized = false;
    this.lastUrl = '';
  }

  /**
   * Очищення стану для ізольованого модульного тестування
   */
  public static resetForTesting(): void {
    this.destroy();
  }
}
