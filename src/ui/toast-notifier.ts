import { ShadowHost } from './shadow-host';

/**
 * Sanctuary Dynamic Capsule Notifier
 * Apple-grade невагомі сповіщення у Shadow DOM.
 * Спроектовано за принципами оптичної ясності, спокою та бездоганного українського відмінювання.
 */
export class ToastNotifier {
  private static container: HTMLElement | null = null;

  private static init(): HTMLElement {
    const root = ShadowHost.getRoot();

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
   */
  public static show(
    message: string,
    type: 'warning' | 'error' | 'info' = 'info',
    durationMs = 5000
  ): HTMLElement {
    const container = this.init();

    const toast = document.createElement('div');
    toast.className = 'sanctuary-toast-capsule';

    let badgeBg = 'rgba(16, 185, 129, 0.12)';
    let badgeBorder = 'rgba(16, 185, 129, 0.25)';
    let badgeColor = '#059669';
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
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      color: #0F172A;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 14px;
      box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.42;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 11px;
      max-width: 420px;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-12px) scale(0.96);
      filter: blur(4px);
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), filter 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
    `;

    toast.innerHTML = `
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
    `;

    const closeBtn = toast.querySelector('.ts-toast-close') as HTMLElement | null;
    let autoCloseTimer: number | null = null;

    const dismiss = () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.96)';
      toast.style.filter = 'blur(3px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 280);
    };

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

    // Apple spring animation in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.filter = 'blur(0px)';
    });

    // Auto remove after timeout
    autoCloseTimer = window.setTimeout(dismiss, durationMs);

    return toast;
  }
}
