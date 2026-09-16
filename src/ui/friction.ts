import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';

export class SecurityFriction {
  /**
   * Застосування адаптивного тертя (Security Friction) через центроване універсальне модальне вікно
   */
  public static apply(
    form: HTMLFormElement,
    assessment: ThreatAssessment,
    anchorElement?: HTMLElement,
    onProceedCallback?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    let targetHost = window.location.hostname;
    const rawAction = form.getAttribute('action') || form.action;
    try {
      if (rawAction) {
        targetHost = new URL(rawAction, window.location.href).hostname;
      }
    } catch {}

    const detectedAmount = XaiEngine.extractFinancialAmount(form);
    const vaultScan = VaultScanner.scanFormSync(form, targetHost);

    // Чистий Дзен + Ізольований Shadow DOM: жодного втручання в інлайн-стилі форми
    UnifiedFrictionModal.show({
      type: 'form',
      title: 'Призупинено відправку форми',
      badgeText: `РІВЕНЬ РИЗИКУ: ${assessment.level} (${assessment.score}/100)`,
      badgeLevel: assessment.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      contextLabel: 'Цільовий сервер',
      contextValue: targetHost,
      triggers: assessment.triggers,
      assessment,
      activeContext,
      detectedAmount,
      vaultMatches: vaultScan.matches,
      allowRememberDomain: true,
      domainToRemember: targetHost,
      onProceed: () => {
        console.log('[ThreatShield] Користувач усвідомлено розблокував відправку форми');
        form.dataset.threatShieldApproved = 'true';

        if (onProceedCallback) {
          onProceedCallback();
        } else {
          // Повторне легітимне відправлення форми
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        }
      },
      onCancel: () => {
        console.log('[ThreatShield] Користувач скасував відправку підозрілої форми');
      },
    });
  }

  /**
   * Застосування тертя при спробі надіслати карткові дані в чаті
   */
  public static applyToChat(
    chatInput: HTMLInputElement | HTMLTextAreaElement,
    leakage: { hasCard: boolean; hasCvv: boolean; cards: string[] },
    onProceed: () => void,
    onCancel?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    const currentPlatform = window.location.hostname || 'Відкритий чат маркетплейсу';
    const detectedAmount = XaiEngine.extractFinancialAmount(chatInput);
    const vaultScan = VaultScanner.scanTextSync(chatInput.value || '');

    const triggers: Array<{ message: string; severity: string }> = [];
    if (leakage.hasCard) {
      triggers.push({
        message: 'У тексті повідомлення виявлено номер банківської картки (Luhn валідація)',
        severity: 'CRITICAL',
      });
    }
    if (leakage.hasCvv) {
      triggers.push({
        message: 'Виявлено секретний тризначний код безпеки картки (CVV/CVC)',
        severity: 'CRITICAL',
      });
    }
    if (vaultScan.triggers.length > 0) {
      triggers.push(...vaultScan.triggers);
    }

    UnifiedFrictionModal.show({
      type: 'chat',
      title: 'Призупинено надсилання в чаті',
      badgeText: 'ВИТІК ПЛАТІЖНИХ ДАНИХ (CRITICAL)',
      badgeLevel: 'CRITICAL',
      contextLabel: 'Платформа діалогу',
      contextValue: currentPlatform,
      triggers,
      activeContext,
      detectedAmount,
      vaultItems: vaultScan.matchedItems,
      chatLeakage: { hasCard: leakage.hasCard, hasCvv: leakage.hasCvv },
      allowRememberDomain: false,
      onProceed: () => {
        console.log('[ThreatShield] Користувач свідомо розблокував відправку повідомлення в чаті');
        chatInput.dataset.threatShieldApproved = 'true';
        onProceed();
      },
      onCancel: () => {
        console.log('[ThreatShield] Користувач скасував відправку повідомлення в чаті');
        if (onCancel) onCancel();
      },
    });
  }

  /**
   * Повідомлення про зшивання сесій (Floating Dynamic Island / Capsule у стилі Apple)
   */
  public static showContextWarningBanner(context: ActiveThreatContext, customSubtitle?: string): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.style.cssText = `
      position: fixed !important;
      top: 14px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #E5E7EB !important;
      box-shadow: 0 4px 14px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06) !important;
      border-radius: 9999px !important;
      padding: 7px 14px 7px 10px !important;
      z-index: 2147483646 !important;
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      animation: tsCapsuleDrop 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
      user-select: none !important;
    `;

    const subtitle = customSubtitle || 'Посилений моніторинг форм';

    banner.innerHTML = `
      <style>
        @keyframes tsCapsuleDrop {
          from { opacity: 0; transform: translate(-50%, -14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      </style>

      <div style="
        width: 22px; height: 22px; border-radius: 50%;
        background: #FFFBEB; border: 1px solid #FDE68A;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>

      <div style="font-size: 12.5px; color: #1A1A1A; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
        <strong style="font-weight: 600; color: #1A1A1A;">${context.sourcePlatform}</strong>
        <span style="color: #D1D5DB;">·</span>
        <span style="color: #D97706; font-weight: 500;">${subtitle}</span>
      </div>

      <button id="threat-shield-close-banner" type="button" title="Закрити" style="
        width: 18px; height: 18px; border-radius: 50%; border: none;
        background: #F3F4F6; color: #9CA3AF; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; line-height: 1; padding: 0; margin-left: 2px;
        transition: background 0.12s, color 0.12s; flex-shrink: 0;
      ">✕</button>
    `;

    ShadowHost.append(banner);
    banner.querySelector('#threat-shield-close-banner')?.addEventListener('click', () => {
      ShadowHost.remove(banner);
    });
  }

  /**
   * Примусове видалення банера контексту з Shadow DOM (наприклад, при скиданні Tainted Context)
   */
  public static removeContextWarningBanner(): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }
}

