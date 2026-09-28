import { SensitiveAssetDetector, OutboundAssetDetectionResult } from './sensitive-asset-detector';
import { VaultScanner } from './vault-scanner';
import { VaultItem } from '../types/vault';

export interface RecordedOutboundMessage {
  text: string;
  timestamp: number;
  assets: OutboundAssetDetectionResult;
}

export interface SessionOutboundEvaluation {
  shouldBlock: boolean;
  reason?: string;
  riskLevel: 'SAFE' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  triggers: Array<{ message: string; severity: string; scoreContribution: number }>;
  leakage: {
    hasCard: boolean;
    hasCvv: boolean;
    hasExpiry: boolean;
    hasOtp: boolean;
    cards: string[];
    isCrossMessage: boolean;
  };
  vaultMatches: VaultItem[];
}

/**
 * Кумулятивна пам'ять вихідних повідомлень діалогу (Session Outbound Memory).
 * Відстежує історію розкриття реквізитів у поточному діалозі та виявляє
 * багатоходові схеми розкрадання даних (Cross-Message Credential Harvesting),
 * коли номер картки та CVV передаються окремими повідомленнями.
 */
export class SessionOutboundMemory {
  private static sentMessages: RecordedOutboundMessage[] = [];
  private static sentCardNumbers = new Set<string>();
  private static sentCvvNumbers = new Set<string>();
  private static sentExpiryDates = new Set<string>();
  private static sentOtpCodes = new Set<string>();
  private static sentVaultItemCategories = new Set<string>();
  private static sentVaultItemLabels = new Set<string>();

  /**
   * Скидання пам'яті сесії (при очищенні діалогу або зміні співрозмовника)
   */
  public static reset(): void {
    this.sentMessages = [];
    this.sentCardNumbers.clear();
    this.sentCvvNumbers.clear();
    this.sentExpiryDates.clear();
    this.sentOtpCodes.clear();
    this.sentVaultItemCategories.clear();
    this.sentVaultItemLabels.clear();
  }

  public static hasSentCard(): boolean {
    return this.sentCardNumbers.size > 0;
  }

  public static hasSentCvv(): boolean {
    return this.sentCvvNumbers.size > 0;
  }

  public static hasSentExpiry(): boolean {
    return this.sentExpiryDates.size > 0;
  }

  public static getSentCards(): string[] {
    return Array.from(this.sentCardNumbers);
  }

  public static getSentVaultLabels(): string[] {
    return Array.from(this.sentVaultItemLabels);
  }

  public static getSentMessagesCount(): number {
    return this.sentMessages.length;
  }

  /**
   * Фіксація факту відправки повідомлення у поточному діалозі
   */
  public static recordSentMessage(text: string): void {
    if (!text || text.trim().length === 0) return;

    const cards = SensitiveAssetDetector.extractCardNumbers(text);
    const hasCard = cards.length > 0;
    const hasCardContext = hasCard || this.hasSentCard();

    const cvvRes = SensitiveAssetDetector.detectCvv(text, hasCardContext);
    const expRes = SensitiveAssetDetector.detectExpirationDate(text, hasCardContext);
    const otpRes = SensitiveAssetDetector.detectOtp(text);
    const vaultScan = VaultScanner.scanTextSync(text);

    cards.forEach((c) => this.sentCardNumbers.add(c));
    if (cvvRes.detected && cvvRes.match) this.sentCvvNumbers.add(cvvRes.match);
    if (expRes.detected && expRes.match) this.sentExpiryDates.add(expRes.match);
    if (otpRes.detected && otpRes.match) this.sentOtpCodes.add(otpRes.match);

    vaultScan.matchedItems.forEach((item) => {
      this.sentVaultItemCategories.add(item.category);
      this.sentVaultItemLabels.add(item.label);
    });

    this.sentMessages.push({
      text,
      timestamp: Date.now(),
      assets: {
        hasCard,
        cards,
        hasCvv: cvvRes.detected,
        cvv: cvvRes.match,
        hasExpiry: expRes.detected,
        expiry: expRes.match,
        hasOtp: otpRes.detected,
        otp: otpRes.match,
        vaultMatches: vaultScan.matchedItems,
      },
    });

    if (this.sentMessages.length > 40) {
      this.sentMessages.shift();
    }
  }

