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
}

export interface FieldLivePillRecord {
  input: HTMLInputElement | HTMLTextAreaElement;
  metadata: FieldProtectionMetadata;
  details: FieldDetailsInfo;
  pillElement: HTMLElement;
  isExpanded: boolean;
  isRedAlert: boolean;
  isHovered: boolean;
  cleanups: Array<() => void>;
}

export class FieldLivePill {
  private static activePills = new Map<HTMLInputElement | HTMLTextAreaElement, FieldLivePillRecord>();
  private static viewportListenerAttached = false;

  /**
   * Створення та прикріплення мікро-пігулки безпеки під полем форми (праворуч знизу)
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

    root.appendChild(pill);

    const record: FieldLivePillRecord = {
      input,
      metadata: meta,
      details,
      pillElement: pill,
      isExpanded: false,
      isRedAlert: false,
      isHovered: false,
      cleanups: [],
    };

    // Початковий рендер вмісту пігулки
    const hasInitialValue = Boolean(input.value && input.value.trim().length >= 2);
    if (hasInitialValue) {
      record.isRedAlert = true;
    }
    this.renderPillContent(record);
    this.updatePillPosition(input, pill);

    // 1. Поведінка при наведенні та кліку на пігулку (розгортання/згортання застереження)
    const handleMouseEnterPill = () => {
      record.isHovered = true;
      if (!record.isExpanded) {
        this.expandPill(input, record);
      }
    };

    const handleMouseLeavePill = () => {
      record.isHovered = false;
      const isFocused = typeof document !== 'undefined' && document.activeElement === input;
      // Якщо поле не у фокусі або вже введено достатньо символів (червона тривога) — згортаємо
      if (!isFocused || input.value.trim().length >= 2) {
        if (record.isExpanded) {
          this.collapsePill(input, record);
        }
      }
    };

    const handleClickPill = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.ts-pill-quick-clean-btn')) {
        // Клік по кнопці очищення обробляється окремо
        return;
      }
      e.stopPropagation();
      if (record.isExpanded) {
        this.collapsePill(input, record);
      } else {
        this.expandPill(input, record);
      }
    };

    pill.addEventListener('mouseenter', handleMouseEnterPill);
    pill.addEventListener('mouseleave', handleMouseLeavePill);
    pill.addEventListener('click', handleClickPill);

    record.cleanups.push(() => {
      pill.removeEventListener('mouseenter', handleMouseEnterPill);
      pill.removeEventListener('mouseleave', handleMouseLeavePill);
      pill.removeEventListener('click', handleClickPill);
    });

    // 2. Інтерактивна реакція на дії користувача в полі (ручне введення, фокус, blur)
    const handleFocus = () => {
      if (input.value.trim().length <= 1 && !record.isRedAlert) {
        this.expandPill(input, record);
      }
    };

    const handleInput = () => {
      const val = input.value.trim();

      if (val.length === 0) {
        // Поле очищено: повертаємо у початковий синій стан спокою
        if (record.isRedAlert) {
          this.setRedAlertState(input, record, false);
        }
        if (record.isExpanded) {
          this.collapsePill(input, record);
        }
      } else if (val.length === 1) {
        // Перший символ: інформаційне застереження розгортається з пігулки
        if (!record.isExpanded && !record.isRedAlert) {
          this.expandPill(input, record);
        }
      } else {
        // Користувач продовжує введення (довжина >= 2):
        // Повідомлення плавно згортається назад у пігулку за кривою Apple, змінюючи колір на червоний!
        if (record.isExpanded) {
          this.collapsePill(input, record);
        }
        if (!record.isRedAlert) {
          this.setRedAlertState(input, record, true);
        }
      }
    };

    const handleBlur = () => {
      if (record.isExpanded && !record.isHovered) {
        this.collapsePill(input, record);
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

    if (record.pillElement && record.pillElement.parentNode) {
      record.pillElement.parentNode.removeChild(record.pillElement);
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
  }

  private static handleViewportChange = () => {
    for (const [input, record] of FieldLivePill.activePills.entries()) {
      if (input.isConnected) {
        FieldLivePill.updatePillPosition(input, record.pillElement);
      } else {
        FieldLivePill.detach(input);
      }
    }
  };

  /**
   * Розташування пігулки: строго праворуч знизу під полем (не перекриваючи поле вводу)
   */
  public static updatePillPosition(input: HTMLInputElement | HTMLTextAreaElement, pill: HTMLElement): void {
    if (!input.isConnected) return;

    const rect = input.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const pillWidth = pill.offsetWidth || (pill.classList.contains('ts-expanded') ? 280 : 96);

    // Розміщуємо строго ЗНИЗУ під полем (gap: 4px)
    const top = scrollY + rect.bottom + 4;

    // Праворуч знизу під полем: вирівнюємо правий край пігулки з правим краєм поля
    let left = scrollX + rect.right - pillWidth;

    // Якщо лівий край пігулки виходить за лівий край вікна браузера
    if (left < scrollX + 8) {
      left = scrollX + 8;
    }

    // Запобігаємо виходу за правий край екрану
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1200) + scrollX - pillWidth - 8;
    if (left > maxLeft) {
      left = Math.max(scrollX + 8, maxLeft);
    }

