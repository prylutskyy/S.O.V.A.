import { ShadowHost } from './shadow-host';
import { SessionOutboundEvaluation } from '../heuristics/session-outbound-memory';

export class ChatLivePill {
  private static activePill: HTMLElement | null = null;
  private static activePopover: HTMLElement | null = null;
  private static currentInput: (HTMLInputElement | HTMLTextAreaElement) | null = null;
  private static currentEvaluation: SessionOutboundEvaluation | null = null;
  private static scrollListenerAttached = false;

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

    // Визначаємо заголовок, опис та категорію загрози
    const details = this.resolvePillDetails(evaluation);
    if (!details) {
      this.hide();
      return;
    }

    if (!this.activePill || !this.activePill.isConnected) {
      this.activePill = this.createPillElement(details);
      root.appendChild(this.activePill);
    } else {
      this.updatePillContent(this.activePill, details);
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
    this.closePopover();

    if (this.activePill && this.activePill.parentNode) {
      this.activePill.parentNode.removeChild(this.activePill);
    }
    this.activePill = null;
    this.currentInput = null;
    this.currentEvaluation = null;

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
   * Визначення семантичного типу та тексту мікро-капсули
   */
  private static resolvePillDetails(evalRes: SessionOutboundEvaluation): {
    iconSvg: string;
    label: string;
    sublabel: string;
    explanation: string;
    stripType: 'CVV' | 'GPS' | 'SABOTAGE' | 'VAULT' | 'OTP';
    isCivic: boolean;
  } | null {
    if (evalRes.leakage.hasGps) {
      return {
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
        label: 'Точні координати',
        sublabel: 'Національний спротив',
        explanation: 'Під час воєнного стану передача точних географічних координат або мап може нести загрозу коригування ворожих ударів.',
        stripType: 'GPS',
        isCivic: true,
      };
    }

    if (evalRes.leakage.hasSabotage) {
      return {
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        label: 'Маркери безпеки',
        sublabel: 'Державна безпека',
        explanation: 'Текст містить маркери вербування до диверсій чи збору даних про захисників України (ст. 111-2, 113 КК України).',
        stripType: 'SABOTAGE',
        isCivic: true,
      };
    }

    if (evalRes.leakage.hasCvv) {
      return {
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        label: 'Код безпеки (CVV)',
        sublabel: 'Секретні реквізити',
        explanation: 'Для отримання коштів тризначний CVV/CVC-код ніколи не потрібен. Його запитують лише для списання коштів з вашої картки.',
        stripType: 'CVV',
        isCivic: false,
      };
    }

    if (evalRes.leakage.hasOtp) {
      return {
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
        label: 'SMS-код безпеки (OTP)',
        sublabel: 'Одноразовий пароль',
        explanation: 'Ніколи не передавайте коди підтвердження з SMS третім особам. Справжні сервіси їх не запитують.',
        stripType: 'OTP',
        isCivic: false,
      };
    }

    if (evalRes.vaultMatches && evalRes.vaultMatches.length > 0) {
      const label = evalRes.vaultMatches[0].label;
      return {
        iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L12 11l-4-4-6 6 4 4 6-6 5.5-5.5M19 5l-2-2"/></svg>`,
        label: `Сховище: ${label}`,
        sublabel: 'Особистий секрет',
        explanation: `Ви ввели конфіденційний маркер зі свого Personal Vault (${label}). Не передавайте його стороннім ресурсам.`,
        stripType: 'VAULT',
        isCivic: false,
      };
    }

    return null;
  }

  /**
   * Створення елемента капсули
   */
  private static createPillElement(details: NonNullable<ReturnType<typeof this.resolvePillDetails>>): HTMLElement {
    const pill = document.createElement('div');
    pill.className = 'ts-chat-live-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    this.applyPillStyling(pill, details);

    pill.addEventListener('mouseenter', () => {
      this.showPopover(pill, details);
    });

    pill.addEventListener('mouseleave', (e) => {
      // Якщо мишка не перейшла у сам поповер
      const toEl = e.relatedTarget as HTMLElement | null;
      if (!toEl || !this.activePopover || !this.activePopover.contains(toEl)) {
        this.closePopover();
      }
    });

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPopover(pill, details);
    });

