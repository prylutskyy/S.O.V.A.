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

// Canonical Apple Design Tokens with fallback values
const C = {
  text:         'var(--sanctuary-ink-primary, #1D1D1F)',
  textSec:      'var(--sanctuary-ink-secondary, #86868B)',
  textMuted:    'var(--sanctuary-ink-tertiary, #A1A1A6)',
  surface:      'var(--sanctuary-surface, #FFFFFF)',
  surfaceSub:   'var(--sanctuary-surface-subtle, #FAFAFC)',
  surfaceHover: 'var(--sanctuary-surface-hover, rgba(0, 0, 0, 0.03))',
  border:       'var(--sanctuary-hairline, rgba(0, 0, 0, 0.07))',
  borderSubtle: 'var(--sanctuary-hairline-subtle, rgba(0, 0, 0, 0.04))',

  red:          'var(--sanctuary-red, #FF3B30)',
  redSoft:      'var(--sanctuary-red-bg, rgba(255, 59, 48, 0.08))',
  redBorder:    'var(--sanctuary-red-bd, rgba(255, 59, 48, 0.22))',

  amber:        'var(--sanctuary-amber, #FF9500)',
  amberSoft:    'var(--sanctuary-amber-bg, rgba(255, 149, 0, 0.10))',
  amberBorder:  'var(--sanctuary-amber-bd, rgba(255, 149, 0, 0.24))',

  blue:         'var(--sanctuary-blue, #0071E3)',
  blueSoft:     'var(--sanctuary-blue-bg, rgba(0, 113, 227, 0.08))',
  blueBorder:   'var(--sanctuary-blue-bd, rgba(0, 113, 227, 0.20))',

  green:        'var(--sanctuary-green-ink, #248A3D)',
  greenSoft:    'var(--sanctuary-green-bg, rgba(52, 199, 89, 0.10))',
  greenBorder:  'var(--sanctuary-green-bd, rgba(52, 199, 89, 0.24))',

  darkAction:   'var(--sanctuary-ink-primary, #1D1D1F)',
  darkHover:    '#000000',

  font:         'var(--font-sanctuary, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif)',
  monoFont:     'var(--font-mono, "SF Mono", Menlo, Consolas, Monaco, monospace)',
};

