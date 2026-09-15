import { ThreatAssessment } from '../types';

export class SecurityFriction {
  /**
   * Застосування адаптивного тертя (Security Friction)
   */
  public static apply(form: HTMLFormElement, assessment: ThreatAssessment): void {
    const reasons = assessment.triggers.map((t) => `• ${t.message}`).join('\n');
    const warningMessage = `⚠️ [УВАГА: СИСТЕМА ЗАХИСТУ ВЕБЗАГРОЗ]\n\nРівень ризику: ${assessment.level} (${assessment.score}/100)\n\nВиявлені ознаки фішингу або соціальної інженерії:\n${reasons}\n\nДію заблоковано для запобігання втрати конфіденційних або платіжних даних!`;

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
}
