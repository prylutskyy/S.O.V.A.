import { UserWhitelistManager } from '../core/user-whitelist';

export interface UnifiedModalOptions {
  type: 'form' | 'chat';
  title: string;
  badgeText: string;
  badgeLevel?: 'CRITICAL' | 'HIGH';
  contextLabel: string;
  contextValue: string;
  triggers: Array<{ message: string; severity?: string }>;
  explanation: string;
  allowRememberDomain?: boolean;
  domainToRemember?: string;
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

export class UnifiedFrictionModal {
  private static activeModal: HTMLElement | null = null;
  private static countdownInterval: number | null = null;
  private static previousBodyOverflow: string | null = null;
  private static previousHtmlOverflow: string | null = null;

  public static show(options: UnifiedModalOptions): void {
    this.close();

    // Заборона гортання основної сторінки (Scroll Lock)
    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const modalRoot = document.createElement('div');
    modalRoot.id = 'threat-shield-unified-modal';

    const reasonsHtml = options.triggers
      .map(
        (t) => `
        <div style="
          font-size: 12px;
          color: #334155;
          padding: 8px 10px;
          background: #f8fafc;
          border-left: 3px solid #ef4444;
          border-radius: 4px;
          margin-bottom: 6px;
          line-height: 1.45;
        ">
          ⚠️ ${t.message}
        </div>
      `
      )
      .join('');

    const rememberHtml =
      options.allowRememberDomain && options.domainToRemember
        ? `
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; margin: 12px 0; cursor: pointer; user-select: none;">
          <input type="checkbox" id="threat-modal-remember" style="accent-color: #2563eb; cursor: pointer; width: 15px; height: 15px;">
          <span>Додати <strong>${options.domainToRemember}</strong> до персонального білого списку</span>
        </label>
      `
        : '';

    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(15, 23, 42, 0.6) !important;
      backdrop-filter: blur(8px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatBackdropFade 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    modalRoot.innerHTML = `
      <style>
        @keyframes threatBackdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes threatModalScale {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      </style>

      <div id="threat-modal-card" style="
        background: #ffffff !important;
        width: 100% !important;
        max-width: 480px !important;
        border-radius: 16px !important;
        box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.9) !important;
        overflow: hidden !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        animation: threatModalScale 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
        color: #0f172a !important;
        display: flex !important;
        flex-direction: column !important;
      ">
        <!-- ВЕРХНЯ ЧАСТИНА (HEADER) -->
        <div style="
          padding: 18px 20px !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          border-bottom: 1px solid #f1f5f9 !important;
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 10px;
              background: #fef2f2;
              border: 1px solid #fee2e2;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 20px;
              flex-shrink: 0;
            ">🛡️</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.2;">
                ${options.title}
              </div>
              <div style="display: inline-flex; align-items: center; gap: 5px; margin-top: 3px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>
                <span style="font-size: 11px; font-weight: 600; color: #dc2626;">
                  ${options.badgeText}
                </span>
              </div>
            </div>
          </div>

          <button id="threat-modal-close-btn" type="button" title="Закрити та скасувати" style="
            width: 30px;
            height: 30px;
            border-radius: 8px;
            border: none;
            background: #f8fafc;
            color: #64748b;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
          ">✕</button>
        </div>

        <!-- ОСНОВНА ЧАСТИНА (BODY) -->
        <div style="padding: 18px 20px; max-height: 65vh; overflow-y: auto;">
          <!-- Контекстний рядок -->
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px 12px;
            margin-bottom: 14px;
            font-size: 12px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <span>${options.contextLabel}:</span>
            <strong style="color: #0f172a; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all;">
              ${options.contextValue}
            </strong>
          </div>

          <!-- Список тригерів -->
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 8px;">
            Виявлені фактори ризику:
          </div>
          <div style="margin-bottom: 14px;">
            ${reasonsHtml}
          </div>

          <!-- Пояснення XAI / Порада безпеки -->
          <div style="
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 12px;
            color: #1e40af;
            line-height: 1.45;
          ">
            ${options.explanation}
          </div>

          ${rememberHtml}
        </div>

        <!-- НИЖНЯ ЧАСТИНА (FOOTER) -->
        <div style="
          padding: 14px 20px;
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        ">
          <button id="threat-modal-cancel-btn" type="button" style="
            background: #ffffff;
            color: #475569;
            border: 1px solid #cbd5e1;
            padding: 9px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
          ">Скасувати дію (Безпечно)</button>

          <button id="threat-modal-override-btn" type="button" disabled style="
            background: #e2e8f0;
            color: #94a3b8;
            border: 1px solid #cbd5e1;
            padding: 9px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: not-allowed;
            transition: all 0.2s;
          ">⏳ Зачекайте (3с)...</button>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(modalRoot);
    this.activeModal = modalRoot;

    // Обробники
    const btnClose = modalRoot.querySelector('#threat-modal-close-btn');
    const btnCancel = modalRoot.querySelector('#threat-modal-cancel-btn');
    const btnOverride = modalRoot.querySelector('#threat-modal-override-btn') as HTMLButtonElement;
    const checkRemember = modalRoot.querySelector('#threat-modal-remember') as HTMLInputElement;

    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnClose?.addEventListener('click', handleCancel);
    btnCancel?.addEventListener('click', handleCancel);

    // Клік по бекдропу поза карткою закриває (як скасування)
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) {
        handleCancel();
      }
    });

    // Запобігання прокручуванню сторінки колесиком або тачем на бекдропі
    modalRoot.addEventListener(
      'wheel',
      (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('#threat-modal-card')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    modalRoot.addEventListener(
      'touchmove',
      (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('#threat-modal-card')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // 3-секундний когнітивний таймер усвідомлення (Security Friction)
    let timeLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnOverride.innerText = `⏳ Зачекайте (${timeLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.innerText = options.type === 'chat' ? 'Я усвідомлюю ризик — Надіслати' : 'Продовжити все одно';
        btnOverride.style.background = '#0f172a';
        btnOverride.style.color = '#ffffff';
        btnOverride.style.borderColor = '#0f172a';
        btnOverride.style.cursor = 'pointer';
      }
    }, 1000);

    btnOverride?.addEventListener('click', async () => {
      if (btnOverride.disabled) return;
      const remember = checkRemember?.checked || false;
      if (remember && options.domainToRemember) {
        await UserWhitelistManager.allowDomain(options.domainToRemember);
      }
      this.close();
      options.onProceed(remember);
    });
  }

  public static close(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }

    // Відновлення гортання сторінки
    if (this.previousBodyOverflow !== null) {
      document.body.style.overflow = this.previousBodyOverflow;
      this.previousBodyOverflow = null;
    }
    if (this.previousHtmlOverflow !== null) {
      document.documentElement.style.overflow = this.previousHtmlOverflow;
      this.previousHtmlOverflow = null;
    }
  }
}
