import { IntentClassifier } from './intent-classifier';
import { ChatSessionState } from './chat-session-state';
import { SessionOutboundMemory } from './session-outbound-memory';
import { AILureVerifier } from './ai-verifier';
import { ChromeBuiltinAIProvider } from './chrome-ai-provider';
import { checkOutboundChatLeakage } from './input-detector';
import { GlobalInputInterceptor } from './input-interceptor';
import { DebuggerOverlay } from '../ui/debugger-overlay';

export type MessageDirection = 'inbound' | 'outbound' | 'unknown';

export interface InboundLureEvent {
  sourcePlatform: string;
  text: string;
  keywords: string[];
  isOffPlatformLure: boolean;
  suspiciousUrls: string[];
  timestamp: number;
  confidence: number;
  intentType?: string;
  intentTitle?: string;
}

export interface OutboundLeakageEvent {
  text: string;
  hasCard: boolean;
  hasCvv: boolean;
  hasExpiry?: boolean;
  hasOtp?: boolean;
  cards: string[];
  timestamp: number;
}

export class ChatChannelMonitor {
  private static observer: MutationObserver | null = null;
  private static processedElements: WeakSet<Element> = new WeakSet();
  private static recentLuresCache: Set<string> = new Set();
  private static onLureDetectedCallback: ((event: InboundLureEvent) => void) | null = null;
  private static sourceHost: string = '';
  public static debugMode = false;

  /**
   * Визначення напрямку повідомлення: Inbound (чуже/вхідне) чи Outbound (моє/вихідне)
   */
  public static determineDirection(element: HTMLElement): MessageDirection {
    // 1. Поле вводу завжди є вихідним драфтом (Outbound Draft)
    if (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable ||
      element.getAttribute('role') === 'textbox'
    ) {
      return 'outbound';
    }

    // 2. Специфічні атрибути продакшн-платформи OLX (React/Next.js)
    const isOlxSent = element.closest(
      '[data-testid="sent-message"], [data-cy="sent-message"], [data-nx-name="SentChatMessage"]'
    );
    if (isOlxSent) return 'outbound';

    const isOlxReceived = element.closest(
      '[data-testid="received-message"], [data-cy="received-message"], [data-nx-name="ReceivedChatMessage"]'
    );
    if (isOlxReceived) return 'inbound';

    // 3. Семантичний атрибут aria-label
    const ariaLabel = (
      element.getAttribute('aria-label') ||
      element.closest('[aria-label]')?.getAttribute('aria-label') ||
      ''
    ).toLowerCase();

    if (ariaLabel.includes('ваше повідомлення') || ariaLabel.includes('your message')) {
      return 'outbound';
    }
    if (
      ariaLabel.includes('повідомлення, надіслане') ||
      ariaLabel.includes('повідомлення від') ||
      ariaLabel.includes('received message')
    ) {
      return 'inbound';
    }

    // 4. Селектори класів та дата-атрибутів популярних чатів та маркетплейсів
    if (element.closest('.has-text-centered, .text-center, .system-message, .status-message, .chat-info, .peer-info')) {
      return 'unknown';
    }

    if (element.closest('.has-text-right, .text-right, .chat-end, .is-right, .justify-end, .self-end, .align-right')) {
      return 'outbound';
    }
    if (element.closest('.has-text-left, .text-left, .chat-start, .is-left, .justify-start, .self-start, .align-left')) {
      return 'inbound';
    }

    const classStr = typeof element.className === 'string' ? element.className : (element.getAttribute('class') || '');
    const classTokens = classStr.toLowerCase().split(/\s+/);
    if (classTokens.includes('sent')) return 'outbound';
    if (classTokens.includes('received')) return 'inbound';

    const classAndAttr = (classStr + ' ' + (element.getAttribute('data-direction') || '') + ' ' + (element.getAttribute('data-author') || '')).toLowerCase();

    // Явні ознаки мого повідомлення (Outbound / Sent / Me)
    if (
      classAndAttr.includes('outgoing') ||
      classAndAttr.includes('message-out') ||
      classAndAttr.includes('msg-out') ||
      classAndAttr.includes('from-me') ||
      classAndAttr.includes('author-self') ||
      classAndAttr.includes('is-me') ||
      classAndAttr.includes('chat-msg-out') ||
      classAndAttr.includes('has-text-right')
    ) {
      return 'outbound';
    }

    // Явні ознаки повідомлення співрозмовника (Inbound / Received / Them)
    if (
      classAndAttr.includes('incoming') ||
      classAndAttr.includes('message-in') ||
      classAndAttr.includes('msg-in') ||
      classAndAttr.includes('from-them') ||
      classAndAttr.includes('author-other') ||
      classAndAttr.includes('chat-msg-in') ||
      classAndAttr.includes('interlocutor') ||
      classAndAttr.includes('has-text-left')
    ) {
      return 'inbound';
    }

    // 5. Евристика геометричного вирівнювання (CSS Flex / Margin Alignment)
    try {
      const style = window.getComputedStyle(element);
      if (
        style.alignSelf === 'flex-end' ||
        style.marginLeft === 'auto' ||
        style.textAlign === 'right' ||
        style.float === 'right'
      ) {
        return 'outbound';
      }
      if (
        style.alignSelf === 'flex-start' ||
        style.marginRight === 'auto' ||
        style.textAlign === 'left' ||
        style.float === 'left'
      ) {
        return 'inbound';
      }
    } catch {}

    // Базовий fallback: якщо це елемент списку повідомлень, за замовчуванням перевіряємо як вхідне
    if (element.closest('.chat-box, .messages-list, .chat-thread, [role="log"]')) {
      return 'inbound';
    }

    return 'unknown';
  }

