import { i18n, getLocalizedVaultLabel } from '../core/i18n';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { ShadowHost } from './shadow-host';
import { DESIGN_TOKENS_CSS, getSovaLogoUrl } from './design-tokens';
import { DebuggerOverlay } from './debugger-overlay';

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
  icon: 'card' | 'cvv' | 'trap' | 'server' | 'timer' | 'vault' | 'chat' | 'alert';
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
    const isCivicDefense =
      options.intentType === 'MILITARY_SABOTAGE_RECRUITMENT' ||
      options.activeContext?.scenario === 'MILITARY_SABOTAGE_RECRUITMENT' ||
      Boolean(options.title?.toLowerCase().includes('диверсі')) ||
      Boolean(options.title?.toLowerCase().includes('вербуванн')) ||
      options.triggers?.some((t) =>
        t.message.toLowerCase().includes('диверсій') ||
        t.message.toLowerCase().includes('вербуванн') ||
        t.message.toLowerCase().includes('геолокац') ||
        t.message.toLowerCase().includes('ппо') ||
        t.message.toLowerCase().includes('координат') ||
        t.message.toLowerCase().includes('підпал')
      );

    const primaryActionLabel = isCivicDefense
      ? 'Обірвати зв\'язок та заблокувати'
      : (options.type === 'chat' ? i18n.getMessage('modalBtnCancelSending') : i18n.getMessage('modalBtnReturnToSafety'));
    const diagnostics = this.buildDiagnosticFactors(options, xai);

    const userIntent = xai.intentVsReality?.userIntent || i18n.getMessage('modalDefaultUserIntent');
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
        <span>${i18n.getMessage('modalTrustDomain', [options.domainToRemember || ''])}</span>
      </label>
    ` : '';

    const breakdown = xai?.breakdown || {
      technical: { score: fallbackAssessment.score > 50 ? 35 : 15, maxScore: 60, percentage: 50 },
      contextual: { score: options.activeContext ? 35 : 0, maxScore: 35, percentage: options.activeContext ? 100 : 0 },
      userAction: { score: 35, maxScore: 45, percentage: 75 },
    };

    const diagnosticsHtml = diagnostics.map((d) => `
      <div class="ts-xai-item">
        <div class="ts-xai-icon-box ${d.badgeType}">
          ${this.getDiagnosticIconSvg(d.icon)}
        </div>
        <div class="ts-xai-item-body">
          <div class="ts-xai-item-top">
            <span class="ts-xai-item-title">${d.title}</span>
            <span class="ts-xai-item-badge ${d.badgeType}">${d.badge}</span>
          </div>
          <div class="ts-xai-item-desc">${d.description}</div>
          ${d.evidence ? `
            <div class="ts-xai-evidence">
              <span class="ts-xai-evidence-label">${i18n.getMessage('modalEvidenceLabel')}</span>
              <span class="ts-xai-evidence-code">${d.evidence}</span>
            </div>
          ` : ''}
        </div>
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
          background: var(--sanctuary-glass-elevated);
          backdrop-filter: blur(32px) saturate(190%);
          -webkit-backdrop-filter: blur(32px) saturate(190%);
          border-radius: var(--radius-modal);
          border: 1px solid var(--sanctuary-hairline);
          box-shadow: var(--shadow-modal);
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
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .ts-emblem-box.warning {
          background: var(--sanctuary-amber-bg);
          border: 1px solid var(--sanctuary-amber-bd);
          color: var(--sanctuary-amber);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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

        .ts-btn-primary.civic {
          background: var(--sanctuary-red-ink);
          box-shadow: var(--shadow-sm);
        }

        .ts-btn-primary.civic:hover {
          background: var(--sanctuary-red-ink-hover);
        }

        .ts-btn-primary:active {
          transform: scale(0.985);
        }

        .ts-btn-secondary-official {
          width: 100%;
          height: 42px;
          background: rgba(0, 0, 0, 0.04);
          color: var(--sanctuary-ink-primary);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s var(--ease-apple-spring);
          font-family: var(--font-sanctuary);
          box-sizing: border-box;
        }

        .ts-btn-secondary-official:hover {
          background: rgba(0, 0, 0, 0.07);
          border-color: rgba(0, 0, 0, 0.14);
        }

        .ts-btn-secondary-official:active {
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

        /* Apple-Inspired Inspector Disclosure */
        .ts-btn-inspect {
          background: rgba(118, 118, 128, 0.08);
          border: 1px solid var(--sanctuary-hairline);
          color: var(--sanctuary-ink-secondary);
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          transition: all 0.2s var(--ease-apple-spring);
          font-family: var(--font-sanctuary);
          margin-top: 10px;
          user-select: none;
        }

        .ts-btn-inspect:hover {
          color: var(--sanctuary-ink-primary);
          background: rgba(118, 118, 128, 0.14);
        }

        .ts-btn-inspect:active {
          transform: scale(0.97);
        }

        .ts-btn-inspect .ts-inspect-chevron {
          transition: transform 0.22s var(--ease-apple-spring);
        }

        .ts-btn-inspect.expanded .ts-inspect-chevron {
          transform: rotate(180deg);
        }

        /* Inspector Sheet Container */
        .ts-inspector-sheet {
          display: none;
          width: 100%;
          background: rgba(0, 0, 0, 0.025);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 14px;
          padding: 12px 14px;
          margin-top: 10px;
          animation: tsInspectorFade 0.24s var(--ease-apple-spring);
          text-align: left;
          box-sizing: border-box;
          flex-direction: column;
          gap: 10px;
        }

        @keyframes tsInspectorFade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Telemetry Header */
        .ts-xai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .ts-xai-engine-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--sanctuary-ink-secondary);
        }

        .ts-xai-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--sanctuary-blue);
        }

        .ts-xai-score-pill {
          font-size: 11px;
          font-weight: 500;
          padding: 2.5px 8px;
          border-radius: 6px;
          font-family: var(--font-sanctuary);
        }

        .ts-xai-score-pill strong {
          font-family: var(--font-mono);
          font-weight: 700;
        }

        .ts-xai-score-pill.critical {
          background: var(--sanctuary-red-bg);
          color: var(--sanctuary-red-ink);
          border: 1px solid var(--sanctuary-red-bd);
        }

        .ts-xai-score-pill.warning {
          background: var(--sanctuary-amber-bg);
          color: var(--sanctuary-amber-ink);
          border: 1px solid var(--sanctuary-amber-bd);
        }

        /* 3-Factor Risk Telemetry Grid */
        .ts-xai-telemetry {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .ts-xai-factor {
          background: var(--sanctuary-surface);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 9px;
          padding: 7px 9px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ts-xai-factor-name {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--sanctuary-ink-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ts-xai-factor-value {
          font-size: 12px;
          font-weight: 700;
          color: var(--sanctuary-ink-primary);
          font-family: var(--font-mono);
          display: flex;
          align-items: baseline;
          gap: 1px;
        }

        .ts-xai-factor-max {
          font-size: 9.5px;
          font-weight: 500;
          color: var(--sanctuary-ink-secondary);
          font-family: var(--font-sanctuary);
        }

        .ts-xai-meter {
          height: 3px;
          background: rgba(118, 118, 128, 0.12);
          border-radius: 1.5px;
          overflow: hidden;
          margin-top: 3px;
        }

        .ts-xai-bar {
          height: 100%;
          border-radius: 1.5px;
          transition: width 0.3s ease;
        }

        .ts-xai-bar.red {
          background: var(--sanctuary-red);
        }

        .ts-xai-bar.amber {
          background: var(--sanctuary-amber);
        }

        .ts-xai-bar.blue {
          background: var(--sanctuary-blue);
        }

        /* Inset Grouped Indicators List */
        .ts-xai-list {
          background: var(--sanctuary-surface);
          border: 1px solid var(--sanctuary-hairline);
          border-radius: 10px;
          overflow-y: auto;
          max-height: 180px;
          display: flex;
          flex-direction: column;
        }

        .ts-xai-list::-webkit-scrollbar {
          width: 3px;
        }

        .ts-xai-list::-webkit-scrollbar-thumb {
          background: rgba(118, 118, 128, 0.2);
          border-radius: 3px;
        }

        .ts-xai-item {
          padding: 9px 11px;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          border-bottom: 1px solid var(--sanctuary-hairline);
        }

        .ts-xai-item:last-child {
          border-bottom: none;
        }

        .ts-xai-icon-box {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .ts-xai-icon-box.critical {
          background: var(--sanctuary-red-bg);
          color: var(--sanctuary-red);
          border: 1px solid var(--sanctuary-red-bd);
        }

        .ts-xai-icon-box.warning {
          background: var(--sanctuary-amber-bg);
          color: var(--sanctuary-amber);
          border: 1px solid var(--sanctuary-amber-bd);
        }

        .ts-xai-icon-box.info {
          background: var(--sanctuary-blue-bg);
          color: var(--sanctuary-blue);
          border: 1px solid var(--sanctuary-blue-bd);
        }

        .ts-xai-item-body {
          flex: 1;
          min-width: 0;
        }

        .ts-xai-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 2px;
        }

        .ts-xai-item-title {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--sanctuary-ink-primary);
          line-height: 1.3;
        }

        .ts-xai-item-badge {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.02em;
          padding: 1.5px 5px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .ts-xai-item-badge.critical {
          background: var(--sanctuary-red-bg);
          color: var(--sanctuary-red-ink);
        }

        .ts-xai-item-badge.warning {
          background: var(--sanctuary-amber-bg);
          color: var(--sanctuary-amber-ink);
        }

        .ts-xai-item-badge.info {
          background: var(--sanctuary-blue-bg);
          color: var(--sanctuary-blue);
        }

        .ts-xai-item-desc {
          font-size: 11px;
          color: var(--sanctuary-ink-secondary);
          line-height: 1.4;
        }

        .ts-xai-evidence {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 4px;
          padding: 2px 6px;
          background: rgba(118, 118, 128, 0.08);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 9.5px;
          color: var(--sanctuary-ink-secondary);
          max-width: 100%;
          word-break: break-all;
        }

        .ts-xai-evidence-label {
          font-weight: 600;
          color: var(--sanctuary-ink-tertiary);
          font-family: var(--font-sanctuary);
        }

        .ts-xai-tip {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          background: rgba(0, 113, 227, 0.05);
          border: 1px solid rgba(0, 113, 227, 0.12);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 11px;
          color: var(--sanctuary-ink-secondary);
          line-height: 1.4;
        }

        .ts-xai-tip svg {
          color: var(--sanctuary-blue);
          flex-shrink: 0;
          margin-top: 1px;
        }
      </style>

      <div id="ts-modal-card">
        <!-- AUTHENTIC S.O.V.A. LOGO EMBLEM -->
        <div class="ts-emblem-box">
          <div style="width: 42px; height: 42px; border-radius: 12px; overflow: hidden; background: #000000; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);">
            <img class="ts-sova-logo-img" src="${getSovaLogoUrl()}" alt="С.О.В.А." style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          </div>
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
              ${i18n.getMessage('modalIntendedActionTitle')}
            </span>
            <span class="ts-contrast-val-left">${userIntent}</span>
          </div>
          <div class="ts-contrast-col-right">
            <span class="ts-contrast-header-right">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              ${i18n.getMessage('modalHiddenThreatTitle')}
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
              <span>${i18n.getMessage('modalBtnApplyDecoys')}</span>
            </button>
          ` : ''}

          <!-- PRIMARY ACTION: Return to Safety / Block Contact -->
          <button id="ts-primary-btn" class="ts-btn-primary ${isCivicDefense ? 'civic' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>${primaryActionLabel}</span>
          </button>

          ${isCivicDefense ? `
            <!-- CIVIC DEFENSE SECONDARY ACTION: Official SBU/evorog report -->
            <button id="ts-evorog-modal-btn" class="ts-btn-secondary-official" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
              </svg>
              <span>Повідомити в СБУ (єВорог)</span>
            </button>
          ` : `
            ${rememberCheckboxHtml}

            <!-- SENSORY 2-SECOND HOLD-TO-UNLOCK -->
            <div id="ts-hold-btn" class="ts-hold-btn" role="button" tabindex="0" title="${i18n.getMessage('modalHoldBtnTitle')}">
              <div id="ts-hold-fill" class="ts-hold-fill"></div>
              <span id="ts-hold-label" class="ts-hold-label">${i18n.getMessage('modalHoldBtnDefault')}</span>
            </div>
          `}
        </div>

        <!-- FOOTER: Inspector Toggle (Apple Disclosure Capsule) -->
        <button id="ts-inspect-btn" class="ts-btn-inspect" type="button" aria-expanded="false" aria-controls="ts-inspector">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          <span id="ts-inspect-text">${i18n.getMessage('modalInspectDetails')}</span>
          <svg class="ts-inspect-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <!-- DIAGNOSTIC SHEET (Apple Security Inspector) -->
        <div id="ts-inspector" class="ts-inspector-sheet" style="display: none;">
          <!-- TELEMETRY HEADER -->
          <div class="ts-xai-header">
            <div class="ts-xai-engine-tag">
              <span class="ts-xai-pulse-dot"></span>
              <span>${xai.engineType === 'chrome-builtin-ai' ? 'Chrome Gemini Nano' : i18n.getMessage('modalAiEngineDefault')}</span>
            </div>
            <div class="ts-xai-score-pill ${isCritical ? 'critical' : 'warning'}">
              <span>${i18n.getMessage('modalThreatScore', [String(fallbackAssessment.score)])}</span>
            </div>
          </div>

          <!-- 3-FACTOR RISK TELEMETRY (R_tech, C_env, A_user) -->
          <div class="ts-xai-telemetry">
            <div class="ts-xai-factor">
              <span class="ts-xai-factor-name">${i18n.getMessage('modalFactorFormServer')}</span>
              <div class="ts-xai-factor-value">
                <span>${breakdown.technical.score}</span>
                <span class="ts-xai-factor-max">/${breakdown.technical.maxScore}</span>
              </div>
              <div class="ts-xai-meter">
                <div class="ts-xai-bar red" style="width: ${breakdown.technical.percentage}%;"></div>
              </div>
            </div>

            <div class="ts-xai-factor">
              <span class="ts-xai-factor-name">${i18n.getMessage('modalFactorSessionContext')}</span>
              <div class="ts-xai-factor-value">
                <span>${breakdown.contextual.score}</span>
                <span class="ts-xai-factor-max">/${breakdown.contextual.maxScore}</span>
              </div>
              <div class="ts-xai-meter">
                <div class="ts-xai-bar amber" style="width: ${breakdown.contextual.percentage}%;"></div>
              </div>
            </div>

            <div class="ts-xai-factor">
              <span class="ts-xai-factor-name">${i18n.getMessage('modalFactorUserAction')}</span>
              <div class="ts-xai-factor-value">
                <span>${breakdown.userAction.score}</span>
                <span class="ts-xai-factor-max">/${breakdown.userAction.maxScore}</span>
              </div>
              <div class="ts-xai-meter">
                <div class="ts-xai-bar blue" style="width: ${breakdown.userAction.percentage}%;"></div>
              </div>
            </div>
          </div>

          <!-- INSET GROUPED INDICATORS LIST -->
          <div class="ts-xai-list">
            ${diagnosticsHtml}
          </div>

          <!-- EDUCATIONAL COUNTERMEASURE FOOTNOTE -->
          ${xai.educationalTip ? `
            <div class="ts-xai-tip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>${xai.educationalTip}</span>
            </div>
          ` : ''}
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

    const holdBtn       = modalRoot.querySelector('#ts-hold-btn') as HTMLElement | null;
    const holdFill      = modalRoot.querySelector('#ts-hold-fill') as HTMLElement | null;
    const holdLabel     = modalRoot.querySelector('#ts-hold-label') as HTMLElement | null;
    const btnEvorog     = modalRoot.querySelector('#ts-evorog-modal-btn') as HTMLElement | null;

    if (btnEvorog) {
      btnEvorog.addEventListener('click', () => {
        if (typeof window !== 'undefined') {
          window.open('https://t.me/evorog_bot', '_blank');
        }
      });
    }

    // Inspector toggle
    let isInspectorOpen = false;
    const inspectText = modalRoot.querySelector('#ts-inspect-text') as HTMLElement | null;
    btnInspect.addEventListener('click', () => {
      isInspectorOpen = !isInspectorOpen;
      inspector.style.display = isInspectorOpen ? 'flex' : 'none';
      btnInspect.classList.toggle('expanded', isInspectorOpen);
      btnInspect.setAttribute('aria-expanded', isInspectorOpen ? 'true' : 'false');
      if (inspectText) {
        inspectText.textContent = isInspectorOpen ? i18n.getMessage('modalHideDetails') : i18n.getMessage('modalInspectDetails');
      }
    });

    // Decoy button: підставляємо маскувальні дані ТІЛЬКИ в поля, де користувач реально ввів дані зі Сховища
    btnDecoy?.addEventListener('click', () => {
      if (options.vaultMatches && options.vaultMatches.length > 0) {
        VaultScanner.applyDecoys(options.vaultMatches, true);
        DebuggerOverlay.recordMitigation(
          i18n.getMessage('modalDecoysAppliedToast'),
          options.assessment?.score,
          options.assessment?.level
        );
        this.close(); options.onProceed(false);
      }
    });

    // Primary action: Return to Safety / Block Contact
    const handleCancel = () => { this.close(); options.onCancel(); };

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

    // 2000 ms Sensory Hold-to-Unlock Mechanics with Apple Spring Rebound (Only for non-civic threats)
    if (holdBtn && holdFill && holdLabel) {
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
          holdLabel.textContent = i18n.getMessage('modalHoldBtnProgress', [String(remainingSec)]);

          if (holdProgress >= 100) {
            if (this.holdInterval) {
              clearInterval(this.holdInterval);
              this.holdInterval = null;
            }
            holdLabel.textContent = i18n.getMessage('modalHoldBtnGranted');
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
          holdLabel.textContent = i18n.getMessage('modalHoldBtnDefault');
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

  private static getDiagnosticIconSvg(icon: string): string {
    switch (icon) {
      case 'card':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
      case 'cvv':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>';
      case 'trap':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      case 'server':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      case 'timer':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      case 'vault':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7M7 10l-4.5 4.5a3 3 0 1 0 4.24 4.24L10 15.5"/><circle cx="16" cy="8" r="2"/></svg>';
      case 'chat':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      case 'alert':
      default:
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
  }

  private static buildDiagnosticFactors(options: UnifiedModalOptions, xai: any): DiagnosticItem[] {
    const list: DiagnosticItem[] = [];

    if (options.triggers && options.triggers.length > 0) {
      for (const t of options.triggers) {
        const rawMsg = t.message.replace(/[●✓✗]/g, '').trim();
        const lower = rawMsg.toLowerCase();
        let title = i18n.getMessage('modalPatternSuspicious');
        let badge = i18n.getMessage('modalBadgeCritical');
        let badgeType: 'critical' | 'warning' | 'info' = 'critical';
        let icon: 'card' | 'cvv' | 'trap' | 'server' | 'timer' | 'vault' | 'chat' | 'alert' = 'alert';
        let description = rawMsg;
        let evidence: string | undefined;

        if (lower.includes('лун') || lower.includes('номер банківськ') || lower.includes('номер картки') || lower.includes('luhn') || lower.includes('card number')) {
          title = i18n.getMessage('modalTitleCardNumber');
          badge = i18n.getMessage('modalBadgePaymentData');
          badgeType = 'critical';
          icon = 'card';
          description = i18n.getMessage('modalDescCardLuhn');
          evidence = i18n.getMessage('modalEvidenceLuhn');
        } else if (lower.includes('прихован') || lower.includes('autofill') || lower.includes('автозаповнен') || lower.includes('hidden')) {
          title = i18n.getMessage('modalTitleAutofillTrap');
          badge = i18n.getMessage('modalBadgeDomTrap');
          badgeType = 'critical';
          icon = 'trap';
          description = i18n.getMessage('modalDescAutofillTrap');
          evidence = 'CSS Cloaking / Autofill Trap';
        } else if (lower.includes('цільовий') || lower.includes('вузол') || lower.includes('хост') || lower.includes('невідповідн') || lower.includes('action') || lower.includes('target') || lower.includes('gateway') || lower.includes('server')) {
          title = i18n.getMessage('modalTitleUnknownGateway');
          badge = i18n.getMessage('modalBadgeUntrustedServer');
          badgeType = 'critical';
          icon = 'server';
          description = i18n.getMessage('modalDescUnknownGateway', [options.contextValue]);
          evidence = `action: ${options.contextValue}`;
        } else if (lower.includes('cvv') || lower.includes('cvc')) {
          title = i18n.getMessage('modalTitleCvv');
          badge = i18n.getMessage('modalBadgeCriticalLeak');
          badgeType = 'critical';
          icon = 'cvv';
          description = i18n.getMessage('modalDescCvv');
          evidence = 'Card Verification Value';
        } else if (t.name === 'urgency_scarcity_manipulation' || lower.includes('термінов') || lower.includes('таймер') || lower.includes('dark pattern') || lower.includes('urgency') || lower.includes('scarcity')) {
          title = i18n.getMessage('modalTitleUrgency');
          badge = 'Dark Pattern';
          badgeType = 'warning';
          icon = 'timer';
          description = i18n.getMessage('modalDescUrgency');
          const timerText = (t.details as any)?.timerText;
          evidence = timerText ? i18n.getMessage('modalEvidenceTimer', [timerText]) : 'Urgency Manipulation';
        } else if (t.name === 'vault_sensitive_data_exposure' || lower.includes('private vault') || lower.includes('маркерів відновлення') || lower.includes('випитує абсолютні банківські маркери') || lower.includes('vault') || lower.includes('recovery markers')) {
          const hasValueLeak = (t.details as any)?.hasValueLeak;
          title = hasValueLeak ? i18n.getMessage('modalTitleVaultLeak') : i18n.getMessage('modalTitleVaultRequest');
          badge = hasValueLeak ? i18n.getMessage('modalBadgeVaultLeak') : i18n.getMessage('modalBadgeVaultRequest');
          badgeType = hasValueLeak ? 'critical' : 'warning';
          icon = 'vault';
          description = hasValueLeak
            ? i18n.getMessage('modalDescVaultLeak')
            : i18n.getMessage('modalDescVaultRequest');
          const labels = (t.details as any)?.labels;
          evidence = labels && Array.isArray(labels) ? labels.join(', ') : 'Private Vault DLP';
        } else {
          title = i18n.getMessage('modalTitleGenericRisk');
          badge = t.severity === 'CRITICAL' ? i18n.getMessage('modalBadgeCritical') : i18n.getMessage('modalBadgeWarning');
          badgeType = t.severity === 'CRITICAL' ? 'critical' : 'warning';
          icon = 'alert';
          description = rawMsg;
        }
        list.push({ badge, badgeType, title, description, evidence, icon });
      }
    }

    if (options.activeContext) {
      const minutesAgo = Math.max(1, Math.round((Date.now() - options.activeContext.timestamp) / 60000));
      const kws = options.activeContext.detectedKeywords || [];
      list.push({
        badge: i18n.getMessage('modalBadgeSessionStitch'),
        badgeType: 'warning',
        title: i18n.getMessage('modalTitleSessionStitch'),
        icon: 'chat',
        description: i18n.getMessage('modalDescSessionStitch', [options.activeContext.sourcePlatform, String(minutesAgo)]),
        evidence: kws.length > 0 ? i18n.getMessage('modalEvidenceKeyphrases', [kws.slice(0, 3).join('", "')]) : i18n.getMessage('modalEvidenceSource', [options.activeContext.sourcePlatform]),
      });
    }

    const vaultItems = options.vaultItems || options.vaultMatches?.map((m) => m.matchedItem);
    if (vaultItems && vaultItems.length > 0) {
      const labels = Array.from(new Set(vaultItems.map((i) => i.label))).join(', ');
      list.push({
        badge: 'Personal Vault',
        badgeType: 'critical',
        title: i18n.getMessage('modalTitlePersonalMarkers'),
        icon: 'vault',
        description: i18n.getMessage('modalDescPersonalMarkers', [labels]),
        evidence: i18n.getMessage('modalEvidenceMarkers', [labels]),
      });
    }

    if (list.length === 0) {
      list.push({
        badge: i18n.getMessage('modalBadgeThreatEval'),
        badgeType: 'critical',
        title: i18n.getMessage('modalTitleSecurityRisk'),
        icon: 'alert',
        description: xai?.humanCoreWarning || i18n.getMessage('modalDescCoreWarning'),
        evidence: i18n.getMessage('modalEvidenceServer', [options.contextValue]),
      });
    }

    return list;
  }
}



