import { IntentClassifier } from './intent-classifier';
import { ChatSessionState } from './chat-session-state';
import { AILureVerifier } from './ai-verifier';
import { ChromeBuiltinAIProvider } from './chrome-ai-provider';
import { checkOutboundChatLeakage } from './input-detector';
import { ToastNotifier } from '../ui/toast-notifier';
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
    if (element.closest('.has-text-right, .text-right, .chat-end, .is-right, .justify-end, .self-end, .align-right')) {
      return 'outbound';
    }
    if (element.closest('.has-text-left, .text-left, .chat-start, .is-left, .justify-start, .self-start, .align-left')) {
      return 'inbound';
    }

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
      '.chat-msg',
      '.message',
      '[role="row"]',
      '.bubble',
      '.has-text-left',
      '.has-text-right',
      '.tag',
      '[class*="chat-"]',
      '[class*="msg-"]',
      '[class*="message-"]',
      'li',
    ].join(', ');

    // Шукаємо потенційні повідомлення
    const candidates = container.matches(selector)
      ? [container, ...Array.from(container.querySelectorAll<HTMLElement>(selector))]
      : Array.from(container.querySelectorAll<HTMLElement>(selector));

    for (const el of candidates) {
      if (this.processedElements.has(el)) continue;

      const direction = this.determineDirection(el);

      // Важливе розмежування:
      // Якщо це повідомлення від співрозмовника (Inbound):
      if (direction === 'inbound') {
        this.processedElements.add(el);
        this.processInboundMessage(el);
      } else if (direction === 'outbound') {
        // Позначаємо як оброблене, щоб не витрачати ресурс на повторний аналіз
        this.processedElements.add(el);
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
      DebuggerOverlay.log('Input Text', text, '#9CA3AF');
      if (scan.normalizedText !== text) DebuggerOverlay.log('1. Normalized (Tier 1)', scan.normalizedText, '#3B82F6');
      if (scan.clustersDetected.length > 0) DebuggerOverlay.log('2. Clusters Matched', scan.clustersDetected, '#EAB308');
      if (scan.suspiciousUrls && scan.suspiciousUrls.length > 0) DebuggerOverlay.log('2. UrlExtractor', scan.suspiciousUrls, '#EAB308');
    }

    // Важлива логіка: жертва може процитувати шахрая "Платити на цей номер 4149...",
    // це є вихідний текст і ми зупинимо це як leakage даних!
    // Ми скануємо вхідні повідомлення на наявність намірів:
    if (scan.hasFormedIntent) {
      if (this.debugMode) DebuggerOverlay.log('3. Intent Formed!', scan.intentType, '#EF4444');
      // TIER 1: Миттєве виявлення загрози (без виклику ШІ)
      ToastNotifier.show('Увага! Підозрілий контекст зафіксовано.', 'error', 3000);
      
      this.recentLuresCache.add(text);
      if (this.recentLuresCache.size > 50) {
        this.recentLuresCache.clear();
      }

      const keywords = scan.matchedSpans.map(s => s.text);
      const suspiciousUrls = scan.suspiciousUrls || [];
      const isOffPlatformLure = scan.clustersDetected.includes('off_platform');

      console.warn('[ThreatShield:ChatChannel] Виявлено загрозу (Tier 1):', {
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
          confidence: scan.confidence || 0
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