  /**
   * Ініціалізація спостерігача за чатом (MutationObserver)
   */
  public static init(
    sourceHost: string,
    onLureDetected: (event: InboundLureEvent) => void
  ): void {
    this.sourceHost = sourceHost;
    this.onLureDetectedCallback = onLureDetected;

    if (this.observer) {
      this.observer.disconnect();
    }

    // Початкове сканування вже наявних повідомлень у DOM
    this.scanContainer(document.body);

    // Спостереження за появою нових повідомлень від співрозмовника в реальному часі
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanContainer(node as HTMLElement);
            }
          });
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Сканування контейнера з розмежуванням вхідних/вихідних елементів
   */
  public static scanContainer(container: HTMLElement): void {
    const selector = [
      '[data-testid="received-message"]',
      '[data-testid="sent-message"]',
      '[data-nx-name="ReceivedChatMessage"]',
      '[data-nx-name="SentChatMessage"]',
      '[data-cy="received-message"]',
      '[data-cy="sent-message"]',
      '.msg.received',
      '.msg.sent',
      '.msg-in',
      '.msg-out',
      '.chat-msg',
      '.message',
      '[role="row"]',
      '.bubble',
      '.has-text-left',
      '.has-text-right',
      '.text-left',
      '.text-right',
      '.chat-start',
      '.chat-end',
      '.messages > div',
      '.chat-thread > div',
      '[class*="chat-message"]',
      '[class*="message-item"]',
      '[class*="message-row"]',
      'li',
    ].join(', ');

    // Шукаємо потенційні повідомлення
    const rawCandidates = container.matches(selector)
      ? [container, ...Array.from(container.querySelectorAll<HTMLElement>(selector))]
      : Array.from(container.querySelectorAll<HTMLElement>(selector));

    // Фільтруємо лише найвищі в ієрархії елементи, щоб не обробляти двічі контейнер і його дочірній тег
    const candidates = rawCandidates.filter((el) => {
      let parent = el.parentElement;
      while (parent && parent !== container) {
        if (rawCandidates.includes(parent as HTMLElement)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });

    for (const el of candidates) {
      if (this.processedElements.has(el)) continue;

      const direction = this.determineDirection(el);

      // Важливе розмежування:
      // Якщо це повідомлення від співрозмовника (Inbound):
      if (direction === 'inbound') {
        this.processedElements.add(el);
        this.processInboundMessage(el);
      } else if (direction === 'outbound') {
        this.processedElements.add(el);
        this.processOutboundMessage(el);
      }
    }
  }

  /**
   * Обробка повідомлення від співрозмовника (Inbound)
   * Сканує ВИКЛЮЧНО на соцінженерні приманки (lures), але НЕ блокує за наявність картки!
   */
  private static processInboundMessage(element: HTMLElement): void {
    const textEl = element.querySelector<HTMLElement>('[data-testid="message"], [data-nx-name="TextContainer"], .bubble, .tag, p, span') || element;
    let text = textEl.innerText?.trim() || element.innerText?.trim() || '';
    
    // Додаємо прямі посилання з тегів <a>, якщо вони не відображаються відкритим текстом
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const a of links) {
      if (a.href && !text.includes(a.href)) {
        text += ' ' + a.href;
      }
    }

    if (text.length < 5) return;

    // Запобігаємо повторному аналізу однакового тексту
    if (this.recentLuresCache.has(text)) return;

    // Використовуємо stateful-класифікатор, який пам'ятає попередні повідомлення
    const scan = ChatSessionState.addMessageAndEvaluate(text, 'inbound');
      if (this.debugMode) {
        // Безпечне логування: маскуємо сирий текст, щоб PII не зберігався в пам'яті Shadow DOM
        const safePreview = text.length <= 20
          ? text.replace(/\d{4,}/g, '****')
          : text.substring(0, 20).replace(/\d{4,}/g, '****') + `... [${text.length} симв.]`;
        DebuggerOverlay.log('Текст повідомлення', safePreview, '#9CA3AF');
        
        if (scan.normalizedText !== text) {
          DebuggerOverlay.log('1. Нормалізація', `Нормалізовано (${scan.normalizedText.length} симв.)`, '#3B82F6');
        }
        
        if (scan.clustersDetected.length > 0) {
          DebuggerOverlay.log('2. Виявлені Кластери', scan.clustersDetected, '#EAB308');
        }
        
        if (scan.clustersDetected.includes('semantic_trigger')) {
          DebuggerOverlay.log('2s. Семантичний Вектор (Tier 1.5)', 'Активовано векторну матрицю намірів (Zero-Regex Match)', '#8B5CF6');
        }
        
        if (scan.matchedSpans && scan.matchedSpans.length > 0) {
          const triggerWords = scan.matchedSpans.map(s => s.text);
          DebuggerOverlay.log('2a. Тригерні Слова', triggerWords, '#F59E0B');
        }

        if (scan.suspiciousUrls && scan.suspiciousUrls.length > 0) {
          DebuggerOverlay.log('2b. Підозрілі Лінійки (URLs)', scan.suspiciousUrls, '#EF4444');
        }
        
        if (scan.hasFormedIntent) {
          DebuggerOverlay.log('3. Класифікація Загрози', {
            intent: scan.intentType,
            confidence: `${scan.confidence}%`,
            action: scan.confidence && scan.confidence >= 50 ? 'Hard Lock (Блокування)' : 'Soft Lock (Попередження)'
          }, '#EF4444');
        } else {
          DebuggerOverlay.log('3. Класифікація Загрози', 'Загрози не виявлено', '#22C55E');
        }
      }

    // Важлива логіка: жертва може процитувати шахрая "Платити на цей номер 4149...",
    // це є вихідний текст і ми зупинимо це як leakage даних!
    // Ми скануємо вхідні повідомлення на наявність намірів:
    if (scan.hasFormedIntent) {
      if (this.debugMode) DebuggerOverlay.log('3. Intent Formed!', scan.intentType, '#EF4444');
      
      this.recentLuresCache.add(text);
      if (this.recentLuresCache.size > 50) {
        this.recentLuresCache.clear();
      }

      const keywords = scan.matchedSpans.map(s => s.text);
      const suspiciousUrls = scan.suspiciousUrls || [];
      const isOffPlatformLure = scan.clustersDetected.includes('off_platform');

      console.warn('[SOVA:ChatChannel] Виявлено загрозу (Tier 1):', {
        text: text.slice(0, 80),
        keywords,
        urls: suspiciousUrls
      });

      if (this.onLureDetectedCallback) {
        this.onLureDetectedCallback({
          sourcePlatform: this.sourceHost,
          text,
          keywords,
          isOffPlatformLure,
          suspiciousUrls,
          timestamp: Date.now(),
          confidence: scan.confidence || 0,
          intentType: scan.intentType,
          intentTitle: scan.intentTitle,
        });
      }
    }
  }

  /**
   * Обробка вихідного повідомлення від користувача (Outbound) для збереження контексту діалогу
   */
  private static processOutboundMessage(element: HTMLElement): void {
    const textEl = element.querySelector<HTMLElement>('[data-testid="message"], [data-nx-name="TextContainer"], .bubble, .tag, p, span') || element;
    const text = textEl.innerText?.trim() || element.innerText?.trim() || '';
    if (text.length >= 2) {
      ChatSessionState.addMessageAndEvaluate(text, 'outbound');
      SessionOutboundMemory.recordSentMessage(text);
    }
  }

  /**
   * Отримання повної історії листування для ШІ (включаючи DOM-повідомлення та чернетку)
   */
  public static getDialogueHistory(currentDraft?: string): string {
    let draft = currentDraft;
    if (!draft && typeof document !== 'undefined') {
      const activeInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="submit"]):not([type="button"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="textbox"], [contenteditable="true"]'
      );
      if (activeInput) {
        draft = (activeInput as HTMLInputElement).value || activeInput.innerText || '';
      }
    }

    // 1. Спроба витягти повний живий діалог безпосередньо з DOM дерева сторінки
    if (typeof document !== 'undefined') {
      const domDialogue = this.extractDialogueFromDOM();
      if (domDialogue.length > 0) {
        if (draft && draft.trim().length > 0) {
          domDialogue.push(`[Ви (Чернетка)]: ${draft.trim()}`);
        }
        return domDialogue.join('\n');
      }
    }

    // 2. Якщо DOM порожній (наприклад, у тестах), використовуємо ChatSessionState
    return ChatSessionState.getDialogueHistory(draft);
  }

  /**
   * Сканування всіх видимих бульбашок повідомлень на сторінці для створення 100% точного контексту діалогу
   */
  public static extractDialogueFromDOM(): string[] {
    if (typeof document === 'undefined') return [];

    const selector = [
      '[data-testid="received-message"]',
      '[data-testid="sent-message"]',
      '[data-testid*="message"]',
      '[data-nx-name="ReceivedChatMessage"]',
      '[data-nx-name="SentChatMessage"]',
      '[data-cy="received-message"]',
      '[data-cy="sent-message"]',
      '.msg.received',
      '.msg.sent',
      '.msg-in',
      '.msg-out',
      '.chat-msg',
      '.bubble',
      '.has-text-left',
      '.has-text-right',
      '.text-left',
      '.text-right',
      '.chat-start',
      '.chat-end',
      '.messages > div',
      '.chat-thread > div',
      '.chat-history > div',
      '[class*="chat-message"]',
      '[class*="message-item"]',
      '[class*="message-row"]',
      '.message',
    ].join(', ');

    const rawElements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (rawElements.length === 0) return [];

    // Залишаємо лише найвищі в ієрархії елементи-контейнери повідомлень (щоб уникнути дублювання)
    let elements = rawElements.filter((el) => {
      let parent = el.parentElement;
      while (parent) {
        if (rawElements.includes(parent as HTMLElement)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });

    // ОПТИМІЗАЦІЯ КОНТЕКСТУ: Беремо лише останні 20 повідомлень
    // Це запобігає переповненню контексту LLM (і помилкам 429) при довгих переписках
    elements = elements.slice(-20);

    const lines: string[] = [];
    let totalLength = 0;
    const MAX_CHARS = 4000;

    for (const el of elements) {
      const direction = this.determineDirection(el);
      // Пропускаємо системні або нейтральні повідомлення без явного автора
      if (direction === 'unknown') {
        continue;
      }

      const speaker = direction === 'outbound' ? '[Ви]' : '[Співрозмовник]';

      const textEl =
        el.querySelector<HTMLElement>(
          '[data-testid="message"], [data-nx-name="TextContainer"], .bubble, .tag, p, span'
        ) || el;

      let text = (textEl.innerText || el.innerText || '').trim();

      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href]'));
      for (const a of links) {
        if (a.href && !text.includes(a.href)) {
          text += ' ' + a.href;
        }
      }

      if (text.length > 0) {
        lines.push(`${speaker}: ${text}`);
      }
    }

    // Захист від переповнення: залишаємо лише останні MAX_CHARS символів (найновіші повідомлення)
    let fullText = lines.join('\n');
    if (fullText.length > MAX_CHARS) {
      fullText = '...[Старі повідомлення обрізано]...\n' + fullText.substring(fullText.length - MAX_CHARS);
      return fullText.split('\n');
    }

    return lines;
  }

  /**
   * Обробка вихідного тексту, який користувач збирається надіслати (Outbound)
   */
  public static checkOutbound(text: string): OutboundLeakageEvent {
    const leakage = checkOutboundChatLeakage(text);
    return {
      text,
      hasCard: leakage.hasCard,
      hasCvv: leakage.hasCvv,
      hasExpiry: leakage.hasExpiry,
      hasOtp: leakage.hasOtp,
      cards: leakage.cards,
      timestamp: Date.now(),
    };
  }

  /**
   * Зупинка моніторингу
   */
  public static destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.processedElements = new WeakSet();
    this.recentLuresCache.clear();
  }

  public static reset(): void {
    this.processedElements = new WeakSet();
    this.recentLuresCache.clear();
    ChatSessionState.reset();
    SessionOutboundMemory.reset();
  }
}

