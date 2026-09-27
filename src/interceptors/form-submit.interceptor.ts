import { FormAnalysisPipeline, FormAnalysisResult } from '../detectors/form-analysis-pipeline';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { FormSensitiveState } from '../heuristics/input-detector';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { isWhitelisted } from '../core/whitelist';
import { UserWhitelistManager } from '../core/user-whitelist';
import { SecurityFriction } from '../ui/friction';
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
    if (UserWhitelistManager.isDomainAllowedSync(targetHost)) return false;
    if (currentHost && UserWhitelistManager.isDomainAllowedSync(currentHost)) return false;
    if (isAccreditedPaymentGateway(targetHost)) return false;
    if (isWhitelisted(targetHost)) return false;
    if (currentHost && isWhitelisted(currentHost)) return false;

    // Блокуємо якщо CRITICAL або HIGH при заповнених чутливих даних
    return assessment.level === 'CRITICAL' || (assessment.level === 'HIGH' && formState.hasFilledAnySensitive);
  }

  private static handleFormAnalysis(form: HTMLFormElement): FormAnalysisResult {
    const { pipeline, getCurrentHost, getActiveContext, getDebugMode } = this.options!;
    const currentHost = getCurrentHost();
    const activeContext = getActiveContext();
    const result = pipeline.analyze(form, currentHost, activeContext);

    if (getDebugMode()) {
      DebuggerOverlay.log(
        'Форма: Оцінка Ризику',
        `${result.assessment.score} балів (Рівень: ${result.assessment.level})`,
        result.assessment.score >= 50 ? '#EF4444' : '#F59E0B'
      );
      if (result.assessment.triggers.length > 0) {
        DebuggerOverlay.log(
          'Форма: Спрацьовані Тригери',
          result.assessment.triggers.map((t) => `${t.name} (+${t.scoreContribution})`),
          '#F59E0B'
        );
      } else {
        DebuggerOverlay.log('Форма: Спрацьовані Тригери', 'Немає тригерів', '#22C55E');
      }
    }

    return result;
  }

  private static setupListeners(): void {
    if (typeof document === 'undefined') return;

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

    document.addEventListener('click', this.clickListener, true);
    document.addEventListener('keydown', this.keydownListener, true);
    document.addEventListener('submit', this.submitListener, true);
  }

  public static destroy(): void {
    if (typeof document !== 'undefined') {
      if (this.clickListener) document.removeEventListener('click', this.clickListener, true);
      if (this.keydownListener) document.removeEventListener('keydown', this.keydownListener, true);
      if (this.submitListener) document.removeEventListener('submit', this.submitListener, true);
    }
    this.options = null;
  }
}
