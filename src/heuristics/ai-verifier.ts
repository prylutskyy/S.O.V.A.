import { IAIProvider, AIValidationResult } from './ai-provider.interface';
import { ScamIntentType } from './intent-classifier';

export class AILureVerifier {
  constructor(private aiProvider: IAIProvider) {}

  /**
   * Словник контексту для різних типів загроз
   */
  private static intentContextRules: Record<ScamIntentType, string> = {
    ESCROW_DELIVERY_SCAM: 'Look for attempts to fake a marketplace delivery (like OLX Delivery) where the sender asks the receiver to click a link to receive funds or confirm an order. Real buyers do not send links to receive money.',
    OFF_PLATFORM_REDIRECT: 'Look for attempts to force the conversation off the current platform (e.g., asking to switch to Telegram, Viber, WhatsApp) immediately after initiating contact.',
    VERIFICATION_PHISHING: 'Look for fake tech support or platform admins asking to verify an account by providing personal data or clicking a link.',
    PAYMENT_CREDENTIAL_THEFT: 'Look for direct requests for sensitive banking information like CVV codes, expiration dates, SMS codes, or current balance.',
    URGENCY_PRESSURE: 'Look for manipulative psychological pressure (e.g., "do this now or your account will be blocked", "the payment will be canceled in 5 minutes").'
  };

  /**
   * Викликає AI для верифікації наміру (Рівень 2).
   * Повертає результат, або null якщо AI недоступний.
   */
  public async verifyIntent(text: string, detectedType: ScamIntentType, triggerWord?: string): Promise<AIValidationResult | null> {
    const isAvailable = await this.aiProvider.isAvailable();
    if (!isAvailable) {
      console.log('[ThreatShield:AIVerifier] Нейромережа недоступна, пропускаємо рівень 2.');
      return null;
    }

    const rules = AILureVerifier.intentContextRules[detectedType] || 'Analyze for general social engineering.';
    console.log(`[ThreatShield:AIVerifier] Запуск перевірки Рівня 2 (Gemini Nano) для типу: ${detectedType}`);
    
    return this.aiProvider.verifyIntent(text, rules, triggerWord);
  }
}
