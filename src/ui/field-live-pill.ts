import { ShadowHost } from './shadow-host';

export interface FieldProtectionMetadata {
  categoryLabel: string;
  fieldType: 'VAULT_ITEM' | 'PAYMENT_CVV' | 'PAYMENT_PIN' | 'PAYMENT_EXPIRY' | 'TAX_ID';
  isTierA?: boolean;
}

export interface FieldDetailsInfo {
  label: string;
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
  isCaution: boolean;
  isVaultAlert: boolean;
  isRedAlert: boolean;
  vaultLabel?: string;
  isHovered: boolean;
  cleanups: Array<() => void>;
  lastRenderedSignature?: string;
}

export class FieldLivePill {
  private static activePills = new Map<HTMLInputElement | HTMLTextAreaElement, FieldLivePillRecord>();
  private static viewportListenerAttached = false;

  /**
   * Чи закріплено за цим полем активну пігулку безпеки
   */
  public static hasPill(input: HTMLElement): boolean {
    return this.activePills.has(input as any);
  }

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
      isCaution: false,
      isVaultAlert: false,
      isRedAlert: false,
      isHovered: false,
      cleanups: [],
    };

    // Якщо в полі вже є довгий текст (> 7 символів) — вмикаємо делікатне бурштинове застереження
    const valLength = (input.value || '').trim().length;
    if (valLength > 7) {
      record.isCaution = true;
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
      // Згортаємо лише якщо поле не у фокусі АБО введено більше 7 символів
      if (!isFocused || (input.value || '').trim().length > 7) {
        if (record.isExpanded) {
          this.collapsePill(input, record);
        }
      }
    };

    const handleClickPill = (e: MouseEvent) => {
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
      // При фокусі розгортаємо застереження, якщо введено не більше 7 символів
      if ((input.value || '').trim().length <= 7) {
        this.expandPill(input, record);
      }
    };

    const handleInput = () => {
      const val = (input.value || '').trim();
      const hasText = val.length > 0;

      if (record.isVaultAlert) {
        // Якщо активна тривога Сховища: розгорнуто при <= 7 символах, згорнуто при > 7
        this.updateCleanButtonVisibility(record, hasText);
        if (val.length <= 7) {
          if (!record.isExpanded) this.expandPill(input, record);
        } else {
          if (record.isExpanded) this.collapsePill(input, record);
        }
        return;
      }

      if (val.length === 0) {
        // Поле очищено: повертаємо у початковий стан спокою
        record.isCaution = false;
        record.isRedAlert = false;
        this.updateCleanButtonVisibility(record, false);
        if (record.isExpanded) {
          this.collapsePill(input, record);
        } else {
          this.renderPillContent(record);
        }
      } else if (val.length <= 7) {
        // Від 1 до 7 символів: застереження залишається РОЗГОРНУТИМ (людина встигає прочитати)
        record.isCaution = false;
        record.isRedAlert = false;
        this.updateCleanButtonVisibility(record, true);
        if (!record.isExpanded) {
          this.expandPill(input, record);
        }
      } else {
        // Більше 7 символів: користувач свідомо продовжує введення.
        // Банер плавно згортається в компактну бурштинову пігулку (Warm Amber), звільняючи форму
        const wasCaution = record.isCaution;
        record.isCaution = true;
        record.isRedAlert = false;
        this.updateCleanButtonVisibility(record, true);
        if (record.isExpanded) {
          this.collapsePill(input, record);
        } else if (!wasCaution) {
          this.renderPillContent(record);
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

    const record = this.activePills.get(input);
    const rect = input.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const isExpanded = record?.isExpanded || pill.classList.contains('ts-expanded');
    const FIXED_EXPANDED_WIDTH = 340;
    const pillWidth = isExpanded ? FIXED_EXPANDED_WIDTH : (pill.offsetWidth || 180);
    const pillHeight = pill.offsetHeight || (isExpanded ? 88 : 28);

    // Розміщуємо акуратно під нижнім правим краєм поля
    let top = scrollY + rect.bottom + 5;
    let left = scrollX + rect.right - pillWidth;

    // Якщо не влазить праворуч або поле вужче за розгорнутий банер — вирівнюємо по лівому краю поля
    if (left < scrollX + rect.left) {
      left = scrollX + rect.left;
    }

    // Запобігаємо виходу за лівий край екрану
    if (left < scrollX + 8) {
      left = scrollX + 8;
    }

    // Запобігаємо виходу за правий край вікна
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1200) + scrollX - pillWidth - 10;
    if (left > maxLeft) {
      left = Math.max(scrollX + 8, maxLeft);
    }

    // Якщо знизу не вистачає місця у в'юпорті — виносимо над полем
    if (typeof window !== 'undefined' && rect.bottom + pillHeight + 10 > window.innerHeight) {
      top = scrollY + rect.top - pillHeight - 5;
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
   * Плавний морфінг пігулки у стан тривоги Сховища (Singular Presence)
   */
  public static morphToVaultAlert(
    input: HTMLInputElement | HTMLTextAreaElement,
    vaultLabel: string
  ): void {
    const record = this.activePills.get(input);
    if (!record) return;

    // ОПТИМІЗАЦІЯ: Уникаємо постійного перемальовування (блимання) при кожному натисканні клавіші
    if (record.isVaultAlert && record.vaultLabel === vaultLabel && record.isRedAlert) {
      // Стан вже встановлено. Дозволяємо власному слухачеві 'input' у FieldLivePill керувати згортанням/розгортанням.
      return;
    }

    record.isVaultAlert = true;
    record.isRedAlert = true;
    record.vaultLabel = vaultLabel;

    // Якщо в полі до 7 символів — розгортаємо детальне застереження Сховища
    if ((input.value || '').trim().length <= 7) {
      record.isExpanded = true;
    } else {
      record.isExpanded = false;
    }

    this.renderPillContent(record);
    this.updatePillPosition(input, record.pillElement);
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePillPosition(input, record.pillElement);
      });
    }
  }

  /**
   * Скидання стану тривоги Сховища до звичайного спостереження
   */
  public static clearVaultAlert(input: HTMLInputElement | HTMLTextAreaElement): void {
    const record = this.activePills.get(input);
    if (!record) return;

    if (!record.isVaultAlert) {
      // Якщо стан і так звичайний — не перемальовуємо
      return;
    }

    record.isVaultAlert = false;
    record.isRedAlert = false;
    delete record.vaultLabel;

    const val = (input.value || '').trim();
    record.isCaution = val.length > 7;
    if (typeof document !== 'undefined' && document.activeElement !== input) {
      record.isExpanded = false;
    }

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
    record.isVaultAlert = isRed;
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
   * Оновлення видимості кнопки очищення без перезавантаження DOM дерева
   */
  private static updateCleanButtonVisibility(record: FieldLivePillRecord, hasText: boolean): void {
    const cleanWrap = record.pillElement.querySelector('.ts-field-clean-wrap') as HTMLElement | null;
    if (cleanWrap) {
      cleanWrap.style.display = hasText ? 'flex' : 'none';
    }
  }

  /**
   * Рендеринг вмісту пігулки залежно від поточного стану (Fluid Morphing)
   */
  private static renderPillContent(record: FieldLivePillRecord): void {
    const pill = record.pillElement;
    const details = record.details;
    const isExpanded = record.isExpanded;
    const isVaultAlert = record.isVaultAlert;
    const isCaution = record.isCaution;
    const hasText = (record.input?.value || '').trim().length > 0;
    const displayLabel = details.label || details.shortLabel;

    pill.classList.toggle('ts-pill-red', isVaultAlert);
    pill.classList.toggle('ts-pill-amber', isCaution && !isVaultAlert);
    pill.classList.toggle('ts-expanded', isExpanded);

    const currentSignature = `${isVaultAlert ? '1' : '0'}_${record.vaultLabel || ''}_${isCaution ? '1' : '0'}_${isExpanded ? '1' : '0'}`;

    if (record.lastRenderedSignature === currentSignature && pill.children.length > 0) {
      this.updateCleanButtonVisibility(record, hasText);
      return;
    }

    record.lastRenderedSignature = currentSignature;

    if (isVaultAlert) {
      // 1. ПІДТВЕРДЖЕНИЙ ЗБІГ ЗІ СХОВИЩЕМ (КРИТИЧНИЙ СТАН CRIMSON RED)
      const vaultLabel = record.vaultLabel || displayLabel;
      if (isExpanded) {
        pill.innerHTML = `
          <div class="ts-field-pill-inner" style="display: flex; flex-direction: column; width: 100%;">
            <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
              <span class="ts-field-pill-icon" style="color: #DC2626; display: flex; align-items: center; margin-top: 1px; flex-shrink: 0;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;">
                  <span style="font-size: 11.5px; font-weight: 700; color: #991B1B; letter-spacing: -0.01em; min-width: 0; word-break: break-word; line-height: 1.25;">
                    Сховище: ${vaultLabel}
                  </span>
                  <span style="font-size: 9.5px; color: #DC2626; font-weight: 600; margin-left: auto; white-space: nowrap; flex-shrink: 0;">
                    Особистий секрет
                  </span>
                </div>
                <p style="font-size: 10.5px; line-height: 1.35; color: #7F1D1D; margin: 2px 0 0 0; word-break: break-word;">
                  Виявлено збережений маркер безпеки. Не передавайте його стороннім ресурсам!
                </p>
              </div>
            </div>
            <div class="ts-field-clean-wrap" style="display: ${hasText ? 'flex' : 'none'}; justify-content: flex-end; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(220, 38, 38, 0.12);">
              <button class="ts-pill-action-chip ts-field-clean-action">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Очистити
              </button>
            </div>
          </div>
        `;
      } else {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #DC2626; display: flex; align-items: center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <span class="ts-field-pill-label" style="color: #B91C1C; font-weight: 700;">Сховище: ${vaultLabel}</span>
          <span style="font-size: 9px; color: #DC2626; opacity: 0.7;">•</span>
          <span style="font-size: 9.5px; color: #DC2626; font-weight: 600;">Маркер</span>
        `;
      }
    } else if (isCaution) {
      // 2. ДЕЛІКАТНЕ ЗАСТЕРЕЖЕННЯ ПРИ ВВЕДЕННІ (> 7 символів) — ТЕПЛИЙ БУРШТИН (AMBER)
      if (isExpanded) {
        pill.innerHTML = `
          <div class="ts-field-pill-inner" style="display: flex; flex-direction: column; width: 100%;">
            <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
              <span class="ts-field-pill-icon" style="color: #D97706; display: flex; align-items: center; margin-top: 1px; flex-shrink: 0;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;">
                  <span style="font-size: 11.5px; font-weight: 700; color: #92400E; letter-spacing: -0.01em; min-width: 0; word-break: break-word; line-height: 1.25;">
                    ${displayLabel}
                  </span>
                  <span style="font-size: 9.5px; color: #D97706; font-weight: 600; margin-left: auto; white-space: nowrap; flex-shrink: 0;">
                    Увага
                  </span>
                </div>
                <p style="font-size: 10.5px; line-height: 1.35; color: #92400E; margin: 2px 0 0 0; word-break: break-word;">
                  ${details.bannerWarning}
                </p>
              </div>
            </div>
            <div class="ts-field-clean-wrap" style="display: ${hasText ? 'flex' : 'none'}; justify-content: flex-end; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(217, 119, 6, 0.15);">
              <button class="ts-pill-action-chip ts-field-clean-action">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Очистити
              </button>
            </div>
          </div>
        `;
      } else {
        pill.innerHTML = `
          <span class="ts-field-pill-icon" style="color: #D97706; display: flex; align-items: center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span class="ts-field-pill-label" style="color: #92400E; font-weight: 700;">${details.shortLabel}</span>
          <span style="font-size: 9px; color: #D97706; opacity: 0.7;">•</span>
          <span style="font-size: 9.5px; color: #D97706; font-weight: 600;">Увага</span>
        `;
      }
    } else {
      // 3. СТАН СПОКОЮ ТА РОЗГОРНУТОЇ ПІДКАЗКИ (0–7 СИМВОЛІВ АБО ФОКУС) — SANCTUARY BLUE
      if (isExpanded) {
        pill.innerHTML = `
          <div class="ts-field-pill-inner" style="display: flex; flex-direction: column; width: 100%;">
            <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
              <span class="ts-field-pill-icon" style="color: #0071E3; display: flex; align-items: center; margin-top: 1px; flex-shrink: 0;">
                ${details.iconSvg}
              </span>
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;">
                  <span style="font-size: 11.5px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.01em; min-width: 0; word-break: break-word; line-height: 1.25;">
                    ${displayLabel}
                  </span>
                  <span style="font-size: 9.5px; color: #0071E3; font-weight: 600; margin-left: auto; white-space: nowrap; flex-shrink: 0;">
                    Захист поля
                  </span>
                </div>
                <p style="font-size: 10.5px; line-height: 1.35; color: #515154; margin: 2px 0 0 0; word-break: break-word;">
                  ${details.bannerWarning}
                </p>
              </div>
            </div>
            <div class="ts-field-clean-wrap" style="display: ${hasText ? 'flex' : 'none'}; justify-content: flex-end; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(0, 113, 227, 0.10);">
              <button class="ts-pill-action-chip ts-field-clean-action">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Очистити
              </button>
            </div>
          </div>
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

    const cleanBtn = pill.querySelector('.ts-field-clean-action');
    if (cleanBtn) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearInputField(record.input, record);
      });
    }
  }

  /**
   * Очищення поля зі скиданням пігулки в безпечний стан
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

    record.isCaution = false;
    record.isVaultAlert = false;
    record.isRedAlert = false;
    this.collapsePill(input, record);
  }

  private static resolveFieldDetails(meta: FieldProtectionMetadata): FieldDetailsInfo {
    const type = meta.fieldType;
    const labelLower = (meta.categoryLabel || '').toLowerCase();

    if (type === 'PAYMENT_CVV' || labelLower.includes('cvv') || labelLower.includes('cvc')) {
      return {
        label: meta.categoryLabel || 'CVV',
        shortLabel: 'CVV',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Для отримання коштів CVV-код ніколи не потрібен! Його запитують лише для списання.',
      };
    }

    if (type === 'PAYMENT_EXPIRY' || labelLower.includes('термін') || labelLower.includes('срок') || labelLower.includes('exp')) {
      return {
        label: meta.categoryLabel || 'Термін дії',
        shortLabel: 'Термін дії',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        bannerWarning: 'Термін дії картки потрібен лише для покупок, а не для зарахування коштів.',
      };
    }

    if (type === 'PAYMENT_PIN' || labelLower.includes('пін') || labelLower.includes('pin')) {
      return {
        label: meta.categoryLabel || 'ПІН-код',
        shortLabel: 'ПІН-код',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        bannerWarning: 'Категорично заборонено: введення ПІН-коду картки на вебсайтах!',
      };
    }

    if (type === 'TAX_ID' || labelLower.includes('іпн') || labelLower.includes('рнокпп') || labelLower.includes('податк')) {
      return {
        label: meta.categoryLabel || 'ІПН / РНОКПП',
        shortLabel: 'ІПН / РНОКПП',
        iconSvg: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        bannerWarning: 'Перевірте одержувача: введення ІПН на сторонніх сайтах несе загрозу крадіжки особистих даних.',
      };
    }

    return {
      label: meta.categoryLabel,
      shortLabel: meta.categoryLabel,
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
        padding: 3.5px 10px !important;
        border-radius: 14px !important;
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
        transition: padding 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    width 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    background-color 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    color 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        pointer-events: auto !important;
      }

      .ts-field-live-pill:hover {
        border-color: rgba(0, 113, 227, 0.45) !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15) !important;
      }

      .ts-field-pill-label {
        display: inline-block !important;
        max-width: 140px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        vertical-align: middle !important;
      }

      /* Unrolled Informational Message (Expanded Pill under field) */
      .ts-field-live-pill.ts-expanded {
        display: block !important;
        width: 340px !important;
        max-width: calc(100vw - 20px) !important;
        padding: 10px 14px !important;
        border-radius: 12px !important;
        white-space: normal !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        cursor: default !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
      }

      @keyframes tsContentUnroll {
        0% {
          opacity: 0;
          transform: translateY(-2px) scale(0.98);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .ts-field-live-pill.ts-expanded .ts-field-pill-inner {
        animation: tsContentUnroll 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        width: 100% !important;
      }

      /* Morphed Amber Caution State (> 7 characters) */
      .ts-field-live-pill.ts-pill-amber {
        background: rgba(255, 251, 235, 0.96) !important;
        border-color: rgba(217, 119, 6, 0.35) !important;
        color: #B45309 !important;
        box-shadow: 0 2px 8px rgba(217, 119, 6, 0.12), 0 1px 2px rgba(217, 119, 6, 0.06) !important;
      }

      .ts-field-live-pill.ts-pill-amber:hover {
        background: rgba(254, 243, 199, 0.98) !important;
        border-color: rgba(217, 119, 6, 0.55) !important;
        box-shadow: 0 3px 12px rgba(217, 119, 6, 0.18) !important;
      }

      .ts-field-live-pill.ts-pill-amber.ts-expanded {
        border-color: rgba(217, 119, 6, 0.45) !important;
        box-shadow: 0 8px 24px rgba(217, 119, 6, 0.16), 0 2px 6px rgba(217, 119, 6, 0.06) !important;
      }

      /* Morphed Red Alert State (Direct Vault Secret Match) */
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

      /* Action Chips (Integrated Minimalist Clean Button) */
      .ts-pill-action-chip {
        all: unset !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        cursor: pointer !important;
        font-family: inherit !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        padding: 2.5px 9px !important;
        border-radius: 9999px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
        box-sizing: border-box !important;
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        background: rgba(0, 113, 227, 0.08) !important;
        color: #0071E3 !important;
        border: 1px solid rgba(0, 113, 227, 0.25) !important;
        transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease !important;
      }

      .ts-pill-action-chip:hover {
        background: #0071E3 !important;
        color: #FFFFFF !important;
        border-color: #0071E3 !important;
        box-shadow: 0 2px 6px rgba(0, 113, 227, 0.22) !important;
      }

      .ts-field-live-pill.ts-pill-amber .ts-pill-action-chip {
        background: rgba(217, 119, 6, 0.08) !important;
        color: #B45309 !important;
        border: 1px solid rgba(217, 119, 6, 0.25) !important;
      }

      .ts-field-live-pill.ts-pill-amber .ts-pill-action-chip:hover {
        background: #D97706 !important;
        color: #FFFFFF !important;
        border-color: #D97706 !important;
        box-shadow: 0 2px 6px rgba(217, 119, 6, 0.22) !important;
      }

      .ts-field-live-pill.ts-pill-red .ts-pill-action-chip {
        background: rgba(220, 38, 38, 0.08) !important;
        color: #DC2626 !important;
        border: 1px solid rgba(220, 38, 38, 0.28) !important;
      }

      .ts-field-live-pill.ts-pill-red .ts-pill-action-chip:hover {
        background: #DC2626 !important;
        color: #FFFFFF !important;
        border-color: #DC2626 !important;
        box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25) !important;
      }
    `;
    root.appendChild(style);
  }
}
