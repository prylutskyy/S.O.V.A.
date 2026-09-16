import { passesLuhnCheck } from '../heuristics/input-detector';
import { ShadowHost } from './shadow-host';
import { PersonalVaultManager } from '../core/personal-vault';

export interface SensitiveSpan {
  start: number;
  end: number;
  text: string;
  type: 'card' | 'cvv' | 'exp' | 'vault';
  tooltip: string;
}

export class TextHighlighter {
  private static overlayMap: Map<HTMLInputElement | HTMLTextAreaElement, HTMLElement> = new Map();
  private static tooltipEl: HTMLElement | null = null;
  private static isGlobalListenersAttached: boolean = false;

  /**
   * Пошук фрагментів із чутливими даними у тексті
   */
  public static findSensitiveSpans(text: string): SensitiveSpan[] {
    if (!text || text.length < 2) return [];

    const spans: SensitiveSpan[] = [];

    // 1. Пошук номерів банківських карток (алгоритм Луна)
    const cardRegex = /(?:\d[ -]*?){13,19}/g;
    let match: RegExpExecArray | null;
    while ((match = cardRegex.exec(text)) !== null) {
      const raw = match[0];
      const digitsOnly = raw.replace(/\D/g, '');
      if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && passesLuhnCheck(digitsOnly)) {
        spans.push({
          start: match.index,
          end: match.index + raw.length,
          text: raw,
          type: 'card',
          tooltip: '[Номер картки] Виявлено банківську картку. Не надсилайте повні реквізити у відкритому чаті.',
        });
      }
    }

