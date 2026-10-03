import { ActiveThreatContext, ThreatAssessment } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { ShadowHost } from './shadow-host';
import { DebuggerOverlay } from './debugger-overlay';
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
 * UnifiedFrictionModal
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
      vaultMatches: options.vaultMatches,
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
      <label class="ts-remember-row" id="ts-remember-label">
        <input type="checkbox" id="ts-remember-domain" class="ts-checkbox">
        <span>Довіряти домену <strong class="ts-mono-host">${options.domainToRemember}</strong></span>
      </label>
    ` : '';

    const diagnosticsHtml = diagnostics.map((d) => `
      <div class="ts-diag-card">
        <div class="ts-diag-top">
          <strong class="ts-diag-title">${d.title}</strong>
          <span class="ts-diag-badge ${d.badgeType}">${d.badge}</span>
        </div>
        <div class="ts-diag-desc">${d.description}</div>
        ${d.evidence ? `<div class="ts-diag-evidence">${d.evidence}</div>` : ''}
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
          from { opacity: 0; transform: scale(0.93) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        #ts-modal-card {
          width: 470px;
          max-width: 92vw;
          max-height: 90vh;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(32px) saturate(190%);
          -webkit-backdrop-filter: blur(32px) saturate(190%);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.75);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.05);
          font-family: var(--font-sanctuary);
          animation: tsCardEnter 0.3s var(--ease-apple-spring);
          color: var(--sanctuary-ink-primary);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 28px 24px 22px;
          box-sizing: border-box;
          user-select: none;
        }

        #ts-modal-card::-webkit-scrollbar {
          width: 4px;
        }
        #ts-modal-card::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12);
          border-radius: 4px;
        }

        .ts-emblem-box {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }

        .ts-emblem-box.critical {
          background: var(--sanctuary-red-bg);
          border: 1px solid var(--sanctuary-red-bd);
          color: var(--sanctuary-red);
          box-shadow: 0 4px 14px rgba(255, 59, 48, 0.16);
        }

        .ts-emblem-box.warning {
          background: var(--sanctuary-amber-bg);
          border: 1px solid var(--sanctuary-amber-bd);
          color: var(--sanctuary-amber);
          box-shadow: 0 4px 14px rgba(255, 149, 0, 0.16);
        }

        .ts-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          letter-spacing: -0.015em;
          line-height: 1.3;
          margin-bottom: 6px;
        }

        .ts-context-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--sanctuary-ink-secondary);
          margin-bottom: 16px;
        }

        .ts-context-tag {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          background: var(--sanctuary-surface-subtle);
          border: 1px solid var(--sanctuary-hairline);
          padding: 2.5px 8px;
          border-radius: 6px;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Two-Column Contrast Grid (Intent vs Reality) */
        .ts-contrast-grid {
          width: 100%;
          margin-bottom: 14px;
          background: var(--sanctuary-surface);
          border-radius: 12px;
          border: 1px solid var(--sanctuary-hairline);
          display: grid;
          grid-template-columns: 1fr 1fr;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          text-align: left;
        }

        .ts-contrast-col-left {
          padding: 12px 14px;
          background: rgba(0, 113, 227, 0.03);
          border-right: 1px solid var(--sanctuary-divider);
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .ts-contrast-col-right {
          padding: 12px 14px;
          background: rgba(255, 59, 48, 0.035);
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .ts-contrast-header-left {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 700;
          color: var(--sanctuary-blue);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .ts-contrast-header-right {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 700;
          color: var(--sanctuary-red);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .ts-contrast-val-left {
          font-size: 12px;
          font-weight: 500;
          color: var(--sanctuary-ink-primary);
          line-height: 1.4;
        }

        .ts-contrast-val-right {
          font-size: 12px;
          font-weight: 600;
          color: var(--sanctuary-red-ink);
          line-height: 1.4;
        }

        .ts-verdict {
          font-size: 12px;
          line-height: 1.5;
          color: var(--sanctuary-ink-secondary);
          margin-bottom: 16px;
          padding: 0 4px;
        }

        .ts-remember-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 11.5px;
          color: var(--sanctuary-ink-secondary);
          margin-bottom: 4px;
          cursor: pointer;
          user-select: none;
        }

        .ts-remember-row input {
          accent-color: var(--sanctuary-blue);
          width: 14px;
          height: 14px;
          cursor: pointer;
        }

        .ts-remember-row .ts-mono-host {
          color: var(--sanctuary-ink-primary);
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .ts-actions-stack {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ts-btn-primary {
          width: 100%;
          height: 42px;
          background: var(--sanctuary-blue);
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s var(--ease-apple-spring);
          font-family: var(--font-sanctuary);
          box-shadow: 0 1px 4px rgba(0, 113, 227, 0.25);
        }

        .ts-btn-primary:hover {
          background: var(--sanctuary-blue-hover);
        }

        .ts-btn-primary:active {
          transform: scale(0.985);
        }

        .ts-btn-decoy {
          width: 100%;
          height: 38px;
          background: var(--sanctuary-green-bg);
          color: var(--sanctuary-green-ink);
          border: 1px solid var(--sanctuary-green-bd);
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s;
          font-family: var(--font-sanctuary);
        }

        .ts-btn-decoy:hover {
          background: rgba(52, 199, 89, 0.16);
        }

        .ts-btn-decoy:active {
          transform: scale(0.985);
        }

        /* 2000 ms Sensory Hold-to-Unlock Slider */
        .ts-hold-btn {
          position: relative;
          width: 100%;
          height: 42px;
          background: rgba(118, 118, 128, 0.08);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 9999px;
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
          background: rgba(118, 118, 128, 0.12);
        }

        .ts-hold-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: rgba(0, 113, 227, 0.18);
          pointer-events: none;
          transition: width 0.05s linear;
        }

        .ts-hold-btn.rebound .ts-hold-fill {
          transition: width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        .ts-hold-label {
          position: relative;
          z-index: 2;
          font-size: 12px;
          font-weight: 500;
          color: var(--sanctuary-ink-secondary);
          pointer-events: none;
          transition: color 0.15s;
        }

        .ts-hold-btn.holding .ts-hold-label {
          color: var(--sanctuary-ink-primary);
          font-weight: 600;
        }

        .ts-hold-btn.unlocked {
          border-color: var(--sanctuary-green);
          background: var(--sanctuary-green-bg);
        }

        .ts-hold-btn.unlocked .ts-hold-label {
          color: var(--sanctuary-green-ink);
          font-weight: 600;
        }

        .ts-btn-inspect {
          background: transparent;
          border: none;
          color: var(--sanctuary-ink-secondary);
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 6px;
          transition: all 0.15s;
          font-family: var(--font-sanctuary);
          margin-top: 8px;
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
          border-radius: 12px;
          padding: 12px 14px;
          margin-top: 10px;
          animation: tsCardEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          box-sizing: border-box;
        }

        .ts-diag-card {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          background: var(--sanctuary-surface);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 8px;
          font-size: 11.5px;
        }

        .ts-diag-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }

        .ts-diag-title {
          color: var(--sanctuary-ink-primary);
          font-weight: 600;
        }

        .ts-diag-badge {
          font-size: 9.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .ts-diag-badge.critical {
          background: var(--sanctuary-red-bg);
          color: var(--sanctuary-red-ink);
          border: 1px solid var(--sanctuary-red-bd);
        }

        .ts-diag-badge.warning {
          background: var(--sanctuary-amber-bg);
          color: var(--sanctuary-amber-ink);
          border: 1px solid var(--sanctuary-amber-bd);
        }

        .ts-diag-badge.info {
          background: var(--sanctuary-blue-bg);
          color: var(--sanctuary-blue);
          border: 1px solid var(--sanctuary-blue-bd);
        }

        .ts-diag-desc {
          color: var(--sanctuary-ink-secondary);
          line-height: 1.4;
        }

        .ts-diag-evidence {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--sanctuary-ink-secondary);
          background: var(--sanctuary-surface-subtle);
          padding: 3px 6px;
          border-radius: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>

      <div id="ts-modal-card">
        <!-- AUTHENTIC SECURITY EMBLEM -->
        <div class="ts-emblem-box ${isCritical ? 'critical' : 'warning'}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
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
            <span class="ts-contrast-header-left">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>
              Ваш очікуваний намір
            </span>
            <span class="ts-contrast-val-left">${userIntent}</span>
          </div>
          <div class="ts-contrast-col-right">
            <span class="ts-contrast-header-right">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              ПРИХОВАНА ЗАГРОЗА
            </span>
            <span class="ts-contrast-val-right">${hiddenReality}</span>
          </div>
        </div>

        <!-- PLAIN LANGUAGE VERDICT -->
        <p class="ts-verdict">${verdict}</p>

        <!-- ACTION STACK -->
        <div class="ts-actions-stack">
          ${options.vaultMatches && options.vaultMatches.some((m) => m.isDecoyAvailable && (options.vaultMatches?.some(v => v.matchType === 'VALUE_MATCH') ? m.matchType === 'VALUE_MATCH' : true)) ? `
            <button id="ts-decoy-btn" class="ts-btn-decoy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
              <span>Підставити маскувальні дані</span>
            </button>
          ` : ''}

          <!-- PRIMARY ACTION: Return to Safety -->
          <button id="ts-primary-btn" class="ts-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>${primaryActionLabel}</span>
          </button>

          ${rememberCheckboxHtml}

          <!-- SENSORY 2-SECOND HOLD-TO-UNLOCK -->
          <div id="ts-hold-btn" class="ts-hold-btn" role="button" tabindex="0" title="Затисніть ліву кнопку миші на 2 секунди для переходу">
            <div id="ts-hold-fill" class="ts-hold-fill"></div>
            <span id="ts-hold-label" class="ts-hold-label">Утримуйте 2с для переходу на власний ризик</span>
          </div>
        </div>

        <!-- FOOTER: Inspector Toggle -->
        <button id="ts-inspect-btn" class="ts-btn-inspect">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          <span>Деталі перевірки (XAI)</span>
        </button>

        <!-- DIAGNOSTIC SHEET -->
        <div id="ts-inspector" class="ts-inspector-sheet">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--sanctuary-hairline);">
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sanctuary-ink-secondary);">Оцінка загрози</span>
            <span style="font-size: 11px; font-weight: 600; color: ${isCritical ? 'var(--sanctuary-red)' : 'var(--sanctuary-amber)'}; font-family: var(--font-mono);">
              RiskScore: ${fallbackAssessment.score}/100
            </span>
          </div>

          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--sanctuary-ink-secondary); background: var(--sanctuary-surface); border: 1px solid var(--sanctuary-hairline); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
            ${xai.breakdown.formula}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 2px;">
            ${diagnosticsHtml}
          </div>
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
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> <span>Приховати деталі перевірки</span>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> <span>Деталі перевірки (XAI)</span>';
    });

    // Decoy button: підставляємо маскувальні дані ТІЛЬКИ в поля, де користувач реально ввів дані зі Сховища
    btnDecoy?.addEventListener('click', () => {
      if (options.vaultMatches && options.vaultMatches.length > 0) {
        VaultScanner.applyDecoys(options.vaultMatches, true);
        DebuggerOverlay.recordMitigation(
          'Застосовано дезінформаційні фейкові дані (Decoys)',
          options.assessment?.score,
          options.assessment?.level
        );
        this.close();
        options.onCancel();
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

    // Keyboard support: Escape cancels
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.holdListeners.push(() => window.removeEventListener('keydown', onKeyDown));

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
          holdLabel.textContent = 'Доступ дозволено';
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
        } else if (t.name === 'vault_sensitive_data_exposure' || lower.includes('private vault') || lower.includes('маркерів відновлення') || lower.includes('випитує абсолютні банківські маркери')) {
          const hasValueLeak = (t.details as any)?.hasValueLeak;
          title = hasValueLeak ? 'Витік банківського маркера безпеки' : 'Запит персональних банківських маркерів';
          badge = hasValueLeak ? 'Критичний витік' : 'Запит маркерів';
          badgeType = hasValueLeak ? 'critical' : 'warning';
          description = hasValueLeak
            ? 'У формі введено дійсне значення конфіденційного маркера безпеки з Private Vault.'
            : 'Форма запитує конфіденційні маркери банківської ідентифікації.';
          const labels = (t.details as any)?.labels;
          evidence = labels && Array.isArray(labels) ? labels.join(', ') : 'Private Vault DLP';
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
