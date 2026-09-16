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

    const detectedAmount = XaiEngine.extractFinancialAmount(form) || undefined;
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
    const detectedAmount = XaiEngine.extractFinancialAmount(chatInput) || undefined;
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
  public static showContextWarningBanner(context: ActiveThreatContext, customSubtitle?: string, rawTextToScan?: string, intentType?: string, onClose?: () => void, confidence?: number): void {
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
      border-radius: 12px !important;
      padding: 12px 14px 12px 14px !important;
      z-index: 2147483646 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 9px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      animation: tsCapsuleDrop 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const subtitle = customSubtitle || 'Посилений моніторинг форм';
    const isHardLock = confidence && confidence >= 50;

    banner.innerHTML = `
      <style>
        @keyframes tsCapsuleDrop {
          from { opacity: 0; transform: translate(-50%, -14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes tsSpin { 100% { transform: rotate(360deg); } }
        .ts-spinner { animation: tsSpin 1s linear infinite; }
      </style>

      <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
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

        <div style="font-size: 12.5px; color: #1A1A1A; display: flex; flex-direction: column; gap: 2px;">
          <strong style="font-weight: 600; color: #1A1A1A;">${context.sourcePlatform}</strong>
          <span style="color: #D97706; font-weight: 500;">${subtitle}</span>
          ${isHardLock ? '<span style="color:#DC2626; font-size: 11px;">(Блокування вводу)</span>' : ''}
        </div>

        <button id="threat-shield-close-banner" type="button" title="Закрити" ${isHardLock ? 'disabled' : ''} style="
          width: ${isHardLock ? '24px' : '18px'}; height: ${isHardLock ? '24px' : '18px'}; border-radius: 50%; border: none;
          background: #F3F4F6; color: #9CA3AF; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: ${isHardLock ? '11px' : '10px'}; line-height: 1; padding: 0; margin-left: auto;
          transition: opacity 0.2s;
          ${isHardLock ? 'opacity: 0.5; cursor: not-allowed;' : ''}
        ">
          ${isHardLock ? '10s' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
        </button>
      </div>

      <button id="ts-ask-ai-banner-btn" style="background:#E0E7FF;color:#4338CA;border:1px solid #C7D2FE;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.2s;width:100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Сумніваєтесь? Запитати ШІ
      </button>
      <div id="ts-ai-banner-result" style="display:none;font-size:12px;padding:8px;border-radius:6px;width:100%;box-sizing:border-box;"></div>
    `;

    ShadowHost.append(banner);

    const btnAi = banner.querySelector('#ts-ask-ai-banner-btn') as HTMLButtonElement;
    const resultDiv = banner.querySelector('#ts-ai-banner-result') as HTMLElement;
    const closeBtn = banner.querySelector('#threat-shield-close-banner') as HTMLButtonElement;

    if (isHardLock) {
      let timeLeft = 10;
      const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
          closeBtn.innerText = `${timeLeft}s`;
        } else {
          clearInterval(interval);
          closeBtn.disabled = false;
          closeBtn.style.opacity = '1';
          closeBtn.style.cursor = 'pointer';
          closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }
      }, 1000);
    }

    closeBtn.addEventListener('click', () => {
      ShadowHost.remove(banner);
      if (onClose) onClose();
    });

    btnAi.addEventListener('click', () => {
      btnAi.disabled = true;
      btnAi.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ts-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ШІ аналізує... (до 30с)';
      btnAi.style.opacity = '0.7';

      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'AI_VERIFY', payload: { text: rawTextToScan || context.targetSuspiciousUrl || '', intentType: intentType || 'UNKNOWN' } }, (response) => {
            const aiResult = response?.aiResult;
            resultDiv.style.display = 'block';
            if (!aiResult) {
              resultDiv.style.background = '#FEF2F2';
              resultDiv.style.color = '#DC2626';
              resultDiv.innerHTML = `Помилка: ШІ недоступний`;
            } else if (aiResult.isScam) {
              resultDiv.style.background = '#FEF2F2';
              resultDiv.style.color = '#DC2626';
              resultDiv.innerHTML = `<b>ШІ підтвердив:</b> ${aiResult.reasoning}`;
            } else {
              resultDiv.style.background = '#F0FDF4';
              resultDiv.style.color = '#166534';
              resultDiv.innerHTML = `<b>ШІ відхилив:</b> ${aiResult.reasoning}`;
              // If AI says it's safe, auto-close the banner and unlock
              setTimeout(() => {
                ShadowHost.remove(banner);
                if (onClose) onClose();
              }, 3000);
            }
            btnAi.style.display = 'none';
          });
        }
      } catch (e) {
        console.error(e);
      }
    });

    // Don't auto-close if it's a Hard Lock. The user must manually close it.
    if (!isHardLock) {
      setTimeout(() => {
        if (root.contains(banner) && btnAi.style.display !== 'none' && !btnAi.disabled) {
          ShadowHost.remove(banner);
          if (onClose) onClose();
        }
      }, 10000);
    }
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