  /**
   * Оцінка поточного тексту повідомлення з урахуванням історії сесії
   */
  public static evaluateWithHistory(currentDraft: string): SessionOutboundEvaluation {
    const trimmed = (currentDraft || '').trim();
    const cardsInDraft = SensitiveAssetDetector.extractCardNumbers(trimmed);
    const hasCardInDraft = cardsInDraft.length > 0;
    const hasCardInHistory = this.hasSentCard();
    const cardAvailable = hasCardInDraft || hasCardInHistory;

    // Детекція CVV з урахуванням наявності картки (в поточному драфті або в історії сесії)
    const cvvResult = SensitiveAssetDetector.detectCvv(trimmed, cardAvailable);
    const expiryResult = SensitiveAssetDetector.detectExpirationDate(trimmed, cardAvailable);
    const otpResult = SensitiveAssetDetector.detectOtp(trimmed);
    const vaultScan = VaultScanner.scanTextSync(trimmed);

    const hasCvvInDraft = cvvResult.detected;
    const hasCvvInHistory = this.hasSentCvv();
    const hasExpiryInDraft = expiryResult.detected;
    const hasExpiryInHistory = this.hasSentExpiry();
    const hasOtpInDraft = otpResult.detected;

    const allCards = Array.from(new Set([...cardsInDraft, ...this.sentCardNumbers]));
    const triggers: Array<{ message: string; severity: string; scoreContribution: number }> = [];
    let score = 0;
    let shouldBlock = false;
    let primaryReason = '';

    // ── СЦЕНАРІЙ 1: Повні платіжні реквізити (Номер картки + CVV) ─────────────
    // Або в одному повідомленні, або картка була раніше, а CVV зараз (чи навпаки)
    if ((hasCardInDraft && hasCvvInDraft) || (hasCardInHistory && hasCvvInDraft) || (hasCardInDraft && hasCvvInHistory)) {
      shouldBlock = true;
      score += 85;
      const isCross = (hasCardInHistory && hasCvvInDraft) || (hasCardInDraft && hasCvvInHistory);
      const detail = isCross
        ? 'У діалозі зафіксовано роздільну передачу платіжних реквізитів: номер картки та CVV-код відправляються різними повідомленнями! Разом це відкриває шахраям повний доступ до ваших коштів.'
        : 'У повідомленні виявлено повні платіжні реквізити (номер картки + секретний код CVV/CVC)! Для отримання коштів CVV-код ніколи не потрібен!';
      triggers.push({
        message: detail,
        severity: 'CRITICAL',
        scoreContribution: 85,
      });
      primaryReason = detail;
    } else if (hasCvvInDraft) {
      // Ізольований CVV код
      shouldBlock = true;
      score += 75;
      const detail = 'Виявлено секретний тризначний код безпеки картки (CVV/CVC). Для отримання переказу цей код ніколи не потрібен!';
      triggers.push({
        message: detail,
        severity: 'CRITICAL',
        scoreContribution: 75,
      });
      primaryReason = detail;
    }

    // ── СЦЕНАРІЙ 2: Номер картки + Термін дії (MM/YY) ─────────────────────────
    if ((hasCardInDraft && hasExpiryInDraft) || (hasCardInHistory && hasExpiryInDraft) || (hasCardInDraft && hasExpiryInHistory)) {
      shouldBlock = true;
      score += 65;
      const isCross = (hasCardInHistory && hasExpiryInDraft) || (hasCardInDraft && hasExpiryInHistory);
      const detail = isCross
        ? 'У діалозі виявлено роздільну передачу: номер картки та термін дії (MM/YY). У сукупності це створює критичний ризик несанкціонованого списання коштів!'
        : 'Виявлено термін дії банківської картки разом із номером картки. Це дозволяє здійснювати онлайн-транзакції!';
      triggers.push({
        message: detail,
        severity: 'HIGH',
        scoreContribution: 65,
      });
      if (!primaryReason) primaryReason = detail;
    }

    // ── СЦЕНАРІЙ 3: Одноразовий SMS-пароль (OTP) ──────────────────────────────
    if (hasOtpInDraft) {
      shouldBlock = true;
      score += 90;
      const detail = 'Виявлено передачу одноразового SMS-пароля підтвердження (OTP)! Справжні сервіси ніколи не запитують SMS-коди!';
      triggers.push({
        message: detail,
        severity: 'CRITICAL',
        scoreContribution: 90,
      });
      if (!primaryReason) primaryReason = detail;
    }

    // ── СЦЕНАРІЙ 4: Маркери Сховища (Vault Secrets) ──────────────────────────
    if (vaultScan.matchedItems.length > 0) {
      shouldBlock = true;
      score += 80;
      const labels = vaultScan.matchedItems.map((m) => m.label).join(', ');
      let detail = `Виявлено передачу конфіденційного маркера безпеки зі Сховища: ${labels}!`;
      if (this.sentVaultItemLabels.size > 0) {
        const prevLabels = Array.from(this.sentVaultItemLabels).join(', ');
        detail += ` (Раніше у цьому діалозі вже було передано: ${prevLabels}). Кумулятивний витік персональних секретів!`;
        score += 15;
      }
      triggers.push({
        message: detail,
        severity: 'CRITICAL',
        scoreContribution: 80,
      });
      if (!primaryReason) primaryReason = detail;
    }

    // ── СЦЕНАРІЙ 5: Безпечний P2P номер картки ────────────────────────────────
    if (hasCardInDraft && !shouldBlock) {
      score += 15;
      triggers.push({
        message: 'Номер банківської картки для P2P-переказу. CVV та термін дії відсутні (безпечно).',
        severity: 'LOW',
        scoreContribution: 15,
      });
    }

    const isCrossMessage =
      (hasCardInHistory && (hasCvvInDraft || hasExpiryInDraft)) ||
      (hasCardInDraft && (hasCvvInHistory || hasExpiryInHistory));

    const riskLevel: 'SAFE' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
      score >= 70 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'SAFE';

    return {
      shouldBlock,
      reason: primaryReason,
      riskLevel,
      score: Math.min(score, 100),
      triggers,
      leakage: {
        hasCard: cardAvailable,
        hasCvv: hasCvvInDraft || hasCvvInHistory,
        hasExpiry: hasExpiryInDraft || hasExpiryInHistory,
        hasOtp: hasOtpInDraft,
        cards: allCards,
        isCrossMessage,
      },
      vaultMatches: vaultScan.matchedItems,
    };
  }
}
