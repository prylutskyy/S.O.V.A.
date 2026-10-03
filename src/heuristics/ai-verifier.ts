import { IAIProvider, AIValidationResult, AIHeuristicContext } from './ai-provider.interface';
import { ScamIntentType } from './intent-classifier';

export class AILureVerifier {
  constructor(private aiProvider: IAIProvider) {}

  /**
   * Context rules dictionary for threat types (optimized in English for Gemini Nano)
   */
  public static intentContextRules: Record<ScamIntentType, string> = {
    ESCROW_DELIVERY_SCAM: 'Check for fake marketplace escrow or delivery lures (e.g. OLX Delivery) where the sender tells the recipient to follow a link to receive funds. Legitimate buyers never send links to receive money.',
    OFF_PLATFORM_REDIRECT: 'Check for attempts to redirect the user to external messengers (Telegram, Viber, WhatsApp) immediately after initiating contact.',
    VERIFICATION_PHISHING: 'Check for fake platform support or administration asking to verify an account or payment card via links.',
    PAYMENT_CREDENTIAL_THEFT: 'Check for explicit or implicit requests for sensitive payment data: CVV/CVC codes, card expiration date, SMS one-time codes, or balance.',
    IDENTITY_PROBING: 'Check for attempts to elicit personal identity markers or bank security recovery answers: Tax ID / INN, mother\'s maiden name, bank secret codeword, or passport ID. Legitimate parties never request these in a marketplace chat.',
    URGENCY_PRESSURE: 'Check for manipulative urgency or pressure (e.g., "act now or account will be blocked", "funds will cancel in 5 minutes").',
    MILITARY_SABOTAGE_RECRUITMENT: 'Check for attempts to recruit users to commit sabotage against critical infrastructure (railways, transformers, arsons) or requests for military locations/air defense coordinates.',
    CRYPTO_WALLET_COMPROMISE: 'Check for attempts to steal cryptocurrency seed phrases (12/24 words), private keys, or wallet authorization passwords.'
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
      console.log('[SOVA:AIVerifier] Нейромережа недоступна, пропускаємо рівень 2.');
      return null;
    }

    const rules = AILureVerifier.intentContextRules[detectedType] || 'Analyze for social engineering, phishing, and payment credential theft.';
    console.log(`[SOVA:AIVerifier] Запуск перевірки Рівня 2 (LLM) для типу: ${detectedType}`);
    
    return this.aiProvider.verifyIntent(text, rules, triggerWord, heuristicContext);
  }
}

