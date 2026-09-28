import { ShadowHost } from './shadow-host';

/**
 * Sanctuary Dynamic Capsule Notifier
 * Apple-grade невагомі сповіщення у Shadow DOM.
 * Втілює принципи оптичного спокою:
 * 1. Hover Freeze — зупинка таймера при наведенні курсору для спокійного осмислення.
 * 2. The Light Filament — витончена оптична нитка часу завтовшки 2px у нижній грані капсули.
 * 3. Калібрована тривалість — час показу адаптований до фізіології читання та ваги події.
 */
export class ToastNotifier {
  private static container: HTMLElement | null = null;
  private static recentToasts: Map<string, number> = new Map();
  private static activeToastElements: Map<string, HTMLElement> = new Map();

  /**
   * Очищення історії сповіщень (для тестів або скидання стану)
   */
  public static clearHistory(): void {
    this.recentToasts.clear();
    this.activeToastElements.clear();
  }

  /**
   * Витягнення семантичних ключів для оптичної дедуплікації сповіщень
   */
  private static extractDeduplicationKeys(message: string): string[] {
    const keys: string[] = [];
    const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ');
    keys.push(`exact:${normalized}`);

    // Маркери у лапках: «РНОКПП (ІПН / Податковий код)» або «Дівоче прізвище матері»
    const quoteMatch = message.match(/[«"']([^»"']+)["'»]/);
    if (quoteMatch && quoteMatch[1]?.trim()) {
      keys.push(`marker:${quoteMatch[1].trim().toLowerCase()}`);
    }

    // Маркери зі Сховища: Сховища: РНОКПП (ІПН / Податковий код)!
    const vaultMatch = message.match(/Сховища:\s*([^!.\n]+)/i);
    if (vaultMatch && vaultMatch[1]?.trim()) {
      keys.push(`marker:${vaultMatch[1].trim().toLowerCase()}`);
    }

    // Застереження щодо CVV / номеру картки
    if (/cvv|cvc/i.test(message) && /картк/i.test(message)) {
      keys.push('topic:card_cvv');
    }

    return keys;
  }

  private static init(): HTMLElement {
    const root = ShadowHost.getRoot();

    // Забезпечуємо наявність анімації світлової нитки часу
    let style = root.getElementById('threat-shield-toast-styles') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'threat-shield-toast-styles';
      style.textContent = `
        @keyframes tsFilamentShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `;
      root.appendChild(style);
    }

    if (this.container && root.contains(this.container)) {
      return this.container;
    }

    let existing = root.getElementById('threat-shield-toast-container') as HTMLElement | null;
    if (existing) {
      this.container = existing;
      return this.container;
    }

