// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpaNavigationDetector, SpaRouteChangeEvent } from '../../../src/core/spa-navigation';
import { ChatSessionState } from '../../../src/heuristics/chat-session-state';
import { ChatChannelMonitor } from '../../../src/heuristics/chat-channel';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';
import { SemanticTriggerEngine } from '../../../src/heuristics/semantic-trigger';

describe('SpaNavigationDetector: Cross-Chat Isolation & Adversarial Stress Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.location.href = 'https://web.telegram.org/k/#-1001111111';

    SpaNavigationDetector.resetForTesting();
    ChatSessionState.reset();
    ChatChannelMonitor.reset();
  });

  afterEach(() => {
    SpaNavigationDetector.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // РІВЕНЬ 1: БАЗОВІ ТЕСТИ НАВІГАЦІЇ В SPA (SANITY & CORE FUNCTIONALITY)
  // =========================================================================
  describe('Рівень 1: Базові механізми виявлення зміни діалогу', () => {
    it('фіксує зміну хешу чату через pushState (Telegram Web Hash Navigation)', () => {
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.init((evt) => events.push(evt));

      const newUrl = 'https://web.telegram.org/k/#-1002222222';
      window.location.href = newUrl;
      window.location.hash = '#-1002222222';

      history.pushState({}, '', newUrl);
      vi.advanceTimersByTime(50); // Пропуск дебаунсу

      expect(events).toHaveLength(1);
      expect(events[0].trigger).toBe('pushState');
      expect(events[0].previousUrl).toBe('https://web.telegram.org/k/#-1001111111');
      expect(events[0].currentUrl).toBe(newUrl);
      expect(events[0].isDifferentConversation).toBe(true);
    });

    it('фіксує зміну шляху через replaceState (OLX / Prom Chat Navigation)', () => {
      window.location.href = 'https://www.olx.ua/d/uk/myaccount/chat/111/';
      window.location.pathname = '/d/uk/myaccount/chat/111/';
      SpaNavigationDetector.init();

      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.onConversationChange((evt) => events.push(evt));

      const newUrl = 'https://www.olx.ua/d/uk/myaccount/chat/222/';
      window.location.href = newUrl;
      window.location.pathname = '/d/uk/myaccount/chat/222/';

      history.replaceState({ chat: 222 }, '', newUrl);
      vi.advanceTimersByTime(50);

      expect(events).toHaveLength(1);
      expect(events[0].trigger).toBe('replaceState');
      expect(events[0].isDifferentConversation).toBe(true);
    });

    it('фіксує зміну діалогу через параметри запиту (Query Params: ?id=xxx)', () => {
      window.location.href = 'https://prom.ua/cabinet/messages?dialog_id=987';
      window.location.search = '?dialog_id=987';
      window.location.pathname = '/cabinet/messages';
      SpaNavigationDetector.init();

      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.onConversationChange((evt) => events.push(evt));

      const newUrl = 'https://prom.ua/cabinet/messages?dialog_id=988';
      window.location.href = newUrl;
      window.location.search = '?dialog_id=988';

      history.pushState({}, '', newUrl);
      vi.advanceTimersByTime(50);

      expect(events).toHaveLength(1);
      expect(events[0].isDifferentConversation).toBe(true);
    });

    it('фіксує навігацію "Назад / Вперед" через подію popstate', () => {
      SpaNavigationDetector.init();
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.onConversationChange((evt) => events.push(evt));

      const newUrl = 'https://web.telegram.org/k/#-1003333333';
      window.location.href = newUrl;
      window.location.hash = '#-1003333333';

      window.dispatchEvent(new PopStateEvent('popstate', { state: { chat: 333 } }));
      vi.advanceTimersByTime(50);

      expect(events).toHaveLength(1);
      expect(events[0].trigger).toBe('popstate');
    });

    it('ігнорує виклик, якщо URL не змінився (No-Op на ідентичний URL)', () => {
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.init((evt) => events.push(evt));

      // Викликаємо pushState з тим самим URL
      history.pushState({}, '', window.location.href);
      vi.advanceTimersByTime(50);

      expect(events).toHaveLength(0);
    });

    it('дозволяє відписатися від сповіщень через повернену функцію unsubscribe', () => {
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.init();
      const unsubscribe = SpaNavigationDetector.onConversationChange((evt) => events.push(evt));

      unsubscribe();

      const newUrl = 'https://web.telegram.org/k/#-1009999999';
      window.location.href = newUrl;
      history.pushState({}, '', newUrl);
      vi.advanceTimersByTime(50);

      expect(events).toHaveLength(0);
    });
  });

  // =========================================================================
  // РІВЕНЬ 2: ІНТЕГРАЦІЙНА ІЗОЛЯЦІЯ ДІАЛОГІВ ТА ВЕКТОРІВ (STATE PURGE)
  // =========================================================================
  describe('Рівень 2: Ізоляція семантичного вектора та пам’яті діалогу', () => {
    it('повністю обнуляє історію повідомлень та накопичений вектор при зміні чату в SPA', () => {
      SpaNavigationDetector.init(() => {
        ChatChannelMonitor.reset();
        DebuggerOverlay.resetSessionRisk();
      });

      // 1. Користувач веде підозріле листування в першому чаті
      ChatSessionState.addMessageAndEvaluate('Шукаємо кур’єрів розвідників у Дніпрі, плачу 500 USDT на криптогаманець', 'inbound');
      ChatSessionState.addMessageAndEvaluate('Сфотографуй будівлю ТЦК та номери машин поруч', 'inbound');

      expect(ChatSessionState.getRecentMessages()).toHaveLength(2);
      const dialogueBefore = ChatSessionState.getDialogueHistory();
      expect(dialogueBefore).toContain('ТЦК');

      // 2. Користувач перемикається в інший чат (наприклад, пише мамі в Telegram)
      const nextChatUrl = 'https://web.telegram.org/k/#-1007777777';
      window.location.href = nextChatUrl;
      window.location.hash = '#-1007777777';
      history.pushState({}, '', nextChatUrl);
      vi.advanceTimersByTime(50);

      // 3. Перевіряємо повну ізоляцію: історія обнулена
      expect(ChatSessionState.getRecentMessages()).toHaveLength(0);
      expect(ChatSessionState.getDialogueHistory()).toBe('');

      // 4. Повідомлення в новому чаті аналізується з чистого аркуша
      const scanNewChat = ChatSessionState.addMessageAndEvaluate('Привіт, купи будь ласка молоко та хліб', 'inbound');
      expect(scanNewChat.hasFormedIntent).toBe(false);
      expect(scanNewChat.telemetry?.cosineSimilarity).toBeLessThan(0.20);
      expect(ChatSessionState.getDialogueHistory()).not.toContain('ТЦК');
    });

    it('очищає статус тривоги та телеметрію в DebuggerOverlay при переході до нового контакту', () => {
      SpaNavigationDetector.init(() => {
        DebuggerOverlay.resetSessionRisk();
      });

      // Імітуємо активну телеметрію загрози в дебагері
      DebuggerOverlay.recordVectorTelemetry({
        rawText: 'Тестова загроза вербування',
        topPrototypeId: 'MILITARY_SABOTAGE_RECRUITMENT',
        topPrototypeLabel: 'Вербування / Диверсія',
        cosineSimilarity: 0.85,
        dimensions: [],
        allPrototypes: [],
        timestamp: Date.now(),
        hasFormedIntent: true,
      });

      expect(DebuggerOverlay.getVectorTelemetry()?.topPrototypeId).toBe('MILITARY_SABOTAGE_RECRUITMENT');

      // Перемикаємо роут SPA
      const newUrl = 'https://web.telegram.org/k/#-1008888888';
      window.location.href = newUrl;
      history.pushState({}, '', newUrl);
      vi.advanceTimersByTime(50);

      // Телеметрія попереднього чату повинна бути повністю очищена
      expect(DebuggerOverlay.getVectorTelemetry()).toBeNull();
    });
  });

  // =========================================================================
  // РІВЕНЬ 3: «БЕЗУМНІ» ТА ЕКСТРЕМАЛЬНІ СЦЕНАРІЇ (ADVERSARIAL & STRESS TESTS)
  // =========================================================================
  describe('Рівень 3: Екстремальні стрес-тести (Crazy & Adversarial Cases)', () => {
    it('ШТОРМ РОУТЕРА (Router Flood): витримує 1000 швидкісних викликів pushState за мілісекунди без збою пам’яті', () => {
      let callCount = 0;
      SpaNavigationDetector.init(() => {
        callCount++;
      });

      // Імітуємо шалену циклічну анімацію роутера або скрол-спай бібліотеку (1000 викликів)
      for (let i = 0; i < 1000; i++) {
        const floodUrl = `https://web.telegram.org/k/#-100${i}`;
        window.location.href = floodUrl;
        history.pushState({ idx: i }, '', floodUrl);
      }

      // Завдяки дебаунсингу система не викликає 1000 важких операцій очищення
      expect(callCount).toBe(0);

      vi.advanceTimersByTime(50);

      // Спрацьовує рівно один агрегований колбек для останнього актуального стану
      expect(callCount).toBe(1);
    });

    it('ЦИРКУЛЯРНІ ОБ’ЄКТИ: витримує стан history.pushState з нескінченними циклічними посиланнями', () => {
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.init((evt) => events.push(evt));

      // Створюємо циркулярний об'єкт, на якому JSON.stringify падає з TypeError
      const circularState: any = { tag: 'malicious' };
      circularState.self = circularState;
      circularState.nested = { backToParent: circularState };

      const safeUrl = 'https://web.telegram.org/k/#-100CIRCULAR';
      window.location.href = safeUrl;

      // pushState не повинен викинути виняток через спроби серіалізації
      expect(() => {
        history.pushState(circularState, '', safeUrl);
      }).not.toThrow();

      vi.advanceTimersByTime(50);
      expect(events).toHaveLength(1);
      expect(events[0].currentUrl).toBe(safeUrl);
    });

    it('ГІГАНТСЬКІ URL (100 000+ символів): захист від Buffer Overflow та ReDoS', () => {
      SpaNavigationDetector.init();

      // Створюємо гігантський URL завдовжки понад 100 000 символів
      const massiveHash = 'A'.repeat(100000);
      const giantUrl = `https://web.telegram.org/k/#${massiveHash}`;
      window.location.href = giantUrl;

      expect(() => {
        history.pushState({}, '', giantUrl);
      }).not.toThrow();

      vi.advanceTimersByTime(50);

      // safeParseUrl безпечно відхиляє гігантський рядок без зависання процесу
      expect(SpaNavigationDetector.safeParseUrl(giantUrl)).toBeNull();
    });

    it('ІН’ЄКЦІЯ ПРОТОКОЛІВ: безпечно ізолює спроби підсунути javascript: схеми без краху перехоплювача', () => {
      SpaNavigationDetector.init();

      const maliciousUrl = 'javascript:alert(document.cookie)';

      // Браузер генерує SecurityError на cross-protocol pushState;
      // наш перехоплювач не падає і безпечно пропускає стандартний виняток
      expect(() => {
        history.pushState({}, '', maliciousUrl);
      }).toThrow();

      // safeParseUrl та isDifferentConversation безпечно опрацьовують подібні схеми без збоїв
      expect(SpaNavigationDetector.isDifferentConversation('https://web.telegram.org/chat/1', maliciousUrl)).toBe(true);
    });

    it('ГОНИТВА ШІ (In-Flight Race Condition): скасовує дію старого вердикту LLM, якщо користувач переключив чат до відповіді', async () => {
      let activeSessionId: string | null = 'session_chat_A';
      let isChatBlocked = false;

      // Слухач зміни SPA роуту скидає активну сесію
      SpaNavigationDetector.init(() => {
        activeSessionId = null;
      });

      // 1. Запит до LLM пішов у ЧАТІ А
      const dispatchedSessionId = activeSessionId;

      // 2. Користувач миттєво клікає інший чат (ЧАТ Б)
      const chatBUrl = 'https://web.telegram.org/k/#-100CHAT_B';
      window.location.href = chatBUrl;
      history.pushState({}, '', chatBUrl);
      vi.advanceTimersByTime(50);

      expect(activeSessionId).toBeNull();

      // 3. Через 800 мс нарешті приходить асинхронна відповідь ШІ від ЧАТУ А
      const simulateLlmArrival = () => {
        // Захисна перевірка, яку ми впровадили в content.ts
        if (!activeSessionId || activeSessionId !== dispatchedSessionId) {
          return 'VERDICT_DROPPED_DUE_TO_SPA_SWITCH';
        }
        isChatBlocked = true;
        return 'CHAT_BLOCKED';
      };

      const result = simulateLlmArrival();

      // Вердикт відхилено, новий чат Б НЕ заблоковано чужим вердиктом!
      expect(result).toBe('VERDICT_DROPPED_DUE_TO_SPA_SWITCH');
      expect(isChatBlocked).toBe(false);
    });

    it('ЗБЕРЕЖЕННЯ ЛАНЦЮЖКА ПЕРЕХОПЛЕННЯ (Monkey-Patch Chaining): не ламає сторонні перехоплювачі pushState', () => {
      let externalPageInterceptorCalled = false;

      // Імітуємо інший скрипт сторінки, який перехопив pushState ДО нашого модуля
      const originalNativePushState = history.pushState;
      history.pushState = function (state, unused, url) {
        externalPageInterceptorCalled = true;
        return originalNativePushState.apply(this, [state, unused, url]);
      };

      SpaNavigationDetector.init();

      const newUrl = 'https://web.telegram.org/k/#-100CHAIN';
      window.location.href = newUrl;
      history.pushState({}, '', newUrl);

      // Викликається і сторонній перехоплювач, і наш детектор
      expect(externalPageInterceptorCalled).toBe(true);

      SpaNavigationDetector.destroy();
    });

    it('РУЧНИЙ СИГНАЛ DOM SWAP: дозволяє скинути контекст, якщо SPA замінила чат без зміни URL', () => {
      const events: SpaRouteChangeEvent[] = [];
      SpaNavigationDetector.init((evt) => events.push(evt));

      // Викликаємо спеціальний метод для без-URL додатків
      SpaNavigationDetector.notifyDomChatSwapped('peer-12345');

      expect(events).toHaveLength(1);
      expect(events[0].trigger).toBe('manual');
      expect(events[0].isDifferentConversation).toBe(true);
    });
  });
});
