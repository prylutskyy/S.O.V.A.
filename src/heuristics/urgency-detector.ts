import { HeuristicResult } from '../types';

/**
 * Регулярні вирази для пошуку часових маркерів зворотного відліку
 * Наприклад: 04:59, 14:30, 00:45, "4 хв 59 сек", "05:00"
 */
const TIMER_REGEX = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
const TEXT_TIME_REGEX = /\b\d+\s*(?:сек(?:унд)?|хв(?:илин)?|sec(?:ond)?s?|min(?:ute)?s?)\b/i;

/**
 * Регулярні вирази для виявлення психологічного тиску та штучної терміновості (Dark Patterns / Urgency Scarcity)
 */
const URGENCY_PATTERNS = [
  { regex: /(кошти|гроші)\s+(будуть\s+)?повернут[іи]\s+(відправнику|покупцю)/i, tag: 'погроза_повернення_коштів' },
  { regex: /(замовлення|угод[ау]|виплат[ау]|резерв)\s+(буде\s+)?(анульован|скасован)/i, tag: 'погроза_анулювання' },
  { regex: /(термін\s+дії|час\s+на\s+підтвердження)\s+(спливає|закінчується|вийшов)/i, tag: 'спливання_терміну' },
  { regex: /(залишилось|залишилося|діє\s+лише|дійсн[ао]\s+протягом)\s+(\d+|\w+)/i, tag: 'обмежений_час' },
  { regex: /(негайно|терміново)\s+(підтвердіть|введіть|заповніть|завершіть)/i, tag: 'заклик_до_поспіху' },
  { regex: /(до\s+скасування|до\s+анулювання|до\s+блокування)\s+залишилось/i, tag: 'залякування_скасуванням' },
  { regex: /(order|payment|payout)\s+(will\s+be\s+cancelled|expires\s+in|expires\s+soon)/i, tag: 'en_urgency_pressure' },
  { regex: /(time\s+remaining|hurry\s+up|limited\s+time\s+only)/i, tag: 'en_time_scarcity' },
];

export interface UrgencyScanResult {
  hasCountdownTimer: boolean;
  timerText?: string;
  matchedTags: string[];
  snippet?: string;
}

export class UrgencyDetector {
  /**
   * Синхронний пошук маніпуляцій терміновістю та фіктивних таймерів
   */
  public static scanUrgencySync(form: HTMLFormElement): HeuristicResult[] {
    const results: HeuristicResult[] = [];
    const scan = this.analyzeFormAndSurroundings(form);

    if (scan.hasCountdownTimer || scan.matchedTags.length > 0) {
      const details: Record<string, unknown> = {
        hasCountdownTimer: scan.hasCountdownTimer,
        timerText: scan.timerText,
        matchedTags: scan.matchedTags,
        snippet: scan.snippet,
      };

      let message = 'Виявлено ознаки штучного нагнітання терміновості (Dark Patterns): ';
      const reasons: string[] = [];

      if (scan.hasCountdownTimer) {
        reasons.push(`таймер зворотного відліку («${scan.timerText}»)`);
      }
      if (scan.matchedTags.length > 0) {
        reasons.push(`психологічний пресинг обмеженого часу (${scan.matchedTags.join(', ')})`);
      }
      message += reasons.join(' та ') + ' для примушення до необачного рішення.';

      results.push({
        name: 'urgency_scarcity_manipulation',
        triggered: true,
        severity: 'MEDIUM',
        scoreContribution: 20,
        message,
        details,
      });
    }

    return results;
  }

  /**
   * Аналіз форми та її найближчого оточення у DOM
   */
  private static analyzeFormAndSurroundings(form: HTMLFormElement): UrgencyScanResult {
    // Шукаємо контекст форми: форма, її картка, або секція сторінки
    const scopeContainer =
      form.closest('.reddit-post, .card, .checkout-container, .order-box, form, section, main, body') || form;

    let hasCountdownTimer = false;
    let timerText: string | undefined = undefined;
    const matchedTags: string[] = [];
    let snippet: string | undefined = undefined;

    // 1. Пошук спеціальних таймер-елементів (за класами, id або тегами)
    const timerCandidates = scopeContainer.querySelectorAll<HTMLElement>(
      '[class*="timer" i], [class*="countdown" i], [class*="counter" i], [class*="clock" i], [class*="expire" i], ' +
      '[id*="timer" i], [id*="countdown" i], [id*="counter" i], [id*="clock" i], [id*="expire" i]'
    );

    for (const el of timerCandidates) {
      const text = el.innerText?.trim() || el.textContent?.trim() || '';
      if (TIMER_REGEX.test(text) || TEXT_TIME_REGEX.test(text)) {
        hasCountdownTimer = true;
        const match = text.match(TIMER_REGEX) || text.match(TEXT_TIME_REGEX);
        timerText = match ? match[0] : text.slice(0, 20);
        snippet = text.slice(0, 100);
        break;
      }
    }

    // 2. Якщо таймер не знайдено за селектором, шукаємо в усьому тексті контейнера форми
    const fullText = (scopeContainer.textContent || '').replace(/\s+/g, ' ');

    if (!hasCountdownTimer) {
      // Шукаємо часовий патерн типу 04:59 поблизу слів "залишилось", "скасування", "таймер"
      const proximityMatch = fullText.match(
        /(?:залишилось|час|таймер|термін|скасуванн[яі]|expires?|time)\D{0,40}(\d{1,2}:\d{2})/i
      );
      if (proximityMatch && proximityMatch[1]) {
        hasCountdownTimer = true;
        timerText = proximityMatch[1];
        snippet = proximityMatch[0];
      }
    }

    // 3. Лінгвістичний аналіз психологічного тиску
    for (const { regex, tag } of URGENCY_PATTERNS) {
      if (regex.test(fullText)) {
        matchedTags.push(tag);
        if (!snippet) {
          const m = fullText.match(regex);
          if (m) snippet = m[0];
        }
      }
    }

    return {
      hasCountdownTimer,
      timerText,
      matchedTags: [...new Set(matchedTags)],
      snippet,
    };
  }
}
