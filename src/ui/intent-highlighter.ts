import { IntentClassifier, IntentClassificationResult, IntentMatchSpan } from '../heuristics/intent-classifier';
import { ShadowHost } from './shadow-host';

export class IntentHighlighter {
  private static activeCard: HTMLElement | null = null;
  private static activeSvg: SVGSVGElement | null = null;
  private static hideTimeout: number | null = null;
  private static currentHoveredMark: HTMLElement | null = null;

  /**
   * Обробка елемента вхідного повідомлення:
   * Якщо класифікатор виявляє сформований намір — виділяємо слова жовтим кольором
   */
  public static highlightInboundElement(element: HTMLElement): boolean {
    const textEl = element.querySelector<HTMLElement>('[data-testid="message"], [data-nx-name="TextContainer"], .bubble, .tag, p, span') || element;
    const text = textEl.innerText?.trim() || '';

    if (text.length < 10) return false;

    // Запобігаємо повторній розмітці одного й того ж елемента
    if (textEl.getAttribute('data-threat-intent-processed') === 'true') {
      return false;
    }

    const classification = IntentClassifier.classify(text);

    if (!classification.hasFormedIntent || classification.matchedSpans.length === 0) {
      return false;
    }

    textEl.setAttribute('data-threat-intent-processed', 'true');

    // Безпечне підсвічування слів без порушення верстки
    this.applyKeywordHighlights(textEl, classification);

    console.log('[ThreatShield:IntentClassifier] Сформовано намір співрозмовника:', {
      intent: classification.intentTitle,
      confidence: classification.confidence,
      words: classification.matchedSpans.map((s) => s.text),
    });

    return true;
  }

