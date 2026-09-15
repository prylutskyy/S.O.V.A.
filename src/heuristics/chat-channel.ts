import { scanTextForLures } from './lure-detector';
import { checkOutboundChatLeakage } from './input-detector';

export type MessageDirection = 'inbound' | 'outbound' | 'unknown';

export interface InboundLureEvent {
  sourcePlatform: string;
  text: string;
  keywords: string[];
  isOffPlatformLure: boolean;
  suspiciousUrls: string[];
  timestamp: number;
}

export interface OutboundLeakageEvent {
  text: string;
  hasCard: boolean;
  hasCvv: boolean;
  cards: string[];
  timestamp: number;
}

export class ChatChannelMonitor {
  private static observer: MutationObserver | null = null;
  private static processedElements: WeakSet<Element> = new WeakSet();
  private static recentLuresCache: Set<string> = new Set();
  private static onLureDetectedCallback: ((event: InboundLureEvent) => void) | null = null;
  private static sourceHost: string = '';

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

    // 2. Селектори класів та дата-атрибутів популярних чатів та маркетплейсів
    const classStr = typeof element.className === 'string' ? element.className : (element.getAttribute('class') || '');
    const classAndAttr = (classStr + ' ' + (element.getAttribute('data-direction') || '') + ' ' + (element.getAttribute('data-author') || '')).toLowerCase();

    // Явні ознаки мого повідомлення (Outbound / Sent / Me)
    if (
      classAndAttr.includes('outgoing') ||
      classAndAttr.includes('message-out') ||
      classAndAttr.includes('msg-out') ||
      classAndAttr.includes('from-me') ||
      classAndAttr.includes('author-self') ||
      classAndAttr.includes('is-me') ||
      classAndAttr.includes('chat-msg-out')
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
      classAndAttr.includes('interlocutor')
    ) {
      return 'inbound';
    }

    // 3. Евристика геометричного вирівнювання (CSS Flex / Margin Alignment)
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
    // Шукаємо потенційні повідомлення
    const candidates = container.matches('.chat-msg, .message, [role="row"], .bubble, li, div')
      ? [container, ...Array.from(container.querySelectorAll<HTMLElement>('.chat-msg, .message, [role="row"], .bubble, li, div'))]
      : Array.from(container.querySelectorAll<HTMLElement>('.chat-msg, .message, [role="row"], .bubble, li, div'));

    for (const el of candidates) {
      if (this.processedElements.has(el)) continue;

      const direction = this.determineDirection(el);

      // Важливе розмежування:
      // Якщо це повідомлення від співрозмовника (Inbound):
      if (direction === 'inbound') {
        this.processedElements.add(el);
        this.processInboundMessage(el);
      }
      // Якщо це вихідний драфт користувача:
      // Ми НЕ чіпаємо його тут, адже він моніториться слухачами 'input' / 'keydown' у реальному часі!
    }
  }

  /**
   * Обробка повідомлення від співрозмовника (Inbound)
   * Сканує ВИКЛЮЧНО на соцінженерні приманки (lures), але НЕ блокує за наявність картки!
   */
  private static processInboundMessage(element: HTMLElement): void {
    const text = element.innerText?.trim() || '';
    if (text.length < 5) return;

    // Запобігаємо повторному аналізу однакового тексту
    if (this.recentLuresCache.has(text)) return;

    const scan = scanTextForLures(text);

    // Зверніть увагу: навіть якщо співрозмовник написав "скиньте на мою картку 4149...",
    // ми НЕ блокуємо екран і не вважаємо це витоком даних!
    // Ми реагуємо ТІЛЬКИ якщо є ознаки приманки або підозрілого зовнішнього посилання:
    if (scan.detected) {
      this.recentLuresCache.add(text);
      if (this.recentLuresCache.size > 50) {
        this.recentLuresCache.clear();
      }

      console.warn('[ThreatShield:ChatChannel] Зафіксовано вхідну приманку від співрозмовника:', {
        text: text.slice(0, 80),
        keywords: scan.keywords,
        urls: scan.suspiciousUrls,
      });

      if (this.onLureDetectedCallback) {
        this.onLureDetectedCallback({
          sourcePlatform: this.sourceHost || 'marketplace-chat',
          text,
          keywords: scan.keywords,
          isOffPlatformLure: scan.isOffPlatformLure,
          suspiciousUrls: scan.suspiciousUrls,
          timestamp: Date.now(),
        });
      }
    }
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
}
