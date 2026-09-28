import { FormAnalysisPipeline, FormAnalysisResult } from '../detectors/form-analysis-pipeline';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { FormSensitiveState } from '../heuristics/input-detector';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { isWhitelisted } from '../core/whitelist';
import { UserWhitelistManager } from '../core/user-whitelist';
import { SecurityFriction } from '../ui/friction';
import { ToastNotifier } from '../ui/toast-notifier';
import { DebuggerOverlay } from '../ui/debugger-overlay';

export interface FormSubmitInterceptorOptions {
  pipeline: FormAnalysisPipeline;
  getCurrentHost: () => string;
  getActiveContext: () => ActiveThreatContext | null;
  getDebugMode: () => boolean;
}

export class FormSubmitInterceptor {
  private static options: FormSubmitInterceptorOptions | null = null;
  private static clickListener: ((e: MouseEvent) => void) | null = null;
  private static keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private static submitListener: ((e: SubmitEvent) => void) | null = null;
  private static inputListener: ((e: Event) => void) | null = null;
  private static realtimeDebounceTimer: any = null;
  private static lastReportedScore: number | null = null;
  private static lastReportedTriggers: string = '';

  public static init(options: FormSubmitInterceptorOptions): void {
    this.options = options;
    this.setupListeners();
  }

  public static isFormWhitelisted(form: HTMLFormElement | null, currentHost: string): boolean {
    if (!form) return false;
    const rawAction = form.getAttribute('action') || form.action;
    let targetHost = currentHost;
    try {
      if (rawAction && rawAction !== '#' && !rawAction.startsWith('javascript:')) {
        targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
      }
    } catch {}
    return (
      isAccreditedPaymentGateway(targetHost) ||
      UserWhitelistManager.isDomainAllowedSync(targetHost) ||
      UserWhitelistManager.isDomainAllowedSync(currentHost) ||
      isWhitelisted(targetHost) ||
      isWhitelisted(currentHost)
    );
  }

  public static shouldBlock(
    assessment: ThreatAssessment,
    formState: FormSensitiveState,
    targetHost: string,
    currentHost?: string
  ): boolean {
    // 1. Повністю порожня форма не містить жодних даних для витоку — блокування скасовується
    if (formState.isEntirelyEmpty) return false;

    if (UserWhitelistManager.isDomainAllowedSync(targetHost)) return false;
    if (currentHost && UserWhitelistManager.isDomainAllowedSync(currentHost)) return false;
    if (isAccreditedPaymentGateway(targetHost)) return false;
    if (isWhitelisted(targetHost)) return false;
    if (currentHost && isWhitelisted(currentHost)) return false;

    // Блокуємо якщо CRITICAL або HIGH при заповнених чутливих даних
    return assessment.level === 'CRITICAL' || (assessment.level === 'HIGH' && formState.hasFilledAnySensitive);
  }

  public static resetAuditState(): void {
    this.lastReportedScore = null;
    this.lastReportedTriggers = '';
  }

  public static handleFormAnalysis(form: HTMLFormElement, isRealtime: boolean = false): FormAnalysisResult {
    const { pipeline, getCurrentHost, getActiveContext, getDebugMode } = this.options!;
    const currentHost = getCurrentHost();
    const activeContext = getActiveContext();
    const result = pipeline.analyze(form, currentHost, activeContext);

    if (getDebugMode()) {
      const prevReportedScore = this.lastReportedScore;
      const currentScore = result.assessment.score;
      const peakBefore = DebuggerOverlay.getPeakScore();

      // 1. Оновлюємо кругову шкалу та бейдж Швейцарської Лупи миттєво в реальному часі!
      DebuggerOverlay.setAssessment(currentScore, result.assessment.level);

      const triggersKey = result.assessment.triggers.map((t) => t.name).sort().join(',');
      const hasChanged = this.lastReportedScore !== currentScore || this.lastReportedTriggers !== triggersKey;

      // 2. До журналу подій (Events Log) додаємо запис при сабміті або коли рівень/тригери суттєво змінилися
      if (!isRealtime || hasChanged) {
        this.lastReportedScore = currentScore;
        this.lastReportedTriggers = triggersKey;

        const liveTag = isRealtime ? ' (Live)' : '';
        if (currentScore === 0 && (peakBefore >= 35 || (prevReportedScore !== null && prevReportedScore >= 35))) {
          DebuggerOverlay.log(
            `Форма: Введення Скасовано${liveTag}`,
            `Користувач вилучив конфіденційні дані або очистив форму. Безпосередній витік відвернено (Чернетка: 0 балів, Сесійний пік: ${DebuggerOverlay.getPeakScore()} балів)`,
            '#22C55E'
          );
          DebuggerOverlay.log(`Форма: Спрацьовані Тригери${liveTag}`, 'Чутливі тригери нейтралізовано', '#22C55E');
        } else {
          DebuggerOverlay.log(
            `Форма: Оцінка Ризику${liveTag}`,
            `${currentScore} балів (Рівень: ${result.assessment.level})`,
            currentScore >= 50 ? '#EF4444' : currentScore >= 20 ? '#F59E0B' : '#22C55E'
          );
          if (result.assessment.triggers.length > 0) {
            DebuggerOverlay.log(
              `Форма: Спрацьовані Тригери${liveTag}`,
              result.assessment.triggers.map((t) => `${t.name} (+${t.scoreContribution})`),
              '#F59E0B'
            );
          } else {
            DebuggerOverlay.log(`Форма: Спрацьовані Тригери${liveTag}`, 'Немає тригерів', '#22C55E');
          }
        }
      }
    }

    return result;
  }

