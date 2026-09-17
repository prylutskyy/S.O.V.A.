import { IAIProvider, AIValidationResult, AIHeuristicContext } from './ai-provider.interface';
import { ScamIntentType } from './intent-classifier';

export class AILureVerifier {
  constructor(private aiProvider: IAIProvider) {}

  /**
   * Словник контексту для різних типів загроз (українською мовою для Gemini Nano)
   */
  public static intentContextRules: Record<ScamIntentType, string> = {
    ESCROW_DELIVERY_SCAM: 'Шукати спроби підробити доставку маркетплейсу (OLX Delivery), де відправник просить перейти за посиланням для отримання коштів. Справжні покупці не надсилають посилань для отримання грошей.',
    OFF_PLATFORM_REDIRECT: 'Шукати спроби перевести розмову з поточної платформи (Telegram, Viber, WhatsApp) одразу після початку контакту.',
    VERIFICATION_PHISHING: 'Шукати підробних тех-підтримок або адміністраторів платформи, що просять верифікувати акаунт через персональні дані або посилання.',
    PAYMENT_CREDENTIAL_THEFT: 'Шукати прямі запити чутливих банківських даних: CVV-коди, терміни дії, SMS-коди, поточний баланс.',
    URGENCY_PRESSURE: 'Шукати маніпулятивний психологічний тиск ("зробіть це зараз або аккаунт заблокують", "оплата скасується через 5 хвилин").'
  };

  /**
   * Викликає AI для верифікації наміру (Рівень 2).
   * Повертає результат, або null якщо AI недоступний.
   */
  public async verifyIntent(
    text: string,
    detectedType: ScamIntentType,
    triggerWord?: string,
    heuristicContext?: AIHeuristicContext
  ): Promise<AIValidationResult | null> {
    const isAvailable = await this.aiProvider.isAvailable();
    if (!isAvailable) {
      console.log('[ThreatShield:AIVerifier] Нейромережа недоступна, пропускаємо рівень 2.');
      return null;
    }

    const rules = AILureVerifier.intentContextRules[detectedType] || 'Загальний аналіз на соціальну інженерію та фішинг.';
    console.log(`[ThreatShield:AIVerifier] Запуск перевірки Рівня 2 (Gemini Nano) для типу: ${detectedType}`);
    
    return this.aiProvider.verifyIntent(text, rules, triggerWord, heuristicContext);
  }
}
