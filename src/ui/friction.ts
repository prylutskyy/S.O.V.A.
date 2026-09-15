import { ActiveThreatContext, ThreatAssessment } from '../types';

export class SecurityFriction {
  /**
   * Застосування адаптивного тертя (Security Friction)
   */
  public static apply(form: HTMLFormElement, assessment: ThreatAssessment): void {
    const reasons = assessment.triggers.map((t) => `• ${t.message}`).join('\n');
    const contextNote = assessment.contextActive
      ? '\n⚠️ УВАГА: Враховано контекст попереднього спілкування (спроба виведення з маркетплейсу/чату)!'
      : '';

    const warningMessage = `⚠️ [УВАГА: СИСТЕМА ЗАХИСТУ ВЕБЗАГРОЗ]\n\nРівень ризику: ${assessment.level} (${assessment.score}/100)${contextNote}\n\nВиявлені ознаки фішингу або соціальної інженерії:\n${reasons}\n\nДію заблоковано для запобігання втрати конфіденційних або платіжних даних!`;

    // Візуальне маркування форми
    if (assessment.level === 'CRITICAL') {
      form.style.outline = '4px solid #ef4444';
      form.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
      form.style.transition = 'all 0.3s ease';
    } else if (assessment.level === 'HIGH') {
      form.style.outline = '3px dashed #f59e0b';
      form.style.backgroundColor = 'rgba(245, 158, 11, 0.05)';
    }

    // Тимчасове блокування кнопки сабміту (Security Friction)
    const submitBtn = form.querySelector<HTMLButtonElement | HTMLInputElement>(
      'button[type="submit"], input[type="submit"]'
    );

    if (submitBtn) {
      const originalText = submitBtn instanceof HTMLInputElement ? submitBtn.value : submitBtn.innerText;
      const originalDisabled = submitBtn.disabled;

      submitBtn.disabled = true;
      if (submitBtn instanceof HTMLInputElement) {
        submitBtn.value = `⛔ Блоковано (${assessment.score}%)`;
      } else {
        submitBtn.innerText = `⛔ Блоковано (${assessment.score}%)`;
      }

      // Дозволити повторну спробу через 5 секунд (тертя безпеки)
      setTimeout(() => {
        submitBtn.disabled = originalDisabled;
        if (submitBtn instanceof HTMLInputElement) {
          submitBtn.value = originalText;
        } else {
          submitBtn.innerText = originalText;
        }
      }, 5000);
    }

    // Сповіщення користувача
    alert(warningMessage);
  }

  /**
   * Виведення індикаторного банера про зшиту сесію (Tainted Context Window)
   */
  public static showContextWarningBanner(context: ActiveThreatContext): void {
    const existing = document.getElementById('threat-shield-context-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      background: linear-gradient(90deg, #b91c1c, #ea580c);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      padding: 10px 16px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
    `;

    const keywords = context.detectedKeywords.join(', ');
    const elapsedMin = Math.round((Date.now() - context.timestamp) / 60000);

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🛡️</span>
        <span>
          <strong>Adaptive Threat Shield [Зшивання сесії]:</strong> 
          Цей сайт відкрито у вікні підозрілого контексту (${elapsedMin} хв тому на платформі <em>${context.sourcePlatform}</em> зафіксовано маніпулятивні маркери: <u>${keywords}</u>).
          Базовий ризик форми підвищено!
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
      ">Зрозуміло</button>
    `;

    document.body.prepend(banner);

    document.getElementById('threat-shield-close-banner')?.addEventListener('click', () => {
      banner.remove();
    });
  }
}
