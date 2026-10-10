import { SensitiveAssetDetector } from '../heuristics/sensitive-asset-detector';
import { PersonalVaultManager } from '../core/personal-vault';
import { VaultItemCategory } from '../types/vault';

export interface SanitizedTokenRecord {
  placeholder: string;
  originalAssetType: string;
  category?: string;
  label?: string;
}

export interface SecurityTelemetryFlags {
  hasValidPaymentCard: boolean;
  cardBrand?: string;
  cardCount: number;
  hasCvv: boolean;
  hasCardExpiry: boolean;
  hasOtp: boolean;
  hasSeedPhrase?: boolean;
  hasPassword?: boolean;
  vaultMarkersDetected: Array<{
    category: VaultItemCategory | string;
    label: string;
    tier: string;
  }>;
  totalSensitiveAssetsRedacted: number;
}

export interface SanitizedPayload {
  sanitizedText: string;
  telemetry: SecurityTelemetryFlags;
  redactedTokens: SanitizedTokenRecord[];
  isFullyAnonymized: boolean;
}

export class OutboundDataSanitizer {
  /**
   * Визначає бренд платіжної картки за першими цифрами (BIN)
   */
  public static getCardBrand(digits: string): string {
    if (digits.startsWith('4')) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
    if (/^3[47]/.test(digits)) return 'American Express';
    if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
    if (/^(50|5[6-9]|6[0-9])/.test(digits)) return 'Maestro';
    return 'Payment Card';
  }

