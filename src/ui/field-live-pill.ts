import { ShadowHost } from './shadow-host';

export interface FieldProtectionMetadata {
  categoryLabel: string;
  fieldType: 'VAULT_ITEM' | 'PAYMENT_CVV' | 'PAYMENT_PIN' | 'PAYMENT_EXPIRY' | 'TAX_ID';
  isTierA?: boolean;
}

export interface FieldDetailsInfo {
  shortLabel: string;
  iconSvg: string;
  bannerWarning: string;
  explanation: string;
}

export interface FieldLivePillRecord {
  input: HTMLInputElement | HTMLTextAreaElement;
  metadata: FieldProtectionMetadata;
  details: FieldDetailsInfo;
  pillElement: HTMLElement;
  bannerElement: HTMLElement | null;
  isRedAlert: boolean;
  cleanups: Array<() => void>;
}

export class FieldLivePill {
  private static activePills = new Map<HTMLInputElement | HTMLTextAreaElement, FieldLivePillRecord>();
  private static activePopover: HTMLElement | null = null;
  private static activePopoverInput: (HTMLInputElement | HTMLTextAreaElement) | null = null;
  private static popoverCloseTimer: any = null;
  private static viewportListenerAttached = false;

  /**
   * Створення та прикріплення мікро-пігулки безпеки скраю поля форми
   */
  public static attach(
    input: HTMLInputElement | HTMLTextAreaElement,
    meta: FieldProtectionMetadata
  ): HTMLElement {
    if (this.activePills.has(input)) {
      return this.activePills.get(input)!.pillElement;
    }

    const root = ShadowHost.getRoot();
    this.ensureStylesInjected(root);

    const details = this.resolveFieldDetails(meta);
    const pill = document.createElement('div');
    pill.className = 'ts-field-live-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    pill.innerHTML = `
      <span class="ts-field-pill-icon" style="color: #0071E3; display: flex; align-items: center;">
        ${details.iconSvg}
      </span>
      <span class="ts-field-pill-label" style="color: #1D1D1F;">${details.shortLabel}</span>
      <span style="font-size: 9px; color: #86868B;">•</span>
      <span style="font-size: 9.5px; color: #0071E3; font-weight: 500;">Захист</span>
    `;

    root.appendChild(pill);

    const record: FieldLivePillRecord = {
      input,
      metadata: meta,
      details,
      pillElement: pill,
      bannerElement: null,
      isRedAlert: false,
      cleanups: [],
    };

    // Якщо поле вже заповнене при завантаженні сторінки — одразу вмикаємо червоний режим
    if (input.value && input.value.trim().length >= 2) {
      this.setRedAlertState(input, record, true);
    }

    this.updatePillPosition(input, pill);

    // 1. Поведінка при наведенні та кліку на пігулку (розкриття поповера з роз'ясненнями)
    const handleMouseEnterPill = () => {
      this.cancelPopoverClose();
      this.showPopover(input, record);
    };
    const handleMouseLeavePill = () => {
      this.schedulePopoverClose();
    };
    const handleClickPill = (e: MouseEvent) => {
      e.stopPropagation();
      this.cancelPopoverClose();
      this.showPopover(input, record);
    };

    pill.addEventListener('mouseenter', handleMouseEnterPill);
    pill.addEventListener('mouseleave', handleMouseLeavePill);
    pill.addEventListener('click', handleClickPill);

    record.cleanups.push(() => {
      pill.removeEventListener('mouseenter', handleMouseEnterPill);
      pill.removeEventListener('mouseleave', handleMouseLeavePill);
      pill.removeEventListener('click', handleClickPill);
    });

    // 2. Інтерактивна реакція на дії користувача в полі (фокус, введення символів)
    const handleFocus = () => {
      if (input.value.trim().length <= 1 && !record.isRedAlert) {
        this.showBanner(input, record);
      }
    };

    const handleInput = () => {
      const val = input.value.trim();

      if (val.length === 0) {
        // Поле очищено: скидаємо червону тривогу в початковий синій стан
        if (record.isRedAlert) {
          this.setRedAlertState(input, record, false);
        }
      } else if (val.length === 1) {
        // Перший символ: розгортаємо інформаційний банер-завісу
        if (!record.bannerElement && !record.isRedAlert) {
          this.showBanner(input, record);
        }
      } else {
        // Користувач продовжує вводити інформацію (довжина >= 2):
        // Інформаційне поле ховається гарною кривою Apple у пігулку, змінивши колір на червону пігулку!
        if (record.bannerElement) {
          this.retractBanner(input, record);
        }
        if (!record.isRedAlert) {
          this.setRedAlertState(input, record, true);
        }
      }
    };

    const handleBlur = () => {
      if (record.bannerElement) {
        this.retractBanner(input, record);
      }
    };

    input.addEventListener('focus', handleFocus);
    input.addEventListener('input', handleInput);
    input.addEventListener('blur', handleBlur);

    record.cleanups.push(() => {
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('input', handleInput);
      input.removeEventListener('blur', handleBlur);
    });

    this.activePills.set(input, record);

    if (!this.viewportListenerAttached && typeof window !== 'undefined') {
      window.addEventListener('scroll', this.handleViewportChange, { passive: true });
      window.addEventListener('resize', this.handleViewportChange, { passive: true });
      this.viewportListenerAttached = true;
    }

    return pill;
  }

  /**
   * Демонтаж пігулки та очищення слухачів
   */
  public static detach(input: HTMLInputElement | HTMLTextAreaElement): void {
    const record = this.activePills.get(input);
    if (!record) return;

    record.cleanups.forEach((cleanup) => cleanup());

    if (record.bannerElement && record.bannerElement.parentNode) {
      record.bannerElement.parentNode.removeChild(record.bannerElement);
    }
    if (record.pillElement && record.pillElement.parentNode) {
      record.pillElement.parentNode.removeChild(record.pillElement);
    }

    if (this.activePopoverInput === input) {
      this.closePopover();
    }

    this.activePills.delete(input);

    if (this.activePills.size === 0 && this.viewportListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.handleViewportChange);
      window.removeEventListener('resize', this.handleViewportChange);
      this.viewportListenerAttached = false;
    }
  }

  /**
   * Демонтаж усіх активних пігулок
   */
  public static detachAll(): void {
    for (const input of Array.from(this.activePills.keys())) {
      this.detach(input);
    }
    this.closePopover();
  }

  private static handleViewportChange = () => {
    for (const [input, record] of FieldLivePill.activePills.entries()) {
      if (input.isConnected) {
        FieldLivePill.updatePillPosition(input, record.pillElement);
        if (record.bannerElement) {
          FieldLivePill.updateBannerPosition(input, record.bannerElement);
        }
      } else {
        FieldLivePill.detach(input);
      }
    }

    if (FieldLivePill.activePopover && FieldLivePill.activePopoverInput) {
      FieldLivePill.updatePopoverPosition(FieldLivePill.activePopoverInput, FieldLivePill.activePopover);
    }
  };

  /**
   * Оновлення координат розташування пігулки скраю поля форми
   */
  public static updatePillPosition(input: HTMLInputElement | HTMLTextAreaElement, pill: HTMLElement): void {
    if (!input.isConnected) return;

    const rect = input.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const pillWidth = pill.offsetWidth || 88;
    const pillHeight = pill.offsetHeight || 22;

    // Розміщуємо скраю поля введення: над правим краєм поля
    let top = scrollY + rect.top - pillHeight - 4;
    let left = scrollX + rect.right - pillWidth;

    // Якщо зверху немає місця або це перший рядок сторінки — розміщуємо знизу під полем
    if (top < scrollY + 4) {
      top = scrollY + rect.bottom + 4;
    }
    // Якщо не вміщується праворуч — вирівнюємо по лівому краю
    if (left < scrollX + rect.left) {
      left = scrollX + rect.left;
    }

    pill.style.top = `${Math.max(0, top)}px`;
    pill.style.left = `${Math.max(0, left)}px`;
  }

  /**
   * Плавне розгортання інформаційного банера-завіси (перекриває поле, якщо воно невелике)
   */
  public static showBanner(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    if (record.bannerElement || record.isRedAlert) return;

    const root = ShadowHost.getRoot();
    this.ensureStylesInjected(root);

    const banner = document.createElement('div');
    banner.className = 'ts-field-banner-curtain';

    this.updateBannerPosition(input, banner);

    const details = record.details;
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1;">
        <span style="font-size: 13px; line-height: 1; flex-shrink: 0;">⚠️</span>
        <span style="font-size: 11px; font-weight: 500; color: #1D1D1F; line-height: 1.35;">
          ${details.bannerWarning}
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
        <button class="ts-banner-dismiss-btn" title="Продовжити введення" style="
          appearance: none !important;
          -webkit-appearance: none !important;
          background: rgba(0, 0, 0, 0.06) !important;
          color: #1D1D1F !important;
          border: 1px solid rgba(0, 0, 0, 0.08) !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          padding: 3px 8px !important;
          border-radius: 5px !important;
          cursor: pointer !important;
          line-height: 1.2 !important;
          transition: background-color 0.15s ease !important;
        ">
          Зрозуміло
        </button>
      </div>
    `;

    const dismissBtn = banner.querySelector('.ts-banner-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.retractBanner(input, record);
        input.focus();
      });
    }

    banner.addEventListener('click', () => {
      this.retractBanner(input, record);
      input.focus();
    });

    root.appendChild(banner);
    record.bannerElement = banner;
  }

  /**
   * Координати та розмір банера: перекриває поле, якщо воно невелике
   */
  private static updateBannerPosition(input: HTMLInputElement | HTMLTextAreaElement, banner: HTMLElement): void {
    if (!input.isConnected) return;

    const rect = input.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    // Невеликі розміри поля (типово для CVV чи Expiry, наприклад width <= 260px)
    const isSmallField = rect.width > 0 && rect.width <= 260 && rect.height <= 70;

    if (isSmallField) {
      const targetWidth = Math.max(rect.width, 220);
      const targetHeight = Math.max(rect.height, 36);

      banner.style.top = `${scrollY + rect.top}px`;
      banner.style.left = `${scrollX + rect.left}px`;
      banner.style.width = `${targetWidth}px`;
      banner.style.minHeight = `${targetHeight}px`;
    } else {
      let top = scrollY + rect.top - 46;
      if (top < scrollY + 4) top = scrollY + rect.bottom + 6;
      banner.style.top = `${Math.max(0, top)}px`;
      banner.style.left = `${scrollX + rect.left}px`;
      banner.style.maxWidth = '360px';
      banner.style.width = 'auto';
    }
  }

  /**
   * Плавне згортання інформаційного банера назад у пігулку за кривою Apple
   */
  public static retractBanner(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    if (!record.bannerElement) return;

    const banner = record.bannerElement;
    banner.classList.add('ts-retracting');
    record.bannerElement = null;

    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 220);
  }

  /**
   * Перемикання пігулки у червоний режим тривоги (Red Security Pill)
   */
  public static setRedAlertState(
    input: HTMLInputElement | HTMLTextAreaElement,
    record: FieldLivePillRecord,
    isRed: boolean
  ): void {
    record.isRedAlert = isRed;
    const pill = record.pillElement;
    const details = record.details;

    if (isRed) {
      pill.classList.add('ts-pill-red');
      pill.innerHTML = `
        <span class="ts-field-pill-icon" style="color: #DC2626; display: flex; align-items: center;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </span>
        <span class="ts-field-pill-label" style="color: #B91C1C; font-weight: 700;">${details.shortLabel}</span>
        <span style="font-size: 9px; color: #DC2626; opacity: 0.7;">•</span>
        <span style="font-size: 9.5px; color: #DC2626; font-weight: 600;">Увага</span>
      `;
    } else {
      pill.classList.remove('ts-pill-red');
      pill.innerHTML = `
        <span class="ts-field-pill-icon" style="color: #0071E3; display: flex; align-items: center;">
          ${details.iconSvg}
        </span>
        <span class="ts-field-pill-label" style="color: #1D1D1F;">${details.shortLabel}</span>
        <span style="font-size: 9px; color: #86868B;">•</span>
        <span style="font-size: 9.5px; color: #0071E3; font-weight: 500;">Захист</span>
      `;
    }

    this.updatePillPosition(input, pill);
  }

  /**
   * Відображення картки з детальним поясненням та кнопкою швидкого очищення
   */
  public static showPopover(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    this.closePopover();

    const root = ShadowHost.getRoot();
    const popover = document.createElement('div');
    popover.className = 'ts-field-live-popover';

    const details = record.details;
    const isRed = record.isRedAlert;
    const hasValue = Boolean(input.value && input.value.trim().length > 0);

    const statusBadge = isRed
      ? `<span style="font-size: 10px; font-weight: 700; background: rgba(239, 68, 68, 0.12); color: #DC2626; padding: 1px 7px; border-radius: 9999px; border: 1px solid rgba(239, 68, 68, 0.25);">Ризик витоку</span>`
      : `<span style="font-size: 10px; font-weight: 700; background: rgba(0, 113, 227, 0.10); color: #0071E3; padding: 1px 7px; border-radius: 9999px; border: 1px solid rgba(0, 113, 227, 0.22);">Захищено</span>`;

    const cleanButtonHtml = hasValue
      ? `<button id="ts-field-clean-btn" class="ts-pill-btn-primary" style="padding: 6px 12px !important; font-size: 11px !important;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Очистити поле
        </button>`
      : '';

    popover.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: ${isRed ? 'rgba(239, 68, 68, 0.12)' : 'rgba(0, 113, 227, 0.1)'}; display: flex; align-items: center; justify-content: center; color: ${isRed ? '#DC2626' : '#0071E3'};">
            ${details.iconSvg}
          </div>
          <span style="font-size: 12px; font-weight: 700; color: #1D1D1F;">
            ${record.metadata.categoryLabel}
          </span>
        </div>
        ${statusBadge}
      </div>
      <p style="font-size: 11px; line-height: 1.45; color: #515154; margin: 0 0 10px 0;">
        ${details.explanation}
      </p>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
        ${cleanButtonHtml}
      </div>
    `;

    popover.addEventListener('mouseenter', () => this.cancelPopoverClose());
    popover.addEventListener('mouseleave', () => this.schedulePopoverClose());

    const cleanBtn = popover.querySelector('#ts-field-clean-btn') as HTMLButtonElement | null;
    if (cleanBtn) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearInputField(input, record);
      });
    }

    root.appendChild(popover);
    this.activePopover = popover;
    this.activePopoverInput = input;
    this.updatePopoverPosition(input, popover);
  }

  private static updatePopoverPosition(input: HTMLInputElement | HTMLTextAreaElement, popover: HTMLElement): void {
    if (!input.isConnected) return;

    const rect = input.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const popoverWidth = popover.offsetWidth || 300;
    const popoverHeight = popover.offsetHeight || 120;

    let top = scrollY + rect.bottom + 6;
    let left = scrollX + rect.right - popoverWidth;

    if (left < scrollX + 10) left = scrollX + 10;
    if (typeof window !== 'undefined' && rect.bottom + popoverHeight + 10 > window.innerHeight) {
      top = scrollY + rect.top - popoverHeight - 6;
    }

    popover.style.top = `${Math.max(0, top)}px`;
    popover.style.left = `${Math.max(0, left)}px`;
  }

  public static closePopover(): void {
    if (this.activePopover && this.activePopover.parentNode) {
      this.activePopover.parentNode.removeChild(this.activePopover);
    }
    this.activePopover = null;
    this.activePopoverInput = null;
  }

  private static schedulePopoverClose(): void {
    if (this.popoverCloseTimer) clearTimeout(this.popoverCloseTimer);
    this.popoverCloseTimer = setTimeout(() => {
      this.closePopover();
    }, 150);
  }

  private static cancelPopoverClose(): void {
    if (this.popoverCloseTimer) {
      clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }
  }

  /**
   * Очищення поля в 1 клік
   */
  private static clearInputField(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    if ('value' in input && typeof input.value === 'string') {
      const proto = input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (nativeSetter) {
        nativeSetter.call(input, '');
      } else {
        input.value = '';
      }
    } else {
      (input as HTMLElement).innerText = '';
    }

    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}

    this.setRedAlertState(input, record, false);
    this.closePopover();

    if (typeof input.focus === 'function') {
      try {
        input.focus();
      } catch {}
    }
  }

  private static resolveFieldDetails(meta: FieldProtectionMetadata): FieldDetailsInfo {
    const type = meta.fieldType;
    const labelLower = (meta.categoryLabel || '').toLowerCase();

    if (type === 'PAYMENT_CVV' || labelLower.includes('cvv') || labelLower.includes('cvc')) {
      return {
        shortLabel: 'CVV',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Для отримання коштів CVV-код ніколи не потрібен! Його запитують лише для списання.',
        explanation: 'Для зарахування коштів або переказу тризначний CVV/CVC-код ніколи не потрібен. Його запитують виключно для списання коштів з вашої картки.',
      };
    }

    if (type === 'PAYMENT_EXPIRY' || labelLower.includes('термін') || labelLower.includes('срок') || labelLower.includes('exp')) {
      return {
        shortLabel: 'Термін дії',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        bannerWarning: 'Термін дії картки потрібен лише для покупок, а не для зарахування коштів.',
        explanation: 'Для отримання грошей потрібен лише номер картки. Дата закінчення терміну дії запитується шахраями для авторизації списання.',
      };
    }

    if (type === 'PAYMENT_PIN' || labelLower.includes('пін') || labelLower.includes('pin')) {
      return {
        shortLabel: 'ПІН-код',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Категорично заборонено: введення ПІН-коду картки на вебсайтах!',
        explanation: 'ПІН-код використовується лише в банкоматах і терміналах. Жоден офіційний сайт ніколи не запитує ПІН-код.',
      };
    }

    if (type === 'TAX_ID' || labelLower.includes('іпн') || labelLower.includes('рнокпп') || labelLower.includes('податк')) {
      return {
        shortLabel: 'ІПН / РНОКПП',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        bannerWarning: 'Перевірте одержувача: введення ІПН на сторонніх сайтах несе загрозу крадіжки особистих даних.',
        explanation: 'Введення персонального ідентифікаційного коду на підозрілих або фішингових сайтах може бути використане для оформлення кредитів на ваше ім’я.',
      };
    }

    return {
      shortLabel: meta.categoryLabel.length > 16 ? meta.categoryLabel.slice(0, 14) + '…' : meta.categoryLabel,
      iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L12 11l-4-4-6 6 4 4 6-6 5.5-5.5M19 5l-2-2"/></svg>`,
      bannerWarning: `Виявлено запит конфіденційного маркера безпеки: «${meta.categoryLabel}».`,
      explanation: `Це поле призначене для введення персонального маркера зі сховища Vault. Переконайтеся в надійності сайту перед відправкою.`,
    };
  }

  private static ensureStylesInjected(root: ShadowRoot): void {
    if (root.getElementById('ts-field-live-pill-styles')) return;

    const style = document.createElement('style');
    style.id = 'ts-field-live-pill-styles';
    style.textContent = `
      @keyframes tsFieldPillFadeIn {
        0% {
          opacity: 0;
          transform: translateY(3px) scale(0.97);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes tsBannerUnroll {
        0% {
          opacity: 0;
          transform: scale(0.88) translateY(-4px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes tsBannerRetract {
        0% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
        100% {
          opacity: 0;
          transform: scale(0.88) translateY(-4px);
        }
      }

      /* Resting Security Pill */
      .ts-field-live-pill {
        position: absolute !important;
        z-index: 2147483645 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        background: rgba(255, 255, 255, 0.94) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(0, 113, 227, 0.25) !important;
        color: #0071E3 !important;
        padding: 3px 8px !important;
        border-radius: 9999px !important;
        font-size: 10.5px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04) !important;
        cursor: pointer !important;
        user-select: none !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
        animation: tsFieldPillFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        transition: background-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .ts-field-live-pill:hover {
        border-color: rgba(0, 113, 227, 0.45) !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15) !important;
      }

      /* Morphed Red Alert State */
      .ts-field-live-pill.ts-pill-red {
        background: rgba(254, 242, 242, 0.96) !important;
        border-color: rgba(220, 38, 38, 0.45) !important;
        color: #DC2626 !important;
        box-shadow: 0 3px 12px rgba(220, 38, 38, 0.18), 0 1px 3px rgba(220, 38, 38, 0.08) !important;
      }

      .ts-field-live-pill.ts-pill-red:hover {
        background: rgba(254, 226, 226, 0.98) !important;
        border-color: rgba(220, 38, 38, 0.65) !important;
        box-shadow: 0 4px 16px rgba(220, 38, 38, 0.25) !important;
      }

      /* Unrolled Informational Banner Curtain */
      .ts-field-banner-curtain {
        position: absolute !important;
        z-index: 2147483646 !important;
        background: rgba(255, 255, 255, 0.96) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(0, 113, 227, 0.35) !important;
        border-radius: 8px !important;
        padding: 6px 10px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
        box-sizing: border-box !important;
        animation: tsBannerUnroll 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        pointer-events: auto !important;
      }

      .ts-field-banner-curtain.ts-retracting {
        animation: tsBannerRetract 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        pointer-events: none !important;
      }

      /* Popover Card */
      .ts-field-live-popover {
        position: absolute !important;
        z-index: 2147483647 !important;
        background: rgba(255, 255, 255, 0.98) !important;
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;
        border-radius: 14px !important;
        padding: 12px 14px !important;
        width: 300px !important;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
        animation: tsFieldPillFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }
    `;
    root.appendChild(style);
  }
}
