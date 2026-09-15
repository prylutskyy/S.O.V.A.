import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UserWhitelistManager } from '../core/user-whitelist';
import { XaiEngine } from '../xai/xai-engine';
import { ShadowHost } from './shadow-host';

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

export class UnifiedFrictionModal {
  private static activeModal: HTMLElement | null = null;
  private static countdownInterval: number | null = null;
  private static keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private static previousBodyOverflow: string | null = null;
  private static previousHtmlOverflow: string | null = null;

  public static async show(options: UnifiedModalOptions): Promise<void> {
    this.close();

    // 1. Блокування гортання сторінки (Scroll Lock)
    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
      this.previousHtmlOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // 2. Ізольований контейнер у Shadow DOM
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

    // 3. Генерація лаконічного аналізу через XAI Engine
    const xai = await XaiEngine.generateExplanation({
      type: options.type,
      targetHost: options.contextValue,
      activeContext: options.activeContext,
      assessment: fallbackAssessment,
      chatLeakage: options.chatLeakage,
    });

    const primaryActionLabel = options.type === 'chat' ? 'Скасувати надсилання' : 'Залишити сторінку';

    // 4. Побудова карток для інтерактивної каруселі XAI
    const slides = this.buildCarouselSlides(options, xai);

    const getBadgeStyles = (type: 'critical' | 'warning' | 'info') => {
      switch (type) {
        case 'critical':
          return 'background: rgba(215, 0, 21, 0.08); color: #d70015; border: 1px solid rgba(215, 0, 21, 0.18);';
        case 'warning':
          return 'background: rgba(255, 149, 0, 0.10); color: #b45309; border: 1px solid rgba(255, 149, 0, 0.22);';
        case 'info':
          return 'background: rgba(0, 113, 227, 0.08); color: #0071e3; border: 1px solid rgba(0, 113, 227, 0.20);';
      }
    };

    const slidesHtml = slides
      .map(
        (slide) => `
        <div class="threat-carousel-slide" style="
          flex: 0 0 100%;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          padding: 2px 2px;
        ">
          <div style="margin-bottom: 8px;">
            <span style="
              display: inline-block;
              font-size: 11.5px;
              font-weight: 600;
              letter-spacing: 0.03em;
              text-transform: uppercase;
              padding: 3px 8px;
              border-radius: 6px;
              ${getBadgeStyles(slide.badgeType)}
            ">
              ${slide.badge}
            </span>
          </div>

          <div style="
            font-size: 15.5px;
            font-weight: 600;
            color: #1d1d1f;
            line-height: 1.35;
            margin-bottom: 6px;
          ">
            ${slide.title}
          </div>

          <div style="
            font-size: 13.5px;
            line-height: 1.5;
            color: #3a3a3c;
            margin-bottom: ${slide.evidence ? '8px' : '2px'};
          ">
            ${slide.description}
          </div>

          ${
            slide.evidence
              ? `
            <div style="
              background: #f2f2f7;
              border-radius: 6px;
              padding: 6px 10px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 12px;
              color: #2c2c2e;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">
              ${slide.evidence}
            </div>
          `
              : ''
          }
        </div>
      `
      )
      .join('');

    const dotsHtml = slides
      .map(
        (_, idx) => `
        <button type="button" class="threat-carousel-dot" data-index="${idx}" aria-label="Слайд ${idx + 1}" style="
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${idx === 0 ? '#0071e3' : '#c7c7cc'};
          border: none;
          padding: 0;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          transform: ${idx === 0 ? 'scale(1.25)' : 'scale(1)'};
        "></button>
      `
      )
      .join('');

    const rememberHtml =
      options.allowRememberDomain && options.domainToRemember
        ? `
        <label style="
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13px;
          color: #424245;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid #e5e5ea;
          cursor: pointer;
          user-select: none;
        ">
          <input type="checkbox" id="threat-modal-remember" style="accent-color: #0071e3; cursor: pointer; width: 16px; height: 16px;">
          <span>Додати домен <strong>${options.domainToRemember}</strong> до персонального білого списку</span>
        </label>
      `
        : '';

    // Стилі бекдропу (Apple System Ultra-Thin Blur)
    modalRoot.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: rgba(0, 0, 0, 0.38) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
      box-sizing: border-box !important;
      animation: threatBackdropFade 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    modalRoot.innerHTML = `
      <div id="threat-modal-card" style="
        background: #ffffff !important;
        width: 100% !important;
        max-width: 460px !important;
        border-radius: 18px !important;
        box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
        overflow: hidden !important;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        animation: threatModalScale 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
        color: #1d1d1f !important;
        display: flex !important;
        flex-direction: column !important;
        padding: 28px 28px 22px 28px !important;
        box-sizing: border-box !important;
      ">
        <!-- ГОЛОВНА ІКОНКА (ВЕКТОРНИЙ ЩИТ У СТИЛІ SF SYMBOLS) -->
        <div style="
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(215, 0, 21, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        ">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d70015" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <!-- ЗАГОЛОВОК ДІАЛОГУ (ЗБІЛЬШЕНИЙ) -->
        <div style="
          font-size: 19px;
          font-weight: 600;
          color: #1d1d1f;
          text-align: center;
          letter-spacing: -0.015em;
          line-height: 1.3;
          margin-bottom: 10px;
        ">
          ${xai.humanTitle}
        </div>

        <!-- ОСНОВНЕ ПОВІДОМЛЕННЯ ШІ (ГОЛОВНИЙ ТЕКСТ ВІКНА) -->
        <div style="
          font-size: 14.5px;
          line-height: 1.55;
          color: #424245;
          text-align: center;
          letter-spacing: -0.01em;
          margin-bottom: 20px;
        ">
          ${xai.humanCoreWarning}
        </div>

        <!-- КОНТЕКСТНИЙ РЯДОК (ХОСТ + РІВЕНЬ РИЗИКУ) -->
        <div style="
          background: #f5f5f7;
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 20px;
          font-size: 12.5px;
          color: #6e6e73;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">
            Вузол: <strong style="color: #1d1d1f; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px;">${options.contextValue}</strong>
          </span>
          <span style="font-weight: 600; color: #d70015; white-space: nowrap;">
            Ризик: ${fallbackAssessment.score}/100
          </span>
        </div>

        <!-- ГОЛОВНА РЯТІВНА ДІЯ (APPLE FILL BUTTON) -->
        <button id="threat-modal-primary-btn" type="button" style="
          width: 100%;
          height: 44px;
          background: #0071e3;
          color: #ffffff;
          border: none;
          border-radius: 11px;
          font-size: 14.5px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
          margin-bottom: 12px;
        ">
          ${primaryActionLabel}
        </button>

        <!-- ДРУГОРЯДНИЙ РЯДОК ДІЙ -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          padding: 0 4px;
        ">
          <button id="threat-modal-inspect-toggle-btn" type="button" style="
            background: transparent;
            border: none;
            color: #0071e3;
            font-size: 13px;
            font-weight: 400;
            cursor: pointer;
            padding: 4px 0;
            transition: opacity 0.15s;
          ">
            Докладніше про оцінку
          </button>

          <button id="threat-modal-override-btn" type="button" disabled style="
            background: transparent;
            border: none;
            color: #86868b;
            font-size: 13px;
            font-weight: 400;
            cursor: not-allowed;
            padding: 4px 0;
            transition: color 0.15s;
          ">
            Продовжити (3с)...
          </button>
        </div>

        <!-- КОМПАКТНА ІНТЕРАКТИВНА КАРУСЕЛЬ XAI ДЕТАЛЕЙ -->
        <div id="threat-modal-inspector-panel" style="
          display: none;
          background: #fbfbfd;
          border: 1px solid #e5e5ea;
          border-radius: 14px;
          padding: 16px 18px;
          margin-top: 14px;
          animation: threatBackdropFade 0.2s ease-in-out;
        ">
          <!-- ШАПКА КАРУСЕЛІ -->
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e5ea;
          ">
            <span style="font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #86868b;">
              Фактори оцінювання
            </span>
            <span id="threat-carousel-counter" style="font-size: 12px; font-weight: 600; color: #0071e3;">
              1 з ${slides.length}
            </span>
          </div>

          <!-- В'ЮПОРТ КАРУСЕЛІ -->
          <div id="threat-carousel-viewport" style="
            position: relative;
            overflow: hidden;
            width: 100%;
          ">
            <div id="threat-carousel-track" style="
              display: flex;
              transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
              width: 100%;
            ">
              ${slidesHtml}
            </div>
          </div>

          <!-- НАВІГАЦІЯ КАРУСЕЛІ (Якщо більше 1 картки) -->
          ${
            slides.length > 1
              ? `
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-top: 12px;
              padding-top: 10px;
              border-top: 1px solid #f0f0f2;
            ">
              <button id="threat-carousel-prev" type="button" aria-label="Попередній фактор" style="
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 1px solid #d1d1d6;
                background: #ffffff;
                color: #1d1d1f;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
                transition: background 0.15s;
              ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>

              <div id="threat-carousel-dots" style="display: flex; gap: 7px; align-items: center;">
                ${dotsHtml}
              </div>

              <button id="threat-carousel-next" type="button" aria-label="Наступний фактор" style="
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 1px solid #d1d1d6;
                background: #ffffff;
                color: #1d1d1f;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
                transition: background 0.15s;
              ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          `
              : ''
          }

          ${rememberHtml}
        </div>
      </div>
    `;

    // Монтування всередину ShadowRoot
    ShadowHost.append(modalRoot);
    this.activeModal = modalRoot;

    // Обробники
    const btnPrimary = modalRoot.querySelector('#threat-modal-primary-btn');
    const btnOverride = modalRoot.querySelector('#threat-modal-override-btn') as HTMLButtonElement;
    const btnInspectToggle = modalRoot.querySelector('#threat-modal-inspect-toggle-btn');
    const inspectorPanel = modalRoot.querySelector('#threat-modal-inspector-panel') as HTMLElement;
    const checkRemember = modalRoot.querySelector('#threat-modal-remember') as HTMLInputElement;

    // Hover ефект на головну кнопку
    btnPrimary?.addEventListener('mouseenter', () => {
      (btnPrimary as HTMLElement).style.background = '#0077ed';
    });
    btnPrimary?.addEventListener('mouseleave', () => {
      (btnPrimary as HTMLElement).style.background = '#0071e3';
    });

    let isInspectorOpen = false;
    btnInspectToggle?.addEventListener('click', () => {
      isInspectorOpen = !isInspectorOpen;
      if (inspectorPanel) {
        inspectorPanel.style.display = isInspectorOpen ? 'block' : 'none';
      }
      if (btnInspectToggle) {
        btnInspectToggle.textContent = isInspectorOpen ? 'Приховати деталі' : 'Докладніше про оцінку';
      }
    });

    // 5. Логіка гортання каруселі
    let currentSlideIndex = 0;
    const totalSlides = slides.length;
    const track = modalRoot.querySelector('#threat-carousel-track') as HTMLElement;
    const counter = modalRoot.querySelector('#threat-carousel-counter') as HTMLElement;
    const dots = modalRoot.querySelectorAll('.threat-carousel-dot');
    const prevBtn = modalRoot.querySelector('#threat-carousel-prev') as HTMLElement;
    const nextBtn = modalRoot.querySelector('#threat-carousel-next') as HTMLElement;

    const updateCarousel = (newIndex: number) => {
      if (totalSlides <= 1 || !track) return;
      currentSlideIndex = (newIndex + totalSlides) % totalSlides;
      track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

      if (counter) {
        counter.textContent = `${currentSlideIndex + 1} з ${totalSlides}`;
      }

      dots.forEach((dot, idx) => {
        const dotEl = dot as HTMLElement;
        if (idx === currentSlideIndex) {
          dotEl.style.background = '#0071e3';
          dotEl.style.transform = 'scale(1.25)';
        } else {
          dotEl.style.background = '#c7c7cc';
          dotEl.style.transform = 'scale(1)';
        }
      });
    };

    if (totalSlides > 1) {
      prevBtn?.addEventListener('click', () => updateCarousel(currentSlideIndex - 1));
      nextBtn?.addEventListener('click', () => updateCarousel(currentSlideIndex + 1));

      prevBtn?.addEventListener('mouseenter', () => {
        prevBtn.style.background = '#f5f5f7';
      });
      prevBtn?.addEventListener('mouseleave', () => {
        prevBtn.style.background = '#ffffff';
      });

      nextBtn?.addEventListener('mouseenter', () => {
        nextBtn.style.background = '#f5f5f7';
      });
      nextBtn?.addEventListener('mouseleave', () => {
        nextBtn.style.background = '#ffffff';
      });

      dots.forEach((dot) => {
        dot.addEventListener('click', (e) => {
          const idx = Number((e.currentTarget as HTMLElement).dataset.index);
          if (!isNaN(idx)) updateCarousel(idx);
        });
      });

      // Підтримка навігації стрілками клавіатури, коли деталі відкриті
      this.keydownListener = (e: KeyboardEvent) => {
        if (!isInspectorOpen) return;
        if (e.key === 'ArrowLeft') {
          updateCarousel(currentSlideIndex - 1);
        } else if (e.key === 'ArrowRight') {
          updateCarousel(currentSlideIndex + 1);
        }
      };
      window.addEventListener('keydown', this.keydownListener);
    }

    const handleCancel = () => {
      this.close();
      options.onCancel();
    };

    btnPrimary?.addEventListener('click', handleCancel);

    // Клік по бекдропу закриває та рятує
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot) {
        handleCancel();
      }
    });

    // Запобігання скролу
    modalRoot.addEventListener(
      'wheel',
      (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('#threat-modal-card')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    modalRoot.addEventListener(
      'touchmove',
      (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('#threat-modal-card')) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // 3-секундний когнітивний таймер для розблокування небезпечної дії
    let timeLeft = 3;
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        btnOverride.innerText = `Продовжити (${timeLeft}с)...`;
      } else {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        btnOverride.disabled = false;
        btnOverride.innerText = 'Продовжити на свій ризик';
        btnOverride.style.color = '#d70015';
        btnOverride.style.cursor = 'pointer';
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
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }
    if (this.activeModal) {
      ShadowHost.remove(this.activeModal);
      this.activeModal = null;
    }

    // Відновлення гортання сторінки
    if (this.previousBodyOverflow !== null) {
      document.body.style.overflow = this.previousBodyOverflow;
      this.previousBodyOverflow = null;
    }
    if (this.previousHtmlOverflow !== null) {
      document.documentElement.style.overflow = this.previousHtmlOverflow;
      this.previousHtmlOverflow = null;
    }
  }

  /**
   * Створення карток для каруселі XAI
   */
  private static buildCarouselSlides(options: UnifiedModalOptions, xai: any): CarouselSlide[] {
    const slides: CarouselSlide[] = [];

    // 1. Тригери
    if (options.triggers && options.triggers.length > 0) {
      for (const t of options.triggers) {
        const rawMsg = t.message.replace(/[⚠️🚨💳🔒💬⚡●✓✗]/g, '').trim();
        const lower = rawMsg.toLowerCase();

        let title = 'Підозрілий патерн';
        let badge = 'Критично';
        let badgeType: 'critical' | 'warning' | 'info' = 'critical';
        let description = rawMsg;
        let evidence: string | undefined = undefined;

        if (lower.includes('лун') || lower.includes('номер банківськ') || lower.includes('номер картки')) {
          title = 'Валідація номера банківської картки';
          badge = 'Платіжні дані';
          badgeType = 'critical';
          description = 'У формі введено коректний номер картки за контрольним алгоритмом Луна (Luhn Algorithm). Недовірений сайт намагається отримати доступ до вашого рахунку.';
          evidence = 'Luhn Validation: SUCCESS';
        } else if (lower.includes('прихован') || lower.includes('autofill') || lower.includes('автозаповнен')) {
          title = 'Прихована DOM-пастка автозаповнення';
          badge = 'DOM-пастка';
          badgeType = 'critical';
          description = 'Сторінка містить невидимі поля банківської картки для тихого перехоплення реквізитів з пам’яті браузера.';
          evidence = 'autocomplete="cc-number" / "cc-csc"';
        } else if (lower.includes('цільовий') || lower.includes('вузол') || lower.includes('хост') || lower.includes('невідповідн') || lower.includes('action')) {
          title = 'Невідповідність отримувача платежу';
          badge = 'Недовірений сервер';
          badgeType = 'critical';
          description = `Дані форми відправляються на сервер ${options.contextValue}, який не належить до переліку акредитованих платіжних систем України (НБУ/PCI-DSS).`;
          evidence = `action: ${options.contextValue}`;
        } else if (lower.includes('cvv') || lower.includes('cvc')) {
          title = 'Секретний тризначний код безпеки (CVV)';
          badge = 'Критичний витік';
          badgeType = 'critical';
          description = 'Виявлено спробу передачі секретного CVV/CVC коду. Жоден офіційний маркетплейс чи служба підтримки ніколи не запитує цей код у чатах.';
          evidence = 'Secret Card Verification Value';
        } else {
          title = 'Виявлений фактор загрози';
          badge = t.severity === 'CRITICAL' ? 'Критично' : 'Попередження';
          badgeType = t.severity === 'CRITICAL' ? 'critical' : 'warning';
          description = rawMsg;
        }

        slides.push({ badge, badgeType, title, description, evidence });
      }
    }

    // 2. Зшивання сесій (Cross-Session Stitching)
    if (options.activeContext) {
      const minutesAgo = Math.max(1, Math.round((Date.now() - options.activeContext.timestamp) / 60000));
      const kws = options.activeContext.detectedKeywords || [];
      slides.push({
        badge: 'Зшивання сесій',
        badgeType: 'warning',
        title: 'Зв\'язок із діалогом у сторонньому чаті',
        description: `Зафіксовано перехід із платформи "${options.activeContext.sourcePlatform}" (${minutesAgo} хв тому). Шахрай заздалегідь підготував приманку в чаті перед перенаправленням на цей платіжний вузол.`,
        evidence: kws.length > 0 ? `Фрази-приманки: "${kws.slice(0, 3).join('", "')}"` : `Джерело: ${options.activeContext.sourcePlatform}`,
      });
    }

    // 3. Діагноз сценарію атаки від XAI Engine
    if (xai?.attackScenario && xai?.diagnosis && !slides.some((s) => s.title.toLowerCase() === xai.attackScenario.toLowerCase())) {
      slides.push({
        badge: 'Сценарій атаки',
        badgeType: 'warning',
        title: xai.attackScenario,
        description: xai.diagnosis,
        evidence: xai.engineType === 'chrome-builtin-ai' ? 'Gemini Nano (On-Device AI)' : 'Contextual XAI Engine',
      });
    }

    // 4. Порада безпеки (Countermeasure)
    if (xai?.educationalTip) {
      slides.push({
        badge: 'Порада захисту',
        badgeType: 'info',
        title: 'Як уникнути фінансових втрат',
        description: xai.educationalTip,
        evidence: 'Ніколи не підтверджуйте отримання коштів введенням CVV чи балансу',
      });
    }

    // Запасний слайд
    if (slides.length === 0) {
      slides.push({
        badge: 'Оцінка загрози',
        badgeType: 'critical',
        title: 'Виявлено ризик для безпеки',
        description: xai?.humanCoreWarning || 'Ця сторінка вимагає підозрілих платіжних дій, які можуть загрожувати вашим коштам.',
        evidence: `Цільовий вузол: ${options.contextValue}`,
      });
    }

    return slides;
  }
}