  /**
   * Головний метод деанонімізації та псевдонімізації тексту перед відправкою до LLM
   */
  public static sanitize(
    rawText: string,
    context?: { targetHost?: string; sourcePlatform?: string }
  ): SanitizedPayload {
    if (!rawText) {
      return {
        sanitizedText: '',
        telemetry: {
          hasValidPaymentCard: false,
          cardCount: 0,
          hasCvv: false,
          hasCardExpiry: false,
          hasOtp: false,
          vaultMarkersDetected: [],
          totalSensitiveAssetsRedacted: 0,
        },
        redactedTokens: [],
        isFullyAnonymized: true,
      };
    }

    let sanitizedText = rawText;
    const redactedTokens: SanitizedTokenRecord[] = [];
    const vaultMarkersDetected: Array<{ category: VaultItemCategory | string; label: string; tier: string }> = [];

    // ── 1. СХОВИЩЕ СЕКРЕТІВ (PERSONAL VAULT) ──────────────────────────────────
    // Спочатку замінюємо точні конфіденційні маркери (ІПН, дівоче прізвище, кодові слова)
    const vaultItems = PersonalVaultManager.getItemsSync();
    if (vaultItems && vaultItems.length > 0) {
      for (const item of vaultItems) {
        if (!item.realValue || item.realValue.trim().length < 2) continue;
        const realVal = item.realValue.trim();

        if (sanitizedText.includes(realVal)) {
          let placeholder = '[VERIFIED_VAULT_SECRET]';
          switch (item.category) {
            case 'TAX_ID':
              placeholder = '[VERIFIED_GOVERNMENT_TAX_ID]';
              break;
            case 'MOTHER_MAIDEN_NAME':
              placeholder = '[VERIFIED_MOTHER_MAIDEN_NAME]';
              break;
            case 'SECRET_WORD':
              placeholder = '[VERIFIED_BANK_SECRET_WORD]';
              break;
            case 'PASSPORT_ID':
              placeholder = '[VERIFIED_PASSPORT_ID]';
              break;
            case 'FINANCIAL_PHONE':
              placeholder = '[VERIFIED_FINANCIAL_PHONE]';
              break;
            case 'DATE_OF_BIRTH':
              placeholder = '[VERIFIED_DATE_OF_BIRTH]';
              break;
          }

          sanitizedText = sanitizedText.split(realVal).join(placeholder);

          redactedTokens.push({
            placeholder,
            originalAssetType: 'VAULT_SECRET',
            category: item.category,
            label: item.label,
          });

          vaultMarkersDetected.push({
            category: item.category,
            label: item.label,
            tier: PersonalVaultManager.getCategoryTier(item.category),
          });
        }
      }
    }

    // ── 2. НОМЕРИ БАНКІВСЬКИХ КАРТОК (PAN) ────────────────────────────────────
    const extractedCards = SensitiveAssetDetector.extractCardNumbers(sanitizedText);
    let cardCount = 0;
    let cardBrand: string | undefined;

    if (extractedCards.length > 0) {
      extractedCards.forEach((cardDigits, idx) => {
        cardCount++;
        if (!cardBrand) {
          cardBrand = this.getCardBrand(cardDigits);
        }

        const placeholder = `[VERIFIED_CARD_NUMBER_${idx + 1}]`;

        // Замінюємо різні формати написання тієї ж картки (з пробілами/дефісами)
        const digitsArray = cardDigits.split('');
        const flexRegexStr = digitsArray.join('[\\s-]*');
        const flexRegex = new RegExp(flexRegexStr, 'g');

        sanitizedText = sanitizedText.replace(flexRegex, placeholder);

        redactedTokens.push({
          placeholder,
          originalAssetType: 'PAYMENT_CARD',
          label: `${cardBrand} (закінчується на *${cardDigits.slice(-4)})`,
        });
      });
    }

    const hasCardContext = cardCount > 0;

    // ── 3. СЕКРЕТНИЙ КОД БЕЗПЕКИ КАРТКИ (CVV / CVC) ──────────────────────────
    let hasCvv = false;
    const cvvResult = SensitiveAssetDetector.detectCvv(sanitizedText, hasCardContext);

    if (cvvResult.detected && cvvResult.match) {
      hasCvv = true;
      const placeholder = '[VERIFIED_CVV_CODE]';
      const code = cvvResult.match;

      // Заміна CVV з прив'язкою до контекстного слова або окремого 3-значного числа
      const cvvRegexWithContext = new RegExp(`(cvv|cvc|cvv2|cvc2|код\\s*безпеки|код|три\\s*цифри)[\\s:=_-]{0,10}?(${code})`, 'gi');
      if (cvvRegexWithContext.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(cvvRegexWithContext, `$1: ${placeholder}`);
      } else {
        // Автономна заміна
        const standaloneCvv = new RegExp(`(^|[^\\d])${code}([^\\d]|$)`, 'g');
        sanitizedText = sanitizedText.replace(standaloneCvv, `$1${placeholder}$2`);
      }

      redactedTokens.push({
        placeholder,
        originalAssetType: 'CVV_CVC',
        label: 'Секретний тризначний код картки',
      });
    }

    // ── 4. ТЕРМІН ДІЇ КАРТКИ (EXPIRATION DATE) ────────────────────────────────
    let hasCardExpiry = false;
    const expiryResult = SensitiveAssetDetector.detectExpirationDate(sanitizedText, hasCardContext);

    if (expiryResult.detected && expiryResult.match) {
      hasCardExpiry = true;
      const placeholder = '[VERIFIED_EXPIRY_DATE]';
      sanitizedText = sanitizedText.replace(expiryResult.match, placeholder);

      redactedTokens.push({
        placeholder,
        originalAssetType: 'EXPIRY_DATE',
        label: 'Термін дії банківської картки',
      });
    }

    // ── 5. ОДНОРАЗОВИЙ ПАРОЛЬ ПІДТВЕРДЖЕННЯ (SMS OTP) ─────────────────────────
    let hasOtp = false;
    const otpResult = SensitiveAssetDetector.detectOtp(sanitizedText);

    if (otpResult.detected && otpResult.match) {
      hasOtp = true;
      const placeholder = '[VERIFIED_SMS_OTP_CODE]';
      sanitizedText = sanitizedText.replace(otpResult.match, placeholder);

      redactedTokens.push({
        placeholder,
        originalAssetType: 'SMS_OTP',
        label: 'Одноразовий SMS-пароль підтвердження',
      });
    }

    // ── 6. SEED-ФРАЗА ВІД КРИПТОГАМАНЦЯ ───────────────────────────────────────
    let hasSeedPhrase = false;
    const seedResult = SensitiveAssetDetector.detectSeedPhrase(sanitizedText);
    
    if (seedResult.detected && seedResult.match) {
      hasSeedPhrase = true;
      const placeholder = '[VERIFIED_CRYPTO_SEED_PHRASE]';
      sanitizedText = sanitizedText.replace(seedResult.match, placeholder);

      redactedTokens.push({
        placeholder,
        originalAssetType: 'SEED_PHRASE',
        label: 'Мнемонічна Seed-фраза від криптогаманця',
      });
    }

    // ── 7. ПАРОЛЬ ─────────────────────────────────────────────────────────────
    let hasPassword = false;
    const passwordResult = SensitiveAssetDetector.detectPassword(sanitizedText);

    if (passwordResult.detected && passwordResult.match) {
      hasPassword = true;
      const placeholder = '[VERIFIED_PASSWORD]';
      sanitizedText = sanitizedText.replace(passwordResult.match, placeholder);

      redactedTokens.push({
        placeholder,
        originalAssetType: 'PASSWORD',
        label: 'Пароль доступу',
      });
    }

    const totalSensitiveAssetsRedacted = redactedTokens.length;

    // Перевірка цілісності: чи залишився будь-який сирий номер картки
    const remainingCards = SensitiveAssetDetector.extractCardNumbers(sanitizedText);
    const isFullyAnonymized = remainingCards.length === 0;

    return {
      sanitizedText,
      telemetry: {
        hasValidPaymentCard: hasCardContext,
        cardBrand,
        cardCount,
        hasCvv,
        hasCardExpiry,
        hasOtp,
        hasSeedPhrase,
        hasPassword,
        vaultMarkersDetected,
        totalSensitiveAssetsRedacted,
      },
      redactedTokens,
      isFullyAnonymized,
    };
  }

