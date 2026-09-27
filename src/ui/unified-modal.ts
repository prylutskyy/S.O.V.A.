import { ActiveThreatContext, ThreatAssessment } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { ShadowHost } from './shadow-host';
import { ToastNotifier } from './toast-notifier';
import { DESIGN_TOKENS_CSS } from './design-tokens';

export interface UnifiedModalOptions {
  type: 'form' | 'chat';
  title: string;
  badgeText: string;
  badgeLevel?: 'CRITICAL' | 'HIGH';
  contextLabel: string;
  contextValue: string;
  triggers: Array<{ message: string; severity?: string; name?: string; details?: any }>;
  explanation?: string;
  allowRememberDomain?: boolean;
  domainToRemember?: string;
  assessment?: ThreatAssessment;
  activeContext?: ActiveThreatContext | null;
  chatLeakage?: { hasCard: boolean; hasCvv: boolean };
  chatDialogue?: string;
  detectedAmount?: string;
  vaultMatches?: VaultMatchResult[];
  vaultItems?: VaultItem[];
  rawTextToScan?: string;
  formDetails?: string;
  intentType?: string;
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

interface DiagnosticItem {
  badge: string;
  badgeType: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  evidence?: string;
}

/**
 * UnifiedFrictionModal: Jony Ive Design Carte Blanche
 * Втілення філософії керованого захисного тертя (Security Friction):
 * 1. Оптичний скляний купол (Frosted Optical Float Glass) з м'якою дифракцією фону.
 * 2. Двоколонкова матриця смислового контрасту «Намір vs Прихована загроза» (250мс сприйняття).
 * 3. Сенсорний жест усвідомленої згоди «Hold to Unlock (2000 ms)» з пружинним поверненням.
 * 4. Ізольований швейцарський турбійон діагностики для дипломного захисту.
 */
export class UnifiedFrictionModal {
  private static activeModal: HTMLElement | null = null;
  private static holdInterval: number | null = null;
  private static holdListeners: Array<() => void> = [];
  private static previousBodyOverflow: string | null = null;
  private static previousHtmlOverflow: string | null = null;

