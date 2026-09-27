import { IntentClassifier } from '../heuristics/intent-classifier';
import { DebuggerOverlay } from '../ui/debugger-overlay';

export interface ClipboardInterceptorOptions {
  getDebugMode: () => boolean;
  onLureDetected: (
    suspiciousUrl: string,
    keywords: string[],
    isOffPlatformLure: boolean,
    bannerSubtitle: string,
    rawTextToScan: string,
    intentType: string,
    confidence: number
  ) => void;
}

/**
 * ClipboardInterceptor з інтелектом самоімунітету (Self-Immunity)
 * Запобігає хибним спрацьовуванням при копіюванні тексту з самого розширення
 * та гарантує чесність детекції: перевіряє реальну наявність посилання.
 */
export class ClipboardInterceptor {
  private static options: ClipboardInterceptorOptions | null = null;
  private static copyListener: (() => void) | null = null;

  public static init(options: ClipboardInterceptorOptions): void {
    this.options = options;
    this.setupListener();
  }

  private static setupListener(): void {
    if (typeof document === 'undefined') return;

    this.copyListener = () => {
      if (!this.options) return;
      const sel = window.getSelection();
      if (!sel) return;
      const selection = sel.toString().trim();
      if (!selection) return;

      // ── 1. САМОІМУНІТЕТ ДО ВЛАСНОГО ІНТЕРФЕЙСУ (SHADOW DOM & TOASTS) ──
      // Якщо виділений текст походить з елементів розширення, блокуємо обробку
      const anchorNode = sel.anchorNode;
      if (anchorNode) {
        const parentElem = anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
        if (
          parentElem?.closest('#threat-shield-shadow-host') ||
          parentElem?.closest('.sanctuary-toast-capsule') ||
          parentElem?.closest('.sanctuary-focus-capsule') ||
          parentElem?.closest('.ts-unified-modal') ||
          parentElem?.closest('#threat-shield-unified-modal')
        ) {
          return;
        }
      }

      // Перевірка на характерні системні маркери сповіщень розширення
      const lower = selection.toLowerCase();
      const SYSTEM_SELF_MARKERS = [
        'сховище рекомендує',
        'зафіксовано введення',
        'конфіденційного маркера',
        'персональний ідентифікатор',
        'безпечне маскувальне',
        'маскувальні дані',
        'sanctuary',
        'threat shield',
        'personal vault',
        'надійно захищено',
        'дію підтверджено',
      ];
      if (SYSTEM_SELF_MARKERS.some((marker) => lower.includes(marker))) {
        return; // Захист від самоатаки на власні цитати розширення
      }

      // ── 2. ЧЕСНІСТЬ ДЕТЕКЦІЇ: ПЕРЕВІРКА НАЯВНОСТІ РЕАЛЬНОГО URL ──
      // Буфер обміну цікавить нас виключно як вектор Phishing Lure (перехід за фішинговим посиланням)
      const URL_REGEX = /https?:\/\/[^\s]+|(?:[a-zA-Z0-9-]+\.)+(?:com|ua|org|net|xyz|top|site|cc|info|biz|ru|su|fun|online|shop|live|store)(?:\/[^\s]*)?/i;
      const urlMatch = selection.match(URL_REGEX);
      const extractedUrl = urlMatch ? urlMatch[0] : null;

      const scan = IntentClassifier.classify(selection);
      const isOffPlatformLure = scan.clustersDetected.includes('off_platform');

      // Якщо в скопійованому тексті немає жодного URL і це не примусовий перехід у месенджер
      if (!extractedUrl && !isOffPlatformLure) {
        return; // Звичайний фрагмент тексту без лінка не є lure-атакою!
      }

      const debugMode = this.options.getDebugMode();

      if (debugMode) {
        DebuggerOverlay.log('Буфер Обміну (Copy)', selection, '#9CA3AF');
        if (scan.clustersDetected.length > 0) {
          DebuggerOverlay.log('Копіювання: Кластери', scan.clustersDetected, '#EAB308');
        }
        if (scan.matchedSpans && scan.matchedSpans.length > 0) {
          DebuggerOverlay.log(
            'Копіювання: Тригерні Слова',
            scan.matchedSpans.map((s) => s.text),
            '#F59E0B'
          );
        }
        if (scan.hasFormedIntent) {
          DebuggerOverlay.log('Копіювання: Класифікація', scan.intentType, '#EF4444');
        } else {
          DebuggerOverlay.log('Копіювання: Класифікація', 'Безпечно', '#22C55E');
        }
      }

      if (scan.hasFormedIntent) {
        const suspiciousUrl = extractedUrl || (scan.suspiciousUrls && scan.suspiciousUrls[0]) || '';
        this.options.onLureDetected(
          suspiciousUrl,
          scan.matchedSpans.map((s) => s.text),
          isOffPlatformLure,
          isOffPlatformLure
            ? 'У скопійованому тексті виявлено спробу переходу в сторонній месенджер'
            : `У скопійованому тексті виявлено підозріле посилання: ${suspiciousUrl}`,
          selection,
          scan.intentType || 'UNKNOWN',
          scan.confidence || 75
        );
      }
    };

    document.addEventListener('copy', this.copyListener);
  }

  public static destroy(): void {
    if (typeof document !== 'undefined' && this.copyListener) {
      document.removeEventListener('copy', this.copyListener);
    }
    this.options = null;
  }
}