  /**
   * Формує кінцевий безпечний промпт для хмарної LLM, що містить
   * очищений текст та структуровані прапорці верифікації
   */
  public static buildCloudPrompt(
    payload: SanitizedPayload,
    context?: {
      sourcePlatform?: string;
      targetHost?: string;
      scenarioRule?: string;
      intentType?: string;
      dialogueHistory?: string;
      detectedKeywords?: string[];
      suspiciousUrls?: string[];
      raisedFlags?: string[];
      offPlatformLure?: boolean;
    }
  ): string {
    const { telemetry, sanitizedText } = payload;

    const flags: string[] = [];
    if (telemetry.hasValidPaymentCard) {
      flags.push(`- Genuine Payment Card: PRESENT (${telemetry.cardBrand || 'Card'}, Passed Luhn verification, Count: ${telemetry.cardCount})`);
    } else {
      flags.push('- Genuine Payment Card: ABSENT');
    }

    if (telemetry.hasCvv) {
      flags.push('- Genuine Security Code (CVV/CVC): PRESENT (Locally verified as an authorization secret)');
    }

    if (telemetry.hasCardExpiry) {
      flags.push('- Genuine Card Expiration: PRESENT');
    }

    if (telemetry.hasOtp) {
      flags.push('- Genuine One-Time SMS Code (OTP): PRESENT (Bank transaction approval token)');
    }

    if (telemetry.hasSeedPhrase) {
      flags.push('- Genuine Cryptocurrency Seed Phrase: PRESENT (Critical wallet access secret)');
    }

    if (telemetry.hasPassword) {
      flags.push('- Plaintext Password/Secret: PRESENT');
    }

    if (telemetry.vaultMarkersDetected.length > 0) {
      const labels = telemetry.vaultMarkersDetected.map((m) => `${m.label} [${m.category}]`).join(', ');
      flags.push(`- Encrypted Personal Vault Markers: PRESENT (${labels})`);
    }

    const threatDetails: string[] = [];
    if (context?.intentType && context.intentType !== 'UNKNOWN') {
      threatDetails.push(`• Detected Threat Intent: ${context.intentType}`);
    }
    if (context?.detectedKeywords && context.detectedKeywords.length > 0) {
      threatDetails.push(`• Suspicious Trigger Keywords: ${context.detectedKeywords.map((k) => `"${k}"`).join(', ')}`);
    }
    if (context?.suspiciousUrls && context.suspiciousUrls.length > 0) {
      threatDetails.push(`• Suspicious Links/URLs: ${context.suspiciousUrls.join(', ')}`);
    }
    if (context?.offPlatformLure) {
      threatDetails.push('• Off-Platform Redirection: TRUE (Attempt to lure user away to external messenger)');
    }
    if (context?.raisedFlags && context.raisedFlags.length > 0) {
      threatDetails.push(`• Heuristic Warnings:\n  ${context.raisedFlags.map((f) => `- ${f}`).join('\n  ')}`);
    }
    if (context?.targetHost) {
      threatDetails.push(`- Route: ${context?.sourcePlatform || 'internal'} -> ${context.targetHost}`);
    } else if (context?.sourcePlatform) {
      threatDetails.push(`- Source Platform: ${context.sourcePlatform}`);
    }

    const dialogueSection = context?.dialogueHistory && context.dialogueHistory.trim().length > 0
      ? `=== FULL CHAT DIALOGUE HISTORY ===
"""
${context.dialogueHistory.trim()}
"""`
      : '';

    return `Threat Analysis Task for External AI Arbiter:
Analyze the interaction below to determine whether THE CURRENT USER ([Ви]) is being targeted by an active social engineering attack, phishing trap, or payment fraud.

PRIMARY OBJECTIVE:
You are a Personal Cyber Defense Arbiter for THE USER ([Ви]).
Your task is NOT simply to detect whether phishing keywords, scam scripts, or fraudulent terminology exist in the text in the abstract.
Your task is strictly: IS THE CURRENT USER ([Ви]) PERSONALLY AT RISK OF BEING MANIPULATED, DEFRAUDED, OR DECEIVED AS A VICTIM IN THIS INTERACTION?

=== DETECTED HEURISTIC THREAT FLAGS & TELEMETRY ===
${threatDetails.length > 0 ? threatDetails.join('\n') + '\n\n' : ''}Security Telemetry & Verified Asset Flags:
${flags.join('\n')}

${context?.scenarioRule ? `Evaluation Rules:\n${context.scenarioRule}\n` : ''}
${dialogueSection ? `${dialogueSection}\n\n` : ''}=== TRIGGER / LATEST MESSAGE UNDER AUDIT ===
"""
${sanitizedText}
"""

CRITICAL EVALUATION RULES:
1. VICTIM-CENTRIC ASSESSMENT (Is [Ви] being attacked?):
   - ACTIVE ATTACK TARGETING [Ви] (isScam: true):
     The interlocutor is actively trying to manipulate, deceive, or exploit [Ви] as a victim:
     * Posing as an interested buyer who "already paid" and sending an external link or bot for [Ви] to "receive money" or "confirm delivery" (Escrow / Delivery Scam).
     * Asking [Ви] directly to provide credit card numbers, CVV/CVC, expiration dates, or bank SMS verification codes (Credential Theft).
     * Impersonating platform administration or technical support demanding that [Ви] verify their account, unblock their profile, or confirm credentials via an external link or bot (Verification Phishing).
     * Urging [Ви] into another platform/messenger under false pretenses to carry out a scam against [Ви].

   - NOT AN ATTACK AGAINST [Ви] / SAFE CONTEXT (isScam: false):
     [Ви] is NOT the victim being defrauded:
     * META-DISCUSSION & TEMPLATE SHARING: The interlocutor is sharing a scam script, citing a phishing template ("пишеш повідомлення по типу...", "ось який текст треба надсилати"), discussing fraudulent schemes ("як заробити на олх", "тєма мутна"), or warning [Ви] about scams. Even if the text quotes a fake bot (e.g. t.me/*bot) or delivery scam message as an example or instruction, [Ви] is NOT the target victim being deceived into surrendering credentials or funds. Therefore, there is NO social engineering threat to [Ви].
     * NORMAL INTERACTION: Legitimate conversation between buyer and seller (asking about item condition, bargaining, arranging in-person meetings, official on-platform cash on delivery or standard delivery without external fake links, friendly chit-chat).

2. VERDICT REQUIREMENTS:
   - "isScam": true ONLY if [Ви] is the intended victim being deceived or defrauded in this chat.
   - "isScam": false if [Ви] is NOT the target victim (including benign chat, bargaining, quoting/discussing scam methods, or sharing scam templates without targeting [Ви]).
   - "confidence": number (0-100).
   - "scamType": string (must be one of: PAYMENT_CREDENTIAL_THEFT, IDENTITY_PROBING, ESCROW_DELIVERY_SCAM, OFF_PLATFORM_REDIRECT, VERIFICATION_PHISHING, URGENCY_PRESSURE, MILITARY_SABOTAGE_RECRUITMENT, CRYPTO_WALLET_COMPROMISE, SUSPICIOUS_LURE, or UNKNOWN).
   - "reasoning": string in Ukrainian (max 35 words), explaining concisely why [Ви] is or is not at risk.

Respond ONLY with valid JSON with keys: "isScam" (boolean), "confidence" (number 0-100), "scamType" (string), "reasoning" (string in Ukrainian).`;
  }
}
