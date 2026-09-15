import { ThreatAssessment } from '../types';
import { UserWhitelistManager } from '../core/user-whitelist';

export interface FrictionModalOptions {
  assessment: ThreatAssessment;
  targetHost: string;
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

export class FrictionModal {
  private static hostElement: HTMLElement | null = null;
  private static countdownInterval: number | null = null;

  public static show(options: FrictionModalOptions): void {
    // Якщо модалка вже відкрита — видаляємо стару
    this.close();

    // Створюємо ізольований контейнер із Shadow DOM
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'adaptive-threat-shield-root';
    this.hostElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const shadow = this.hostElement.attachShadow({ mode: 'open' });

    // Стилі для Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleUp {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .modal-card {
        background: #ffffff;
        width: 90%;
        max-width: 520px;
        border-radius: 16px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
        border: 1px solid #fee2e2;
        overflow: hidden;
        animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .modal-header {
        background: linear-gradient(135deg, #b91c1c, #dc2626);
        color: white;
        padding: 20px 24px;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .header-icon {
        font-size: 32px;
        line-height: 1;
      }
      .header-text h2 {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .header-badge {
        display: inline-block;
        background: rgba(0, 0, 0, 0.25);
        padding: 3px 8px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        margin-top: 4px;
      }
      .modal-body {
        padding: 24px;
        color: #1e293b;
      }
      .host-alert {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #475569;
      }
      .host-alert strong {
        color: #0f172a;
        word-break: break-all;
      }
      .reasons-title {
        font-size: 13px;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      .reasons-list {
        list-style: none;
        margin-bottom: 20px;
      }
      .reasons-list li {
        font-size: 13px;
        line-height: 1.5;
        padding: 8px 10px;
        background: #fef2f2;
        border-left: 3px solid #ef4444;
        border-radius: 4px;
        margin-bottom: 6px;
        color: #991b1b;
      }
      .remember-container {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #475569;
        margin-bottom: 20px;
        cursor: pointer;
      }
      .remember-container input {
        cursor: pointer;
        accent-color: #2563eb;
      }
      .modal-footer {
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        padding: 16px 24px;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      .btn {
        padding: 10px 18px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
      }
      .btn-cancel {
        background: #2563eb;
        color: white;
      }
      .btn-cancel:hover {
        background: #1d4ed8;
      }
      .btn-override {
        background: #f1f5f9;
        color: #64748b;
        border: 1px solid #cbd5e1;
      }
      .btn-override:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-override.ready {
        background: #fff;
        color: #ea580c;
        border-color: #f97316;
        cursor: pointer;
      }
      .btn-override.ready:hover {
        background: #fff7ed;
      }
    `;

    // Розмітка модалки
    const reasonsHtml = options.assessment.triggers
      .map((t) => `<li>⚠️ ${t.message}</li>`)
      .join('');

    const modalWrapper = document.createElement('div');
    modalWrapper.className = 'backdrop';

    modalWrapper.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="header-icon">🛡️</div>
          <div class="header-text">
            <h2>Захисне переривання безпеки (Security Friction)</h2>
            <span class="header-badge">РІВЕНЬ РИЗИКУ: ${options.assessment.level} (${options.assessment.score}/100)</span>
          </div>
        </div>
        <div class="modal-body">
          <div class="host-alert">
            Цільовий хост відправки форми: <strong>${options.targetHost}</strong>
          </div>

          <div class="reasons-title">Чому дію було тимчасово призупинено:</div>
          <ul class="reasons-list">
            ${reasonsHtml}
          </ul>

          <label class="remember-container">
            <input type="checkbox" id="rememberDomainCheck">
            <span>Додати <strong>${options.targetHost}</strong> до персонального білого списку</span>
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-cancel" id="btnCancel">⛔ Скасувати дію (Безпечно)</button>
          <button type="button" class="btn btn-override" id="btnOverride" disabled>⏳ Зачекайте (3с)...</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(modalWrapper);
    document.body.appendChild(this.hostElement);

    // Логіка кнопок
    const btnCancel = shadow.getElementById('btnCancel');
    const btnOverride = shadow.getElementById('btnOverride') as HTMLButtonElement;
    const rememberCheck = shadow.getElementById('rememberDomainCheck') as HTMLInputElement;

    btnCancel?.addEventListener('click', () => {
      this.close();
      options.onCancel();
    });

    // Таймер усвідомлення (Cognitive Delay) на 3 секунди
    let secondsLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        btnOverride.innerText = `⏳ Зачекайте (${secondsLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.classList.add('ready');
        btnOverride.innerText = `⚠️ Я довіряю цьому сайту — Продовжити`;
      }
    }, 1000);

    btnOverride?.addEventListener('click', async () => {
      if (btnOverride.disabled) return;
      const remember = rememberCheck?.checked || false;
      if (remember) {
        await UserWhitelistManager.allowDomain(options.targetHost);
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
    if (this.hostElement) {
      this.hostElement.remove();
      this.hostElement = null;
    }
  }
}
