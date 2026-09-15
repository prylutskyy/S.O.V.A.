import { ThreatAssessment } from '../types';
import { UserWhitelistManager } from '../core/user-whitelist';

export interface ButtonPopoverOptions {
  anchorElement: HTMLElement;
  assessment: ThreatAssessment;
  targetHost: string;
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

export class PopoverUI {
  private static activePopover: HTMLElement | null = null;
  private static activeToast: HTMLElement | null = null;
  private static countdownInterval: number | null = null;

  /**
   * 1. Спливаюче вікно над кнопкою (Hover / Floating Popover над елементом взаємодії)
   */
  public static showButtonPopover(options: ButtonPopoverOptions): void {
    this.hideButtonPopover();

    const anchorRect = options.anchorElement.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.id = 'threat-shield-button-popover';


    popover.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 380px !important;
      max-width: calc(100vw - 24px) !important;
      background: #ffffff !important;
      color: #0f172a !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.15), 0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(239, 68, 68, 0.15) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatPopoverFade 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const reasonsHtml = options.assessment.triggers
      .map((t) => `
        <div style="font-size: 12px; color: #334155; padding: 6px 8px; background: #f8fafc; border-left: 3px solid #ef4444; border-radius: 4px; margin-bottom: 4px; line-height: 1.4;">
          ${t.message}
        </div>
      `)
      .join('');

    popover.innerHTML = `
      <style>
        @keyframes threatPopoverFade {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
      
      <!-- Заголовок -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px; line-height: 1;">🛡️</span>
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.2;">Дію форми призупинено</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>
              <span style="font-size: 11px; font-weight: 600; color: #dc2626;">
                Рівень ризику: ${options.assessment.level} (${options.assessment.score}/100)
              </span>
            </div>
          </div>
        </div>
        <button id="threat-popover-close" type="button" title="Закрити та скасувати" style="
          background: transparent; border: none; font-size: 15px; color: #94a3b8; cursor: pointer; padding: 4px; line-height: 1; border-radius: 4px; transition: color 0.15s;
        ">✕</button>
      </div>

      <!-- Інформація про цільовий сервер -->
      <div style="font-size: 11px; color: #64748b; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; word-break: break-all; display: flex; justify-content: space-between; align-items: center;">
        <span>Цільовий сервер:</span>
        <strong style="color: #0f172a; font-family: ui-monospace, monospace; font-size: 12px;">${options.targetHost}</strong>
      </div>

      <!-- Список причин блокування -->
      <div style="margin-bottom: 12px; max-height: 140px; overflow-y: auto;">
        ${reasonsHtml}
      </div>

      <!-- Опція довіри сайту -->
      <label style="display: flex; align-items: center; gap: 7px; font-size: 12px; color: #475569; margin-bottom: 14px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="threat-popover-remember" style="accent-color: #2563eb; cursor: pointer; width: 14px; height: 14px;">
        <span>Додати домен <strong>${options.targetHost}</strong> до Whitelist</span>
      </label>

      <!-- Дії користувача -->
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="threat-popover-cancel" type="button" style="
          background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s;
        ">Скасувати</button>
        <button id="threat-popover-override" type="button" disabled style="
          background: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: not-allowed; transition: all 0.2s;
        ">⏳ Зачекайте (3с)...</button>
      </div>
    `;

    // Додаємо до body або documentElement
    (document.body || document.documentElement).appendChild(popover);
    this.activePopover = popover;

    // Розрахунок точного позиціонування через fixed viewport координати
    const popoverRect = popover.getBoundingClientRect();
    let top = anchorRect.top - popoverRect.height - 10;
    let left = anchorRect.left;

    // Якщо над кнопкою недостатньо місця (менше 10px від верху вікна) — розміщуємо під кнопкою
    if (top < 10) {
      top = anchorRect.bottom + 10;
    }

    // Якщо під кнопкою виходить за нижній край екрана
    if (top + popoverRect.height > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - popoverRect.height - 10);
    }

    // Запобігання виходу за правий край екрана
    if (left + popoverRect.width > window.innerWidth - 12) {
      left = Math.max(10, window.innerWidth - popoverRect.width - 12);
    }
    if (left < 10) {
      left = 10;
    }

    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;

    // Обробники кнопок
    const btnClose = popover.querySelector('#threat-popover-close');
    const btnCancel = popover.querySelector('#threat-popover-cancel');
    const btnOverride = popover.querySelector('#threat-popover-override') as HTMLButtonElement;
    const checkRemember = popover.querySelector('#threat-popover-remember') as HTMLInputElement;

    const handleCancel = () => {
      this.hideButtonPopover();
      options.onCancel();
    };

    btnClose?.addEventListener('click', handleCancel);
    btnCancel?.addEventListener('click', handleCancel);

    // Таймер усвідомленої затримки (3 секунди)
    let timeLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnOverride.innerText = `⏳ Зачекайте (${timeLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.innerText = `Продовжити все одно`;
        btnOverride.style.background = '#0f172a';
        btnOverride.style.color = '#ffffff';
        btnOverride.style.borderColor = '#0f172a';
        btnOverride.style.cursor = 'pointer';
      }
    }, 1000);

    btnOverride?.addEventListener('click', async () => {
      if (btnOverride.disabled) return;
      const remember = checkRemember?.checked || false;
      if (remember) {
        await UserWhitelistManager.allowDomain(options.targetHost);
      }
      this.hideButtonPopover();
      options.onProceed(remember);
    });
  }

  public static hideButtonPopover(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }
  }

  /**
   * 2. Плаваючий верхній тост (Minimalist Top Floating Capsule)
   * Закріплений у самому верху сторінки, не ламає і не зсуває розмітку сайту.
   */
  public static showTopToast(message: string, durationMs: number = 0): void {
    let toast = document.getElementById('threat-shield-top-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'threat-shield-top-toast';
      toast.style.cssText = `
        position: fixed !important;
        top: 18px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        max-width: 580px !important;
        width: 90% !important;
        background: #0f172a !important;
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-radius: 12px !important;
        box-shadow: 0 16px 36px -4px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.15) !important;
        padding: 12px 16px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        animation: threatToastSlideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      `;

      toast.innerHTML = `
        <style>
          @keyframes threatToastSlideDown {
            from { opacity: 0; transform: translate(-50%, -15px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
        </style>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px; line-height: 1;">🛡️</span>
          <div>
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #f87171; line-height: 1;">
              Захист від витоку даних
            </div>
            <div id="threat-toast-text" style="font-size: 12px; line-height: 1.4; color: #f1f5f9; margin-top: 3px;"></div>
          </div>
        </div>
        <button id="threat-toast-close" type="button" title="Зрозуміло" style="
          background: rgba(255,255,255,0.1);
          border: none;
          color: #e2e8f0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s;
        ">✕</button>
      `;

      document.body.appendChild(toast);
      toast.querySelector('#threat-toast-close')?.addEventListener('click', () => {
        this.hideTopToast();
      });
      this.activeToast = toast;
    }

    const textEl = toast.querySelector('#threat-toast-text');
    if (textEl) {
      textEl.textContent = message;
    }

    if (durationMs > 0) {
      setTimeout(() => {
        this.hideTopToast();
      }, durationMs);
    }
  }

  public static hideTopToast(): void {
    const toast = document.getElementById('threat-shield-top-toast');
    if (toast) {
      toast.remove();
      this.activeToast = null;
    }
  }
}
