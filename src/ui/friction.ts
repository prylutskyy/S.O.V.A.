import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';

export class SecurityFriction {
  /**
   * Застосування адаптивного тертя (Security Friction) через центроване універсальне модальне вікно
   */
  public static apply(
    form: HTMLFormElement,
    assessment: ThreatAssessment,
    anchorElement?: HTMLElement,
    onProceedCallback?: () => void
  ): void {
    let targetHost = window.location.hostname;
    const rawAction = form.getAttribute('action') || form.action;
    try {
      if (rawAction) {
        targetHost = new URL(rawAction, window.location.href).hostname;
      }
    } catch {}

    // Візуальне маркування форми
    if (assessment.level === 'CRITICAL') {
      form.style.outline = '3px solid #ef4444';
      form.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
      form.style.transition = 'all 0.3s ease';
    } else if (assessment.level === 'HIGH') {
      form.style.outline = '2px dashed #f59e0b';
      form.style.backgroundColor = 'rgba(245, 158, 11, 0.04)';
    }

    // Виклик універсального центрованого модального вікна
    UnifiedFrictionModal.show({
      type: 'form',
      title: 'Призупинено відправку форми',
      badgeText: `РІВЕНЬ РИЗИКУ: ${assessment.level} (${assessment.score}/100)`,
      contextLabel: 'Цільовий сервер',
      contextValue: targetHost,
      triggers: assessment.triggers,
      explanation: '💡 Цей ресурс не є офіційним акредитованим платіжним еквайрингом (LiqPay, Stripe, Portmone). Передача реквізитів банківської картки чи паролів стороннім серверам загрожує несанкціонованим списанням коштів!',
      allowRememberDomain: true,
      domainToRemember: targetHost,
      onProceed: () => {
        console.log('[ThreatShield] Користувач усвідомлено розблокував відправку форми');
        form.dataset.threatShieldApproved = 'true';
        form.style.outline = '2px solid #22c55e';

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
    onCancel?: () => void
  ): void {
    const currentPlatform = window.location.hostname || 'Відкритий чат маркетплейсу';

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

    UnifiedFrictionModal.show({
      type: 'chat',
      title: 'Призупинено надсилання в чаті',
      badgeText: 'ВИТІК ПЛАТІЖНИХ ДАНИХ (CRITICAL)',
      contextLabel: 'Платформа діалогу',
      contextValue: currentPlatform,
      triggers,
      explanation: '💡 Порада кібербезпеки: Для отримання оплати іншій стороні ніколи не потрібні CVV або термін дії вашої картки (достатньо лише номера IBAN або 16 цифр). Повна передача реквізитів у незахищеному чаті призводить до крадіжки грошей!',
      allowRememberDomain: false,
      onProceed: () => {
        console.log('[ThreatShield] Користувач свідомо розблокував відправку повідомлення в чаті');
        chatInput.dataset.threatShieldApproved = 'true';
        chatInput.style.outline = '2px solid #22c55e';
        onProceed();
      },
      onCancel: () => {
        console.log('[ThreatShield] Користувач скасував відправку повідомлення в чаті');
        if (onCancel) onCancel();
      },
    });
  }

  /**
   * Виведення верхнього попереджувального банера про активне вікно підозри
   */
  public static showContextWarningBanner(context: ActiveThreatContext): void {
    const existing = document.getElementById('threat-shield-context-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 38px !important;
      background: #0f172a !important;
      color: #e2e8f0 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      padding: 0 16px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      z-index: 2147483646 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
      animation: threatBannerSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    `;

    const keywords = context.detectedKeywords.join(', ');
    const elapsedMin = Math.round((Date.now() - context.timestamp) / 60000);

    banner.innerHTML = `
      <style>
        @keyframes threatBannerSlide {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      </style>
      <div style="display: flex; align-items: center; gap: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">
          <span>●</span> Зшивання сесій
        </span>
        <span style="color: #cbd5e1; font-size: 12px;">
          Сайт відкрито у 15-хв. вікні загрози (${elapsedMin} хв тому на <strong>${context.sourcePlatform}</strong> зафіксовано: <span style="color: #f87171;">${keywords}</span>). Базовий ризик форми підвищено.
        </span>
      </div>
      <button id="threat-shield-close-banner" type="button" title="Зрозуміло" style="
        background: rgba(255,255,255,0.08);
        border: none;
        color: #94a3b8;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        transition: background 0.15s, color 0.15s;
        flex-shrink: 0;
      ">✕</button>
    `;

    document.body.prepend(banner);
    document.getElementById('threat-shield-close-banner')?.addEventListener('click', () => {
      banner.remove();
    });
  }
}