/**
 * UnifiedFrictionModal
 * Центральний інтерфейс адаптивного тертя (Security Friction).
 * Втілює філософію кришталевої ясності та спокою Джоні Айва:
 * 1. Формула контрасту «Очікуваний намір проти Прихованої загрози» (XAI).
 * 2. Сенсорний жест усвідомленої згоди «Hold to Unlock (2с)» замість пасивних таймерів покарання.
 * 3. Ізольований швейцарський аналітичний зріз для експертів та дипломного захисту.
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
    const threatTitle = xai.intentVsReality?.threatName || xai.humanTitle;

    // Скляний Backdrop з м'яким матовим розмиттям
    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(0, 0, 0, 0.42) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: tsBackdrop 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const rememberCheckboxHtml = options.allowRememberDomain && options.domainToRemember ? `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${C.textSec}; margin-top: 14px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="ts-remember-domain" style="accent-color: ${C.darkAction}; width: 14px; height: 14px; cursor: pointer;">
        <span>Довіряти домену <strong style="color: ${C.text}; font-family: ${C.monoFont}; font-size: 11px;">${options.domainToRemember}</strong></span>
      </label>
    ` : '';

    const diagnosticsHtml = diagnostics.map((d) => `
      <div style="display: flex; flex-direction: column; gap: 4px; padding: 9px 12px; background: ${C.surface}; border: 1px solid ${C.border}; border-radius: 10px; font-size: 11.5px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <strong style="color: ${C.text}; font-weight: 600;">${d.title}</strong>
          <span style="font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 4px; ${
            d.badgeType === 'critical'
              ? `background: ${C.redSoft}; color: ${C.red}; border: 1px solid ${C.redBorder};`
              : d.badgeType === 'warning'
              ? `background: ${C.amberSoft}; color: ${C.amber}; border: 1px solid ${C.amberBorder};`
              : `background: ${C.blueSoft}; color: ${C.blue}; border: 1px solid ${C.blueBorder};`
          }">${d.badge}</span>
        </div>
        <div style="color: ${C.textSec}; line-height: 1.45;">${d.description}</div>
        ${d.evidence ? `<div style="font-family: ${C.monoFont}; font-size: 10.5px; color: ${C.textMuted}; background: ${C.surfaceSub}; padding: 3px 6px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.evidence}</div>` : ''}
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
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .ts-btn-primary {
          width: 100%;
          height: 42px;
          background: ${C.darkAction};
          color: #FFFFFF;
          border: none;
          border-radius: var(--radius-control, 10px);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 0.15s, transform 0.1s;
          font-family: ${C.font};
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .ts-btn-primary:hover {
          background: ${C.darkHover};
        }
        .ts-btn-primary:active {
          transform: scale(0.985);
        }
        .ts-btn-decoy {
          width: 100%;
          height: 40px;
          background: ${C.greenSoft};
          color: ${C.green};
          border: 1px solid ${C.greenBorder};
          border-radius: var(--radius-control, 10px);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: background 0.15s, transform 0.1s;
          margin-bottom: 10px;
          font-family: ${C.font};
        }
        .ts-btn-decoy:hover {
          background: #D1FAE5;
        }
        .ts-btn-decoy:active {
          transform: scale(0.985);
        }
        .ts-hold-btn {
          position: relative;
          width: 100%;
          height: 40px;
          background: rgba(118, 118, 128, 0.08);
          border: 1px solid ${C.border};
          border-radius: var(--radius-pill, 9999px);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
          outline: none;
          transition: border-color 0.2s var(--ease-apple-spring);
          font-family: ${C.font};
        }
        .ts-hold-btn:hover {
          border-color: ${C.textMuted};
        }
        .ts-hold-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: ${isCritical ? 'linear-gradient(90deg, rgba(255, 59, 48, 0.2) 0%, rgba(255, 59, 48, 0.4) 100%)' : 'linear-gradient(90deg, rgba(255, 149, 0, 0.2) 0%, rgba(255, 149, 0, 0.4) 100%)'};
          pointer-events: none;
          transition: width 0.05s linear;
        }
        .ts-hold-label {
          position: relative;
          z-index: 1;
          font-size: 12px;
          font-weight: 500;
          color: ${C.textSec};
          pointer-events: none;
          transition: color 0.15s;
        }
        .ts-hold-btn.holding .ts-hold-label {
          color: ${isCritical ? C.red : C.amber};
          font-weight: 600;
        }
        .ts-hold-btn.unlocked {
          border-color: ${C.green};
          background: ${C.greenSoft};
        }
        .ts-hold-btn.unlocked .ts-hold-label {
          color: ${C.green};
          font-weight: 600;
        }
        .ts-btn-inspect {
          background: transparent;
          border: none;
          color: ${C.textMuted};
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 6px;
          border-radius: 6px;
          transition: color 0.15s;
          font-family: ${C.font};
        }
        .ts-btn-inspect:hover {
          color: ${C.text};
        }
      </style>

      <div id="ts-modal-card" style="
        background: var(--sanctuary-surface, #FFFFFF);
        width: 100%;
        max-width: 440px;
        border-radius: var(--radius-modal, 22px);
        box-shadow: var(--shadow-modal, 0 24px 64px rgba(0, 0, 0, 0.16));
        border: 1px solid rgba(255, 255, 255, 0.7);
        overflow: hidden;
        font-family: ${C.font};
        animation: tsCardEnter 0.26s var(--ease-apple-spring);
        color: ${C.text};
        display: flex;
        flex-direction: column;
        padding: 28px 24px 20px;
        box-sizing: border-box;
      ">
        <!-- ICON -->
        <div style="
          width: 46px;
          height: 46px;
          border-radius: 14px;
          background: ${isCritical ? C.redSoft : C.amberSoft};
          border: 1px solid ${isCritical ? C.redBorder : C.amberBorder};
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
          color: ${isCritical ? C.red : C.amber};
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${isCritical
              ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
              : '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
          </svg>
        </div>

        <!-- TITLE -->
        <div style="
          font-size: 19px;
          font-weight: 600;
          color: ${C.text};
          text-align: center;
          letter-spacing: -0.02em;
          line-height: 1.3;
          margin-bottom: 6px;
        ">${threatTitle}</div>

        <!-- CONTEXT PILL -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11.5px;
          color: ${C.textMuted};
          margin-bottom: 18px;
        ">
          <span>${options.contextLabel}:</span>
          <span style="
            font-family: ${C.monoFont};
            font-weight: 600;
            color: ${C.textSec};
            background: ${C.surfaceSub};
            border: 1px solid ${C.border};
            padding: 2px 7px;
            border-radius: 6px;
            max-width: 220px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${options.contextValue}</span>
        </div>

        <!-- CONTRAST CAPSULE (Intent vs Reality) -->
        <div style="
          background: ${C.surfaceSub};
          border: 1px solid ${C.border};
          border-radius: 16px;
          padding: 13px 15px;
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <!-- User Intent -->
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; color: ${C.textMuted}; text-transform: uppercase;">Ваш очікуваний намір</span>
            <span style="font-size: 12.5px; font-weight: 500; color: ${C.text}; line-height: 1.4;">${userIntent}</span>
          </div>

          <!-- Divider -->
          <div style="display: flex; align-items: center; gap: 8px; margin: 1px 0;">
            <div style="flex: 1; height: 1px; background: ${C.border};"></div>
            <div style="color: ${isCritical ? C.red : C.amber}; display: flex; align-items: center; font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;">
              ПРИХОВАНА ЗАГРОЗА
            </div>
            <div style="flex: 1; height: 1px; background: ${C.border};"></div>
          </div>

          <!-- Hidden Reality -->
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 12.5px; font-weight: 500; color: ${C.text}; line-height: 1.4;">${hiddenReality}</span>
          </div>
        </div>

        <!-- REASSURING VERDICT -->
        <div style="
          font-size: 12.5px;
          line-height: 1.5;
          color: ${C.textSec};
          text-align: center;
          margin-bottom: 20px;
          padding: 0 4px;
        ">${verdict}</div>

        <!-- DECOY BUTTON (If available) -->
        ${options.vaultMatches && options.vaultMatches.some((m) => m.isDecoyAvailable) ? `
          <button id="ts-decoy-btn" class="ts-btn-decoy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            Підставити безпечні дані (Canary Decoy)
          </button>
        ` : ''}

        <!-- PRIMARY ACTION: Return to Safety -->
        <button id="ts-primary-btn" class="ts-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          ${primaryActionLabel}
        </button>

        <!-- SENSORY HOLD TO UNLOCK -->
        <div style="margin-top: 10px;">
          <div id="ts-hold-btn" class="ts-hold-btn" title="Затисніть ліву кнопку миші на 2 секунди для переходу">
            <div id="ts-hold-fill" class="ts-hold-fill"></div>
            <span id="ts-hold-label" class="ts-hold-label">Утримуйте 2с для переходу на власний ризик</span>
          </div>
        </div>

        <!-- FOOTER: Inspector Toggle -->
        <div style="display: flex; align-items: center; justify-content: center; margin-top: 14px;">
          <button id="ts-inspect-btn" class="ts-btn-inspect">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Аналітичний зріз
          </button>
        </div>

        <!-- INSPECTOR PANEL (Swiss-Watch diagnostic sheet) -->
        <div id="ts-inspector" style="
          display: none;
          background: ${C.surfaceSub};
          border: 1px solid ${C.border};
          border-radius: 14px;
          padding: 13px 14px;
          margin-top: 14px;
          animation: tsCardEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid ${C.border};">
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.textMuted};">Формула оцінки загрози</span>
            <span style="font-size: 11px; font-weight: 600; color: ${isCritical ? C.red : C.amber}; font-family: ${C.monoFont};">
              RiskScore: ${fallbackAssessment.score}/100
            </span>
          </div>

          <div style="font-size: 10.5px; font-family: ${C.monoFont}; color: ${C.textSec}; background: ${C.surface}; border: 1px solid ${C.border}; border-radius: 6px; padding: 6px 8px; margin-bottom: 10px;">
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

    // Element references
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
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Сховати аналітику'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Аналітичний зріз';
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

    // Primary action
    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnPrimary.addEventListener('click', handleCancel);
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) handleCancel();
    });

    // Hold-to-Unlock sensory mechanics (2 seconds duration with spring rebound)
    let holdProgress = 0;
    const HOLD_DURATION_MS = 2000;
    const HOLD_STEP_MS = 25;

    const startHold = () => {
      if (this.holdInterval) clearInterval(this.holdInterval);
      const startTime = Date.now();
      holdBtn.classList.add('holding');

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
        holdFill.style.width = '0%';
        holdLabel.textContent = 'Утримуйте 2с для переходу на власний ризик';
        holdBtn.classList.remove('holding');
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