    pill.style.top = `${Math.max(0, top)}px`;
    pill.style.left = `${Math.max(0, left)}px`;
  }

  /**
   * Розгортання інформаційного повідомлення прямо з пігулки (без сторонніх вікон)
   */
  public static expandPill(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    record.isExpanded = true;
    this.renderPillContent(record);
    this.updatePillPosition(input, record.pillElement);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePillPosition(input, record.pillElement);
      });
    }
  }

  /**
   * Згортання повідомлення назад у компактну пігулку за фірмовою Apple-кривою
   */
  public static collapsePill(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    record.isExpanded = false;
    this.renderPillContent(record);
    this.updatePillPosition(input, record.pillElement);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePillPosition(input, record.pillElement);
      });
    }
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
    this.renderPillContent(record);
    this.updatePillPosition(input, record.pillElement);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePillPosition(input, record.pillElement);
      });
    }
  }

  /**
   * Рендеринг вмісту пігулки залежно від поточного стану
   */
  private static renderPillContent(record: FieldLivePillRecord): void {
    const pill = record.pillElement;
    const details = record.details;
    const isRed = record.isRedAlert;
    const isExpanded = record.isExpanded;

    pill.classList.toggle('ts-pill-red', isRed);
    pill.classList.toggle('ts-expanded', isExpanded);

    if (isExpanded) {
      if (isRed) {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #DC2626; display: flex; align-items: center; flex-shrink: 0;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span class="ts-field-pill-msg" style="color: #991B1B; font-size: 11px; line-height: 1.35; font-weight: 500; flex: 1;">
            ${details.bannerWarning}
          </span>
          <button class="ts-pill-quick-clean-btn ts-clean-prominent" title="Очистити поле" type="button">
            Очистити
          </button>
        `;
      } else {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #0071E3; display: flex; align-items: center; flex-shrink: 0;">
            ${details.iconSvg}
          </span>
          <span class="ts-field-pill-msg" style="color: #1D1D1F; font-size: 11px; line-height: 1.35; font-weight: 500;">
            ${details.bannerWarning}
          </span>
        `;
      }
    } else {
      if (isRed) {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #DC2626; display: flex; align-items: center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span class="ts-field-pill-label" style="color: #B91C1C; font-weight: 700;">${details.shortLabel}</span>
          <span style="font-size: 9px; color: #DC2626; opacity: 0.7;">•</span>
          <span style="font-size: 9.5px; color: #DC2626; font-weight: 600;">Увага</span>
          <button class="ts-pill-quick-clean-btn" title="Очистити поле" type="button">Очистити</button>
        `;
      } else {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #0071E3; display: flex; align-items: center;">
            ${details.iconSvg}
          </span>
          <span class="ts-field-pill-label" style="color: #1D1D1F;">${details.shortLabel}</span>
          <span style="font-size: 9px; color: #86868B;">•</span>
          <span style="font-size: 9.5px; color: #0071E3; font-weight: 500;">Захист</span>
        `;
      }
    }

    // Слухач для кнопки швидкого очищення
    const cleanBtn = pill.querySelector('.ts-pill-quick-clean-btn');
    if (cleanBtn) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearInputField(record.input, record);
      });
    }
  }

  /**
   * Очищення поля в 1 клік зі скиданням пігулки в безпечний стан
   */
  public static clearInputField(input: HTMLInputElement | HTMLTextAreaElement, record: FieldLivePillRecord): void {
    if ('value' in input && typeof input.value === 'string') {
      const proto = input instanceof HTMLTextAreaElement
        ? (typeof window !== 'undefined' ? window.HTMLTextAreaElement?.prototype : null)
        : (typeof window !== 'undefined' ? window.HTMLInputElement?.prototype : null);
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
    this.collapsePill(input, record);
  }

  private static resolveFieldDetails(meta: FieldProtectionMetadata): FieldDetailsInfo {
    const type = meta.fieldType;
    const labelLower = (meta.categoryLabel || '').toLowerCase();

    if (type === 'PAYMENT_CVV' || labelLower.includes('cvv') || labelLower.includes('cvc')) {
      return {
        shortLabel: 'CVV',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Для отримання коштів CVV-код ніколи не потрібен! Його запитують лише для списання.',
      };
    }

    if (type === 'PAYMENT_EXPIRY' || labelLower.includes('термін') || labelLower.includes('срок') || labelLower.includes('exp')) {
      return {
        shortLabel: 'Термін дії',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        bannerWarning: 'Термін дії картки потрібен лише для покупок, а не для зарахування коштів.',
      };
    }

    if (type === 'PAYMENT_PIN' || labelLower.includes('пін') || labelLower.includes('pin')) {
      return {
        shortLabel: 'ПІН-код',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Категорично заборонено: введення ПІН-коду картки на вебсайтах!',
      };
    }

    if (type === 'TAX_ID' || labelLower.includes('іпн') || labelLower.includes('рнокпп') || labelLower.includes('податк')) {
      return {
        shortLabel: 'ІПН / РНОКПП',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        bannerWarning: 'Перевірте одержувача: введення ІПН на сторонніх сайтах несе загрозу крадіжки особистих даних.',
      };
    }

    return {
      shortLabel: meta.categoryLabel.length > 16 ? meta.categoryLabel.slice(0, 14) + '…' : meta.categoryLabel,
      iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L12 11l-4-4-6 6 4 4 6-6 5.5-5.5M19 5l-2-2"/></svg>`,
      bannerWarning: `Виявлено запит конфіденційного маркера безпеки: «${meta.categoryLabel}».`,
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

      /* Resting Security Pill (Bottom-right under input) */
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
        padding: 3px 9px !important;
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
        max-width: 95vw !important;
        animation: tsFieldPillFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        transition: padding 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    background-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
        pointer-events: auto !important;
      }

      .ts-field-live-pill:hover {
        border-color: rgba(0, 113, 227, 0.45) !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15) !important;
      }

      /* Unrolled Informational Message (Expanded Pill under field) */
      .ts-field-live-pill.ts-expanded {
        border-radius: 10px !important;
        padding: 6px 11px !important;
        white-space: normal !important;
        max-width: 380px !important;
        gap: 8px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.10), 0 2px 6px rgba(0, 0, 0, 0.04) !important;
        cursor: default !important;
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

      .ts-field-live-pill.ts-pill-red.ts-expanded {
        border-color: rgba(220, 38, 38, 0.55) !important;
        box-shadow: 0 8px 24px rgba(220, 38, 38, 0.20), 0 2px 6px rgba(220, 38, 38, 0.08) !important;
      }

      /* Inline Quick Clean Button */
      .ts-pill-quick-clean-btn {
        all: unset !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        cursor: pointer !important;
        background: rgba(220, 38, 38, 0.12) !important;
        color: #DC2626 !important;
        border: 1px solid rgba(220, 38, 38, 0.25) !important;
        font-size: 9.5px !important;
        font-weight: 600 !important;
        padding: 1.5px 7px !important;
        border-radius: 9999px !important;
        margin-left: 2px !important;
        display: inline-flex !important;
        align-items: center !important;
        line-height: 1.3 !important;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }

      .ts-pill-quick-clean-btn:hover {
        background: #DC2626 !important;
        color: #FFFFFF !important;
        border-color: #DC2626 !important;
        transform: scale(1.03) !important;
      }

      .ts-pill-quick-clean-btn.ts-clean-prominent {
        background: #DC2626 !important;
        color: #FFFFFF !important;
        border-color: #DC2626 !important;
        font-size: 10px !important;
        padding: 3px 8px !important;
        border-radius: 6px !important;
        box-shadow: 0 1px 3px rgba(220, 38, 38, 0.3) !important;
      }

      .ts-pill-quick-clean-btn.ts-clean-prominent:hover {
        background: #B91C1C !important;
        border-color: #B91C1C !important;
        box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4) !important;
      }
    `;
    root.appendChild(style);
  }
}
