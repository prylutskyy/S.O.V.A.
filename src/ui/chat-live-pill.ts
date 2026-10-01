import { ShadowHost } from './shadow-host';
import { SessionOutboundEvaluation } from '../heuristics/session-outbound-memory';
import { FieldLivePill } from './field-live-pill';

export interface PillDetailItem {
  id: string;
  iconSvg: string;
  label: string;
  sublabel: string;
  explanation: string;
  stripType: 'CVV' | 'GPS' | 'SABOTAGE' | 'VAULT' | 'OTP';
  vaultValue?: string;
  isCivic: boolean;
  priority: number;
  buttonLabel: string;
}

export class ChatLivePill {
  private static activePill: HTMLElement | null = null;
  private static activePopover: HTMLElement | null = null;
  private static currentInput: (HTMLInputElement | HTMLTextAreaElement) | null = null;
  private static currentEvaluation: SessionOutboundEvaluation | null = null;
  private static currentDetailsList: PillDetailItem[] = [];
  private static scrollListenerAttached = false;
  private static popoverCloseTimer: any = null;
  private static isExpanded = false;

  /**
   * Відобразити або оновити мікро-капсулу безпеки під полем чату
   */
  public static show(
    input: HTMLInputElement | HTMLTextAreaElement,
    evaluation: SessionOutboundEvaluation
  ): void {
    if (typeof document === 'undefined') return;
    if (FieldLivePill.hasPill(input)) return;

    this.currentInput = input;
    this.currentEvaluation = evaluation;

    const root = ShadowHost.getRoot();
    this.ensureStylesInjected(root);

    // Збираємо повний перелік усіх активних тригерів, ранжований за небезпекою
    const detailsList = this.resolveAllPillDetails(evaluation);
    if (!detailsList || detailsList.length === 0) {
      this.hide();
      return;
    }
    this.currentDetailsList = detailsList;

    if (!this.activePill || !this.activePill.isConnected) {
      this.activePill = this.createPillElement(detailsList);
      root.appendChild(this.activePill);
    } else {
      this.renderPill(this.activePill, detailsList, this.isExpanded);
    }

    this.updatePosition();

    if (!this.scrollListenerAttached && typeof window !== 'undefined') {
      window.addEventListener('scroll', this.handleViewportChange, { passive: true });
      window.addEventListener('resize', this.handleViewportChange, { passive: true });
      this.scrollListenerAttached = true;
    }
  }

