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

    // 3. Генерація зрозумілого людині пояснення XAI
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
          padding: 6px 10px;
          background: #f8fafc;
          border-left: 3px solid #ef4444;
          border-radius: 4px;
          margin-bottom: 5px;
          line-height: 1.4;
        ">
          ⚠️ ${t.message}
        </div>
      `
      )
      .join('');

    const rememberHtml =
      options.allowRememberDomain && options.domainToRemember
        ? `
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; margin: 12px 0 6px 0; cursor: pointer; user-select: none;">
          <input type="checkbox" id="threat-modal-remember" style="accent-color: #2563eb; cursor: pointer; width: 15px; height: 15px;">
          <span>Я знаю цей сайт і хочу додати його до персонального білого списку</span>
        </label>
      `
        : '';

    // Розкладка формули XAI для технічного блоку
    const breakdown = xai.breakdown;
    const formulaHtml = `
      <div style="
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 12px;
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

    const engineBadgeText =
      xai.engineType === 'chrome-builtin-ai' ? '⚡ Gemini Nano (On-Device AI)' : '🧠 Adaptive Contextual XAI';

    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(15, 23, 42, 0.7) !important;
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

    // Формуємо списки «Як правильно» та «Ознака шахрайства»
    const goodListHtml = xai.humanChecklist.good
      .map((g) => `<li style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 6px;"><span style="color: #16a34a; font-weight: 700;">✓</span><span>${g}</span></li>`)
      .join('');
    const badListHtml = xai.humanChecklist.bad
      .map((b) => `<li style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 6px;"><span style="color: #dc2626; font-weight: 700;">✗</span><span>${b}</span></li>`)
      .join('');

    modalRoot.innerHTML = `
      <div id="threat-modal-card" style="
        background: #ffffff !important;
        width: 100% !important;
        max-width: 520px !important;
        border-radius: 20px !important;
        box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.9) !important;
        overflow: hidden !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        animation: threatModalScale 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
        color: #0f172a !important;
        display: flex !important;
        flex-direction: column !important;
      ">
        <!-- ВЕРХНЯ ЧАСТИНА (ГОЛОВНЕ ПОПЕРЕДЖЕННЯ ДЛЯ ЛЮДИНИ) -->
        <div style="
          padding: 20px 22px 16px 22px !important;
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          border-bottom: 1px solid #f1f5f9 !important;
          background: #fff5f5 !important;
        ">
          <div style="display: flex; align-items: flex-start; gap: 14px;">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: #fee2e2;
              border: 1px solid #fca5a5;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              flex-shrink: 0;
            ">🛑</div>
            <div>
              <div style="font-size: 19px; font-weight: 800; color: #991b1b; line-height: 1.25;">
                ${xai.humanTitle}
              </div>
              <div style="font-size: 13.5px; color: #475569; margin-top: 4px; font-weight: 500; line-height: 1.4;">
                ${xai.humanSubtitle}
              </div>
            </div>
          </div>

          <button id="threat-modal-close-btn" type="button" title="Закрити та зберегти гроші" style="
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: none;
            background: rgba(0,0,0,0.05);
            color: #64748b;
            cursor: pointer;
            font-size: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            flex-shrink: 0;
          ">✕</button>
        </div>

        <!-- ОСНОВНА ЧАСТИНА: ЗРОЗУМІЛЕ ЖИТТЄВЕ ПОЯСНЕННЯ (16px) -->
        <div style="padding: 20px 22px; max-height: 68vh; overflow-y: auto;">
          
          <!-- Головний блок застереження -->
          <div style="
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 12px;
            padding: 14px 16px;
            margin-bottom: 14px;
          ">
            <div style="font-size: 14.5px; font-weight: 700; color: #991b1b; line-height: 1.5; margin-bottom: 8px;">
              ⚠️ ${xai.humanCoreWarning}
            </div>
            
            <div style="font-size: 12px; color: #64748b; background: rgba(255,255,255,0.7); padding: 6px 10px; border-radius: 6px; word-break: break-all;">
              🌐 Адреса сайту: <strong style="color: #0f172a; font-family: ui-monospace, monospace;">${options.contextValue}</strong> (не є офіційним платіжним сервісом)
            </div>
          </div>

          <!-- Світлофор: Правильно vs Шахрайство -->
          <div style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
          ">
            <!-- Зелений блок -->
            <div style="
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              border-radius: 10px;
              padding: 12px 14px;
            ">
              <div style="font-size: 12px; font-weight: 700; color: #15803d; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
                <span>🟢 Як безпечно:</span>
              </div>
              <ul style="margin: 0; padding: 0; list-style: none; font-size: 12px; color: #166534; line-height: 1.4;">
                ${goodListHtml}
              </ul>
            </div>

            <!-- Червоний блок -->
            <div style="
              background: #fff1f2;
              border: 1px solid #fecdd3;
              border-radius: 10px;
              padding: 12px 14px;
            ">
              <div style="font-size: 12px; font-weight: 700; color: #b91c1c; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
                <span>🔴 Ознаки обману:</span>
              </div>
              <ul style="margin: 0; padding: 0; list-style: none; font-size: 12px; color: #991b1b; line-height: 1.4;">
                ${badListHtml}
              </ul>
            </div>
          </div>

          <!-- ГОЛОВНА ВЕЛИКА РЯТІВНА КНОПКА (ESCAPE HATCH) -->
          <div style="margin-bottom: 14px;">
            <button id="threat-modal-primary-save-btn" type="button" style="
              width: 100%;
              background: #0f172a;
              color: #ffffff;
              border: none;
              padding: 14px 20px;
              border-radius: 12px;
              font-size: 15px;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.25);
              transition: transform 0.15s, background 0.15s;
            ">
              <span>🛡️ Зберегти гроші (Закрити сторінку)</span>
            </button>
          </div>

          <!-- РОЗКРИВНИЙ БЛОК: ТЕХНІЧНИЙ АНАЛІЗ ТА XAI ДЛЯ ФАХІВЦІВ / ДИПЛОМА -->
          <div style="text-align: center; margin-bottom: 6px;">
            <button id="threat-modal-toggle-details" type="button" style="
              background: transparent;
              border: none;
              color: #2563eb;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 6px 10px;
              border-radius: 6px;
              transition: background 0.15s;
            ">
              <span id="threat-details-label">🔍 Показати технічний аналіз та формулу ризику</span>
              <span id="threat-details-arrow" style="font-size: 10px; transition: transform 0.2s;">▼</span>
            </button>
          </div>

          <!-- ПРИХОВАНИЙ ТЕХНІЧНИЙ БЛОК (PROGRESSIVE DISCLOSURE) -->
          <div id="threat-modal-details-panel" style="
            display: none;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
            margin-top: 8px;
            animation: threatBackdropFade 0.2s ease-in-out;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #dc2626; background: #fee2e2; padding: 2px 7px; border-radius: 4px;">
                ${options.badgeText}
              </span>
              <span style="font-size: 11px; font-weight: 600; color: #64748b;">
                ${engineBadgeText}
              </span>
            </div>

            <div style="font-size: 12px; color: #334155; margin-bottom: 10px; line-height: 1.4;">
              🎯 <strong>Діагноз моделі:</strong> ${xai.diagnosis}
            </div>

            <!-- SVG граф вектора атаки -->
            <div id="threat-modal-graph-slot"></div>

            <!-- Математична декомпозиція ризику -->
            ${formulaHtml}

            <!-- Список технічних евристик -->
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">
              Спрацьовані тригери безпеки:
            </div>
            ${reasonsHtml}

            <!-- Пояснення нейромережі / синтезатора -->
            <div style="
              background: #eff6ff;
              border: 1px solid #bfdbfe;
              border-radius: 8px;
              padding: 10px 12px;
              font-size: 12px;
              color: #1e40af;
              margin-top: 10px;
              line-height: 1.45;
            ">
              ${xai.plainLanguageExplanation}
            </div>

            <!-- Освітня порада -->
            <div style="font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.4; border-left: 2px solid #3b82f6; padding-left: 8px;">
              ${xai.educationalTip}
            </div>
          </div>

          ${rememberHtml}

          <!-- ДРУГОРЯДНА НЕБЕЗПЕЧНА ДІЯ (ДЛЯ УСВІДОМЛЕНОГО РИЗИКУ) -->
          <div style="margin-top: 12px; text-align: center;">
            <button id="threat-modal-override-btn" type="button" disabled style="
              background: transparent;
              color: #94a3b8;
              border: 1px solid #cbd5e1;
              padding: 8px 14px;
              border-radius: 8px;
              font-size: 12px;
              font-weight: 500;
              cursor: not-allowed;
              transition: all 0.2s;
            ">⏳ Зачекайте (3с)...</button>
          </div>

        </div>
      </div>
    `;

    // Монтуємо модальне вікно в ізольований ShadowRoot
    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    // Вставляємо динамічний SVG граф у технічний слот
    const graphSlot = modalRoot.querySelector('#threat-modal-graph-slot');
    if (graphSlot) {
      const graphElement = SvgAttackGraph.render(xai.chain);
      graphSlot.appendChild(graphElement);
    }

    // Обробники кнопок
    const btnClose = modalRoot.querySelector('#threat-modal-close-btn');
    const btnPrimarySave = modalRoot.querySelector('#threat-modal-primary-save-btn');
    const btnOverride = modalRoot.querySelector('#threat-modal-override-btn') as HTMLButtonElement;
    const checkRemember = modalRoot.querySelector('#threat-modal-remember') as HTMLInputElement;

    // Тогл технічного розкривного блоку (Progressive Disclosure)
    const btnToggleDetails = modalRoot.querySelector('#threat-modal-toggle-details');
    const panelDetails = modalRoot.querySelector('#threat-modal-details-panel') as HTMLElement;
    const labelDetails = modalRoot.querySelector('#threat-details-label');
    const arrowDetails = modalRoot.querySelector('#threat-details-arrow') as HTMLElement;

    let isDetailsOpen = false;
    btnToggleDetails?.addEventListener('click', () => {
      isDetailsOpen = !isDetailsOpen;
      if (panelDetails) {
        panelDetails.style.display = isDetailsOpen ? 'block' : 'none';
      }
      if (labelDetails) {
        labelDetails.textContent = isDetailsOpen
          ? '▲ Сховати технічний аналіз'
          : '🔍 Показати технічний аналіз та формулу ризику';
      }
      if (arrowDetails) {
        arrowDetails.style.transform = isDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });

    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnClose?.addEventListener('click', handleCancel);
    btnPrimarySave?.addEventListener('click', handleCancel);

    // Клік по бекдропу за межами картки закриває та рятує
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
        btnOverride.innerText =
          options.type === 'chat'
            ? 'Я розумію ризик і все одно хочу надіслати'
            : 'Я розумію ризик втрати коштів, продовжити';
        btnOverride.style.color = '#dc2626';
        btnOverride.style.borderColor = '#fca5a5';
        btnOverride.style.background = '#fff5f5';
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
