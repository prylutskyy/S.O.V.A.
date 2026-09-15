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

    const reasonsHtml = options.assessment.triggers
      .map((t) => `<div style="font-size: 12px; color: #991b1b; padding: 4px 6px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; margin-bottom: 4px;">⚠️ ${t.message}</div>`)
      .join('');

    popover.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 390px !important;
      max-width: calc(100vw - 24px) !important;
      background: #ffffff !important;
      color: #0f172a !important;
      border: 2px solid #ef4444 !important;
      border-radius: 12px !important;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 6px 16px rgba(239,68,68,0.15) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatPopoverFade 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    popover.innerHTML = `
      <style>
        @keyframes threatPopoverFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🛡️</span>
          <div>
            <strong style="font-size: 14px; color: #b91c1c; display: block;">Дію форми призупинено!</strong>
            <span style="font-size: 11px; font-weight: 600; color: #fff; background: #dc2626; padding: 1px 6px; border-radius: 10px;">
              ${options.assessment.level} (${options.assessment.score}%)
            </span>
          </div>
        </div>
        <button id="threat-popover-close" type="button" style="
          background: none; border: none; font-size: 18px; color: #64748b; cursor: pointer; padding: 0 4px; line-height: 1;
        ">✕</button>
      </div>

      <div style="font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 8px; border-radius: 6px; margin-bottom: 10px; word-break: break-all;">
        Цільовий сервер: <strong>${options.targetHost}</strong>
      </div>

      <div style="margin-bottom: 10px; max-height: 150px; overflow-y: auto;">
        ${reasonsHtml}
      </div>

      <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #475569; margin-bottom: 12px; cursor: pointer;">
        <input type="checkbox" id="threat-popover-remember" style="accent-color: #2563eb; cursor: pointer;">
        <span>Довіряти домену <strong>${options.targetHost}</strong></span>
      </label>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="threat-popover-cancel" type="button" style="
          background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
        ">Скасувати</button>
        <button id="threat-popover-override" type="button" disabled style="
          background: #e2e8f0; color: #94a3b8; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: not-allowed; transition: all 0.2s;
        ">⏳ Зачекайте (3с)...</button>
      </div>
    `;

    // Додаємо до body або documentElement
    (document.body || document.documentElement).appendChild(popover);
    this.activePopover = popover;

    // Розрахунок точного позиціонування через fixed viewport координати
    const popoverRect = popover.getBoundingClientRect();
    let top = anchorRect.top - popoverRect.height - 12;
    let left = anchorRect.left;

    // Якщо над кнопкою недостатньо місця (менше 10px від верху вікна) — розміщуємо під кнопкою
    if (top < 10) {
      top = anchorRect.bottom + 12;
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
        btnOverride.innerText = `⚠️ Продовжити все одно`;
        btnOverride.style.background = '#ffffff';
        btnOverride.style.color = '#ea580c';
        btnOverride.style.borderColor = '#f97316';
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
   * 2. Плаваючий верхній тост (Top Toast Notification)
   * Закріплений у самому верху сторінки, не ламає і не зсуває розмітку сайту.
   */
  public static showTopToast(message: string, durationMs: number = 0): void {
    let toast = document.getElementById('threat-shield-top-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'threat-shield-top-toast';
      toast.style.cssText = `
        position: fixed !important;
        top: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        max-width: 650px !important;
        width: 90% !important;
        background: linear-gradient(135deg, #b91c1c, #7f1d1d) !important;
        color: #ffffff !important;
        border: 1px solid #f87171 !important;
        border-radius: 12px !important;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.2) !important;
        padding: 14px 18px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        animation: threatToastSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      `;

      toast.innerHTML = `
        <style>
          @keyframes threatToastSlideDown {
            from { opacity: 0; transform: translate(-50%, -20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
        </style>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px; line-height: 1;">🛑</span>
          <div>
            <strong style="font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; color: #fecaca; display: block;">
              Захист від витоку даних
            </strong>
            <span id="threat-toast-text" style="font-size: 13px; line-height: 1.4; color: #ffffff;"></span>
          </div>
        </div>
        <button id="threat-toast-close" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
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