  /**
   * Приховати та демонтувати капсулу
   */
  public static hide(): void {
    this.cancelPopoverClose();
    this.isExpanded = false;
    this.activePopover = null;

    if (this.activePill && this.activePill.parentNode) {
      this.activePill.parentNode.removeChild(this.activePill);
    }
    this.activePill = null;
    this.currentInput = null;
    this.currentEvaluation = null;
    this.currentDetailsList = [];

    if (this.scrollListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.handleViewportChange);
      window.removeEventListener('resize', this.handleViewportChange);
      this.scrollListenerAttached = false;
    }
  }

  private static handleViewportChange = () => {
    if (ChatLivePill.activePill && ChatLivePill.currentInput) {
      ChatLivePill.updatePosition();
    }
  };

  /**
   * Оновлення координат розташування капсули під краєм поля введення
   */
  public static updatePosition(): void {
    if (!this.activePill || !this.currentInput || !this.currentInput.isConnected) {
      this.hide();
      return;
    }

    const rect = this.currentInput.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const pillWidth = this.activePill.offsetWidth || (this.isExpanded ? 360 : 180);
    const pillHeight = this.activePill.offsetHeight || (this.isExpanded ? 80 : 28);

    // Розміщуємо акуратно під нижнім правим краєм поля
    let top = scrollY + rect.bottom + 5;
    let left = scrollX + rect.right - pillWidth;

    // Якщо не влазить праворуч або поле дуже вузьке — вирівнюємо по лівому краю
    if (left < scrollX + rect.left) {
      left = scrollX + rect.left;
    }

    // Якщо знизу закінчився екран — виносимо над полем
    if (typeof window !== 'undefined' && rect.bottom + pillHeight + 10 > window.innerHeight) {
      top = scrollY + rect.top - pillHeight - 5;
    }

    this.activePill.style.top = `${Math.max(0, top)}px`;
    this.activePill.style.left = `${Math.max(0, left)}px`;
  }

  /**
   * Виявлення та ранжування ВСІХ активних тригерів у повідомленні
   */
  private static resolveAllPillDetails(evalRes: SessionOutboundEvaluation): PillDetailItem[] {
    const list: PillDetailItem[] = [];

    if (evalRes.leakage.hasSabotage) {
      list.push({
        id: 'sabotage',
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        label: 'Маркери безпеки',
        sublabel: 'Державна безпека',
        explanation: 'Текст містить маркери вербування до диверсій чи збору даних про захисників України (ст. 111-2, 113 КК України).',
        stripType: 'SABOTAGE',
        isCivic: true,
        priority: 1,
        buttonLabel: 'Очистити поле',
      });
    }

    if (evalRes.leakage.hasGps) {
      list.push({
        id: 'gps',
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
        label: 'Точні координати',
        sublabel: 'Національний спротив',
        explanation: 'Під час воєнного стану передача точних географічних координат або мап може нести загрозу коригування ворожих ударів.',
        stripType: 'GPS',
        isCivic: true,
        priority: 2,
        buttonLabel: 'Видалити координати',
      });
    }

    if (evalRes.leakage.hasCvv) {
      list.push({
        id: 'cvv',
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        label: 'Код безпеки (CVV)',
        sublabel: 'Секретні реквізити',
        explanation: 'Для отримання коштів тризначний CVV/CVC-код ніколи не потрібен. Його запитують лише для списання коштів з вашої картки.',
        stripType: 'CVV',
        isCivic: false,
        priority: 3,
        buttonLabel: 'Видалити CVV',
      });
    }

    if (evalRes.leakage.hasOtp) {
      list.push({
        id: 'otp',
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
        label: 'SMS-код безпеки (OTP)',
        sublabel: 'Одноразовий пароль',
        explanation: 'Ніколи не передавайте коди підтвердження з SMS третім особам. Справжні сервіси їх не запитують.',
        stripType: 'OTP',
        isCivic: false,
        priority: 4,
        buttonLabel: 'Видалити код',
      });
    }

    if (evalRes.vaultMatches && evalRes.vaultMatches.length > 0) {
      const seenVaultLabels = new Set<string>();
      for (const item of evalRes.vaultMatches) {
        const itemVal = (item as any).matchedValue || item.realValue || (item as any).value || '';
        const itemKey = `${item.label}_${itemVal}`;
        if (seenVaultLabels.has(itemKey)) continue;
        seenVaultLabels.add(itemKey);

        list.push({
          id: `vault_${item.label}_${itemVal}`,
          iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
          label: `Сховище: ${item.label}`,
          sublabel: 'Особистий секрет',
          explanation: `Ви ввели конфіденційний маркер зі свого Personal Vault («${item.label}»). Не передавайте його стороннім ресурсам.`,
          stripType: 'VAULT',
          vaultValue: itemVal,
          isCivic: false,
          priority: 5,
          buttonLabel: 'Видалити секрет',
        });
      }
    }

    return list.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Створення елемента капсули (Singular Interactive Surface)
   */
  private static createPillElement(detailsList: PillDetailItem[]): HTMLElement {
    const pill = document.createElement('div');
    pill.className = 'ts-chat-live-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    this.renderPill(pill, detailsList, false);

    pill.addEventListener('mouseenter', () => {
      this.cancelPopoverClose();
      this.expandPill(pill, this.currentDetailsList);
    });

    pill.addEventListener('mouseleave', () => {
      this.schedulePopoverClose();
    });

    pill.addEventListener('click', (e) => {
      // Якщо клікнули на саму пігулку (не на кнопку) — розгортаємо/згортаємо
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      e.stopPropagation();
      this.cancelPopoverClose();
      if (!this.isExpanded) {
        this.expandPill(pill, this.currentDetailsList);
      }
    });

    return pill;
  }

  public static expandPill(pill: HTMLElement, detailsList: PillDetailItem[]): void {
    this.isExpanded = true;
    this.activePopover = pill;
    this.renderPill(pill, detailsList, true);
    this.updatePosition();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePosition();
      });
    }
  }

  public static collapsePill(pill: HTMLElement, detailsList: PillDetailItem[]): void {
    this.isExpanded = false;
    this.activePopover = null;
    this.renderPill(pill, detailsList, false);
    this.updatePosition();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.updatePosition();
      });
    }
  }

  private static schedulePopoverClose(): void {
    if (this.popoverCloseTimer) clearTimeout(this.popoverCloseTimer);
    this.popoverCloseTimer = setTimeout(() => {
      if (this.activePill && this.isExpanded) {
        this.collapsePill(this.activePill, this.currentDetailsList);
      }
    }, 180);
  }

  private static cancelPopoverClose(): void {
    if (this.popoverCloseTimer) {
      clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }
  }

  public static closePopover(): void {
    if (this.activePill && this.isExpanded) {
      this.collapsePill(this.activePill, this.currentDetailsList);
    }
  }

  /**
   * Суцільний рендеринг вмісту пігулки (In-Place Fluid Surface)
   */
  private static renderPill(pill: HTMLElement, detailsList: PillDetailItem[], isExpanded: boolean): void {
    const count = detailsList.length;
    const primary = detailsList[0];
    if (!primary) return;

    const isRed = detailsList.some(d => d.stripType === 'VAULT' || d.stripType === 'CVV' || d.stripType === 'OTP' || d.stripType === 'SABOTAGE');
    const isCivic = !isRed && detailsList.some(d => d.isCivic || d.stripType === 'GPS');
    const accentColor = isRed ? '#DC2626' : (isCivic ? '#0284C7' : '#0071E3');
    const labelColor = isRed ? '#991B1B' : (isCivic ? '#0369A1' : '#1D1D1F');

    // Керування базовими класами
    pill.className = 'ts-chat-live-pill';
    if (count >= 3) {
      pill.classList.add('ts-has-stack', 'ts-has-stack-multi');
    } else if (count === 2) {
      pill.classList.add('ts-has-stack');
    }

    if (isRed) {
      pill.classList.add('ts-pill-red');
    } else if (isCivic) {
      pill.classList.add('ts-civic');
    }

    if (isExpanded) {
      pill.classList.add('ts-expanded', 'ts-chat-live-popover');
    } else {
      pill.classList.remove('ts-expanded', 'ts-chat-live-popover');
    }

    if (!isExpanded) {
      // ── КОМПАКТНИЙ СТАН (Minimalist Capsule) ──────────────────────────
      const counterBadge = count > 1
        ? `<span class="ts-pill-counter">+${count - 1}</span>`
        : '';

      const hintText = isRed
        ? (primary.stripType === 'VAULT' ? 'Секрет' : 'Увага')
        : (primary.stripType === 'GPS' ? 'Координати' : 'Підказка');

      pill.innerHTML = `
        <span class="ts-pill-icon" style="display: flex; align-items: center; justify-content: center; color: ${accentColor};">${primary.iconSvg}</span>
        <span class="ts-pill-label" style="color: ${labelColor}; font-weight: 600;">${primary.label}</span>
        ${counterBadge}
        <span class="ts-pill-dot" style="font-size: 9px; color: #86868B; margin-left: 2px;">•</span>
        <span class="ts-pill-hint" style="font-size: 10px; color: ${accentColor}; font-weight: 500;">${hintText}</span>
      `;
    } else {
      // ── РОЗГОРНУТИЙ СТАН IN-PLACE (Unrolled Protection Banner) ──────────
      if (count === 1) {
        // Одиночний тригер: елегантний банер із вбудованим чіпом-дією
        const actionLabel = primary.buttonLabel || 'Вилучити';

        pill.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;">
            <div style="display: flex; align-items: flex-start; gap: 8px; min-width: 0; flex: 1;">
              <span class="ts-pill-icon" style="color: ${accentColor}; display: flex; align-items: center; margin-top: 1px; flex-shrink: 0;">
                ${primary.iconSvg}
              </span>
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 11.5px; font-weight: 700; color: ${labelColor}; letter-spacing: -0.01em;">
                    ${primary.label}
                  </span>
                  <span style="font-size: 9px; color: ${accentColor}; opacity: 0.7;">•</span>
                  <span style="font-size: 9.5px; color: ${accentColor}; font-weight: 600;">
                    ${primary.sublabel}
                  </span>
                </div>
                <p style="font-size: 10.5px; line-height: 1.35; color: ${isRed ? '#7F1D1D' : '#515154'}; margin: 1px 0 0 0;">
                  ${primary.explanation}
                </p>
              </div>
            </div>
            <button id="ts-pill-clean-btn" class="ts-pill-action-chip ts-pill-btn-primary" style="margin-left: 4px;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              ${actionLabel}
            </button>
          </div>
        `;

        const cleanBtn = pill.querySelector('#ts-pill-clean-btn') as HTMLButtonElement | null;
        if (cleanBtn) {
          cleanBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stripSensitiveData(primary.stripType, primary.vaultValue);
          });
        }
      } else {
        // Багатопунктовий стек (Protection Deck In-Place)
        const rowsHtml = detailsList
          .map((item, idx) => {
            const itemAccent = (item.stripType === 'VAULT' || item.stripType === 'CVV' || item.stripType === 'OTP' || item.stripType === 'SABOTAGE')
              ? '#DC2626'
              : (item.isCivic ? '#0284C7' : '#0071E3');
            const isLast = idx === detailsList.length - 1;
            const escapedVault = item.vaultValue ? encodeURIComponent(item.vaultValue) : '';

            return `
              <div class="ts-deck-row" data-item-id="${item.id}" style="
                padding: ${idx === 0 ? '0 0 8px 0' : '8px 0'};
                ${isLast ? '' : 'border-bottom: 1px solid rgba(0, 0, 0, 0.05);'}
              ">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                    <span style="color: ${itemAccent}; display: flex; align-items: center; flex-shrink: 0;">
                      ${item.iconSvg}
                    </span>
                    <div style="min-width: 0; flex: 1;">
                      <div style="font-size: 11px; font-weight: 600; color: #1D1D1F; line-height: 1.2; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                        ${item.label}
                      </div>
                      <div style="font-size: 9.5px; color: #86868B;">${item.sublabel}</div>
                    </div>
                  </div>
                  <button class="ts-pill-clean-single-btn ts-pill-btn-secondary" data-item-index="${idx}" data-strip-type="${item.stripType}" ${item.vaultValue ? `data-vault-value="${escapedVault}"` : ''}>
                    Видалити
                  </button>
                </div>
                <p style="font-size: 10px; line-height: 1.35; color: #515154; margin: 3px 0 0 18px;">
                  ${item.explanation}
                </p>
              </div>
            `;
          })
          .join('');

        pill.innerHTML = `
          <div style="width: 100%;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(0, 0, 0, 0.07);">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11.5px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.01em;">
                  Виявлені маркери
                </span>
                <span class="ts-pill-counter">${count}</span>
              </div>
              <button id="ts-pill-clean-all-btn" class="ts-pill-action-chip ts-pill-btn-primary">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Очистити всі
              </button>
            </div>
            <div class="ts-deck-body" style="max-height: 220px; overflow-y: auto; overflow-x: hidden; box-sizing: border-box;">
              ${rowsHtml}
            </div>
          </div>
        `;

        const cleanAllBtn = pill.querySelector('#ts-pill-clean-all-btn') as HTMLButtonElement | null;
        if (cleanAllBtn) {
          cleanAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stripAllSensitiveData();
          });
        }

        pill.querySelectorAll('.ts-pill-clean-single-btn').forEach((btn) => {
          const b = btn as HTMLButtonElement;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const idxStr = b.dataset.itemIndex;
            const idx = idxStr !== undefined ? parseInt(idxStr, 10) : -1;
            const item = detailsList[idx];
            if (item) {
              this.stripSensitiveData(item.stripType, item.vaultValue);
            } else {
              const stripType = b.dataset.stripType as any;
              const rawVault = b.dataset.vaultValue;
              const vaultValue = rawVault ? decodeURIComponent(rawVault) : undefined;
              this.stripSensitiveData(stripType, vaultValue);
            }
          });
        });
      }
    }
  }

  /**
   * Точне очищення чутливого значення зі сховища або реквізитів особи
   */
  private static stripVaultValue(
    currentText: string,
    targetVal?: string,
    category?: string,
    label?: string
  ): string {
    let updated = currentText;

    if (targetVal && targetVal.trim().length > 0) {
      const cleanTarget = targetVal.trim();
      const escaped = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Шаблони префіксів для ІПН, прізвища, кодового слова тощо
      const prefix = `(?:\\b(?:іпн|рнокпп|податковий\\s*(?:номер|код)|прізвище(?:\\s*матері)?|дівоче\\s*прізвище|паспорт(?:ні\\s*дані|ний\\s*код)?|код(?:ове\\s*слово)?|секретне\\s*слово|слово-пароль|tax\\s*id|inn|maiden\\s*name|secret\\s*word)\\s*[:=]?\\s*)?`;

      // 1. Спроба видалити разом із контекстним словом-префіксом (наприклад "ІПН: 3124567890" або "прізвище Коваленко")
      const patternWithPrefix = new RegExp(`(?:,\\s*)?${prefix}${escaped}(?:\\s*,)?`, 'gi');
      updated = updated.replace(patternWithPrefix, ' ').replace(/\s{2,}/g, ' ').trim();

      // 2. Якщо не спрацювало або префіксу не було — пряме видалення значення (незалежно від регістру)
      if (updated === currentText) {
        const directPattern = new RegExp(`(?:,\\s*)?${escaped}(?:\\s*,)?`, 'gi');
        updated = updated.replace(directPattern, ' ').replace(/\s{2,}/g, ' ').trim();
      }
    }

    // Резервний варіант для ІПН: якщо конкретне значення не передано або є залишком — шукаємо 8-10 цифр
    if (
      (updated === currentText || !targetVal) &&
      (category === 'TAX_ID' || label?.toLowerCase().includes('іпн') || label?.toLowerCase().includes('податк'))
    ) {
      updated = updated.replace(/(?:,\s*)?(?:\b(?:іпн|рнокпп|податковий\\s*(?:номер|код)|инн)\s*[:=]?\s*)?\b\d{8,10}\b(?:\s*,)?/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Очищення залишкових розділових знаків на краях
    updated = updated.replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim();

    return updated;
  }

  /**
   * Точкове видалення конкретного виявленого елемента
   */
  private static stripSensitiveData(type: 'CVV' | 'GPS' | 'SABOTAGE' | 'VAULT' | 'OTP', vaultValue?: string): void {
    if (!this.currentInput) return;

    const val = this.currentInput.value || this.currentInput.innerText || '';
    let updated = val;

    if (type === 'CVV') {
      updated = val.replace(/,\s*(?:cvv|cvc|csc|cvv2|cvc2|код)?\s*[:=]?\s*\b\d{3,4}\b/gi, '')
        .replace(/(?:cvv|cvc|csc|cvv2|cvc2|код)\s*[:=]?\s*\b\d{3,4}\b\s*,?/gi, '')
        .trim();
      if (updated === val) {
        updated = val.replace(/,\s*\b\d{3}\b/g, '').replace(/\b\d{3}\b\s*,?/g, '').trim();
      }
      updated = updated.replace(/,\s*$/, '').trim();
    } else if (type === 'GPS') {
      updated = val.replace(/\b[3-7]\d\.\d{4,8}\s*,\s*[2-4]\d\.\d{4,8}\b/gi, '')
        .replace(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)[^\s]*/gi, '')
        .trim();
    } else if (type === 'OTP') {
      updated = val.replace(/(?:код\s*з\s*смс|пароль\s*підтвердження|код\s*підтвердження|sms\s*code|otp\s*code|otp)[\s\p{L}:=_-]{0,25}?[0-9]{4,8}/giu, '').trim();
    } else if (type === 'VAULT') {
      const item = this.currentDetailsList.find(d => d.stripType === 'VAULT' && (!vaultValue || d.vaultValue === vaultValue));
      const vaultMatch = this.currentEvaluation?.vaultMatches?.find(
        m => (m as any).matchedValue === vaultValue || m.realValue === vaultValue || (item && m.label === item.label)
      );
      const targetVal = vaultValue || item?.vaultValue || (vaultMatch as any)?.matchedValue || vaultMatch?.realValue;
      const category = vaultMatch?.category;
      const label = item?.label || vaultMatch?.label;

      updated = this.stripVaultValue(updated, targetVal, category, label);
    } else if (type === 'SABOTAGE') {
      updated = '';
    }

    this.applyUpdatedInput(updated);
  }

  /**
   * Пакетне видалення всіх виявлених чутливих елементів в 1 клік
   */
  private static stripAllSensitiveData(): void {
    if (!this.currentInput || !this.currentDetailsList.length) return;

    let updated = this.currentInput.value || this.currentInput.innerText || '';

    for (const item of this.currentDetailsList) {
      if (item.stripType === 'CVV') {
        updated = updated.replace(/,\s*(?:cvv|cvc|csc|cvv2|cvc2|код)?\s*[:=]?\s*\b\d{3,4}\b/gi, '')
          .replace(/(?:cvv|cvc|csc|cvv2|cvc2|код)\s*[:=]?\s*\b\d{3,4}\b\s*,?/gi, '')
          .trim();
        updated = updated.replace(/,\s*\b\d{3}\b/g, '').replace(/\b\d{3}\b\s*,?/g, '').trim();
        updated = updated.replace(/,\s*$/, '').trim();
      } else if (item.stripType === 'GPS') {
        updated = updated.replace(/\b[3-7]\d\.\d{4,8}\s*,\s*[2-4]\d\.\d{4,8}\b/gi, '')
          .replace(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)[^\s]*/gi, '')
          .trim();
      } else if (item.stripType === 'OTP') {
        updated = updated.replace(/(?:код\s*з\s*смс|пароль\s*підтвердження|код\s*підтвердження|sms\s*code|otp\s*code|otp)[\s\p{L}:=_-]{0,25}?[0-9]{4,8}/giu, '').trim();
      } else if (item.stripType === 'VAULT') {
        const vaultMatch = this.currentEvaluation?.vaultMatches?.find(
          m => (m as any).matchedValue === item.vaultValue || m.realValue === item.vaultValue || m.label === item.label
        );
        const targetVal = item.vaultValue || (vaultMatch as any)?.matchedValue || vaultMatch?.realValue;
        const category = vaultMatch?.category;
        const label = item.label || vaultMatch?.label;

        updated = this.stripVaultValue(updated, targetVal, category, label);
      } else if (item.stripType === 'SABOTAGE') {
        updated = '';
      }
    }

    this.applyUpdatedInput(updated);
  }

  private static applyUpdatedInput(updated: string): void {
    if (!this.currentInput) return;

    if ('value' in this.currentInput && typeof (this.currentInput as HTMLInputElement).value === 'string') {
      const proto = this.currentInput instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (nativeSetter) {
        nativeSetter.call(this.currentInput, updated);
      } else {
        (this.currentInput as HTMLInputElement).value = updated;
      }
    } else {
      (this.currentInput as HTMLElement).innerText = updated;
    }

    try {
      this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.currentInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}

    const targetInput = this.currentInput;
    this.hide();
    if (targetInput && typeof targetInput.focus === 'function') {
      try {
        targetInput.focus();
      } catch {}
    }
  }

  private static ensureStylesInjected(root: ShadowRoot): void {
    if (root.getElementById('ts-chat-live-pill-styles')) return;

    const style = document.createElement('style');
    style.id = 'ts-chat-live-pill-styles';
    style.textContent = `
      @keyframes tsChatPillFadeIn {
        0% {
          opacity: 0;
          transform: translateY(4px) scale(0.97);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .ts-chat-live-pill {
        position: absolute !important;
        z-index: 2147483646 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        background: rgba(255, 255, 255, 0.96) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(0, 113, 227, 0.28) !important;
        color: #005BB5 !important;
        padding: 4px 10px !important;
        border-radius: 9999px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04) !important;
        cursor: pointer !important;
        user-select: none !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
        animation: tsChatPillFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        transition: padding 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    border-radius 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    max-width 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    background-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 0.24s cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .ts-chat-live-pill:hover {
        border-color: rgba(0, 113, 227, 0.45) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 113, 0.12) !important;
      }

      /* Crimson Red State (Vault Secrets, CVV, OTP, Sabotage) */
      .ts-chat-live-pill.ts-pill-red {
        background: rgba(254, 242, 242, 0.96) !important;
        border-color: rgba(220, 38, 38, 0.38) !important;
        color: #DC2626 !important;
        box-shadow: 0 4px 14px rgba(220, 38, 38, 0.12), 0 1px 3px rgba(220, 38, 38, 0.06) !important;
      }

      .ts-chat-live-pill.ts-pill-red:hover {
        border-color: rgba(220, 38, 38, 0.55) !important;
        box-shadow: 0 6px 20px rgba(220, 38, 38, 0.18) !important;
      }

      /* Civic State (GPS Coordinates, National Resistance) */
      .ts-chat-live-pill.ts-civic {
        background: rgba(240, 249, 255, 0.96) !important;
        border-color: rgba(2, 132, 199, 0.35) !important;
        color: #0369A1 !important;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.12), 0 1px 3px rgba(2, 132, 199, 0.06) !important;
      }

      .ts-chat-live-pill.ts-civic:hover {
        border-color: rgba(2, 132, 199, 0.55) !important;
        box-shadow: 0 6px 20px rgba(2, 132, 199, 0.18) !important;
      }

      /* Stack Indicators */
      .ts-pill-counter {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        font-family: inherit !important;
        background: rgba(0, 113, 227, 0.10) !important;
        color: #0071E3 !important;
        border: 1px solid rgba(0, 113, 227, 0.22) !important;
        border-radius: 9999px !important;
        padding: 0 5px !important;
        height: 16px !important;
        line-height: 16px !important;
        letter-spacing: -0.01em !important;
      }

      .ts-chat-live-pill.ts-pill-red .ts-pill-counter {
        background: rgba(220, 38, 38, 0.12) !important;
        color: #DC2626 !important;
        border-color: rgba(220, 38, 38, 0.28) !important;
      }

      .ts-chat-live-pill.ts-civic .ts-pill-counter {
        background: rgba(2, 132, 199, 0.12) !important;
        color: #0284C7 !important;
        border-color: rgba(2, 132, 199, 0.25) !important;
      }

      /* Expanded Banner State (In-Place Fluid Surface) */
      .ts-chat-live-pill.ts-expanded {
        padding: 9px 14px !important;
        border-radius: 14px !important;
        white-space: normal !important;
        max-width: 440px !important;
        min-width: 280px !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        cursor: default !important;
        overflow-x: hidden !important;
      }

      .ts-chat-live-popover {
        overflow-x: hidden !important;
      }

      /* Deck Scroll Container */
      .ts-deck-body {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
        padding-right: 4px !important;
      }

      .ts-deck-body::-webkit-scrollbar {
        width: 4px !important;
        height: 0px !important;
      }

      .ts-deck-body::-webkit-scrollbar-horizontal {
        display: none !important;
        height: 0px !important;
      }

      .ts-deck-body::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15) !important;
        border-radius: 9999px !important;
      }

      /* Action Chips (Minimalist, Apple-style) */
      .ts-pill-action-chip,
      .ts-pill-btn-primary {
        all: unset !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        cursor: pointer !important;
        font-family: inherit !important;
        font-size: 10.5px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        padding: 3px 10px !important;
        border-radius: 9999px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        box-sizing: border-box !important;
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        background: rgba(0, 113, 227, 0.09) !important;
        color: #0071E3 !important;
        border: 1px solid rgba(0, 113, 227, 0.25) !important;
        transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
      }

      .ts-pill-action-chip:hover,
      .ts-pill-btn-primary:hover {
        background: #0071E3 !important;
        color: #FFFFFF !important;
        border-color: #0071E3 !important;
        box-shadow: 0 2px 8px rgba(0, 113, 227, 0.25) !important;
      }

      .ts-pill-red .ts-pill-action-chip,
      .ts-pill-red .ts-pill-btn-primary {
        background: rgba(220, 38, 38, 0.10) !important;
        color: #DC2626 !important;
        border: 1px solid rgba(220, 38, 38, 0.28) !important;
      }

      .ts-pill-red .ts-pill-action-chip:hover,
      .ts-pill-red .ts-pill-btn-primary:hover {
        background: #DC2626 !important;
        color: #FFFFFF !important;
        border-color: #DC2626 !important;
        box-shadow: 0 2px 8px rgba(220, 38, 38, 0.28) !important;
      }

      .ts-civic .ts-pill-action-chip,
      .ts-civic .ts-pill-btn-primary {
        background: rgba(2, 132, 199, 0.10) !important;
        color: #0284C7 !important;
        border: 1px solid rgba(2, 132, 199, 0.28) !important;
      }

      .ts-civic .ts-pill-action-chip:hover,
      .ts-civic .ts-pill-btn-primary:hover {
        background: #0284C7 !important;
        color: #FFFFFF !important;
        border-color: #0284C7 !important;
        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.28) !important;
      }

      /* Secondary Item Action Button (In Deck Rows) */
      .ts-pill-clean-single-btn,
      .ts-pill-btn-secondary {
        all: unset !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        cursor: pointer !important;
        font-family: inherit !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        padding: 2.5px 8px !important;
        border-radius: 9999px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        flex-shrink: 0 !important;
        white-space: nowrap !important;
        background: rgba(0, 0, 0, 0.04) !important;
        color: #1D1D1F !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;
        transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
      }

      .ts-pill-clean-single-btn:hover,
      .ts-pill-btn-secondary:hover {
        background: rgba(220, 38, 38, 0.12) !important;
        color: #DC2626 !important;
        border-color: rgba(220, 38, 38, 0.30) !important;
        box-shadow: 0 1px 4px rgba(220, 38, 38, 0.12) !important;
      }
    `;
    root.appendChild(style);
  }
}
