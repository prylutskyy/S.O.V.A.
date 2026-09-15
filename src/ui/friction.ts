import { ActiveThreatContext, ThreatAssessment } from '../types';
import { PopoverUI } from './popover-ui';

export class SecurityFriction {
  /**
   * Застосування адаптивного тертя (Security Friction) через спливаюче вікно над кнопкою (Hover / Popover)
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

    // Шукаємо кнопку, до якої прив'язати спливаюче вікно
    const targetAnchor =
      anchorElement ||
      form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], button') ||
      form;

    // Виклик спливаючого вікна безпосередньо над кнопкою
    PopoverUI.showButtonPopover({
      anchorElement: targetAnchor,
      assessment,
      targetHost,
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
        console.log('[ThreatShield] Користувач закрив спливаюче вікно безпеки');
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
      background: linear-gradient(90deg, #b91c1c, #ea580c) !important;
      color: white !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      padding: 10px 16px !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important;
      z-index: 2147483646 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
    `;

    const keywords = context.detectedKeywords.join(', ');
    const elapsedMin = Math.round((Date.now() - context.timestamp) / 60000);

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🛡️</span>
        <span>
          <strong>Adaptive Threat Shield [Зшивання сесії]:</strong> 
          Сайт відкрито під час активного вікна загрози (${elapsedMin} хв тому на <em>${context.sourcePlatform}</em> зафіксовано: <u>${keywords}</u>).
        </span>
      </div>
      <button id="threat-shield-close-banner" style="
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">✕</button>
    `;

    document.body.prepend(banner);
    document.getElementById('threat-shield-close-banner')?.addEventListener('click', () => {
      banner.remove();
    });
  }
}