    // 2. Пошук CVV / CVC кодів
    const cvvRegex = /\b(?:cvv|cvc|код безпеки)[\s:=]*([0-9]{3,4})\b/gi;
    while ((match = cvvRegex.exec(text)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'cvv',
        tooltip: '[Секретний CVV/CVC] Код безпеки ніколи не потрібен покупцю або іншій стороні!',
      });
    }

    // 3. Пошук терміну дії (у контексті наявності картки)
    if (spans.some((s) => s.type === 'card')) {
      const expRegex = /\b(0[1-9]|1[0-2])[\/.-]([2-3][0-9])\b/g;
      while ((match = expRegex.exec(text)) !== null) {
        // Уникаємо перекриття з уже знайденою карткою
        const start = match.index;
        const end = match.index + match[0].length;
        const isOverlapping = spans.some((s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
        if (!isOverlapping) {
          spans.push({
            start,
            end,
            text: match[0],
            type: 'exp',
            tooltip: '[Термін дії картки] Конфіденційні платіжні реквізити.',
          });
        }
      }
    }

    // 4. Пошук збережених персональних маркерів із Personal Vault
    const vaultItems = PersonalVaultManager.getItemsSync();
    if (vaultItems && vaultItems.length > 0) {
      const activeItems = vaultItems.filter((i) => i.enabled !== false && Boolean(i.realValue));
      for (const item of activeItems) {
        const real = item.realValue.trim();
        if (real.length < 2) continue;

        // Пошук входження значення маркера (без урахування регістру)
        const escaped = real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        let vMatch: RegExpExecArray | null;
        while ((vMatch = regex.exec(text)) !== null) {
          const start = vMatch.index;
          const end = vMatch.index + vMatch[0].length;
          const isOverlapping = spans.some((s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
          if (!isOverlapping) {
            spans.push({
              start,
              end,
              text: vMatch[0],
              type: 'vault',
              tooltip: `[Personal Vault] Виявлено маркер безпеки: «${item.label}». Не передавайте його стороннім!`,
            });
          }
        }

        // Для фінансового номера телефону перевіряємо формат без +380 (напр. 0501234567 або 501234567)
        if (item.category === 'FINANCIAL_PHONE') {
          const phoneDigits = real.replace(/\D/g, '');
          if (phoneDigits.length >= 7) {
            const shortPhone = phoneDigits.slice(-7);
            const phoneRegex = new RegExp(`(?:\\+?380|0)?\\d{2}[\\s-]?${shortPhone.slice(0, 3)}[\\s-]?${shortPhone.slice(3)}`, 'g');
            let pMatch: RegExpExecArray | null;
            while ((pMatch = phoneRegex.exec(text)) !== null) {
              const start = pMatch.index;
              const end = pMatch.index + pMatch[0].length;
              const isOverlapping = spans.some((s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
              if (!isOverlapping) {
                spans.push({
                  start,
                  end,
                  text: pMatch[0],
                  type: 'vault',
                  tooltip: `[Personal Vault] Виявлено фінансовий номер телефону (${item.label})!`,
                });
              }
            }
          }
        }
      }
    }

    // Сортуємо за позицією
    return spans.sort((a, b) => a.start - b.start);
  }

  /**
   * Оновлення підсвічування для конкретного поля вводу
   */
  public static update(element: HTMLInputElement | HTMLTextAreaElement): void {
    const text = element.value || '';
    const spans = this.findSensitiveSpans(text);

    let overlay = this.overlayMap.get(element);

    if (spans.length === 0) {
      if (overlay) {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      }
      return;
    }

    if (!overlay) {
      overlay = this.createOverlay(element);
      this.overlayMap.set(element, overlay);
    }

    this.syncStylesAndPosition(element, overlay);
    overlay.style.display = 'block';

    // Будуємо розмітку тексту з <mark> підсвічуванням як у Grammarly
    let html = '';
    let lastIndex = 0;

    for (const span of spans) {
      if (span.start > lastIndex) {
        html += this.escapeHtml(text.substring(lastIndex, span.start));
      }

      html += `<mark class="threat-ghost-mark" data-threat-tooltip="${this.escapeAttr(span.tooltip)}" style="
        background: rgba(239, 68, 68, 0.16) !important;
        border-bottom: 2px wavy #ef4444 !important;
        border-radius: 3px !important;
        color: transparent !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        box-decoration-break: clone !important;
        -webkit-box-decoration-break: clone !important;
      ">${this.escapeHtml(span.text)}</mark>`;

      lastIndex = span.end;
    }

    if (lastIndex < text.length) {
      html += this.escapeHtml(text.substring(lastIndex));
    }

    // Для правильного перенесення рядків у textarea
    if (text.endsWith('\n')) {
      html += '<br>&nbsp;';
    }

    overlay.innerHTML = html;

    // Вішаємо події hover для тултіпа на всі згенеровані <mark>
    const marks = overlay.querySelectorAll<HTMLElement>('.threat-ghost-mark');
    marks.forEach((m) => {
      m.addEventListener('mouseenter', (e) => {
        const target = e.target as HTMLElement;
        const msg = target.getAttribute('data-threat-tooltip') || '';
        const rect = target.getBoundingClientRect();
        this.showTooltip(rect, msg);
      });

      m.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });

      // Перенаправлення фокусу назад в інпут при кліку на маркер
      m.addEventListener('mousedown', (e) => {
        e.preventDefault();
        element.focus();
      });
    });

    if (!this.isGlobalListenersAttached) {
      this.attachGlobalListeners();
    }
  }

  /**
   * Створення та налаштування оверлею
   */
  private static createOverlay(element: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'threat-shield-ghost-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      color: transparent !important;
      background: transparent !important;
      border: 1px solid transparent !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      z-index: 2147483640 !important;
    `;

    ShadowHost.append(overlay);

    // Синхронізація скролу всередині textarea
    element.addEventListener('scroll', () => {
      overlay.scrollTop = element.scrollTop;
      overlay.scrollLeft = element.scrollLeft;
    });

    return overlay;
  }

  /**
   * Синхронізація геометрії та шрифтів оверлею з цільовим елементом
   */
  private static syncStylesAndPosition(source: HTMLInputElement | HTMLTextAreaElement, overlay: HTMLElement): void {
    const rect = source.getBoundingClientRect();
    const style = window.getComputedStyle(source);

    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    overlay.style.paddingTop = style.paddingTop;
    overlay.style.paddingRight = style.paddingRight;
    overlay.style.paddingBottom = style.paddingBottom;
    overlay.style.paddingLeft = style.paddingLeft;

    overlay.style.borderTopWidth = style.borderTopWidth;
    overlay.style.borderRightWidth = style.borderRightWidth;
    overlay.style.borderBottomWidth = style.borderBottomWidth;
    overlay.style.borderLeftWidth = style.borderLeftWidth;

    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.fontWeight = style.fontWeight;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.letterSpacing = style.letterSpacing;
    overlay.style.wordSpacing = style.wordSpacing;
    overlay.style.whiteSpace = source.tagName === 'INPUT' ? 'pre' : style.whiteSpace;
    overlay.style.wordBreak = style.wordBreak;
    overlay.style.overflowWrap = style.overflowWrap;
    overlay.style.textAlign = style.textAlign;
    overlay.style.borderRadius = style.borderRadius;

    overlay.scrollTop = source.scrollTop;
    overlay.scrollLeft = source.scrollLeft;
  }

  /**
   * Відображення плаваючого тултіпа над виділеним словом
   */
  private static showTooltip(markRect: DOMRect, message: string): void {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.id = 'threat-shield-ghost-tooltip';
      this.tooltipEl.style.cssText = `
        position: fixed !important;
        z-index: 2147483647 !important;
        background: #0f172a !important;
        color: #f8fafc !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 8px !important;
        box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 0, 0, 0.15) !important;
        padding: 8px 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 11.5px !important;
        line-height: 1.4 !important;
        max-width: 290px !important;
        pointer-events: none !important;
        box-sizing: border-box !important;
        animation: threatTooltipFade 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      `;

      this.tooltipEl.innerHTML = `
        <style>
          @keyframes threatTooltipFade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
        <span id="threat-tooltip-content"></span>
      `;

      ShadowHost.append(this.tooltipEl);
    }

    const content = this.tooltipEl.querySelector('#threat-tooltip-content');
    if (content) {
      content.textContent = message;
    }

    this.tooltipEl.style.display = 'block';

    const tipRect = this.tooltipEl.getBoundingClientRect();
    let top = markRect.top - tipRect.height - 8;
    let left = markRect.left;

    if (top < 10) {
      top = markRect.bottom + 8;
    }

    if (left + tipRect.width > window.innerWidth - 12) {
      left = Math.max(10, window.innerWidth - tipRect.width - 12);
    }

    this.tooltipEl.style.top = `${Math.round(top)}px`;
    this.tooltipEl.style.left = `${Math.round(left)}px`;
  }

  private static hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * Глобальна синхронізація при скролі сторінки або ресайзі
   */
  private static attachGlobalListeners(): void {
    this.isGlobalListenersAttached = true;

    const resyncAll = () => {
      this.overlayMap.forEach((overlay, source) => {
        if (document.body.contains(source) && overlay.style.display !== 'none') {
          this.syncStylesAndPosition(source, overlay);
        } else if (!document.body.contains(source)) {
          overlay.remove();
          this.overlayMap.delete(source);
        }
      });
    };

    window.addEventListener('scroll', resyncAll, true);
    window.addEventListener('resize', resyncAll);
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private static escapeAttr(str: string): string {
    return str.replace(/"/g, '&quot;');
  }
}
