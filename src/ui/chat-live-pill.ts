import { ShadowHost } from './shadow-host';
import { SessionOutboundEvaluation } from '../heuristics/session-outbound-memory';

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

  /**
   * Відобразити або оновити мікро-капсулу безпеки під полем чату
   */
  public static show(
    input: HTMLInputElement | HTMLTextAreaElement,
    evaluation: SessionOutboundEvaluation
  ): void {
    if (typeof document === 'undefined') return;

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
      this.updatePillContent(this.activePill, detailsList);
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
    this.closePopover();

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
   * Оновлення координат розташування капсули під правим краєм поля введення
   */
  public static updatePosition(): void {
    if (!this.activePill || !this.currentInput || !this.currentInput.isConnected) {
      this.hide();
      return;
    }

    const rect = this.currentInput.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const pillWidth = this.activePill.offsetWidth || 180;
    const pillHeight = this.activePill.offsetHeight || 28;

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

    if (this.activePopover) {
      this.updatePopoverPosition();
    }
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
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
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
        const itemKey = `${item.label}_${item.value || ''}`;
        if (seenVaultLabels.has(itemKey)) continue;
        seenVaultLabels.add(itemKey);

        list.push({
          id: `vault_${item.label}_${item.value || ''}`,
          iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L12 11l-4-4-6 6 4 4 6-6 5.5-5.5M19 5l-2-2"/></svg>`,
          label: `Сховище: ${item.label}`,
          sublabel: 'Особистий секрет',
          explanation: `Ви ввели конфіденційний маркер зі свого Personal Vault («${item.label}»). Не передавайте його стороннім ресурсам.`,
          stripType: 'VAULT',
          vaultValue: item.value,
          isCivic: false,
          priority: 5,
          buttonLabel: 'Видалити секрет',
        });
      }
    }

    return list.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Створення елемента капсули
   */
  private static createPillElement(detailsList: PillDetailItem[]): HTMLElement {
    const pill = document.createElement('div');
    pill.className = 'ts-chat-live-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    this.applyPillStyling(pill, detailsList);

    pill.addEventListener('mouseenter', () => {
      this.cancelPopoverClose();
      this.showPopover(pill, this.currentDetailsList);
    });

    pill.addEventListener('mouseleave', (e) => {
      const toEl = e.relatedTarget as HTMLElement | null;
      if (!toEl || !this.activePopover || !this.activePopover.contains(toEl)) {
        this.schedulePopoverClose();
      }
    });

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelPopoverClose();
      this.showPopover(pill, this.currentDetailsList);
    });

    return pill;
  }

  private static updatePillContent(pill: HTMLElement, detailsList: PillDetailItem[]): void {
    this.applyPillStyling(pill, detailsList);
    if (this.activePopover) {
      this.showPopover(pill, detailsList);
    }
  }

  private static applyPillStyling(pill: HTMLElement, detailsList: PillDetailItem[]): void {
    const primary = detailsList[0];
    const count = detailsList.length;
    const isCivic = primary.isCivic;
    const accentColor = isCivic ? '#0284C7' : '#0071E3'; // Sky Blue vs Apple Royal Blue
    const borderColor = isCivic ? 'rgba(2, 132, 199, 0.35)' : 'rgba(0, 113, 227, 0.3)';
    const bgColor = 'rgba(255, 255, 255, 0.94)';
    const textColor = isCivic ? '#0369A1' : '#005BB5';

    // Встановлюємо класи фізичного стека (One UI / iOS Notification Stack)
    if (count >= 3) {
      pill.className = 'ts-chat-live-pill ts-has-stack ts-has-stack-multi';
    } else if (count === 2) {
      pill.className = 'ts-chat-live-pill ts-has-stack';
    } else {
      pill.className = 'ts-chat-live-pill';
    }

    pill.style.cssText = `
      position: absolute !important;
      z-index: 2147483646 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      background: ${bgColor} !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      border: 1px solid ${borderColor} !important;
      color: ${textColor} !important;
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
      animation: tsPillFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    `;

    const counterBadge = count > 1
      ? `<span class="ts-pill-counter" style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          background: ${isCivic ? 'rgba(2, 132, 199, 0.14)' : 'rgba(0, 113, 227, 0.12)'};
          color: ${accentColor};
          border: 1px solid ${isCivic ? 'rgba(2, 132, 199, 0.28)' : 'rgba(0, 113, 227, 0.24)'};
          border-radius: 9999px;
          padding: 0 5px;
          height: 16px;
          line-height: 16px;
          letter-spacing: -0.01em;
        ">+${count - 1}</span>`
      : '';

    pill.innerHTML = `
      <span class="ts-pill-icon" style="display: flex; align-items: center; justify-content: center; color: ${accentColor};">${primary.iconSvg}</span>
      <span class="ts-pill-label" style="color: #1D1D1F;">${primary.label}</span>
      ${counterBadge}
      <span class="ts-pill-dot" style="font-size: 9px; color: #86868B; margin-left: 2px;">•</span>
      <span class="ts-pill-hint" style="font-size: 10px; color: ${accentColor}; font-weight: 500;">Підказка</span>
    `;
  }

  /**
   * Відображення розгорнутої картки-колоди тригерів при наведенні (Protection Deck)
   */
  private static showPopover(
    pill: HTMLElement,
    detailsList: PillDetailItem[]
  ): void {
    this.closePopover();

    const root = ShadowHost.getRoot();
    const popover = document.createElement('div');
    popover.className = 'ts-chat-live-popover';

    const count = detailsList.length;
    const isMulti = count > 1;
    const primary = detailsList[0];
    const accentColor = primary.isCivic ? '#0284C7' : '#0071E3';

    popover.style.cssText = `
      position: absolute !important;
      z-index: 2147483647 !important;
      width: ${isMulti ? '330px' : '290px'} !important;
      max-width: 90vw !important;
      background: rgba(255, 255, 255, 0.98) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      border-radius: 14px !important;
      padding: ${isMulti ? '14px 16px' : '12px 14px'} !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.04) !important;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
      box-sizing: border-box !important;
      animation: tsPillFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    `;

    if (!isMulti) {
      // Одиночний тригер (сумісність з існуючими тестами та компактністю)
      popover.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="width: 22px; height: 22px; border-radius: 50%; background: ${primary.isCivic ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0, 113, 227, 0.1)'}; display: flex; align-items: center; justify-content: center; color: ${accentColor};">
            ${primary.iconSvg}
          </div>
          <div>
            <div style="font-size: 12px; font-weight: 600; color: #1D1D1F; line-height: 1.2;">${primary.label}</div>
            <div style="font-size: 10px; color: #86868B;">${primary.sublabel}</div>
          </div>
        </div>
        <p style="font-size: 11px; line-height: 1.45; color: #515154; margin: 0 0 10px 0;">
          ${primary.explanation}
        </p>
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
          <button id="ts-pill-clean-btn" class="ts-pill-clean-btn" style="
            all: unset !important;
            background: #1D1D1F !important;
            color: #FFFFFF !important;
            padding: 5px 11px !important;
            border-radius: 6px !important;
            font-size: 11px !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            transition: background-color 0.15s ease, transform 0.15s ease !important;
          ">
            ${primary.buttonLabel || 'Видалити з тексту'}
          </button>
        </div>
      `;
    } else {
      // Багатопунктова картка-колода (Protection Deck)
      const rowsHtml = detailsList
        .map((item, idx) => {
          const itemAccent = item.isCivic ? '#0284C7' : '#0071E3';
          const isLast = idx === detailsList.length - 1;
          const escapedVault = item.vaultValue ? item.vaultValue.replace(/"/g, '&quot;') : '';

          return `
            <div class="ts-deck-row" data-item-id="${item.id}" style="
              padding: ${idx === 0 ? '0 0 10px 0' : '10px 0'};
              ${isLast ? '' : 'border-bottom: 1px solid rgba(0, 0, 0, 0.06);'}
            ">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                  <div style="
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: ${item.isCivic ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0, 113, 227, 0.1)'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: ${itemAccent};
                    flex-shrink: 0;
                  ">
                    ${item.iconSvg}
                  </div>
                  <div style="min-width: 0;">
                    <div style="font-size: 11.5px; font-weight: 600; color: #1D1D1F; line-height: 1.2; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                      ${item.label}
                    </div>
                    <div style="font-size: 9.5px; color: #86868B;">${item.sublabel}</div>
                  </div>
                </div>
                <button class="ts-pill-clean-single-btn" data-strip-type="${item.stripType}" ${item.vaultValue ? `data-vault-value="${escapedVault}"` : ''} style="
                  all: unset !important;
                  background: rgba(0, 0, 0, 0.05) !important;
                  color: #1D1D1F !important;
                  padding: 3px 8px !important;
                  border-radius: 5px !important;
                  font-size: 10px !important;
                  font-weight: 600 !important;
                  cursor: pointer !important;
                  white-space: nowrap !important;
                  border: 1px solid rgba(0, 0, 0, 0.08) !important;
                  transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease !important;
                ">
                  Видалити
                </button>
              </div>
              <p style="font-size: 10.5px; line-height: 1.4; color: #515154; margin: 0 0 0 28px;">
                ${item.explanation}
              </p>
            </div>
          `;
        })
        .join('');

      popover.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(0, 0, 0, 0.08);">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.01em;">
              Виявлені маркери
            </span>
            <span style="
              font-size: 10px;
              font-weight: 700;
              background: rgba(0, 113, 227, 0.12);
              color: #0071E3;
              padding: 1px 6px;
              border-radius: 9999px;
              border: 1px solid rgba(0, 113, 227, 0.22);
            ">${count}</span>
          </div>
          <button id="ts-pill-clean-all-btn" style="
            all: unset !important;
            background: #1D1D1F !important;
            color: #FFFFFF !important;
            padding: 4px 10px !important;
            border-radius: 6px !important;
            font-size: 10.5px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            transition: background-color 0.15s ease, transform 0.15s ease !important;
          ">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Очистити всі
          </button>
        </div>
        <div class="ts-deck-body" style="max-height: 260px; overflow-y: auto;">
          ${rowsHtml}
        </div>
      `;
    }

    // Слухачі для запобігання мерехтінню поповера при русі мишки
    popover.addEventListener('mouseenter', () => {
      this.cancelPopoverClose();
    });
    popover.addEventListener('mouseleave', () => {
      this.schedulePopoverClose();
    });

    // Одиночна кнопка очищення
    const cleanBtn = popover.querySelector('#ts-pill-clean-btn') as HTMLButtonElement | null;
    if (cleanBtn && detailsList[0]) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stripSensitiveData(detailsList[0].stripType, detailsList[0].vaultValue);
      });
      cleanBtn.addEventListener('mouseenter', () => {
        cleanBtn.style.backgroundColor = '#000000';
        cleanBtn.style.transform = 'scale(1.02)';
      });
      cleanBtn.addEventListener('mouseleave', () => {
        cleanBtn.style.backgroundColor = '#1D1D1F';
        cleanBtn.style.transform = 'scale(1)';
      });
    }

    // Кнопка «Очистити всі»
    const cleanAllBtn = popover.querySelector('#ts-pill-clean-all-btn') as HTMLButtonElement | null;
    if (cleanAllBtn) {
      cleanAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stripAllSensitiveData();
      });
      cleanAllBtn.addEventListener('mouseenter', () => {
        cleanAllBtn.style.backgroundColor = '#000000';
        cleanAllBtn.style.transform = 'scale(1.02)';
      });
      cleanAllBtn.addEventListener('mouseleave', () => {
        cleanAllBtn.style.backgroundColor = '#1D1D1F';
        cleanAllBtn.style.transform = 'scale(1)';
      });
    }

    // Кнопки видалення окремих пунктів колоди
    popover.querySelectorAll('.ts-pill-clean-single-btn').forEach((btn) => {
      const b = btn as HTMLButtonElement;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const stripType = b.dataset.stripType as any;
        const vaultValue = b.dataset.vaultValue;
        this.stripSensitiveData(stripType, vaultValue);
      });
      b.addEventListener('mouseenter', () => {
        b.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        b.style.transform = 'scale(1.03)';
      });
      b.addEventListener('mouseleave', () => {
        b.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        b.style.transform = 'scale(1)';
      });
    });

    root.appendChild(popover);
    this.activePopover = popover;
    this.updatePopoverPosition();
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

  private static updatePopoverPosition(): void {
    if (!this.activePopover || !this.activePill) return;

    const pillRect = this.activePill.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    const popoverWidth = this.activePopover.offsetWidth || 300;
    const popoverHeight = this.activePopover.offsetHeight || 140;

    let top = scrollY + pillRect.bottom + 6;
    let left = scrollX + pillRect.right - popoverWidth;

    if (left < scrollX + 10) left = scrollX + 10;

    // Якщо знизу не вміщується — відкриваємо зверху над пігулкою
    if (typeof window !== 'undefined' && pillRect.bottom + popoverHeight + 10 > window.innerHeight) {
      top = scrollY + pillRect.top - popoverHeight - 6;
    }

    this.activePopover.style.top = `${Math.max(0, top)}px`;
    this.activePopover.style.left = `${Math.max(0, left)}px`;
  }

  public static closePopover(): void {
    if (this.activePopover && this.activePopover.parentNode) {
      this.activePopover.parentNode.removeChild(this.activePopover);
    }
    this.activePopover = null;
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
      if (vaultValue) {
        updated = updated.replace(vaultValue, '').trim();
      } else if (this.currentEvaluation?.vaultMatches) {
        for (const item of this.currentEvaluation.vaultMatches) {
          if (item.value) {
            updated = updated.replace(item.value, '').trim();
          }
        }
      }
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
      } else if (item.stripType === 'VAULT' && item.vaultValue) {
        updated = updated.replace(item.vaultValue, '').trim();
      } else if (item.stripType === 'SABOTAGE') {
        updated = '';
      }
    }

    this.applyUpdatedInput(updated);
  }

  private static applyUpdatedInput(updated: string): void {
    if (!this.currentInput) return;

    this.currentInput.value = updated;
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
      @keyframes tsPillFadeIn {
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
        position: relative !important;
      }
      .ts-chat-live-pill:hover {
        transform: scale(1.03) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12) !important;
      }
      .ts-chat-live-pill.ts-has-stack::before {
        content: '' !important;
        position: absolute !important;
        top: 3px !important;
        left: 4px !important;
        right: 4px !important;
        bottom: -3px !important;
        background: rgba(255, 255, 255, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(0, 113, 227, 0.22) !important;
        border-radius: 9999px !important;
        z-index: -1 !important;
        transform: scale(0.96) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05) !important;
        pointer-events: none !important;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease !important;
      }
      .ts-chat-live-pill.ts-has-stack-multi::after {
        content: '' !important;
        position: absolute !important;
        top: 6px !important;
        left: 8px !important;
        right: 8px !important;
        bottom: -6px !important;
        background: rgba(255, 255, 255, 0.60) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border: 1px solid rgba(0, 113, 227, 0.15) !important;
        border-radius: 9999px !important;
        z-index: -2 !important;
        transform: scale(0.92) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        pointer-events: none !important;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease !important;
      }
      .ts-chat-live-pill.ts-has-stack:hover::before {
        transform: translateY(2px) scale(0.98) !important;
      }
      .ts-chat-live-pill.ts-has-stack-multi:hover::after {
        transform: translateY(4px) scale(0.95) !important;
      }
      .ts-deck-body::-webkit-scrollbar {
        width: 4px;
      }
      .ts-deck-body::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 9999px;
      }
    `;
    root.appendChild(style);
  }
}