    this.container = document.createElement('div');
    this.container.id = 'threat-shield-toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    root.appendChild(this.container);
    return this.container;
  }

  /**
   * Граматично бездоганне відмінювання числівників в українській мові
   */
  public static formatPluralUkrainian(
    count: number,
    one: string,
    few: string,
    many: string
  ): string {
    const abs = Math.abs(count) % 100;
    const rem = abs % 10;
    if (abs > 10 && abs < 20) return `${count} ${many}`;
    if (rem > 1 && rem < 5) return `${count} ${few}`;
    if (rem === 1) return `${count} ${one}`;
    return `${count} ${many}`;
  }

  /**
   * Показ сповіщення у вигляді Sanctuary Dynamic Capsule
   * @param message Текст повідомлення
   * @param type Тип події ('info' | 'warning' | 'error')
   * @param durationMs Тривалість відображення (якщо не вказано, калібрується автоматично)
   */
  public static show(
    message: string,
    type: 'warning' | 'error' | 'info' = 'info',
    durationMs?: number
  ): HTMLElement {
    const container = this.init();

    const now = Date.now();
    // Очищення застарілих записів дедуплікації (>15 сек)
    for (const [key, timestamp] of this.recentToasts.entries()) {
      if (now - timestamp > 15000) {
        this.recentToasts.delete(key);
        this.activeToastElements.delete(key);
      }
    }

    const dedupKeys = this.extractDeduplicationKeys(message);
    const DEDUP_WINDOW_MS = 3500;
    for (const key of dedupKeys) {
      const lastShown = this.recentToasts.get(key);
      if (lastShown && now - lastShown < DEDUP_WINDOW_MS) {
        const existing = this.activeToastElements.get(key);
        if (existing) {
          return existing;
        }
        return container;
      }
    }

    for (const key of dedupKeys) {
      this.recentToasts.set(key, now);
    }

    // Калібрування тривалості за швидкістю читання (~3.5 слова/сек) та важливістю події
    const wordCount = message.trim().split(/\s+/).length;
    const calculatedReadingTime = Math.round((wordCount / 3.5) * 1000) + 1800;
    const defaultBaseline = type === 'error' ? 8500 : (type === 'warning' ? 7000 : 5500);
    const totalDuration = durationMs !== undefined ? durationMs : Math.max(defaultBaseline, calculatedReadingTime);

    const toast = document.createElement('div');
    toast.className = 'sanctuary-toast-capsule';

    let badgeBg = 'rgba(16, 185, 129, 0.12)';
    let badgeBorder = 'rgba(16, 185, 129, 0.25)';
    let badgeColor = '#059669';
    let filamentColor = 'rgba(16, 185, 129, 0.85)';

    // Swiss Precision Loupe з оптичним підтвердженням
    let iconSvg = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <polyline points="8.5 11 10.5 13 14 9.5"/>
      </svg>
    `;

    if (type === 'warning') {
      badgeBg = 'rgba(245, 158, 11, 0.12)';
      badgeBorder = 'rgba(245, 158, 11, 0.25)';
      badgeColor = '#D97706';
      filamentColor = 'rgba(245, 158, 11, 0.9)';
      // Swiss Loupe з бурштиновим оптичним фокусом
      iconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <circle cx="11" cy="11" r="2.5" fill="currentColor"/>
        </svg>
      `;
    } else if (type === 'error') {
      badgeBg = 'rgba(239, 68, 68, 0.1)';
      badgeBorder = 'rgba(239, 68, 68, 0.25)';
      badgeColor = '#DC2626';
      filamentColor = 'rgba(239, 68, 68, 0.9)';
      // Swiss Loupe з маркерною апертурою уваги
      iconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="11" y1="8" x2="11" y2="11.5"/>
          <circle cx="11" cy="14" r="0.75" fill="currentColor"/>
        </svg>
      `;
    }

    toast.style.cssText = `
      position: relative;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      color: #0F172A;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 14px;
      box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
      padding: 10px 14px 12px 14px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.42;
      letter-spacing: -0.01em;
      display: flex;
      flex-direction: column;
      max-width: 420px;
      pointer-events: auto;
      overflow: hidden;
      opacity: 0;
      transform: translateY(-12px) scale(0.96);
      filter: blur(4px);
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), filter 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
      box-sizing: border-box;
      cursor: default;
    `;

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 11px; width: 100%;">
        <div style="
          width: 28px; height: 28px; border-radius: 9px;
          background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor};
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        ">
          ${iconSvg}
        </div>
        <div style="flex: 1; min-width: 0; word-break: break-word;">${message}</div>
        <button class="ts-toast-close" title="Закрити" style="
          background: transparent;
          border: none;
          color: #94A3B8;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
          flex-shrink: 0;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Світлова нитка часу (The Light Filament) -->
      <div class="ts-toast-filament-track" style="
        position: absolute;
        bottom: 0;
        left: 14px;
        right: 14px;
        height: 2px;
        background: rgba(0, 0, 0, 0.04);
        border-radius: 1px;
        overflow: hidden;
      ">
        <div class="ts-toast-filament-bar" style="
          height: 100%;
          width: 100%;
          background: ${filamentColor};
          border-radius: 1px;
          animation: tsFilamentShrink ${totalDuration}ms linear forwards;
        "></div>
      </div>
    `;

    const closeBtn = toast.querySelector('.ts-toast-close') as HTMLElement | null;
    const filamentBar = toast.querySelector('.ts-toast-filament-bar') as HTMLElement | null;

    let autoCloseTimer: number | null = null;
    let remainingMs = totalDuration;
    let startTime = Date.now();
    let isPaused = false;

    const dismiss = () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      for (const key of dedupKeys) {
        if (ToastNotifier.activeToastElements.get(key) === toast) {
          ToastNotifier.activeToastElements.delete(key);
        }
      }
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.96)';
      toast.style.filter = 'blur(3px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 280);
    };

    const scheduleTimer = (ms: number) => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      startTime = Date.now();
      autoCloseTimer = window.setTimeout(dismiss, ms);
    };

    // ── ХОВЕР-ЗАВИСАННЯ (HOVER FREEZE) ──
    const pauseTimer = () => {
      if (isPaused) return;
      isPaused = true;
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(500, remainingMs - elapsed);
      if (filamentBar) {
        filamentBar.style.animationPlayState = 'paused';
      }
      toast.style.boxShadow = '0 16px 36px -4px rgba(0, 0, 0, 0.16), 0 4px 12px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)';
    };

    const resumeTimer = () => {
      if (!isPaused) return;
      isPaused = false;
      if (filamentBar) {
        filamentBar.style.animationPlayState = 'running';
      }
      toast.style.boxShadow = '0 12px 32px -4px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8)';
      scheduleTimer(remainingMs);
    };

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);

    if (closeBtn) {
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = '#0F172A';
        closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = '#94A3B8';
        closeBtn.style.backgroundColor = 'transparent';
      });
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
    }

    container.appendChild(toast);
    for (const key of dedupKeys) {
      ToastNotifier.activeToastElements.set(key, toast);
    }

    // Apple spring animation in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.filter = 'blur(0px)';
    });

    // Початковий запуск таймера
    scheduleTimer(totalDuration);

    return toast;
  }
}