    return pill;
  }

  private static updatePillContent(pill: HTMLElement, details: NonNullable<ReturnType<typeof this.resolvePillDetails>>): void {
    this.applyPillStyling(pill, details);
  }

  private static applyPillStyling(pill: HTMLElement, details: NonNullable<ReturnType<typeof this.resolvePillDetails>>): void {
    // Фірмова колірна гама: спокійний синій/індиго (як в Apple Autofill Trap) або делікатний бурштин
    const isCivic = details.isCivic;
    const accentColor = isCivic ? '#0284C7' : '#0071E3'; // Sky Blue vs Apple Royal Blue
    const borderColor = isCivic ? 'rgba(2, 132, 199, 0.35)' : 'rgba(0, 113, 227, 0.3)';
    const bgColor = 'rgba(255, 255, 255, 0.94)';
    const textColor = isCivic ? '#0369A1' : '#005BB5';

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

    pill.innerHTML = `
      <span style="display: flex; align-items: center; justify-content: center; color: ${accentColor};">${details.iconSvg}</span>
      <span style="color: #1D1D1F;">${details.label}</span>
      <span style="font-size: 9px; color: #86868B; margin-left: 2px;">•</span>
      <span style="font-size: 10px; color: ${accentColor}; font-weight: 500;">Підказка</span>
    `;
  }

  /**
   * Відображення Swiss Loupe картки при наведенні (Hover Popover)
   */
  private static showPopover(
    pill: HTMLElement,
    details: NonNullable<ReturnType<typeof this.resolvePillDetails>>
  ): void {
    this.closePopover();

    const root = ShadowHost.getRoot();
    const popover = document.createElement('div');
    popover.className = 'ts-chat-live-popover';

    const accentColor = details.isCivic ? '#0284C7' : '#0071E3';

    popover.style.cssText = `
      position: absolute !important;
      z-index: 2147483647 !important;
      width: 290px !important;
      background: rgba(255, 255, 255, 0.98) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      border-radius: 12px !important;
      padding: 12px 14px !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04) !important;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
      box-sizing: border-box !important;
      animation: tsPillFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    `;

    popover.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div style="width: 22px; height: 22px; border-radius: 50%; background: ${details.isCivic ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0, 113, 227, 0.1)'}; display: flex; align-items: center; justify-content: center; color: ${accentColor};">
          ${details.iconSvg}
        </div>
        <div>
          <div style="font-size: 12px; font-weight: 600; color: #1D1D1F; line-height: 1.2;">${details.label}</div>
          <div style="font-size: 10px; color: #86868B;">${details.sublabel}</div>
        </div>
      </div>
      <p style="font-size: 11px; line-height: 1.45; color: #515154; margin: 0 0 10px 0;">
        ${details.explanation}
      </p>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
        <button id="ts-pill-clean-btn" style="
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
          Видалити з тексту
        </button>
      </div>
    `;

    popover.addEventListener('mouseleave', () => {
      this.closePopover();
    });

    const cleanBtn = popover.querySelector('#ts-pill-clean-btn') as HTMLButtonElement | null;
    if (cleanBtn) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stripSensitiveData(details.stripType);
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

    root.appendChild(popover);
    this.activePopover = popover;
    this.updatePopoverPosition();
  }

  private static updatePopoverPosition(): void {
    if (!this.activePopover || !this.activePill) return;

    const pillRect = this.activePill.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    let top = scrollY + pillRect.bottom + 6;
    let left = scrollX + pillRect.right - 290;

    if (left < scrollX + 10) left = scrollX + 10;

    // Якщо знизу не вміщується — відкриваємо зверху над пігулкою
    if (typeof window !== 'undefined' && pillRect.bottom + 140 > window.innerHeight) {
      top = scrollY + pillRect.top - 130;
    }

    this.activePopover.style.top = `${top}px`;
    this.activePopover.style.left = `${left}px`;
  }

  public static closePopover(): void {
    if (this.activePopover && this.activePopover.parentNode) {
      this.activePopover.parentNode.removeChild(this.activePopover);
    }
    this.activePopover = null;
  }

  /**
   * Інтелектуальне 1-клік видалення виявленого чутливого елемента з тексту поля
   */
  private static stripSensitiveData(type: 'CVV' | 'GPS' | 'SABOTAGE' | 'VAULT' | 'OTP'): void {
    if (!this.currentInput) return;

    const val = this.currentInput.value || this.currentInput.innerText || '';
    let updated = val;

    if (type === 'CVV') {
      // Видаляємо маркер CVV та самі 3-4 цифри, а також розділові коми
      updated = val.replace(/,\s*(?:cvv|cvc|csc|cvv2|cvc2|код)?\s*[:=]?\s*\b\d{3,4}\b/gi, '')
        .replace(/(?:cvv|cvc|csc|cvv2|cvc2|код)\s*[:=]?\s*\b\d{3,4}\b\s*,?/gi, '')
        .trim();
      if (updated === val) {
        // Fallback: видаляємо окремі 3 цифри якщо були на кінці чи початку
        updated = val.replace(/,\s*\b\d{3}\b/g, '').replace(/\b\d{3}\b\s*,?/g, '').trim();
      }
      updated = updated.replace(/,\s*$/, '').trim();
    } else if (type === 'GPS') {
      // Видаляємо точні координати або мапи
      updated = val.replace(/\b[3-7]\d\.\d{4,8}\s*,\s*[2-4]\d\.\d{4,8}\b/gi, '')
        .replace(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)[^\s]*/gi, '')
        .trim();
    } else if (type === 'OTP') {
      updated = val.replace(/(?:код\s*з\s*смс|пароль\s*підтвердження|код\s*підтвердження|sms\s*code|otp\s*code|otp)[\s\p{L}:=_-]{0,25}?[0-9]{4,8}/giu, '').trim();
    } else if (type === 'VAULT' && this.currentEvaluation?.vaultMatches) {
      for (const item of this.currentEvaluation.vaultMatches) {
        if (item.value) {
          updated = updated.replace(item.value, '').trim();
        }
      }
    } else if (type === 'SABOTAGE') {
      // Для диверсійного рекрутингу очищаємо все поле
      updated = '';
    }

    this.currentInput.value = updated;
    // Генеруємо подію input, щоб реактивні фреймворки сайту (React, Vue, Telegram Web) оновили стан
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
      .ts-chat-live-pill:hover {
        transform: scale(1.03) !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12) !important;
      }
    `;
    root.appendChild(style);
  }
}
