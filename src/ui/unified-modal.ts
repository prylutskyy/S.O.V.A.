import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { SvgAttackGraph } from './svg-attack-graph';
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

    // 1. Заборона гортання основної сторінки (Scroll Lock)
    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // 2. Створення кореневого елемента всередині ShadowRoot (ізоляція від CSS сайту)
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

    // 3. Генерація розширеного пояснення XAI (Explainable AI)
    const xai = await XaiEngine.generateExplanation({
      type: options.type,
      targetHost: options.contextValue,
      activeContext: options.activeContext,
      assessment: fallbackAssessment,
      chatLeakage: options.chatLeakage,
    });

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

    // Розкладка факторів формули XAI
    const breakdown = xai.breakdown;
    const formulaHtml = `
      <div style="
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 14px;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.04em;">
            Декомпозиція індексу ризику: f(R_tech, C_env, A_user)
          </span>
          <span style="font-size: 12px; font-weight: 800; color: #dc2626; font-family: ui-monospace, monospace;">
            ${breakdown.totalScore}/100
          </span>
        </div>

        <!-- R_tech -->
        <div style="margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #334155; margin-bottom: 2px;">
            <span>🔧 <strong>R_tech</strong> (Технічні евристики):</span>
            <span style="font-weight: 600;">${breakdown.technical.score}/${breakdown.technical.maxScore}</span>
          </div>
          <div style="height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${breakdown.technical.percentage}%; background: #3b82f6; border-radius: 3px;"></div>
          </div>
        </div>

        <!-- C_env -->
        <div style="margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #334155; margin-bottom: 2px;">
            <span>🌐 <strong>C_env</strong> (Міжсесійний контекст):</span>
            <span style="font-weight: 600;">${breakdown.contextual.score}/${breakdown.contextual.maxScore}</span>
          </div>
          <div style="height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${breakdown.contextual.percentage}%; background: #f59e0b; border-radius: 3px;"></div>
          </div>
        </div>

        <!-- A_user -->
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #334155; margin-bottom: 2px;">
            <span>👤 <strong>A_user</strong> (Намір та дія):</span>
            <span style="font-weight: 600;">${breakdown.userAction.score}/${breakdown.userAction.maxScore}</span>
          </div>
          <div style="height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${breakdown.userAction.percentage}%; background: #ef4444; border-radius: 3px;"></div>
          </div>
        </div>
      </div>
    `;

    // Контрзаходи (Countermeasures)
    const countermeasuresHtml = xai.countermeasures
      .map(
        (c) => `
        <div style="display: flex; align-items: flex-start; gap: 6px; font-size: 11.5px; color: #334155; margin-bottom: 4px; line-height: 1.4;">
          <span style="color: #22c55e; font-weight: 700;">✓</span>
          <span>${c}</span>
        </div>
      `
      )
      .join('');

    const engineBadgeText =
      xai.engineType === 'chrome-builtin-ai' ? '⚡ Gemini Nano (On-Device AI)' : '🧠 Adaptive Contextual XAI';

    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(15, 23, 42, 0.65) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatBackdropFade 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    modalRoot.innerHTML = `
      <div id="threat-modal-card" style="
        background: #ffffff !important;
        width: 100% !important;
        max-width: 520px !important;
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
          padding: 16px 20px !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          border-bottom: 1px solid #f1f5f9 !important;
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              width: 38px;
              height: 38px;
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
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 1px 7px; border-radius: 10px;">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>
                  ${options.badgeText}
                </span>
                <span style="font-size: 10.5px; font-weight: 600; color: #64748b;">
                  ${engineBadgeText}
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
        <div style="padding: 16px 20px; max-height: 70vh; overflow-y: auto;">
          <!-- Контекстний рядок -->
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px 12px;
            margin-bottom: 12px;
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

          <!-- Діагноз XAI -->
          <div style="
            font-size: 12.5px;
            font-weight: 600;
            color: #991b1b;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 9px 12px;
            margin-bottom: 12px;
            line-height: 1.4;
          ">
            🎯 <strong>Діагноз загрози:</strong> ${xai.diagnosis}
          </div>

          <!-- Візуальний граф ланцюга атаки (SVG Attack Graph) -->
          <div id="threat-modal-graph-slot"></div>

          <!-- Формула оцінки ризику XAI -->
          ${formulaHtml}

          <!-- Розгорнуте пояснення людською мовою -->
          <div style="
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 12px;
            font-size: 12px;
            color: #1e3a8a;
            line-height: 1.5;
          ">
            ${xai.plainLanguageExplanation}
          </div>

          <!-- Рекомендації та заходи безпеки -->
          <div style="
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 12px;
          ">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #166534; margin-bottom: 6px;">
              🛡️ Рекомендовані заходи безпеки:
            </div>
            ${countermeasuresHtml}
          </div>

          <!-- Освітня порада -->
          <div style="
            font-size: 11.5px;
            color: #64748b;
            background: #f8fafc;
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 8px;
            line-height: 1.4;
            border-left: 3px solid #3b82f6;
          ">
            ${xai.educationalTip}
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

    // Монтуємо модальне вікно в ізольований ShadowRoot
    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    // Вставляємо згенерований динамічний SVG граф у слот
    const graphSlot = modalRoot.querySelector('#threat-modal-graph-slot');
    if (graphSlot) {
      const graphElement = SvgAttackGraph.render(xai.chain);
      graphSlot.appendChild(graphElement);
    }

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

    // Клік по бекдропу за межами картки
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
