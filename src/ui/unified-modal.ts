import { ActiveThreatContext, ThreatAssessment } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { ShadowHost } from './shadow-host';
import { AILureVerifier } from '../heuristics/ai-verifier';
import { ScamIntentType } from '../heuristics/intent-classifier';
import { DebuggerOverlay } from './debugger-overlay';

export interface UnifiedModalOptions {
  type: 'form' | 'chat';
  title: string;
  badgeText: string;
  badgeLevel?: 'CRITICAL' | 'HIGH';
  contextLabel: string;
  contextValue: string;
  triggers: Array<{ message: string; severity?: string }>;
  explanation?: string;
  allowRememberDomain?: boolean;
  domainToRemember?: string;
  assessment?: ThreatAssessment;
  activeContext?: ActiveThreatContext | null;
  chatLeakage?: { hasCard: boolean; hasCvv: boolean };
  detectedAmount?: string;
  vaultMatches?: VaultMatchResult[];
  vaultItems?: VaultItem[];
  rawTextToScan?: string;
  formDetails?: string;
  intentType?: string;
  onProceed: (rememberDomain: boolean) => void;
  onCancel: () => void;
}

interface CarouselSlide {
  badge: string;
  badgeType: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  evidence?: string;
}

// Claude design language tokens
const C = {
  text:        '#1A1A1A',
  textSec:     '#6B7280',
  textMuted:   '#9CA3AF',
  surface:     '#FFFFFF',
  canvas:      '#F9F9F8',
  border:      '#E5E7EB',
  borderStr:   '#D1D5DB',
  red:         '#DC2626',
  redBg:       '#FEF2F2',
  redBd:       '#FECACA',
  amber:       '#D97706',
  amberBg:     '#FFFBEB',
  amberBd:     '#FDE68A',
  green:       '#16A34A',
  greenBg:     '#F0FDF4',
  greenBd:     '#BBF7D0',
  blue:        '#1D4ED8',
  blueBg:      '#EFF6FF',
  blueBd:      '#BFDBFE',
  font:        `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
};

export class UnifiedFrictionModal {
  private static activeModal: HTMLElement | null = null;
  private static countdownInterval: number | null = null;
  private static keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private static previousBodyOverflow: string | null = null;
  private static previousHtmlOverflow: string | null = null;

  public static async show(options: UnifiedModalOptions): Promise<void> {
    this.close();

    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const modalRoot = document.createElement('div');
    modalRoot.id = 'threat-shield-unified-modal';

    const fallbackAssessment: ThreatAssessment = options.assessment || {
      score: options.badgeLevel === 'CRITICAL' ? 95 : 65,
      level: options.badgeLevel || 'CRITICAL',
      triggers: options.triggers.map((t) => ({
        name: 'generic_trigger',
        triggered: true,
        severity: (t.severity as any) || 'CRITICAL',
        scoreContribution: 35,
        message: t.message,
      })),
      timestamp: Date.now(),
    };

    const vaultItems = options.vaultItems || options.vaultMatches?.map((m) => m.matchedItem);

    const xai = await XaiEngine.generateExplanation({
      type: options.type,
      targetHost: options.contextValue,
      activeContext: options.activeContext,
      assessment: fallbackAssessment,
      chatLeakage: options.chatLeakage,
      detectedAmount: options.detectedAmount,
      vaultItems,
    });

    const primaryActionLabel = options.type === 'chat' ? 'Скасувати надсилання' : 'Повернутися до безпеки';
    const slides = this.buildCarouselSlides(options, xai);

    const getBadgeStyle = (type: 'critical' | 'warning' | 'info') => {
      if (type === 'critical') return `background:${C.redBg};color:${C.red};border:1px solid ${C.redBd};`;
      if (type === 'warning')  return `background:${C.amberBg};color:${C.amber};border:1px solid ${C.amberBd};`;
      return `background:${C.blueBg};color:${C.blue};border:1px solid ${C.blueBd};`;
    };

    const slidesHtml = slides.map((slide) => `
      <div class="ts-slide" style="flex:0 0 100%;width:100%;box-sizing:border-box;display:flex;flex-direction:column;padding:2px;">
        <span style="display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:2px 8px;border-radius:5px;margin-bottom:8px;${getBadgeStyle(slide.badgeType)}">${slide.badge}</span>
        <div style="font-size:14px;font-weight:600;color:${C.text};line-height:1.35;margin-bottom:6px;">${slide.title}</div>
        <div style="font-size:13px;line-height:1.5;color:${C.textSec};margin-bottom:${slide.evidence ? '8px' : '2px'};">${slide.description}</div>
        ${slide.evidence ? `<div style="background:${C.canvas};border:1px solid ${C.border};border-radius:6px;padding:6px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:${C.textSec};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${slide.evidence}</div>` : ''}
      </div>
    `).join('');

    const dotsHtml = slides.map((_, idx) => `
      <button type="button" class="ts-dot" data-index="${idx}" style="width:7px;height:7px;border-radius:50%;background:${idx === 0 ? C.text : C.borderStr};border:none;padding:0;cursor:pointer;transition:all 0.15s;${idx === 0 ? 'transform:scale(1.2);' : ''}"></button>
    `).join('');

    const rememberHtml = options.allowRememberDomain && options.domainToRemember ? `
      <label style="display:flex;align-items:center;gap:9px;font-size:12.5px;color:${C.textSec};margin-top:14px;padding-top:12px;border-top:1px solid ${C.border};cursor:pointer;">
        <input type="checkbox" id="ts-remember" style="accent-color:${C.text};cursor:pointer;width:15px;height:15px;">
        <span>Довіряти домену <strong style="color:${C.text};">${options.domainToRemember}</strong></span>
      </label>
    ` : '';

    // Backdrop
    modalRoot.style.cssText = `
      position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
      z-index:2147483647!important;background:rgba(0,0,0,0.35)!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      padding:16px!important;box-sizing:border-box!important;
      animation:tsBackdrop 0.15s ease!important;pointer-events:auto!important;
    `;

    const isCritical = fallbackAssessment.level === 'CRITICAL';

    modalRoot.innerHTML = `
      <style>
        @keyframes tsBackdrop { from{opacity:0} to{opacity:1} }
        @keyframes tsModal { from{opacity:0;transform:scale(0.97) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes tsSpin { 100% { transform: rotate(360deg); } }
        .ts-spinner { animation: tsSpin 1s linear infinite; }
        .ts-btn-primary { width:100%;height:42px;background:${C.text};color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity 0.12s;font-family:${C.font}; }
        .ts-btn-primary:hover { opacity:0.84; }
        .ts-btn-override { background:transparent;border:none;color:${C.textMuted};font-size:13px;font-weight:400;cursor:not-allowed;padding:4px 0;transition:color 0.12s;font-family:${C.font}; }
        .ts-btn-override.active { color:${C.red};cursor:pointer; }
        .ts-btn-link { background:transparent;border:none;color:${C.blue};font-size:13px;cursor:pointer;padding:4px 0;transition:opacity 0.12s;font-family:${C.font}; }
        .ts-btn-link:hover { opacity:0.7; }
        .ts-btn-decoy { width:100%;height:40px;background:${C.greenBg};color:${C.green};border:1px solid ${C.greenBd};border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background 0.12s;margin-bottom:10px;font-family:${C.font}; }
        .ts-btn-decoy:hover { background:${C.greenBd}; }
        .ts-carousel-nav { width:28px;height:28px;border-radius:50%;border:1px solid ${C.border};background:${C.surface};color:${C.text};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 0.12s; }
        .ts-carousel-nav:hover { background:${C.canvas}; }
      </style>

      <div id="ts-modal-card" style="
        background:${C.surface};width:100%;max-width:440px;border-radius:16px;
        box-shadow:0 20px 50px -10px rgba(0,0,0,0.22),0 0 0 1px ${C.border};
        overflow:hidden;font-family:${C.font};
        animation:tsModal 0.2s cubic-bezier(0.16,1,0.3,1);
        color:${C.text};display:flex;flex-direction:column;
        padding:26px 24px 20px;box-sizing:border-box;
      ">
        <!-- ICON -->
        <div style="width:44px;height:44px;border-radius:11px;background:${isCritical ? C.redBg : C.amberBg};border:1px solid ${isCritical ? C.redBd : C.amberBd};display:flex;align-items:center;justify-content:center;margin:0 auto 16px auto;color:${isCritical ? C.red : C.amber};">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${isCritical
              ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
              : '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
          </svg>
        </div>

        <!-- TITLE -->
        <div style="font-size:18px;font-weight:600;color:${C.text};text-align:center;letter-spacing:-0.015em;line-height:1.3;margin-bottom:8px;">${xai.humanTitle}</div>

        <!-- SUBTITLE -->
        <div style="font-size:13.5px;line-height:1.55;color:${C.textSec};text-align:center;margin-bottom:18px;">${xai.humanCoreWarning}</div>

        <!-- CONTEXT ROW -->
        <div style="background:${C.canvas};border:1px solid ${C.border};border-radius:8px;padding:9px 13px;margin-bottom:16px;font-size:12px;color:${C.textSec};display:flex;justify-content:space-between;align-items:center;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">
            ${options.contextLabel}: <strong style="color:${C.text};font-family:ui-monospace,monospace;font-size:11.5px;">${options.contextValue}</strong>
          </span>
          <span style="font-weight:600;color:${isCritical ? C.red : C.amber};white-space:nowrap;font-size:11.5px;">Ризик: ${fallbackAssessment.score}/100</span>
        </div>

        <!-- DECOY BUTTON (if available) -->
        ${options.vaultMatches && options.vaultMatches.some((m) => m.isDecoyAvailable) ? `
          <button id="ts-decoy-btn" class="ts-btn-decoy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            Підставити безпечні дані (Canary Decoy)
          </button>
        ` : ''}

        <!-- PRIMARY ACTION -->
        <button id="ts-primary-btn" class="ts-btn-primary">${primaryActionLabel}</button>

        <!-- AI ARBITER -->
        <button id="ts-ai-arbiter-btn" style="width:100%;height:40px;background:#E0E7FF;color:#4338CA;border:1px solid #C7D2FE;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:opacity 0.12s;margin-top:10px;font-family:${C.font};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Сумніваєтесь? Запитати ШІ
        </button>
        <div id="ts-ai-arbiter-result" style="display:none;font-size:12.5px;padding:10px;border-radius:8px;margin-top:10px;width:100%;box-sizing:border-box;font-family:${C.font};"></div>

        <!-- SECONDARY ROW -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:0 2px;">
          <button id="ts-inspect-btn" class="ts-btn-link">Докладніше</button>
          <button id="ts-override-btn" class="ts-btn-override" disabled>Продовжити (3с)...</button>
        </div>

        <!-- INSPECTOR PANEL -->
        <div id="ts-inspector" style="display:none;background:${C.canvas};border:1px solid ${C.border};border-radius:12px;padding:14px 16px;margin-top:14px;">
          <!-- CAROUSEL HEADER -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${C.border};">
            <span style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${C.textMuted};">Фактори оцінювання</span>
            <span id="ts-counter" style="font-size:11.5px;font-weight:600;color:${C.text};">1 з ${slides.length}</span>
          </div>

          <!-- CAROUSEL -->
          <div id="ts-viewport" style="position:relative;overflow:hidden;width:100%;">
            <div id="ts-track" style="display:flex;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1);width:100%;">
              ${slidesHtml}
            </div>
          </div>

          <!-- CAROUSEL NAV -->
          ${slides.length > 1 ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid ${C.border};">
            <button id="ts-prev" class="ts-carousel-nav" aria-label="Назад">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div id="ts-dots" style="display:flex;gap:6px;align-items:center;">${dotsHtml}</div>
            <button id="ts-next" class="ts-carousel-nav" aria-label="Далі">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          ` : ''}

          ${rememberHtml}
        </div>
      </div>
    `;

    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    const btnPrimary   = modalRoot.querySelector('#ts-primary-btn') as HTMLButtonElement;
    const btnOverride  = modalRoot.querySelector('#ts-override-btn') as HTMLButtonElement;
    const btnInspect   = modalRoot.querySelector('#ts-inspect-btn') as HTMLButtonElement;
    const inspector    = modalRoot.querySelector('#ts-inspector') as HTMLElement;
    const checkRemember= modalRoot.querySelector('#ts-remember') as HTMLInputElement;
    const btnDecoy     = modalRoot.querySelector('#ts-decoy-btn');

    const btnAi = modalRoot.querySelector('#ts-ai-arbiter-btn') as HTMLButtonElement;
    const aiResultDiv = modalRoot.querySelector('#ts-ai-arbiter-result') as HTMLElement;

    if (btnAi && aiResultDiv) {
      btnAi.addEventListener('click', () => {
        btnAi.disabled = true;
        btnAi.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ts-spinner" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ШІ аналізує... (до 30с)';
        btnAi.style.opacity = '0.7';

        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const scanText = options.rawTextToScan || options.activeContext?.targetSuspiciousUrl || options.contextValue || '';
            const intentLabel = (options.intentType && options.intentType !== 'UNKNOWN') ? options.intentType : (options.activeContext?.scenario || 'UNKNOWN');
            const triggerWord = options.activeContext?.detectedKeywords?.[0];

            const contextRules = AILureVerifier.intentContextRules[intentLabel as ScamIntentType] || 'Загальний аналіз на соціальну інженерію та фішинг.';
            const systemPrompt = `Ти — експерт з кібербезпеки та соціальної інженерії, що спеціалізується на виявленні фішингу, крадіжки платіжних даних та шахрайства в українських маркетплейсах (OLX, Prom) і соціальних мережах.

ВАЖЛИВО: Відповідай ВИКЛЮЧНО валідним JSON-об'єктом. Мова пояснення (поле reasoning) — ТІЛЬКИ українська. Не використовуй англійську мову.
Обов'язкова схема JSON:
{
  "isScam": true або false,
  "confidence": число від 0 до 100,
  "reasoning": "Пояснення виключно українською мовою (1-2 речення): чому це небезпечно або безпечно"
}

Приклад для загрози:
{"isScam": true, "confidence": 95, "reasoning": "Фішингове посилання під виглядом безпечної оплати OLX для викрадення даних картки."}

Приклад для безпечного тексту:
{"isScam": false, "confidence": 90, "reasoning": "Звичайне повідомлення без ознак маніпуляцій, посилань чи збору платіжних даних."}`;

            const raisedFlags: string[] = [];
            if (options.triggers && options.triggers.length > 0) {
              for (const t of options.triggers) {
                raisedFlags.push(`${t.severity || 'УВАГА'}: ${t.message}`);
              }
            }
            if (options.activeContext) {
              raisedFlags.push(`Зшита сесія: перехід після активності на ${options.activeContext.sourcePlatform}`);
            }

            const heuristicContext = {
              intentType: intentLabel,
              detectedKeywords: [
                ...(options.activeContext?.detectedKeywords || []),
                ...(options.triggers || []).map(t => t.message)
              ],
              suspiciousUrls: [
                ...(options.activeContext?.targetSuspiciousUrl ? [options.activeContext.targetSuspiciousUrl] : []),
                ...(options.domainToRemember ? [options.domainToRemember] : [])
              ],
              triggeredClusters: options.activeContext?.offPlatformLure ? ['off_platform'] : [],
              nlpConfidence: options.assessment?.score || (options.badgeLevel === 'CRITICAL' ? 90 : 70),
              raisedFlags,
              formDetails: options.formDetails,
              sourcePlatform: options.activeContext?.sourcePlatform || window.location.hostname,
              targetHost: options.contextValue || window.location.hostname
            };

            const aiLogId = DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', '⏳ Запит відправлено, очікую відповідь...', '#3B82F6', {
              systemPrompt,
              contextRules,
              textSent: scanText,
              raisedFlags,
              formDetails: options.formDetails
            });

            chrome.runtime.sendMessage({
              type: 'AI_VERIFY',
              payload: {
                text: scanText,
                intentType: intentLabel,
                triggerWord,
                heuristicContext
              }
            }, (response) => {
              const aiResult = response?.aiResult;
              aiResultDiv.style.display = 'block';
              
              const rawSuffix = aiResult?.rawResponse ? `\n\n[Сира відповідь LLM]:\n${aiResult.rawResponse}` : '';

              if (!aiResult) {
                aiResultDiv.style.background = C.redBg;
                aiResultDiv.style.color = C.red;
                aiResultDiv.style.border = `1px solid ${C.redBd}`;
                aiResultDiv.innerHTML = '<b>Помилка:</b> ШІ не відповів або недоступний.';
                DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', '❌ Gemini Nano не зміг обробити запит.', '#EF4444', undefined, aiLogId);
              } else if (aiResult.isScam) {
                aiResultDiv.style.background = C.redBg;
                aiResultDiv.style.color = C.red;
                aiResultDiv.style.border = `1px solid ${C.redBd}`;
                aiResultDiv.innerHTML = '<b>ШІ Підтвердив Загрозу:</b> ' + aiResult.reasoning;
                DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', `🔴 СКАМ підтверджено\nВпевненість: ${aiResult.confidence}%\n\n"${aiResult.reasoning}"${rawSuffix}`, '#EF4444', { rawResponse: aiResult.rawResponse }, aiLogId);
              } else {
                aiResultDiv.style.background = C.greenBg;
                aiResultDiv.style.color = C.green;
                aiResultDiv.style.border = `1px solid ${C.greenBd}`;
                aiResultDiv.innerHTML = '<b>ШІ Спростував Загрозу:</b> ' + aiResult.reasoning;
                DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', `🟢 Загрозу спростовано\nВпевненість: ${aiResult.confidence}%\n\n"${aiResult.reasoning}"${rawSuffix}`, '#22C55E', { rawResponse: aiResult.rawResponse }, aiLogId);
                
                if (this.countdownInterval) clearInterval(this.countdownInterval);
                btnOverride.disabled = false;
                btnOverride.innerText = 'Продовжити (Відправити Дані)';
                btnOverride.classList.add('active');
              }

              btnAi.style.display = 'none';
            });
          }
        } catch (e) {
          console.error(e);
        }
      });
    }

    let isInspectorOpen = false;
    btnInspect?.addEventListener('click', () => {
      isInspectorOpen = !isInspectorOpen;
      inspector.style.display = isInspectorOpen ? 'block' : 'none';
      btnInspect.textContent = isInspectorOpen ? 'Сховати деталі' : 'Докладніше';
    });

    btnDecoy?.addEventListener('click', () => {
      if (options.vaultMatches && options.vaultMatches.length > 0) {
        const count = VaultScanner.applyDecoys(options.vaultMatches);
        this.close();
        options.onCancel();
        alert(`Захист активовано: ${count} фіктивних значень підставлено замість реальних даних (Canary Decoy).`);
      }
    });

    // Carousel
    let currentSlide = 0;
    const totalSlides = slides.length;
    const track   = modalRoot.querySelector('#ts-track') as HTMLElement;
    const counter = modalRoot.querySelector('#ts-counter') as HTMLElement;
    const dots    = modalRoot.querySelectorAll('.ts-dot');
    const prevBtn = modalRoot.querySelector('#ts-prev') as HTMLElement;
    const nextBtn = modalRoot.querySelector('#ts-next') as HTMLElement;

    const goToSlide = (idx: number) => {
      if (totalSlides <= 1 || !track) return;
      currentSlide = (idx + totalSlides) % totalSlides;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      if (counter) counter.textContent = `${currentSlide + 1} з ${totalSlides}`;
      dots.forEach((dot, i) => {
        const el = dot as HTMLElement;
        el.style.background = i === currentSlide ? C.text : C.borderStr;
        el.style.transform   = i === currentSlide ? 'scale(1.2)' : 'scale(1)';
      });
    };

    if (totalSlides > 1) {
      prevBtn?.addEventListener('click', () => goToSlide(currentSlide - 1));
      nextBtn?.addEventListener('click', () => goToSlide(currentSlide + 1));
      dots.forEach((dot) => {
        dot.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).dataset.index);
          if (!isNaN(idx)) goToSlide(idx);
        });
      });
      this.keydownListener = (e: KeyboardEvent) => {
        if (!isInspectorOpen) return;
        if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
        if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
      };
      window.addEventListener('keydown', this.keydownListener);
    }

    const handleCancel = () => { this.close(); options.onCancel(); };
    btnPrimary?.addEventListener('click', handleCancel);
    modalRoot.addEventListener('click', (e) => { if (e.target === modalRoot) handleCancel(); });
    modalRoot.addEventListener('wheel', (e) => { if (!(e.target as HTMLElement).closest('#ts-modal-card')) e.preventDefault(); }, { passive: false });
    modalRoot.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('#ts-modal-card')) e.preventDefault(); }, { passive: false });

    // 3-second countdown
    let timeLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnOverride.innerText = `Продовжити (${timeLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.innerText = 'Продовжити на свій ризик';
        btnOverride.classList.add('active');
      }
    }, 1000);

    btnOverride?.addEventListener('click', async () => {
      if (btnOverride.disabled) return;
      const remember = checkRemember?.checked || false;
      if (remember && options.domainToRemember) {
        await UserWhitelistManager.allowDomain(options.domainToRemember);
      }
      this.close();
      options.onProceed(remember);
    });
  }

  public static close(): void {
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    if (this.keydownListener) { window.removeEventListener('keydown', this.keydownListener); this.keydownListener = null; }
    if (this.activeModal) { ShadowHost.remove(this.activeModal); this.activeModal = null; }
    if (this.previousBodyOverflow !== null) { document.body.style.overflow = this.previousBodyOverflow; this.previousBodyOverflow = null; }
    if (this.previousHtmlOverflow !== null) { document.documentElement.style.overflow = this.previousHtmlOverflow; this.previousHtmlOverflow = null; }
  }

  private static buildCarouselSlides(options: UnifiedModalOptions, xai: any): CarouselSlide[] {
    const slides: CarouselSlide[] = [];

    if (options.triggers && options.triggers.length > 0) {
      for (const t of options.triggers) {
        const rawMsg = t.message.replace(/[●✓✗]/g, '').trim();
        const lower = rawMsg.toLowerCase();
        let title = 'Підозрілий патерн';
        let badge = 'Критично';
        let badgeType: 'critical' | 'warning' | 'info' = 'critical';
        let description = rawMsg;
        let evidence: string | undefined;

        if (lower.includes('лун') || lower.includes('номер банківськ') || lower.includes('номер картки')) {
          title = 'Номер банківської картки'; badge = 'Платіжні дані'; badgeType = 'critical';
          description = 'У формі введено коректний номер картки за алгоритмом Луна. Недовірений сайт намагається отримати доступ до вашого рахунку.';
          evidence = 'Luhn Validation: SUCCESS';
        } else if (lower.includes('прихован') || lower.includes('autofill') || lower.includes('автозаповнен')) {
          title = 'Прихована пастка автозаповнення'; badge = 'DOM-пастка'; badgeType = 'critical';
          description = 'Сторінка містить невидимі поля для тихого перехоплення реквізитів з пам\'яті браузера.';
          evidence = 'autocomplete="cc-number" / "cc-csc"';
        } else if (lower.includes('цільовий') || lower.includes('вузол') || lower.includes('хост') || lower.includes('невідповідн') || lower.includes('action')) {
          title = 'Невідомий отримувач платежу'; badge = 'Недовірений сервер'; badgeType = 'critical';
          description = `Дані форми відправляються на сервер ${options.contextValue}, який не є акредитованою платіжною системою.`;
          evidence = `action: ${options.contextValue}`;
        } else if (lower.includes('cvv') || lower.includes('cvc')) {
          title = 'CVV/CVC — секретний код картки'; badge = 'Критичний витік'; badgeType = 'critical';
          description = 'Виявлено спробу передачі CVV/CVC коду. Жоден легітимний маркетплейс чи служба підтримки ніколи не запитує цей код у чатах.';
          evidence = 'Card Verification Value';
        } else if (t.name === 'urgency_scarcity_manipulation' || lower.includes('термінов') || lower.includes('таймер') || lower.includes('dark pattern')) {
          title = 'Штучний тиск терміновості'; badge = 'Психологічна маніпуляція'; badgeType = 'warning';
          description = 'Сторінка використовує фіктивний таймер або погрози, щоб змусити вас діяти необдумано.';
          const timerText = (t.details as any)?.timerText;
          evidence = timerText ? `Зворотний відлік: ${timerText}` : 'Urgency Scarcity Manipulation';
        } else {
          title = 'Виявлений ризик'; badge = t.severity === 'CRITICAL' ? 'Критично' : 'Попередження';
          badgeType = t.severity === 'CRITICAL' ? 'critical' : 'warning';
          description = rawMsg;
        }
        slides.push({ badge, badgeType, title, description, evidence });
      }
    }

    if (options.activeContext) {
      const minutesAgo = Math.max(1, Math.round((Date.now() - options.activeContext.timestamp) / 60000));
      const kws = options.activeContext.detectedKeywords || [];
      slides.push({
        badge: 'Зшивання сесій', badgeType: 'warning',
        title: 'Зв\'язок із попереднім чатом',
        description: `Зафіксовано перехід з "${options.activeContext.sourcePlatform}" (${minutesAgo} хв тому). Шахрай заздалегідь підготував приманку перед перенаправленням.`,
        evidence: kws.length > 0 ? `Фрази-приманки: "${kws.slice(0, 3).join('", "')}"` : `Джерело: ${options.activeContext.sourcePlatform}`,
      });
    }

    const vaultItems = options.vaultItems || options.vaultMatches?.map((m) => m.matchedItem);
    if (vaultItems && vaultItems.length > 0) {
      const labels = Array.from(new Set(vaultItems.map((i) => i.label))).join(', ');
      slides.push({
        badge: 'Personal Data Vault', badgeType: 'critical',
        title: 'Захист персональних маркерів',
        description: `Форма випитує захищені дані (${labels}), що використовуються банками для верифікації. Відправка неперевіреному ресурсу загрожує вашим рахункам.`,
        evidence: `Маркери: ${labels}`,
      });
    }

    if (xai?.attackScenario && xai?.diagnosis && !slides.some((s) => s.title.toLowerCase() === xai.attackScenario.toLowerCase())) {
      slides.push({
        badge: 'Сценарій атаки', badgeType: 'warning',
        title: xai.attackScenario,
        description: xai.diagnosis,
        evidence: xai.engineType === 'chrome-builtin-ai' ? 'Gemini Nano (On-Device AI)' : 'Contextual XAI Engine',
      });
    }

    if (xai?.educationalTip) {
      slides.push({
        badge: 'Порада безпеки', badgeType: 'info',
        title: 'Як уникнути шахрайства',
        description: xai.educationalTip,
        evidence: 'Ніколи не підтверджуйте отримання коштів введенням CVV',
      });
    }

    if (slides.length === 0) {
      slides.push({
        badge: 'Оцінка загрози', badgeType: 'critical',
        title: 'Виявлено ризик для безпеки',
        description: xai?.humanCoreWarning || 'Ця сторінка вимагає підозрілих дій, що можуть загрожувати вашим даним.',
        evidence: `Сайт: ${options.contextValue}`,
      });
    }

    return slides;
  }
}