  public static async show(options: UnifiedModalOptions): Promise<void> {
    if (typeof document === 'undefined') return;
    this.close();

    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const modalRoot = document.createElement('div');
    modalRoot.id = 'threat-shield-unified-modal';

    const fallbackAssessment: ThreatAssessment = options.assessment || {
      score: options.badgeLevel === 'CRITICAL' ? 95 : 65,
      level: options.badgeLevel || 'CRITICAL',
      triggers: options.triggers.map((t) => ({
        name: t.name || 'generic_trigger',
        triggered: true,
        severity: (t.severity as any) || 'CRITICAL',
        scoreContribution: 35,
        message: t.message,
      })),
      timestamp: Date.now(),
    };

    const vaultItems = options.vaultItems || options.vaultMatches?.map((m) => m.matchedItem);

    // Миттєвий XAI-синтез тріади контрасту (< 0.1 мс на будь-якому ПК)
    const xai = await XaiEngine.generateExplanation({
      type: options.type,
      targetHost: options.contextValue,
      activeContext: options.activeContext,
      assessment: fallbackAssessment,
      chatLeakage: options.chatLeakage,
      detectedAmount: options.detectedAmount,
      vaultItems,
    });

    const isCritical = fallbackAssessment.level === 'CRITICAL';
    const primaryActionLabel = options.type === 'chat' ? 'Скасувати надсилання' : 'Повернутися до безпеки';
    const diagnostics = this.buildDiagnosticFactors(options, xai);

    const userIntent = xai.intentVsReality?.userIntent || 'Безпечна взаємодія з вебсервісом';
    const hiddenReality = xai.intentVsReality?.hiddenReality || xai.humanCoreWarning;
    const verdict = xai.intentVsReality?.verdict || xai.plainLanguageExplanation;
    const threatTitle = options.title || xai.intentVsReality?.threatName || xai.humanTitle;

    // Скляний Backdrop з м'яким матовим розмиттям (Apple Frosted Glass)
    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(0, 0, 0, 0.32) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: tsBackdrop 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const rememberCheckboxHtml = options.allowRememberDomain && options.domainToRemember ? `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sanctuary-ink-secondary); margin-top: 14px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="ts-remember-domain" style="accent-color: var(--sanctuary-blue); width: 15px; height: 15px; cursor: pointer;">
        <span>Довіряти домену <strong style="color: var(--sanctuary-ink-primary); font-family: var(--font-mono); font-size: 11px;">${options.domainToRemember}</strong></span>
      </label>
    ` : '';

    const diagnosticsHtml = diagnostics.map((d) => `
      <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; background: var(--sanctuary-surface); border: 1px solid var(--sanctuary-hairline); border-radius: 10px; font-size: 11.5px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <strong style="color: var(--sanctuary-ink-primary); font-weight: 600;">${d.title}</strong>
          <span style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 4px; ${
            d.badgeType === 'critical'
              ? `background: var(--sanctuary-red-bg); color: var(--sanctuary-red); border: 1px solid var(--sanctuary-red-bd);`
              : d.badgeType === 'warning'
              ? `background: var(--sanctuary-amber-bg); color: var(--sanctuary-amber); border: 1px solid var(--sanctuary-amber-bd);`
              : `background: var(--sanctuary-blue-bg); color: var(--sanctuary-blue); border: 1px solid var(--sanctuary-blue-bd);`
          }">${d.badge}</span>
        </div>
        <div style="color: var(--sanctuary-ink-secondary); line-height: 1.45;">${d.description}</div>
        ${d.evidence ? `<div style="font-family: var(--font-mono); font-size: 10.5px; color: var(--sanctuary-ink-tertiary); background: var(--sanctuary-surface-subtle); padding: 4px 7px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.evidence}</div>` : ''}
      </div>
    `).join('');

    modalRoot.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}

        @keyframes tsBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tsCardEnter {
          from { opacity: 0; transform: scale(0.94) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        #ts-modal-card {
          width: 480px;
          max-width: 92vw;
          background: rgba(255, 255, 255, 0.90);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border-radius: var(--radius-modal, 22px);
          border: 1px solid rgba(255, 255, 255, 0.65);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
          overflow: hidden;
          font-family: var(--font-sanctuary);
          animation: tsCardEnter 0.38s var(--ease-apple-spring);
          color: var(--sanctuary-ink-primary);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 30px 26px 22px;
          box-sizing: border-box;
          user-select: none;
        }

        .ts-emblem-box {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: ${isCritical ? 'var(--sanctuary-red-bg)' : 'var(--sanctuary-amber-bg)'};
          border: 1px solid ${isCritical ? 'var(--sanctuary-red-bd)' : 'var(--sanctuary-amber-bd)'};
          color: ${isCritical ? 'var(--sanctuary-red)' : 'var(--sanctuary-amber)'};
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          box-shadow: 0 4px 12px ${isCritical ? 'rgba(255, 59, 48, 0.16)' : 'rgba(255, 149, 0, 0.16)'};
        }

        .ts-title {
          font-size: 19px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.02em;
          line-height: 1.25;
          margin-bottom: 6px;
        }

        .ts-context-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--sanctuary-ink-secondary);
          margin-bottom: 18px;
        }

        .ts-context-tag {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          background: var(--sanctuary-surface-subtle);
          border: 1px solid var(--sanctuary-hairline);
          padding: 2px 8px;
          border-radius: 6px;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Two-Column Contrast Grid (Intent vs Reality) */
        .ts-contrast-grid {
          width: 100%;
          margin-bottom: 16px;
          background: var(--sanctuary-surface);
          border-radius: var(--radius-card, 14px);
          border: 1px solid var(--sanctuary-hairline);
          display: grid;
          grid-template-columns: 1fr 1fr;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          text-align: left;
        }

        .ts-contrast-col-left {
          padding: 14px 16px;
          background: rgba(0, 113, 227, 0.035);
          border-right: 1px solid var(--sanctuary-divider);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ts-contrast-col-right {
          padding: 14px 16px;
          background: rgba(255, 59, 48, 0.04);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ts-contrast-header-left {
          font-size: 10px;
          font-weight: 700;
          color: var(--sanctuary-blue);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ts-contrast-header-right {
          font-size: 10px;
          font-weight: 700;
          color: var(--sanctuary-red);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ts-contrast-val-left {
          font-size: 12.5px;
          font-weight: 500;
          color: var(--sanctuary-ink-primary);
          line-height: 1.4;
        }

        .ts-contrast-val-right {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--sanctuary-red-ink);
          line-height: 1.4;
        }

        .ts-verdict {
          font-size: 12px;
          line-height: 1.5;
          color: var(--sanctuary-ink-secondary);
          margin-bottom: 20px;
          padding: 0 6px;
        }

        .ts-actions-stack {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .ts-btn-primary {
          width: 100%;
          height: 44px;
          background: var(--sanctuary-ink-primary);
          color: #FFFFFF;
          border: none;
          border-radius: var(--radius-control, 10px);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: background 0.15s, transform 0.1s var(--ease-apple-press);
          font-family: var(--font-sanctuary);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        }

        .ts-btn-primary:hover {
          background: #000000;
        }

        .ts-btn-primary:active {
          transform: scale(0.985);
        }

        .ts-btn-decoy {
          width: 100%;
          height: 40px;
          background: var(--sanctuary-green-bg);
          color: var(--sanctuary-green-ink);
          border: 1px solid var(--sanctuary-green-bd);
          border-radius: var(--radius-control, 10px);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s;
          font-family: var(--font-sanctuary);
        }

        .ts-btn-decoy:hover {
          background: rgba(52, 199, 89, 0.18);
        }

        .ts-btn-decoy:active {
          transform: scale(0.985);
        }

        /* 2000 ms Sensory Hold-to-Unlock Slider */
        .ts-hold-btn {
          position: relative;
          width: 100%;
          height: 48px;
          background: rgba(118, 118, 128, 0.10);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: var(--radius-pill, 9999px);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
          font-family: var(--font-sanctuary);
        }

        .ts-hold-btn:hover {
          border-color: var(--sanctuary-ink-tertiary);
          background: rgba(118, 118, 128, 0.14);
        }

        .ts-hold-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: linear-gradient(90deg, #0071E3 0%, #34C759 100%);
          pointer-events: none;
          transition: width 0.05s linear;
        }

        .ts-hold-btn.rebound .ts-hold-fill {
          transition: width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        .ts-hold-label {
          position: relative;
          z-index: 2;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-secondary);
          pointer-events: none;
          transition: color 0.15s;
        }

        .ts-hold-btn.holding .ts-hold-label {
          color: #FFFFFF;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }

        .ts-hold-btn.unlocked {
          border-color: var(--sanctuary-green);
          background: var(--sanctuary-green-bg);
          filter: brightness(1.08);
        }

        .ts-hold-btn.unlocked .ts-hold-label {
          color: var(--sanctuary-green-ink);
          font-weight: 700;
        }

        .ts-btn-inspect {
          background: transparent;
          border: none;
          color: var(--sanctuary-ink-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: var(--radius-nested);
          transition: all 0.15s;
          font-family: var(--font-sanctuary);
          margin-top: 10px;
        }

        .ts-btn-inspect:hover {
          color: var(--sanctuary-ink-primary);
          background: var(--sanctuary-surface-hover);
        }

        .ts-inspector-sheet {
          display: none;
          width: 100%;
          background: var(--sanctuary-surface-subtle);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: var(--radius-card, 14px);
          padding: 14px;
          margin-top: 12px;
          animation: tsCardEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
        }
      </style>

      <div id="ts-modal-card">
        <!-- EMBLEM: CONCENTRIC SANCTUARY LENS -->
        <div class="ts-emblem-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="5" stroke-dasharray="1.5 2"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
          </svg>
        </div>

        <!-- HEADLINE -->
        <h2 class="ts-title">${threatTitle}</h2>

        <!-- CONTEXT PILL -->
        <div class="ts-context-pill">
          <span>${options.contextLabel}:</span>
          <span class="ts-context-tag">${options.contextValue}</span>
        </div>

        <!-- TWO-COLUMN INTENT VS REALITY CONTRAST MATRIX -->
        <div class="ts-contrast-grid">
          <div class="ts-contrast-col-left">
            <span class="ts-contrast-header-left">Ваш очікуваний намір</span>
            <span class="ts-contrast-val-left">${userIntent}</span>
          </div>
          <div class="ts-contrast-col-right">
            <span class="ts-contrast-header-right">ПРИХОВАНА ЗАГРОЗА</span>
            <span class="ts-contrast-val-right">${hiddenReality}</span>
          </div>
        </div>

        <!-- PLAIN LANGUAGE VERDICT -->
        <p class="ts-verdict">${verdict}</p>

        <!-- ACTION STACK -->
        <div class="ts-actions-stack">
          ${options.vaultMatches && options.vaultMatches.some((m) => m.isDecoyAvailable) ? `
            <button id="ts-decoy-btn" class="ts-btn-decoy">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
              <span>Підставити безпечні дані (Canary Decoy)</span>
            </button>
          ` : ''}

          <!-- PRIMARY ACTION: Return to Safety -->
          <button id="ts-primary-btn" class="ts-btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>${primaryActionLabel}</span>
          </button>

          <!-- SENSORY 2-SECOND HOLD-TO-UNLOCK -->
          <div id="ts-hold-btn" class="ts-hold-btn" role="button" tabindex="0" title="Затисніть ліву кнопку миші на 2 секунди для переходу">
            <div id="ts-hold-fill" class="ts-hold-fill"></div>
            <span id="ts-hold-label" class="ts-hold-label">Утримуйте 2с для переходу на власний ризик</span>
          </div>
        </div>

        <!-- FOOTER: Inspector Toggle -->
        <button id="ts-inspect-btn" class="ts-btn-inspect">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>▾ Діагностичний звіт швейцарського механізму (XAI)</span>
        </button>

        <!-- SWISS-WATCH DIAGNOSTIC SHEET -->
        <div id="ts-inspector" class="ts-inspector-sheet">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--sanctuary-hairline);">
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sanctuary-ink-secondary);">Формула оцінки загрози</span>
            <span style="font-size: 11px; font-weight: 600; color: ${isCritical ? 'var(--sanctuary-red)' : 'var(--sanctuary-amber)'}; font-family: var(--font-mono);">
              RiskScore: ${fallbackAssessment.score}/100
            </span>
          </div>

          <div style="font-size: 10.5px; font-family: var(--font-mono); color: var(--sanctuary-ink-secondary); background: var(--sanctuary-surface); border: 1px solid var(--sanctuary-hairline); border-radius: 6px; padding: 6px 8px; margin-bottom: 10px;">
            ${xai.breakdown.formula}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 2px;">
            ${diagnosticsHtml}
          </div>

          ${rememberCheckboxHtml}
        </div>
      </div>
    `;

    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    // References
    const btnPrimary    = modalRoot.querySelector('#ts-primary-btn') as HTMLButtonElement;
    const btnDecoy      = modalRoot.querySelector('#ts-decoy-btn') as HTMLButtonElement | null;
    const btnInspect    = modalRoot.querySelector('#ts-inspect-btn') as HTMLButtonElement;
    const inspector     = modalRoot.querySelector('#ts-inspector') as HTMLElement;
    const checkRemember = modalRoot.querySelector('#ts-remember-domain') as HTMLInputElement | null;

    const holdBtn       = modalRoot.querySelector('#ts-hold-btn') as HTMLElement;
    const holdFill      = modalRoot.querySelector('#ts-hold-fill') as HTMLElement;
    const holdLabel     = modalRoot.querySelector('#ts-hold-label') as HTMLElement;

    // Inspector toggle
    let isInspectorOpen = false;
    btnInspect.addEventListener('click', () => {
      isInspectorOpen = !isInspectorOpen;
      inspector.style.display = isInspectorOpen ? 'block' : 'none';
      btnInspect.innerHTML = isInspectorOpen
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> <span>▴ Приховати діагностику</span>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> <span>▾ Діагностичний звіт швейцарського механізму (XAI)</span>';
    });

    // Decoy button
    btnDecoy?.addEventListener('click', () => {
      if (options.vaultMatches && options.vaultMatches.length > 0) {
        const count = VaultScanner.applyDecoys(options.vaultMatches);
        this.close();
        options.onCancel();
        ToastNotifier.show(
          `Захист активовано: ${count} фіктивних значень підставлено замість реальних даних (Canary Decoy).`,
          'info',
          5000
        );
      }
    });

    // Primary action: Return to Safety
    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnPrimary.addEventListener('click', handleCancel);
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) handleCancel();
    });