  /**
   * Рекурсивна заміна тексту в текстових вузлах на підсвічені <mark> елементи
   */
  private static applyKeywordHighlights(
    container: HTMLElement,
    classification: IntentClassificationResult
  ): void {
    const sortedSpans = [...classification.matchedSpans].sort((a, b) => b.text.length - a.text.length);

    // Збираємо регулярний вираз для всіх виявлених слів
    const escapedWords = sortedSpans
      .map((s) => s.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter((w, i, arr) => arr.indexOf(w) === i);

    if (escapedWords.length === 0) return;

    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
      regex.lastIndex = 0;
      if (node.nodeValue && regex.test(node.nodeValue)) {
        // Не чіпаємо вже розмічені <mark> та теги <script>
        if (node.parentElement?.tagName !== 'MARK' && node.parentElement?.tagName !== 'SCRIPT') {
          textNodes.push(node as Text);
        }
      }
    }

    textNodes.forEach((textNode) => {
      const parent = textNode.parentNode;
      if (!parent) return;

      const content = textNode.nodeValue || '';
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const matchIndex = match.index;
        const matchedText = match[0];

        // Текст до збігу
        if (matchIndex > lastIndex) {
          frag.appendChild(document.createTextNode(content.substring(lastIndex, matchIndex)));
        }

        // Елемент підсвічування (Apple Amber style)
        const mark = document.createElement('mark');
        mark.className = 'threat-intent-mark';
        mark.style.cssText = `
          background: rgba(245, 158, 11, 0.18) !important;
          border-bottom: 2px solid #f59e0b !important;
          border-radius: 3px !important;
          padding: 1px 4px !important;
          color: inherit !important;
          cursor: pointer !important;
          transition: background 0.15s ease !important;
          display: inline !important;
        `;
        mark.textContent = matchedText;

        // Події наведення курсору
        mark.addEventListener('mouseenter', () => {
          if (this.hideTimeout) {
            window.clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
          }
          this.currentHoveredMark = mark;
          mark.style.background = 'rgba(245, 158, 11, 0.32)';
          this.showIntentPopover(mark, classification);
        });

        mark.addEventListener('mouseleave', () => {
          mark.style.background = 'rgba(245, 158, 11, 0.18)';
          this.scheduleHide();
        });

        frag.appendChild(mark);
        lastIndex = matchIndex + matchedText.length;
      }

      if (lastIndex < content.length) {
        frag.appendChild(document.createTextNode(content.substring(lastIndex)));
      }

      parent.replaceChild(frag, textNode);
    });
  }

  /**
   * Відображення спливаючої картки з плавною лінією зв'язку
   */
  public static showIntentPopover(
    mark: HTMLElement,
    classification: IntentClassificationResult
  ): void {
    this.hide();

    const markRect = mark.getBoundingClientRect();

    // 1. Створюємо картку пояснення
    const card = document.createElement('div');
    card.id = 'threat-shield-intent-card';
    card.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 360px !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #E5E7EB !important;
      border-top: 3px solid #D97706 !important;
      border-radius: 12px !important;
      box-shadow: 0 8px 24px -4px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06) !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      padding: 16px 18px !important;
      box-sizing: border-box !important;
      color: #1A1A1A !important;
      pointer-events: auto !important;
      animation: tsIntentCardIn 0.15s ease !important;
    `;


    card.innerHTML = `
      <style>
        @keyframes tsIntentCardIn {
          from { opacity: 0; transform: scale(0.97) translateY(3px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      </style>

      <!-- BADGE + CONFIDENCE -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="display:inline-flex;align-items:center;gap:5px;background:#FFFBEB;color:#D97706;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;border:1px solid #FDE68A;letter-spacing:0.02em;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Підозрілий намір
        </span>
        <span style="font-size:11.5px;color:#9CA3AF;font-weight:500;">
          Впевненість: <strong style="color:#6B7280;">${classification.confidence || 85}%</strong>
        </span>
      </div>

      <!-- TITLE -->
      <div style="font-size:14px;font-weight:600;color:#1A1A1A;margin-bottom:7px;line-height:1.3;">
        ${classification.intentTitle || 'Виявлено маніпулятивний намір'}
      </div>

      <!-- EXPLANATION -->
      <div style="font-size:12.5px;line-height:1.5;color:#6B7280;margin-bottom:11px;">
        ${classification.explanation}
      </div>

      <!-- RECOMMENDATION -->
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:7px;padding:8px 11px;font-size:11.5px;line-height:1.45;color:#6B7280;margin-bottom:11px;">
        <strong style="color:#1A1A1A;display:block;margin-bottom:2px;">Що варто зробити:</strong>
        ${classification.whereToBeCareful}
      </div>

      <!-- MATCHED WORDS -->
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:10.5px;color:#9CA3AF;">Ключові слова:</span>
        ${classification.matchedSpans.map((s: any) => `
          <span style="background:#F9F9F8;border:1px solid #E5E7EB;border-radius:4px;font-size:10.5px;padding:1px 6px;color:#1A1A1A;font-family:ui-monospace,SFMono-Regular,monospace;">${s.text}</span>
        `).join('')}
      </div>
    `;

    // Запобігаємо зникненню картки при наведенні курсору на саму картку
    card.addEventListener('mouseenter', () => {
      if (this.hideTimeout) {
        window.clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    });

    card.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    // Монтуємо картку в Shadow DOM
    ShadowHost.append(card);
    this.activeCard = card;

    // 2. Розрахунок позиції картки
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let cardLeft: number;
    let cardTop: number;

    // Перевіряємо чи вміщується праворуч від слова
    if (markRect.right + cardRect.width + 30 < viewportWidth) {
      cardLeft = markRect.right + 30;
      cardTop = Math.max(16, Math.min(markRect.top - 20, viewportHeight - cardRect.height - 16));
    } else if (markRect.left - cardRect.width - 30 > 0) {
      // Якщо праворуч немає місця, ставимо ліворуч
      cardLeft = markRect.left - cardRect.width - 30;
      cardTop = Math.max(16, Math.min(markRect.top - 20, viewportHeight - cardRect.height - 16));
    } else {
      // Якщо ні ліворуч, ні праворуч немає місця (мобільний екран), ставимо під/над
      cardLeft = Math.max(16, (viewportWidth - cardRect.width) / 2);
      cardTop = markRect.bottom + 20 < viewportHeight - cardRect.height ? markRect.bottom + 20 : markRect.top - cardRect.height - 20;
    }

    card.style.left = `${cardLeft}px`;
    card.style.top = `${cardTop}px`;

    // 3. Малюємо плавну SVG лінію зв'язку
    this.renderConnectingCurve(mark, card);
  }

  /**
   * Малювання плавної кривої Безьє між підсвіченим словом та карткою
   */
  private static renderConnectingCurve(mark: HTMLElement, card: HTMLElement): void {
    const markRect = mark.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'threat-shield-intent-curve-svg';
    svg.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      overflow: visible !important;
    `;

    // Точка старту (центр правого або лівого краю слова)
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;

    if (cardRect.left >= markRect.right) {
      // Картка праворуч від слова
      startX = markRect.right + 2;
      startY = markRect.top + markRect.height / 2;
      endX = cardRect.left;
      endY = Math.min(Math.max(cardRect.top + 30, startY), cardRect.bottom - 30);
    } else if (cardRect.right <= markRect.left) {
      // Картка ліворуч від слова
      startX = markRect.left - 2;
      startY = markRect.top + markRect.height / 2;
      endX = cardRect.right;
      endY = Math.min(Math.max(cardRect.top + 30, startY), cardRect.bottom - 30);
    } else {
      // Картка зверху або знизу
      startX = markRect.left + markRect.width / 2;
      startY = cardRect.top > markRect.bottom ? markRect.bottom + 2 : markRect.top - 2;
      endX = cardRect.left + cardRect.width / 2;
      endY = cardRect.top > markRect.bottom ? cardRect.top : cardRect.bottom;
    }

    // Розрахунок контрольних точок для кубічної кривої Безьє
    const deltaX = Math.abs(endX - startX);
    const deltaY = Math.abs(endY - startY);
    const curveOffset = Math.max(30, deltaX * 0.45);

    let cp1X: number;
    let cp1Y: number;
    let cp2X: number;
    let cp2Y: number;

    if (cardRect.left >= markRect.right) {
      cp1X = startX + curveOffset;
      cp1Y = startY;
      cp2X = endX - curveOffset;
      cp2Y = endY;
    } else if (cardRect.right <= markRect.left) {
      cp1X = startX - curveOffset;
      cp1Y = startY;
      cp2X = endX + curveOffset;
      cp2Y = endY;
    } else {
      cp1X = startX;
      cp1Y = startY + (endY > startY ? deltaY * 0.5 : -deltaY * 0.5);
      cp2X = endX;
      cp2Y = endY + (endY > startY ? -deltaY * 0.5 : deltaY * 0.5);
    }

    const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="intentCurveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.6" />
        </linearGradient>
      </defs>

      <!-- Плавна крива Bezier -->
      <path d="${pathData}"
        fill="none"
        stroke="url(#intentCurveGrad)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-dasharray="4 3"
        style="animation: threatDashAnimation 1s linear infinite;"
      />

      <!-- Стартова точка на слові -->
      <circle cx="${startX}" cy="${startY}" r="3.5" fill="#f59e0b" />
      <circle cx="${startX}" cy="${startY}" r="6" fill="#f59e0b" opacity="0.25" />

      <!-- Кінцева точка на картці -->
      <circle cx="${endX}" cy="${endY}" r="3.5" fill="#f59e0b" />

      <style>
        @keyframes threatDashAnimation {
          to { stroke-dashoffset: -14; }
        }
      </style>
    `;

    ShadowHost.append(svg);
    this.activeSvg = svg;
  }

  /**
   * Запланувати приховування з невеликою затримкою
   */
  private static scheduleHide(): void {
    if (this.hideTimeout) window.clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 180);
  }

  /**
   * Миттєве закриття картки та лінії
   */
  public static hide(): void {
    if (this.activeCard) {
      this.activeCard.remove();
      this.activeCard = null;
    }
    if (this.activeSvg) {
      this.activeSvg.remove();
      this.activeSvg = null;
    }
    this.currentHoveredMark = null;
  }
}
