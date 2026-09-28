import { PersonalVaultManager } from '../core/personal-vault';
import { VaultScanner } from './vault-scanner';
import { ToastNotifier } from '../ui/toast-notifier';
import { ShadowHost } from '../ui/shadow-host';
import { isWhitelisted } from '../core/whitelist';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { UserWhitelistManager } from '../core/user-whitelist';
import { HiddenFieldInspector } from './hidden-field-inspector';

export interface SealedFieldMetadata {
  input: HTMLInputElement | HTMLTextAreaElement;
  categoryLabel: string;
  isTierA: boolean;
  fieldType: 'VAULT_ITEM' | 'PAYMENT_CVV' | 'PAYMENT_PIN' | 'PAYMENT_EXPIRY';
  badgeElement?: HTMLElement;
  tooltipElement?: HTMLElement;
}

/**
 * ProactiveFieldProtector (Sanctuary Sealed Aperture)
 *
 * Превентивне знешкодження видимих небезпечних полів на неакредитованих сайтах:
 * - Запечатує поля (readOnly = true + capture event interception), щоб кейлогери
 *   не отримали жодного символу через addEventListener('input') / WebSocket.
 * - Огортає поле делікатним бурштиновим контуром та мікро-бейдж-капсулою у Shadow DOM.
 * - При наведенні або кліку виводить інтерактивну лупу (Swiss Loupe) з 1-клік розблокуванням.
 * - При завантаженні сторінки показує спокійне сповіщення про захищені поля.
 */
export class ProactiveFieldProtector {
  private static sealedFields = new Map<HTMLInputElement | HTMLTextAreaElement, SealedFieldMetadata>();
  private static observer: MutationObserver | null = null;
  private static currentHost: string = '';
  private static activeTooltip: HTMLElement | null = null;
  private static outsideClickListenerAttached = false;

  /**
   * Перевірка, чи має сайт апріорний імунітет до блокувань
   */
  public static isHostImmune(host: string = this.currentHost): boolean {
    if (!host) {
      if (typeof window !== 'undefined' && window.location) {
        const proto = (window.location.protocol || '').toLowerCase();
        if (proto === 'chrome-extension:' || proto === 'moz-extension:') return true;
        let clean = (window.location.hostname || '').toLowerCase().trim();
        if (!clean && proto === 'file:') {
          const parts = (window.location.pathname || '').split('/');
          clean = 'file://' + (parts[parts.length - 1] || 'local-file');
        }
        host = clean;
      }
    }
    if (!host) return false;

    const lower = host.toLowerCase().trim();
    return (
      isWhitelisted(lower) ||
      lower.endsWith('.gov.ua') ||
      isAccreditedPaymentGateway(lower) ||
      UserWhitelistManager.isDomainAllowedSync(lower)
    );
  }

  /**
   * Ініціалізація проактивного захисту полів
   */
  public static init(host: string = ''): void {
    this.currentHost = host;
    if (this.isHostImmune(host)) return;

    this.scanAndProtect();
    this.setupObserver();
    this.setupGlobalInterception();
  }

  /**
   * Скидання та зупинка
   */
  public static reset(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.unsealAll();
  }