    // 2000 ms Sensory Hold-to-Unlock Mechanics with Apple Spring Rebound
    let holdProgress = 0;
    const HOLD_DURATION_MS = 2000;
    const HOLD_STEP_MS = 25;

    const startHold = () => {
      if (this.holdInterval) clearInterval(this.holdInterval);
      holdBtn.classList.remove('rebound');
      holdBtn.classList.add('holding');
      const startTime = Date.now();

      this.holdInterval = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        holdProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
        holdFill.style.width = `${holdProgress}%`;

        const remainingSec = Math.max(0, (HOLD_DURATION_MS - elapsed) / 1000).toFixed(1);
        holdLabel.textContent = `Утримуйте... (${remainingSec}с)`;

        if (holdProgress >= 100) {
          if (this.holdInterval) {
            clearInterval(this.holdInterval);
            this.holdInterval = null;
          }
          holdLabel.textContent = '✓ Доступ підтверджено';
          holdBtn.classList.remove('holding');
          holdBtn.classList.add('unlocked');

          setTimeout(async () => {
            const remember = checkRemember?.checked || false;
            if (remember && options.domainToRemember) {
              await UserWhitelistManager.allowDomain(options.domainToRemember);
            }
            UnifiedFrictionModal.close();
            options.onProceed(remember);
          }, 180);
        }
      }, HOLD_STEP_MS);
    };

    const cancelHold = () => {
      if (this.holdInterval) {
        clearInterval(this.holdInterval);
        this.holdInterval = null;
      }
      if (holdProgress < 100) {
        holdProgress = 0;
        holdBtn.classList.add('rebound');
        holdBtn.classList.remove('holding');
        holdFill.style.width = '0%';
        holdLabel.textContent = 'Утримуйте 2с для переходу на власний ризик';
      }
    };

    holdBtn.addEventListener('mousedown', (e) => {
      if (e.button === 0) startHold();
    });
    holdBtn.addEventListener('mouseleave', cancelHold);

    const onMouseUp = () => cancelHold();
    window.addEventListener('mouseup', onMouseUp);
    this.holdListeners.push(() => window.removeEventListener('mouseup', onMouseUp));

    holdBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startHold();
    }, { passive: false });

    const onTouchEnd = () => cancelHold();
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    this.holdListeners.push(() => {
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    });
  }

  public static close(): void {
    if (this.holdInterval) {
      clearInterval(this.holdInterval);
      this.holdInterval = null;
    }
    for (const remove of this.holdListeners) {
      try { remove(); } catch {}
    }
    this.holdListeners = [];

    if (this.activeModal) {
      ShadowHost.remove(this.activeModal);
      this.activeModal = null;
    }
    if (typeof document !== 'undefined') {
      if (this.previousBodyOverflow !== null && document.body) {
        document.body.style.overflow = this.previousBodyOverflow;
        this.previousBodyOverflow = null;
      }
      if (this.previousHtmlOverflow !== null && document.documentElement) {
        document.documentElement.style.overflow = this.previousHtmlOverflow;
        this.previousHtmlOverflow = null;
      }
    }
  }

  private static buildDiagnosticFactors(options: UnifiedModalOptions, xai: any): DiagnosticItem[] {
    const list: DiagnosticItem[] = [];

    if (options.triggers && options.triggers.length > 0) {
      for (const t of options.triggers) {
        const rawMsg = t.message.replace(/[●✓✗]/g, '').trim();
        const lower = rawMsg.toLowerCase();
        let title = 'Підозрілий патерн';
        let badge = 'Критично';
        let badgeType: 'critical' | 'warning' | 'info' = 'critical';
        let description = rawMsg;
        let evidence: string | undefined;

        if (lower.includes('лун') || lower.includes('номер банківськ') || lower.includes('номер картки')) {
          title = 'Номер банківської картки';
          badge = 'Платіжні дані';
          badgeType = 'critical';
          description = 'У формі введено коректний номер картки за алгоритмом Луна на неакредитованій сторінці.';
          evidence = 'Алгоритм Луна: успішно валідовано';
        } else if (lower.includes('прихован') || lower.includes('autofill') || lower.includes('автозаповнен')) {
          title = 'Прихована пастка автозаповнення';
          badge = 'DOM-пастка';
          badgeType = 'critical';
          description = 'Сторінка містить приховані поля (CSS cloaking) для викрадення збережених карткових даних.';
          evidence = 'CSS Cloaking / Autofill Trap';
        } else if (lower.includes('цільовий') || lower.includes('вузол') || lower.includes('хост') || lower.includes('невідповідн') || lower.includes('action')) {
          title = 'Невідомий платіжний вузол';
          badge = 'Недовірений сервер';
          badgeType = 'critical';
          description = `Дані форми відправляються на сторонній сервер ${options.contextValue}, який не є акредитованим шлюзом.`;
          evidence = `action: ${options.contextValue}`;
        } else if (lower.includes('cvv') || lower.includes('cvc')) {
          title = 'Секретний код картки (CVV/CVC)';
          badge = 'Критичний витік';
          badgeType = 'critical';
          description = 'Виявлено спробу передачі CVV-коду. Офіційні служби ніколи не запитують його для зарахування грошей.';
          evidence = 'Card Verification Value';
        } else if (t.name === 'urgency_scarcity_manipulation' || lower.includes('термінов') || lower.includes('таймер') || lower.includes('dark pattern')) {
          title = 'Штучний тиск терміновості';
          badge = 'Dark Pattern';
          badgeType = 'warning';
          description = 'Сторінка застосовує фіктивний зворотний відлік або психологічний тиск, провокуючи поспіх.';
          const timerText = (t.details as any)?.timerText;
          evidence = timerText ? `Зворотний відлік: ${timerText}` : 'Urgency Manipulation';
        } else {
          title = 'Виявлений фактор ризику';
          badge = t.severity === 'CRITICAL' ? 'Критично' : 'Попередження';
          badgeType = t.severity === 'CRITICAL' ? 'critical' : 'warning';
          description = rawMsg;
        }
        list.push({ badge, badgeType, title, description, evidence });
      }
    }

    if (options.activeContext) {
      const minutesAgo = Math.max(1, Math.round((Date.now() - options.activeContext.timestamp) / 60000));
      const kws = options.activeContext.detectedKeywords || [];
      list.push({
        badge: 'Зшивання сесій',
        badgeType: 'warning',
        title: "Контекстний зв'язок із попереднім чатом",
        description: `Зафіксовано перехід після повідомлення на платформі "${options.activeContext.sourcePlatform}" (${minutesAgo} хв тому).`,
        evidence: kws.length > 0 ? `Ключові фрази: "${kws.slice(0, 3).join('", "')}"` : `Джерело: ${options.activeContext.sourcePlatform}`,
      });
    }

    const vaultItems = options.vaultItems || options.vaultMatches?.map((m) => m.matchedItem);
    if (vaultItems && vaultItems.length > 0) {
      const labels = Array.from(new Set(vaultItems.map((i) => i.label))).join(', ');
      list.push({
        badge: 'Personal Vault',
        badgeType: 'critical',
        title: 'Захист персональних маркерів',
        description: `Форма випитує захищені банківські маркери відновлення доступу (${labels}).`,
        evidence: `Маркери: ${labels}`,
      });
    }

    if (list.length === 0) {
      list.push({
        badge: 'Оцінка загрози',
        badgeType: 'critical',
        title: 'Виявлено ризик для безпеки',
        description: xai?.humanCoreWarning || 'Ця сторінка запитує чутливі дані, що загрожують безпеці ваших коштів.',
        evidence: `Сервер: ${options.contextValue}`,
      });
    }

    return list;
  }
}
