import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { ShadowHost } from './shadow-host';

export interface UnifiedModalOptions {
  type: 'form' | 'chat';
  title: string;
  badgeText: string;
  badgeLevel?: 'CRITICAL' | 'HIGH';
  contextLabel: string;
  contextValue: string;
  triggers: Array<{ message: string; severity?: string }>;
  explanation?: string;
  allowRememberDomain?: boolean;
  domainToRemember?: string;
  assessment?: ThreatAssessment;
  activeContext?: ActiveThreatContext | null;
  chatLeakage?: { hasCard: boolean; hasCvv: boolean };
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

export class UnifiedFrictionModal {
  private static activeModal: HTMLElement | null = null;
  private static countdownInterval: number | null = null;
  private static previousBodyOverflow: string | null = null;
  private static previousHtmlOverflow: string | null = null;

  public static async show(options: UnifiedModalOptions): Promise<void> {
    this.close();

    // 1. Блокування гортання сторінки (Scroll Lock)
    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // 2. Ізольований контейнер у Shadow DOM
    const modalRoot = document.createElement('div');
    modalRoot.id = 'threat-shield-unified-modal';

    const fallbackAssessment: ThreatAssessment = options.assessment || {
      score: options.badgeLevel === 'CRITICAL' ? 95 : 65,
      level: options.badgeLevel || 'CRITICAL',
      triggers: options.triggers.map((t) => ({
        name: 'generic_trigger',
        triggered: true,
        severity: (t.severity as any) || 'CRITICAL',
        scoreContribution: 35,
        message: t.message,
      })),
      timestamp: Date.now(),
    };

    // 3. Генерація лаконічного аналізу через XAI Engine
    const xai = await XaiEngine.generateExplanation({
      type: options.type,
      targetHost: options.contextValue,
      activeContext: options.activeContext,
      assessment: fallbackAssessment,
      chatLeakage: options.chatLeakage,
    });

    const primaryActionLabel = options.type === 'chat' ? 'Скасувати надсилання' : 'Залишити сторінку';
    const breakdown = xai.breakdown;

    const reasonsListHtml = options.triggers
      .map(
        (t) => `
        <div style="font-size: 12px; color: #424245; padding: 6px 0; border-bottom: 1px solid #f2f2f7; line-height: 1.45;">
          ${t.message.replace(/[⚠️🚨💳🔒💬⚡●✓✗]/g, '').trim()}
        </div>
      `
      )
      .join('');

    const rememberHtml =
      options.allowRememberDomain && options.domainToRemember
        ? `
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6e6e73; margin: 12px 0 6px 0; cursor: pointer; user-select: none;">
          <input type="checkbox" id="threat-modal-remember" style="accent-color: #0071e3; cursor: pointer; width: 14px; height: 14px;">
          <span>Додати домен <strong>${options.domainToRemember}</strong> до персонального білого списку</span>
        </label>
      `
        : '';

    // Стилі бекдропу (Apple System Ultra-Thin Blur)
    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(0, 0, 0, 0.38) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatBackdropFade 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    modalRoot.innerHTML = `
      <div id="threat-modal-card" style="
        background: #ffffff !important;
        width: 100% !important;
        max-width: 440px !important;
        border-radius: 18px !important;
        box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
        overflow: hidden !important;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        animation: threatModalScale 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
        color: #1d1d1f !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 28px 28px 22px 28px !important;
        box-sizing: border-box !important;
      ">
        <!-- ГОЛОВНА ІКОНКА (ВЕКТОРНИЙ ЩИТ У СТИЛІ SF SYMBOLS) -->
        <div style="
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(215, 0, 21, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d70015" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <!-- ЗАГОЛОВОК ДІАЛОГУ -->
        <div style="
          font-size: 18px;
          font-weight: 600;
          color: #1d1d1f;
          text-align: center;
          letter-spacing: -0.015em;
          line-height: 1.3;
          margin-bottom: 10px;
        ">
          ${xai.humanTitle}
        </div>

        <!-- ОСНОВНЕ ПОВІДОМЛЕННЯ ШІ (ГОЛОВНИЙ ТЕКСТ ВІКНА) -->
        <div style="
          font-size: 14px;
          line-height: 1.55;
          color: #424245;
          text-align: center;
          letter-spacing: -0.01em;
          margin-bottom: 20px;
        ">
          ${xai.humanCoreWarning}
        </div>

        <!-- КОНТЕКСТНИЙ РЯДОК (ХОСТ + РІВЕНЬ РИЗИКУ) -->
        <div style="
          background: #f5f5f7;
          border-radius: 10px;
          padding: 9px 14px;
          margin-bottom: 20px;
          font-size: 12px;
          color: #6e6e73;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
            Вузол: <strong style="color: #1d1d1f; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px;">${options.contextValue}</strong>
          </span>
          <span style="font-weight: 600; color: #d70015; white-space: nowrap;">
            Ризик: ${fallbackAssessment.score}/100
          </span>
        </div>

        <!-- ГОЛОВНА РЯТІВНА ДІЯ (APPLE FILL BUTTON) -->
        <button id="threat-modal-primary-btn" type="button" style="
          width: 100%;
          height: 42px;
          background: #0071e3;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
          margin-bottom: 12px;
        ">
          ${primaryActionLabel}
        </button>

        <!-- ДРУГОРЯДНИЙ РЯДОК ДІЙ -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12.5px;
          padding: 0 4px;
        ">
          <button id="threat-modal-inspect-toggle-btn" type="button" style="
            background: transparent;
            border: none;
            color: #0071e3;
            font-size: 12.5px;
            font-weight: 400;
            cursor: pointer;
            padding: 4px 0;
            transition: opacity 0.15s;
          ">
            Докладніше про оцінку
          </button>

          <button id="threat-modal-override-btn" type="button" disabled style="
            background: transparent;
            border: none;
            color: #86868b;
            font-size: 12.5px;
            font-weight: 400;
            cursor: not-allowed;
            padding: 4px 0;
            transition: color 0.15s;
          ">
            Продовжити (3с)...
          </button>
        </div>

        <!-- РОЗКРИВНИЙ ТЕХНІЧНИЙ ІНСПЕКТОР XAI (ДЛЯ АУДИТУ ТА ДИПЛОМА) -->
        <div id="threat-modal-inspector-panel" style="
          display: none;
          background: #fbfbfd;
          border: 1px solid #e5e5ea;
          border-radius: 12px;
          padding: 14px 16px;
          margin-top: 14px;
          font-size: 12px;
          color: #424245;
          animation: threatBackdropFade 0.2s ease-in-out;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #86868b;">
              Математична декомпозиція: f(R, C, A)
            </span>
            <span style="font-size: 11px; font-weight: 600; color: #6e6e73;">
              ${xai.engineType === 'chrome-builtin-ai' ? 'Gemini Nano' : 'Adaptive XAI'}
            </span>
          </div>

          <!-- R_tech progress -->
          <div style="margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 2px;">
              <span>R_tech (Евристики форми):</span>
              <span style="font-weight: 600;">${breakdown.technical.score}/${breakdown.technical.maxScore}</span>
            </div>
            <div style="height: 4px; background: #e5e5ea; border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; width: ${breakdown.technical.percentage}%; background: #0071e3; border-radius: 2px;"></div>
            </div>
          </div>

          <!-- C_env progress -->
          <div style="margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 2px;">
              <span>C_env (Міжсесійний перехід):</span>
              <span style="font-weight: 600;">${breakdown.contextual.score}/${breakdown.contextual.maxScore}</span>
            </div>
            <div style="height: 4px; background: #e5e5ea; border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; width: ${breakdown.contextual.percentage}%; background: #ff9500; border-radius: 2px;"></div>
            </div>
          </div>

          <!-- A_user progress -->
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 2px;">
              <span>A_user (Дія та намір):</span>
              <span style="font-weight: 600;">${breakdown.userAction.score}/${breakdown.userAction.maxScore}</span>
            </div>
            <div style="height: 4px; background: #e5e5ea; border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; width: ${breakdown.userAction.percentage}%; background: #d70015; border-radius: 2px;"></div>
            </div>
          </div>

          <!-- Спрацьовані тригери -->
          <div style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #86868b; margin: 10px 0 4px 0;">
            Фактори виявлення:
          </div>
          ${reasonsListHtml}

          ${options.activeContext ? `
            <div style="margin-top: 10px; padding: 10px 12px; background: rgba(255, 149, 0, 0.08); border-radius: 8px; border: 1px solid rgba(255, 149, 0, 0.2);">
              <div style="font-weight: 600; font-size: 11px; color: #b45309; margin-bottom: 3px;">
                Зшивання розірваних сесій (Tainted Context):
              </div>
              <div style="font-size: 11.5px; color: #78350f; line-height: 1.45;">
                Встановлено зв'язок із платформою <strong>${options.activeContext.sourcePlatform}</strong> (${Math.max(1, Math.round((Date.now() - options.activeContext.timestamp) / 60000))} хв тому).
                ${options.activeContext.detectedKeywords.length > 0 ? `<br>Ключові фрази приманки: <em>"${options.activeContext.detectedKeywords.join('", "')}"</em>` : ''}
              </div>
            </div>
          ` : ''}

          ${rememberHtml}
        </div>
      </div>
    `;

    // Монтування всередину ShadowRoot
    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    // Обробники
    const btnPrimary = modalRoot.querySelector('#threat-modal-primary-btn');
    const btnOverride = modalRoot.querySelector('#threat-modal-override-btn') as HTMLButtonElement;
    const btnInspectToggle = modalRoot.querySelector('#threat-modal-inspect-toggle-btn');
    const inspectorPanel = modalRoot.querySelector('#threat-modal-inspector-panel') as HTMLElement;
    const checkRemember = modalRoot.querySelector('#threat-modal-remember') as HTMLInputElement;

    // Hover ефект на головну кнопку
    btnPrimary?.addEventListener('mouseenter', () => {
      (btnPrimary as HTMLElement).style.background = '#0077ed';
    });
    btnPrimary?.addEventListener('mouseleave', () => {
      (btnPrimary as HTMLElement).style.background = '#0071e3';
    });

    let isInspectorOpen = false;
    btnInspectToggle?.addEventListener('click', () => {
      isInspectorOpen = !isInspectorOpen;
      if (inspectorPanel) {
        inspectorPanel.style.display = isInspectorOpen ? 'block' : 'none';
      }
      if (btnInspectToggle) {
        btnInspectToggle.textContent = isInspectorOpen ? 'Приховати деталі' : 'Докладніше про оцінку';
      }
    });

    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnPrimary?.addEventListener('click', handleCancel);

    // Клік по бекдропу закриває та рятує
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) {
        handleCancel();
      }
    });

    // Запобігання скролу
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

    // 3-секундний когнітивний таймер для розблокування небезпечної дії
    let timeLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnOverride.innerText = `Продовжити (${timeLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.innerText = 'Продовжити на свій ризик';
        btnOverride.style.color = '#d70015';
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
      ShadowHost.remove(this.activeModal);
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
