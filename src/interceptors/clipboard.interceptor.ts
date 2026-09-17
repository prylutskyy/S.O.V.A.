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
      const selection = window.getSelection()?.toString().trim();
      if (!selection) return;

      const scan = IntentClassifier.classify(selection);
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
        const isOffPlatformLure = scan.clustersDetected.includes('off_platform');
        this.options.onLureDetected(
          (scan.suspiciousUrls && scan.suspiciousUrls[0]) || selection,
          scan.matchedSpans.map((s) => s.text),
          isOffPlatformLure,
          isOffPlatformLure
            ? 'Виявлено спробу переходу в сторонній месенджер'
            : 'У скопійованому тексті виявлено підозріле посилання',
          selection,
          scan.intentType,
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