  public static auditForm(form: HTMLFormElement, isRealtime: boolean = true): FormAnalysisResult | null {
    if (!this.options) return null;
    return this.handleFormAnalysis(form, isRealtime);
  }

  private static setupListeners(): void {
    if (typeof document === 'undefined') return;

    // Реактивний моніторинг введення у формах (Live Loupe Telemetry та Proactive Warnings)
    this.inputListener = (event: Event) => {
      if (!this.options) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const form = target.closest('form');
      if (!form) return;

      if (this.realtimeDebounceTimer) {
        clearTimeout(this.realtimeDebounceTimer);
      }
      this.realtimeDebounceTimer = setTimeout(() => {
        if (!this.options) return;
        const result = this.handleFormAnalysis(form, true);

        // Проактивне застереження при одночасному введенні номера картки та CVV на сторонніх ресурсах
        const currentHost = this.options.getCurrentHost();
        if (
          !this.isFormWhitelisted(form, currentHost) &&
          result.formState.hasFilledCard &&
          result.formState.hasFilledCvv
        ) {
          const now = Date.now();
          const lastWarn = parseInt(form.dataset?.threatShieldLastCardCvvWarn || '0', 10);
          if (now - lastWarn > 8000) {
            form.dataset.threatShieldLastCardCvvWarn = now.toString();
            ToastNotifier.show(
              '⚠️ Увага! У формі зафіксовано введення номера картки та CVV-коду. Для отримання коштів CVV-код ніколи не потрібен! Переконайтеся в надійності сайту.',
              'error',
              10000
            );
          }
        }
      }, 150);
    };

    this.clickListener = (event: MouseEvent) => {
      if (!this.options) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const submitBtn = target.closest(
        'button[type="submit"], input[type="submit"], [role="button"], button'
      ) as HTMLElement | null;

      if (submitBtn) {
        const form = submitBtn.closest('form');
        if (form) {
          const currentHost = this.options.getCurrentHost();
          if (this.isFormWhitelisted(form, currentHost)) return;
          if (form.dataset.threatShieldApproved === 'true') return;

          const { assessment, formState, targetHost } = this.handleFormAnalysis(form);
          if (this.shouldBlock(assessment, formState, targetHost, currentHost)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            SecurityFriction.apply(form, assessment, submitBtn, undefined, this.options.getActiveContext());
          }
        }
      }
    };

    this.keydownListener = (event: KeyboardEvent) => {
      if (!this.options) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('role') === 'textbox') {
          const form = target.closest('form');
          if (form) {
            const currentHost = this.options.getCurrentHost();
            if (this.isFormWhitelisted(form, currentHost)) return;
            if (form.dataset.threatShieldApproved === 'true') return;

            const { assessment, formState, targetHost } = this.handleFormAnalysis(form);
            if (this.shouldBlock(assessment, formState, targetHost, currentHost)) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              SecurityFriction.apply(form, assessment, undefined, undefined, this.options.getActiveContext());
            }
          }
        }
      }
    };

    this.submitListener = (event: SubmitEvent) => {
      if (!this.options) return;
      const form = event.target as HTMLFormElement | null;
      if (!form || !(form instanceof HTMLFormElement)) return;

      const currentHost = this.options.getCurrentHost();
      if (this.isFormWhitelisted(form, currentHost)) return;
      if (form.dataset.threatShieldApproved === 'true') return;

      const { assessment, formState, targetHost } = this.handleFormAnalysis(form);
      if (this.shouldBlock(assessment, formState, targetHost, currentHost)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        SecurityFriction.apply(form, assessment, undefined, undefined, this.options.getActiveContext());
      }
    };

    document.addEventListener('input', this.inputListener, true);
    document.addEventListener('change', this.inputListener, true);
    document.addEventListener('click', this.clickListener, true);
    document.addEventListener('keydown', this.keydownListener, true);
    document.addEventListener('submit', this.submitListener, true);
  }

  public static destroy(): void {
    this.resetAuditState();
    if (typeof document !== 'undefined') {
      if (this.inputListener) {
        document.removeEventListener('input', this.inputListener, true);
        document.removeEventListener('change', this.inputListener, true);
        this.inputListener = null;
      }
      if (this.clickListener) document.removeEventListener('click', this.clickListener, true);
      if (this.keydownListener) document.removeEventListener('keydown', this.keydownListener, true);
      if (this.submitListener) document.removeEventListener('submit', this.submitListener, true);
    }
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
      this.realtimeDebounceTimer = null;
    }
    this.options = null;
  }
}