  /**
   * Сканування та запечатування підозрілих полів у документі
   */
  public static scanAndProtect(root: ParentNode = document): number {
    if (this.isHostImmune(this.currentHost)) return 0;

    const inputs = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]), textarea'
      )
    );

    const newlySealedLabels: string[] = [];

    for (const input of inputs) {
      if (
        input.dataset?.threatShieldApproved === 'true' ||
        input.dataset?.sanctuaryApproved === 'true' ||
        input.dataset?.sanctuaryUnsealed === 'true'
      ) {
        continue;
      }
      if (input.dataset?.sanctuarySealed === 'true') {
        continue;
      }

      // Пропускаємо клоаковані/приховані поля — ними опікується HiddenFieldInspector
      const cloaking = HiddenFieldInspector.isElementCloaked(input);
      if (cloaking.isCloaked) {
        continue;
      }

      const match = this.evaluateField(input);
      if (match) {
        this.sealField(input, match);
        newlySealedLabels.push(match.categoryLabel);
      }
    }

    if (newlySealedLabels.length > 0) {
      const distinct = Array.from(new Set(newlySealedLabels));
      const labelText = distinct.slice(0, 2).join(', ') + (distinct.length > 2 ? ' та ін.' : '');
      ToastNotifier.show(
        `Sanctuary убезпечив поля від витоку даних: «${labelText}».`,
        'warning',
        8000
      );
    }

    return newlySealedLabels.length;
  }

  /**
   * Оцінка окремого поля на предмет небезпеки (Vault маркери або неакредитовані платіжні реквізити)
   */
  public static evaluateField(input: HTMLInputElement | HTMLTextAreaElement): {
    categoryLabel: string;
    isTierA: boolean;
    fieldType: 'VAULT_ITEM' | 'PAYMENT_CVV' | 'PAYMENT_PIN' | 'PAYMENT_EXPIRY';
  } | null {
    const { descriptor, labelText } = VaultScanner.extractInputContext(input, input.form || undefined);

    // 1. Перевірка на маркери з Personal Vault (включно з дефолтними шаблонами)
    const vaultItems = PersonalVaultManager.getItemsSync();
    const vaultItem = PersonalVaultManager.findMatchingVaultItemForField(descriptor, vaultItems, true);

    if (vaultItem) {
      const tier = PersonalVaultManager.getCategoryTier(vaultItem.category);
      const isTierA = tier === 'TIER_A_ABSOLUTE';
      return {
        categoryLabel: vaultItem.label,
        isTierA,
        fieldType: 'VAULT_ITEM',
      };
    }

    // 2. Якщо домен не є акредитованим платіжним шлюзом — перевіряємо запити реквізитів банківських карток
    if (!isAccreditedPaymentGateway(this.currentHost)) {
      // CVV / CVC
      if (/(?:^|[^a-z0-9])(?:cvv|cvc|csc|cvv2|cvc2|cid)(?:$|[^a-z0-9])|код\s*безпеки|код\s*картки/i.test(descriptor)) {
        return {
          categoryLabel: 'Код безпеки картки (CVV/CVC)',
          isTierA: true,
          fieldType: 'PAYMENT_CVV',
        };
      }

      // PIN-код
      if (/(?:^|[^a-z0-9])(?:pin|pin[-_]?code)(?:$|[^a-z0-9])|пін[-_\s]*код|пин[-_\s]*код/i.test(descriptor)) {
        return {
          categoryLabel: 'ПІН-код картки (PIN)',
          isTierA: true,
          fieldType: 'PAYMENT_PIN',
        };
      }

      // Термін дії картки (MM/YY)
      if (/(?:^|[^a-z0-9])(?:exp|expiry|exp[-_]?date|card[-_]?exp)(?:$|[^a-z0-9])|термін\s*дії|срок\s*действия/i.test(descriptor)) {
        return {
          categoryLabel: 'Термін дії картки (MM/YY)',
          isTierA: false,
          fieldType: 'PAYMENT_EXPIRY',
        };
      }
    }

    return null;
  }

  /**
   * Запечатування чутливого поля
   */
  public static sealField(
    input: HTMLInputElement | HTMLTextAreaElement,
    meta: {
      categoryLabel: string;
      isTierA: boolean;
      fieldType: 'VAULT_ITEM' | 'PAYMENT_CVV' | 'PAYMENT_PIN' | 'PAYMENT_EXPIRY';
    }
  ): void {
    if (input.dataset.sanctuarySealed === 'true') return;

    // Зберігаємо оригінальний стан для безшовного відновлення
    input.dataset.sanctuarySealed = 'true';
    input.dataset.sanctuaryLabel = meta.categoryLabel;
    input.dataset.sanctuaryIsTierA = String(meta.isTierA);
    input.dataset.tsOriginalReadonly = String(input.readOnly);
    input.dataset.tsOriginalOutline = input.style.outline || '';
    input.dataset.tsOriginalOutlineOffset = input.style.outlineOffset || '';
    input.dataset.tsOriginalBg = input.style.backgroundColor || '';
    input.dataset.tsOriginalCursor = input.style.cursor || '';
    input.dataset.tsOriginalTransition = input.style.transition || '';

    // Апертурний бар'єр: readOnly блокує клавіатурний ввід нативним рушієм браузера (0 байт кейлогеру!)
    input.readOnly = true;

    // Оптична естетика Sanctuary
    const accentColor = meta.isTierA ? 'rgba(220, 38, 38, 0.55)' : 'rgba(217, 119, 6, 0.55)';
    const bgColor = meta.isTierA ? 'rgba(220, 38, 38, 0.03)' : 'rgba(217, 119, 6, 0.03)';

    input.style.outline = `2px solid ${accentColor}`;
    input.style.outlineOffset = '1px';
    input.style.backgroundColor = bgColor;
    input.style.cursor = 'pointer';
    input.style.transition = 'outline 0.2s ease, background-color 0.2s ease';

    // Рендеринг мікро-бейджа у Shadow DOM
    const badge = this.renderMicroBadge(input, meta.categoryLabel, meta.isTierA);

    const record: SealedFieldMetadata = {
      input,
      categoryLabel: meta.categoryLabel,
      isTierA: meta.isTierA,
      fieldType: meta.fieldType,
      badgeElement: badge,
    };

    this.sealedFields.set(input, record);
  }

  /**
   * Розблокування окремого поля за волею користувача
   */
  public static unsealField(input: HTMLInputElement | HTMLTextAreaElement, userInitiated = true): void {
    const record = this.sealedFields.get(input);
    if (!record && input.dataset.sanctuarySealed !== 'true') return;

    // Відновлення атрибутів
    input.readOnly = input.dataset.tsOriginalReadonly === 'true';
    input.style.outline = input.dataset.tsOriginalOutline || '';
    input.style.outlineOffset = input.dataset.tsOriginalOutlineOffset || '';
    input.style.backgroundColor = input.dataset.tsOriginalBg || '';
    input.style.cursor = input.dataset.tsOriginalCursor || '';
    input.style.transition = input.dataset.tsOriginalTransition || '';

    // Очищення метаданих
    delete input.dataset.sanctuarySealed;
    delete input.dataset.sanctuaryLabel;
    delete input.dataset.sanctuaryIsTierA;
    delete input.dataset.tsOriginalReadonly;
    delete input.dataset.tsOriginalOutline;
    delete input.dataset.tsOriginalOutlineOffset;
    delete input.dataset.tsOriginalBg;
    delete input.dataset.tsOriginalCursor;
    delete input.dataset.tsOriginalTransition;

    if (userInitiated) {
      input.dataset.sanctuaryUnsealed = 'true';
    }

    // Видалення бейджа та тултіпа з Shadow DOM
    if (record?.badgeElement && record.badgeElement.parentNode) {
      record.badgeElement.parentNode.removeChild(record.badgeElement);
    }
    this.closeActiveTooltip();

    this.sealedFields.delete(input);

    if (userInitiated) {
      input.focus();
      ToastNotifier.show('Поле розблоковано за вашим запитом.', 'info', 3000);
    }
  }

  /**
   * Розблокування всіх полів (наприклад, при внесенні сайту до білого списку)
   */
  public static unsealAll(): void {
    for (const input of Array.from(this.sealedFields.keys())) {
      this.unsealField(input, false);
      delete input.dataset.sanctuaryUnsealed;
    }
    this.sealedFields.clear();
    this.closeActiveTooltip();
  }

  /**
   * Рендеринг мікро-бейджа у Shadow DOM
   */
  private static renderMicroBadge(
    input: HTMLInputElement | HTMLTextAreaElement,
    label: string,
    isTierA: boolean
  ): HTMLElement {
    const root = ShadowHost.getRoot();

    const badge = document.createElement('div');
    badge.className = 'ts-sanctuary-seal-badge';
    badge.title = `Поле захищено Sanctuary: ${label} (натисніть для деталей)`;

    // Швейцарська типографіка + невагоме скло
    const bg = isTierA ? 'rgba(254, 242, 242, 0.94)' : 'rgba(255, 251, 235, 0.94)';
    const border = isTierA ? 'rgba(239, 68, 68, 0.35)' : 'rgba(217, 119, 6, 0.35)';
    const textColor = isTierA ? '#991B1B' : '#92400E';
    const shadowColor = isTierA ? 'rgba(239, 68, 68, 0.15)' : 'rgba(217, 119, 6, 0.15)';

    badge.style.cssText = `
      position: absolute !important;
      z-index: 2147483646 !important;
      background: ${bg} !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      border: 1px solid ${border} !important;
      color: ${textColor} !important;
      padding: 3px 7px !important;
      border-radius: 6px !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      letter-spacing: 0.02em !important;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
      box-shadow: 0 2px 6px ${shadowColor} !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      cursor: pointer !important;
      white-space: nowrap !important;
      line-height: 1.2 !important;
      user-select: none !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease !important;
      box-sizing: border-box !important;
    `;

    badge.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span>Захищено</span>
    `;

    const updatePosition = () => {
      if (!input.isConnected) {
        if (badge.parentNode) badge.parentNode.removeChild(badge);
        return;
      }
      const rect = input.getBoundingClientRect();
      const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
      const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

      let top = scrollY + rect.top - 21;
      let left = scrollX + rect.left + Math.max(0, rect.width - 76);

      if (top < scrollY + 4) {
        top = scrollY + rect.bottom + 4;
      }

      badge.style.top = `${top}px`;
      badge.style.left = `${left}px`;
    };

    updatePosition();

    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.05)';
      this.showTooltip(input, label, isTierA, badge);
    });

    badge.addEventListener('mouseleave', (e) => {
      badge.style.transform = 'scale(1)';
    });

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTooltip(input, label, isTierA, badge);
    });

    root.appendChild(badge);
    return badge;
  }

  private static ensureStylesInjected(root: ShadowRoot): void {
    if (root.getElementById('ts-sanctuary-loupe-styles')) return;

    const style = document.createElement('style');
    style.id = 'ts-sanctuary-loupe-styles';
    style.textContent = `
      @keyframes tsLoupeIn {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes tsLoupeOut {
        0% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translateY(4px) scale(0.97);
        }
      }

      .ts-sanctuary-loupe-tooltip {
        animation: tsLoupeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        transform-origin: top center !important;
      }

      .ts-sanctuary-loupe-tooltip.ts-closing {
        animation: tsLoupeOut 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        pointer-events: none !important;
      }

      .ts-loupe-unlock-btn {
        all: unset !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        box-sizing: border-box !important;
        background-color: #1D1D1F !important;
        color: #FFFFFF !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
        padding: 6px 14px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        line-height: 1.2 !important;
        border: 1px solid rgba(0, 0, 0, 0.1) !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) !important;
        transition: background-color 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .ts-loupe-unlock-btn:hover {
        background-color: #000000 !important;
        color: #FFFFFF !important;
        transform: translateY(-1px) scale(1.02) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
      }

      .ts-loupe-unlock-btn:active {
        background-color: #2C2C2E !important;
        color: #FFFFFF !important;
        transform: translateY(0) scale(0.98) !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
      }

      .ts-loupe-unlock-btn svg {
        stroke: #FFFFFF !important;
        color: #FFFFFF !important;
      }

      .ts-loupe-close-btn {
        all: unset !important;
        cursor: pointer !important;
        color: #86868B !important;
        padding: 4px !important;
        border-radius: 4px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: color 0.15s ease, background-color 0.15s ease !important;
      }

      .ts-loupe-close-btn:hover {
        color: #1D1D1F !important;
        background-color: rgba(0, 0, 0, 0.05) !important;
      }
    `;
    root.appendChild(style);
  }

  /**
   * Відображення плаваючої швейцарської лупи (Swiss Loupe Tooltip)
   */
  public static showTooltip(
    input: HTMLInputElement | HTMLTextAreaElement,
    label: string,
    isTierA: boolean,
    anchorEl?: HTMLElement
  ): void {
    this.closeActiveTooltip();

    const root = ShadowHost.getRoot();
    this.ensureStylesInjected(root);

    const tooltip = document.createElement('div');
    tooltip.className = 'ts-sanctuary-loupe-tooltip';

    const borderColor = isTierA ? 'rgba(239, 68, 68, 0.28)' : 'rgba(217, 119, 6, 0.28)';

    tooltip.style.cssText = `
      position: absolute !important;
      z-index: 2147483647 !important;
      width: 290px !important;
      background: rgba(255, 255, 255, 0.98) !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      border: 1px solid ${borderColor} !important;
      border-radius: 12px !important;
      padding: 14px 16px !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04) !important;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
      color: #1D1D1F !important;
      box-sizing: border-box !important;
    `;

    tooltip.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: ${isTierA ? '#FEE2E2' : '#FEF3C7'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${isTierA ? '#DC2626' : '#D97706'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <span style="font-size: 13px; font-weight: 600; color: #1D1D1F; letter-spacing: -0.01em;">Поле убезпечено Sanctuary</span>
        </div>
        <button id="ts-loupe-close" class="ts-loupe-close-btn" aria-label="Закрити" title="Закрити підказку">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <p style="font-size: 12px; line-height: 1.45; color: #6E6E73; margin: 0 0 12px 0;">
        Сторонній ресурс запитує конфіденційні дані: <strong style="color: #1D1D1F; font-weight: 600;">«${label}»</strong>.
        Введення деактивовано для запобігання перехопленню кейлогерами.
      </p>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
        <button id="ts-unlock-btn" class="ts-loupe-unlock-btn">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
          Розблокувати поле
        </button>
      </div>
    `;

    // Позиціонування тултіпа над полем або якорем
    const targetEl = anchorEl || input;
    const rect = targetEl.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;

    let top = scrollY + rect.top - 132;
    let left = scrollX + rect.left;

    if (top < scrollY + 10) {
      top = scrollY + rect.bottom + 8;
    }
    if (left + 290 > (typeof window !== 'undefined' ? window.innerWidth : 1000)) {
      left = Math.max(10, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 300);
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    const unlockBtn = tooltip.querySelector('#ts-unlock-btn') as HTMLButtonElement | null;
    if (unlockBtn) {
      unlockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.unsealField(input, true);
      });
    }

    const closeBtn = tooltip.querySelector('#ts-loupe-close') as HTMLButtonElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeActiveTooltip();
      });
    }

    root.appendChild(tooltip);
    this.activeTooltip = tooltip;

    if (!this.outsideClickListenerAttached) {
      window.addEventListener('click', (e) => {
        if (this.activeTooltip) {
          this.closeActiveTooltip();
        }
      }, { capture: true, once: true });
      this.outsideClickListenerAttached = false;
    }
  }

  public static closeActiveTooltip(): void {
    if (this.activeTooltip && this.activeTooltip.parentNode) {
      const el = this.activeTooltip;
      this.activeTooltip = null;
      el.classList.add('ts-closing');
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, 150);
    }
  }

  public static showTooltipForElement(input: HTMLInputElement | HTMLTextAreaElement): void {
    const meta = this.sealedFields.get(input);
    if (!meta) {
      const label = input.dataset.sanctuaryLabel || 'Конфіденційні дані';
      const isTierA = input.dataset.sanctuaryIsTierA === 'true';
      this.showTooltip(input, label, isTierA);
      return;
    }
    this.showTooltip(input, meta.categoryLabel, meta.isTierA, meta.badgeElement);
  }

  private static setupObserver(): void {
    if (typeof MutationObserver === 'undefined') return;
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'INPUT' || node.tagName === 'FORM' || node.querySelector('input, form')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }
      if (shouldScan) {
        this.scanAndProtect();
      }
    });

    try {
      const target = document.body || document.documentElement;
      if (target) {
        this.observer.observe(target, { childList: true, subtree: true });
      }
    } catch {}
  }

  /**
   * Глобальне перехоплення подій для запечатаних полів (фаза Capture)
   */
  private static setupGlobalInterception(): void {
    if (typeof window === 'undefined') return;

    const handleInteraction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.dataset?.sanctuarySealed === 'true') {
        const inp = target as HTMLInputElement | HTMLTextAreaElement;

        // Повне блокування введення клавіш для кейлогерів сайту
        if (['keydown', 'keypress', 'beforeinput', 'input', 'paste'].includes(e.type)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.showTooltipForElement(inp);
        } else if (e.type === 'click') {
          // Клік на полі викликає картку розблокування
          this.showTooltipForElement(inp);
        }
      }
    };

    window.addEventListener('keydown', handleInteraction, true);
    window.addEventListener('keypress', handleInteraction, true);
    window.addEventListener('beforeinput', handleInteraction, true);
    window.addEventListener('paste', handleInteraction, true);
    window.addEventListener('click', handleInteraction, true);
  }
}
