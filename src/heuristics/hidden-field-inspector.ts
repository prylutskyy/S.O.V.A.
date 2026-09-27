import { HeuristicResult } from '../types';

export type SensitiveFieldType =
  | 'CARD_NUMBER'
  | 'CVV'
  | 'CARD_EXPIRY'
  | 'PASSWORD'
  | 'PIN'
  | 'OTHER_SENSITIVE';

export interface FieldCloakResult {
  isCloaked: boolean;
  reason?: string;
  cloakingTechnique?: string;
}

export interface FieldSensitivityResult {
  isSensitive: boolean;
  fieldType?: SensitiveFieldType;
}

export interface HiddenFieldScanResult {
  hasTrap: boolean;
  trapType?: 'AUTOFILL_CARD_TRAP' | 'AUTOFILL_PASSWORD_TRAP' | 'NONE';
  flaggedInputs: Array<{
    element: HTMLElement;
    name: string;
    type: string;
    fieldType: SensitiveFieldType;
    cloakingReason: string;
  }>;
  flaggedTypes: SensitiveFieldType[];
  heuristicResult: HeuristicResult;
}

export class HiddenFieldInspector {
  // Regex for safe CSRF, technical tokens, search filters, and anti-forgery fields
  private static readonly SAFE_TOKEN_REGEX =
    /(?:^|[_\-.])(csrf|xsrf|_token|authenticity_token|csrfmiddlewaretoken|recaptcha|cf[-_]?turnstile|turnstile|timestamp|form_id|form_build_id|__viewstate|__requestverificationtoken)(?:$|[_\-.])/i;

  // Words that contain 'pass' or 'pin' or 'pan' or 'exp' but are definitely NOT payment/auth credentials
  private static readonly NON_SENSITIVE_WORDS = new Set([
    'company',
    'companies',
    'panel',
    'panels',
    'span',
    'spans',
    'japan',
    'japanese',
    'expand',
    'expanded',
    'expansion',
    'panic',
    'companion',
    'companions',
    'pancake',
    'panorama',
    'participant',
    'participants',
    'pantry',
    'trepan',
    'shipping',
    'opinion',
    'opinions',
    'pinned',
    'pinning',
    'pine',
    'pineapple',
    'pink',
    'alpine',
    'spinning',
    'spine',
    'passport',
    'passports',
    'passenger',
    'passengers',
    'compass',
    'compasses',
    'bypass',
    'bypasses',
    'passage',
    'passages',
    'passive',
    'passing',
    'trespass',
    'experience',
    'experiences',
    'expert',
    'experts',
    'expense',
    'expenses',
    'export',
    'exports',
    'explain',
    'explanation',
    'expression',
    'expressions',
    'expected',
    'expectations',
  ]);

  /**
   * Розбиває рядок дескриптора на окремі нормалізовані токени.
   * Підтримує camelCase, snake_case, kebab-case, кирилицю та латиницю.
   */
  public static tokenizeDescriptor(descriptor: string): string[] {
    if (!descriptor) return [];
    const splitCamel = descriptor.replace(/([a-z\d])([A-Z])/g, '$1 $2');
    const normalized = splitCamel.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
    return normalized.split(/\s+/).filter(Boolean);
  }

  private static isCardNumberField(tokens: string[], rawDescriptor: string, autocomplete: string): boolean {
    if (autocomplete === 'cc-number') return true;
    if (/(?:номер|nomer)[-_\s]*(?:карт|kart)/i.test(rawDescriptor)) return true;

    const hasPanToken = tokens.includes('pan');
    if (hasPanToken) {
      const isStandalonePan = tokens.length === 1;
      const isCardPan = tokens.some((t) => ['card', 'cc', 'primary', 'account', 'number', 'num', 'no'].includes(t));
      if (isStandalonePan || isCardPan) return true;
    }

    if (tokens.includes('iban') || tokens.some((t) => t.endsWith('iban'))) {
      return true;
    }

    const hasCard = tokens.includes('card') || tokens.includes('cc');
    const hasNum = tokens.some((t) => ['number', 'num', 'no', 'nbr', 'digits'].includes(t));
    if (hasCard && hasNum) return true;

    if (/(?:^|[^a-z0-9])(?:card[-_]?num(?:ber)?|cc[-_]?num(?:ber)?|credit[-_]?card|debit[-_]?card)(?:$|[^a-z0-9])/i.test(rawDescriptor)) {
      return true;
    }

    return false;
  }

  private static isCvvField(tokens: string[], rawDescriptor: string, autocomplete: string): boolean {
    if (['cc-csc', 'cc-cvv', 'cc-cvc'].includes(autocomplete)) return true;
    if (/(?:код|kod)[-_\s]*(?:безпек|карт|bezpek)/i.test(rawDescriptor)) return true;

    const hasCvvToken = tokens.some((t) => ['cvv', 'cvc', 'csc', 'cvv2', 'cvc2', 'cid'].includes(t));
    if (hasCvvToken) return true;

    if (tokens.includes('security') && tokens.some((t) => ['code', 'num', 'number'].includes(t))) return true;

    const hasPinToken = tokens.includes('pin') || tokens.includes('пин') || tokens.includes('пін');
    if (hasPinToken) {
      const isStandalonePin = tokens.length === 1;
      const isCardOrCodePin = tokens.some((t) => ['card', 'code', 'atm', 'security', 'код'].includes(t));
      if (isStandalonePin || isCardOrCodePin) return true;
    }

    if (/(?:^|[^a-z0-9])(?:cc[-_]?csc|cvv2?|cvc2?|security[-_]?code)(?:$|[^a-z0-9])/i.test(rawDescriptor)) {
      return true;
    }

    return false;
  }

  private static isExpiryField(tokens: string[], rawDescriptor: string, autocomplete: string): boolean {
    if (['cc-exp', 'cc-exp-month', 'cc-exp-year'].includes(autocomplete)) return true;
    if (/(?:термін|срок)[-_\s]*(?:дії|действ)/i.test(rawDescriptor)) return true;

    if (tokens.includes('expiry') || tokens.includes('expiration')) return true;

    const hasExpToken = tokens.includes('exp');
    if (hasExpToken) {
      const isExpDate = tokens.some((t) => ['month', 'year', 'date', 'card', 'cc'].includes(t));
      if (isExpDate || tokens.length === 1) return true;
    }

    if (/(?:cc[-_]?exp|card[-_]?exp(?:ir(?:y|ation))?|exp[-_]?(?:month|year|date))(?:$|[^a-z0-9])/i.test(rawDescriptor)) {
      return true;
    }

    return false;
  }

  private static isPasswordField(tokens: string[], rawDescriptor: string, autocomplete: string, inputType: string): boolean {
    if (inputType === 'password') return true;
    if (['current-password', 'new-password'].includes(autocomplete)) return true;
    if (/(?:парол|parol)/i.test(rawDescriptor)) return true;

    if (tokens.includes('password') || tokens.includes('passwd') || tokens.includes('pwd') || tokens.includes('passcode')) {
      return true;
    }

    const hasPassToken = tokens.includes('pass');
    if (hasPassToken) {
      const isPasswordContext = tokens.length === 1 || tokens.some((t) => ['user', 'confirm', 'confirmation', 'new', 'current', 'auth', 'login'].includes(t));
      if (isPasswordContext) return true;
    }

    return false;
  }

  /**
   * Перевірка, чи замасковано або приховано елемент від зору користувача
   */
  public static isElementCloaked(element: HTMLElement): FieldCloakResult {
    // 1. Прямий інпут з type="hidden"
    if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'hidden') {
      return {
        isCloaked: true,
        reason: 'input[type="hidden"]',
        cloakingTechnique: 'TYPE_HIDDEN',
      };
    }

    // 2. Перевірка самого елемента та його предків (Parent Container Cloaking)
    let current: HTMLElement | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const cloakCheck = this.checkSingleElementCloaking(current);
      if (cloakCheck.isCloaked) {
        return {
          isCloaked: true,
          reason: current === element ? cloakCheck.reason : `parent container cloaked: ${cloakCheck.reason}`,
          cloakingTechnique: cloakCheck.cloakingTechnique,
        };
      }
      current = current.parentElement;
    }

    return { isCloaked: false };
  }

  private static checkSingleElementCloaking(el: HTMLElement): FieldCloakResult {
    const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
    const inlineStyle = el.style;

    // A. display: none
    const display = style.display || inlineStyle.display;
    if (display === 'none') {
      return { isCloaked: true, reason: 'display: none', cloakingTechnique: 'DISPLAY_NONE' };
    }

    // B. visibility: hidden
    const visibility = style.visibility || inlineStyle.visibility;
    if (visibility === 'hidden') {
      return { isCloaked: true, reason: 'visibility: hidden', cloakingTechnique: 'VISIBILITY_HIDDEN' };
    }

    // C. opacity <= 0.05
    const opacityStr = style.opacity || inlineStyle.opacity;
    if (opacityStr !== undefined && opacityStr !== '') {
      const opacity = parseFloat(opacityStr);
      if (!isNaN(opacity) && opacity <= 0.05) {
        return { isCloaked: true, reason: `opacity: ${opacity}`, cloakingTechnique: 'OPACITY_ZERO' };
      }
    }

    // D. CSS transform (scale(0), matrix(0, ...), або translateX(-9999px))
    const transform = (style.transform || inlineStyle.transform || '').toLowerCase();
    if (
      transform &&
      (transform.includes('scale(0') ||
        transform.includes('matrix(0') ||
        transform.includes('-9999px') ||
        transform.includes('-5000px'))
    ) {
      return { isCloaked: true, reason: `transform (${transform})`, cloakingTechnique: 'TRANSFORM_CLOAK' };
    }

    // E. Оффскрін через inline або computed стилі (left: -9999px, top: -5000px)
    const left = style.left || inlineStyle.left || '';
    const top = style.top || inlineStyle.top || '';
    if (parseFloat(left) < -500 || parseFloat(top) < -500) {
      return { isCloaked: true, reason: `offscreen position style (left=${left}, top=${top})`, cloakingTechnique: 'OFFSCREEN' };
    }

    // F. Негативний text-indent
    const textIndent = style.textIndent || inlineStyle.textIndent || '';
    if (parseFloat(textIndent) < -500) {
      return { isCloaked: true, reason: `negative text-indent (${textIndent})`, cloakingTechnique: 'TEXT_INDENT' };
    }

    // G. CSS clip: rect(...)
    const clip = (style.clip || inlineStyle.clip || '').toLowerCase();
    if (clip && (clip.includes('rect(0') || clip.includes('rect(1px, 1px, 1px, 1px)'))) {
      return { isCloaked: true, reason: `clip: ${clip}`, cloakingTechnique: 'CLIP_RECT' };
    }

    // H. CSS clip-path: inset / circle(0) / polygon(0)
    const clipPath = (style.clipPath || (style as any).webkitClipPath || inlineStyle.clipPath || '').toLowerCase();
    if (clipPath && (clipPath.includes('inset(50%)') || clipPath.includes('circle(0') || clipPath.includes('polygon(0'))) {
      return { isCloaked: true, reason: `clip-path: ${clipPath}`, cloakingTechnique: 'CLIP_PATH' };
    }

    // I. visually-hidden / sr-only (width: <= 3px, height: <= 3px, overflow: hidden)
    const overflow = (style.overflow || inlineStyle.overflow || '').toLowerCase();
    const widthStr = style.width || inlineStyle.width || '';
    const heightStr = style.height || inlineStyle.height || '';
    const isTinyWidth = widthStr === '1px' || widthStr === '0px' || widthStr === '2px' || widthStr === '3px';
    const isTinyHeight = heightStr === '1px' || heightStr === '0px' || heightStr === '2px' || heightStr === '3px';

    if (
      (isTinyWidth && isTinyHeight) ||
      el.classList.contains('visually-hidden') ||
      el.classList.contains('sr-only')
    ) {
      if (overflow === 'hidden' || clip || isTinyWidth) {
        return { isCloaked: true, reason: 'visually-hidden dimensions (<= 3px)', cloakingTechnique: 'VISUALLY_HIDDEN' };
      }
    }

    const isExplicitZeroSize = (widthStr === '0px' || heightStr === '0px' || style.maxHeight === '0px' || style.maxWidth === '0px');
    if (isExplicitZeroSize) {
      return { isCloaked: true, reason: 'explicit zero dimensions (width/height: 0px)', cloakingTechnique: 'ZERO_DIMENSIONS' };
    }

    // J. getBoundingClientRect (у реальному браузері з активним лейаутом)
    const isMockDom = typeof navigator !== 'undefined' && (
      navigator.userAgent.includes('happy-dom') ||
      navigator.userAgent.includes('jsdom') ||
      (globalThis as any).process?.env?.VITEST
    );

    if (!isMockDom && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if ((rect.width <= 3 || rect.height <= 3) && el.isConnected) {
        return { isCloaked: true, reason: `micro dimensions (rect.width=${rect.width}, rect.height=${rect.height})`, cloakingTechnique: 'ZERO_DIMENSIONS' };
      }
      // Безпечна перевірка оффскріну (не залежить від вертикального скролу сторінки)
      if (rect.right < 0 || rect.left < -500 || (rect.bottom < 0 && ((rect.top + (window.scrollY || 0)) < -500))) {
        return { isCloaked: true, reason: `offscreen position (left=${rect.left}, top=${rect.top})`, cloakingTechnique: 'OFFSCREEN' };
      }
    }

    return { isCloaked: false };
  }

  /**
   * Класифікація чутливості поля (карткові реквізити, CVV, паролі)
   */
  public static isFieldSensitive(input: HTMLElement): FieldSensitivityResult {
    if (
      !(
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement
      )
    ) {
      return { isSensitive: false };
    }

    const type = (input.getAttribute('type') || (input instanceof HTMLSelectElement ? 'select' : 'text')).toLowerCase();

    // 1. Відсікаємо не-текстові типи полів, які браузер ніколи не автозаповнює платіжними або обліковими даними
    const nonSensitiveInputTypes = [
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'file',
      'image',
      'range',
      'color',
      'search',
    ];
    if (nonSensitiveInputTypes.includes(type)) {
      return { isSensitive: false };
    }

    const name = (input.getAttribute('name') || '').toLowerCase();
    const id = (input.getAttribute('id') || '').toLowerCase();
    const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

    // 2. Фільтрація безпечних CSRF / технічних токенів
    if (this.SAFE_TOKEN_REGEX.test(name) || this.SAFE_TOKEN_REGEX.test(id)) {
      return { isSensitive: false };
    }

    const rawDescriptor = `${name} ${id} ${autocomplete} ${placeholder} ${ariaLabel}`;
    const tokens = this.tokenizeDescriptor(rawDescriptor);

    // Перевіряємо, чи всі токени є звичайними не-чутливими словами (наприклад, "company", "type")
    const hasOnlyNonSensitiveTokens =
      tokens.length > 0 &&
      tokens.every(
        (t) =>
          this.NON_SENSITIVE_WORDS.has(t) ||
          ['type', 'name', 'id', 'title', 'query', 'filter', 'val', 'value', 'sort', 'category', 'status'].includes(t)
      );
    if (
      hasOnlyNonSensitiveTokens &&
      type !== 'password' &&
      !['cc-number', 'cc-csc', 'cc-exp', 'current-password', 'new-password'].includes(autocomplete)
    ) {
      return { isSensitive: false };
    }

    // 3. HTMLSelectElement може бути ТІЛЬКИ терміном дії картки (місяць / рік)
    if (input instanceof HTMLSelectElement) {
      if (this.isExpiryField(tokens, rawDescriptor, autocomplete)) {
        return { isSensitive: true, fieldType: 'CARD_EXPIRY' };
      }
      return { isSensitive: false };
    }

    // 4. Номер банківської картки
    if (this.isCardNumberField(tokens, rawDescriptor, autocomplete)) {
      return { isSensitive: true, fieldType: 'CARD_NUMBER' };
    }

    // 5. CVV / CVC код
    if (this.isCvvField(tokens, rawDescriptor, autocomplete)) {
      return { isSensitive: true, fieldType: 'CVV' };
    }

    // 6. Термін дії картки
    if (this.isExpiryField(tokens, rawDescriptor, autocomplete)) {
      return { isSensitive: true, fieldType: 'CARD_EXPIRY' };
    }

    // 7. Пароль
    if (this.isPasswordField(tokens, rawDescriptor, autocomplete, type)) {
      return { isSensitive: true, fieldType: 'PASSWORD' };
    }

    return { isSensitive: false };
  }

  /**
   * Комплексне сканування форми на наявність пасток з прихованими полями (Autofill Phishing)
   */
  public static scanForm(form: HTMLFormElement): HiddenFieldScanResult {
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea, select')
    );

    const flaggedInputs: Array<{
      element: HTMLElement;
      name: string;
      type: string;
      fieldType: SensitiveFieldType;
      cloakingReason: string;
    }> = [];
    const flaggedTypesSet = new Set<SensitiveFieldType>();

    for (const input of inputs) {
      const sensitivity = this.isFieldSensitive(input);
      if (!sensitivity.isSensitive || !sensitivity.fieldType) continue;

      const cloaking = this.isElementCloaked(input);
      if (cloaking.isCloaked) {
        flaggedInputs.push({
          element: input,
          name: input.name || input.id || input.getAttribute('autocomplete') || 'unknown_field',
          type: input.type || 'text',
          fieldType: sensitivity.fieldType,
          cloakingReason: cloaking.reason || 'cloaked',
        });
        flaggedTypesSet.add(sensitivity.fieldType);
      }
    }

    const hasTrap = flaggedInputs.length > 0;
    const flaggedTypes = Array.from(flaggedTypesSet);
    const hasCardTrap =
      flaggedTypes.includes('CARD_NUMBER') ||
      flaggedTypes.includes('CVV') ||
      flaggedTypes.includes('CARD_EXPIRY');

    const heuristicResult: HeuristicResult = {
      name: 'hidden_sensitive_fields',
      triggered: hasTrap,
      severity: hasTrap ? 'CRITICAL' : 'LOW',
      scoreContribution: hasTrap ? 50 : 0,
      message: hasTrap
        ? `Виявлено приховані поля збору чутливих даних (Autofill Phishing: ${flaggedTypes.join(', ')})! Форма намагається викрасти платіжні або облікові дані через браузерне автозаповнення.`
        : 'Прихованих чутливих полів не виявлено.',
      details: {
        flaggedInputs: flaggedInputs.map((f) => `${f.name} (${f.fieldType})`),
        flaggedTypes,
      },
    };

    return {
      hasTrap,
      trapType: hasTrap ? (hasCardTrap ? 'AUTOFILL_CARD_TRAP' : 'AUTOFILL_PASSWORD_TRAP') : 'NONE',
      flaggedInputs,
      flaggedTypes,
      heuristicResult,
    };
  }

  /**
   * Превентивне знешкодження пастки автозаповнення (Autofill Disarm)
   * Вимикає автозаповнення на прихованих полях, зберігаючи оригінальні атрибути для безпечного відновлення
   */
  public static disarmForm(form: HTMLFormElement): number {
    const scan = this.scanForm(form);
    let count = 0;
    for (const item of scan.flaggedInputs) {
      const el = item.element as HTMLInputElement;
      if (!el.dataset.threatShieldDisarmed) {
        el.dataset.threatShieldDisarmed = 'true';
        el.dataset.tsOriginalAutocomplete = el.getAttribute('autocomplete') ?? '';
        el.dataset.tsOriginalDisabled = String(el.disabled);
        el.dataset.tsOriginalTabindex = el.getAttribute('tabindex') ?? '';

        el.setAttribute('autocomplete', 'off');
        el.disabled = true;
        el.tabIndex = -1;
        count++;
      } else {
        count++;
      }
    }
    return count;
  }

  /**
   * Відновлення знешкоджених полів форми (Un-disarm / Restore)
   */
  public static restoreForm(form: HTMLFormElement): number {
    const disarmedInputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '[data-threat-shield-disarmed="true"]'
    );
    let count = 0;
    for (const el of Array.from(disarmedInputs)) {
      if (el.dataset.tsOriginalAutocomplete !== undefined && el.dataset.tsOriginalAutocomplete !== '') {
        el.setAttribute('autocomplete', el.dataset.tsOriginalAutocomplete);
      } else {
        el.removeAttribute('autocomplete');
      }
      el.disabled = el.dataset.tsOriginalDisabled === 'true';
      if (el.dataset.tsOriginalTabindex !== undefined && el.dataset.tsOriginalTabindex !== '') {
        el.setAttribute('tabindex', el.dataset.tsOriginalTabindex);
      } else {
        el.removeAttribute('tabindex');
      }
      delete el.dataset.threatShieldDisarmed;
      delete el.dataset.tsOriginalAutocomplete;
      delete el.dataset.tsOriginalDisabled;
      delete el.dataset.tsOriginalTabindex;
      count++;
    }
    return count;
  }
}

export interface ProactiveScanCallbacks {
  onTrapDetected: (scan: HiddenFieldScanResult, form: HTMLFormElement) => void;
  isDomainAllowed?: (domain: string) => boolean;
}

export class ProactiveFormScanner {
  private static observer: MutationObserver | null = null;
  private static scannedForms = new WeakSet<HTMLFormElement>();
  private static callbacks: ProactiveScanCallbacks | null = null;
  private static currentHost: string = '';

  public static init(callbacks: ProactiveScanCallbacks, host: string = ''): void {
    this.callbacks = callbacks;
    this.currentHost = host;
    this.scannedForms = new WeakSet<HTMLFormElement>();

    this.scanCurrentDocument();
    this.setupObserver();
  }

  public static resetScannedForms(): void {
    this.scannedForms = new WeakSet<HTMLFormElement>();
  }

  public static scanCurrentDocument(): HiddenFieldScanResult[] {
    if (!this.callbacks) return [];
    if (this.currentHost && this.callbacks.isDomainAllowed && this.callbacks.isDomainAllowed(this.currentHost)) {
      return [];
    }

    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
    const results: HiddenFieldScanResult[] = [];

    for (const form of forms) {
      if (this.scannedForms.has(form)) continue;
      this.scannedForms.add(form);

      const targetHost = this.getFormTargetHost(form);
      if (targetHost && this.callbacks.isDomainAllowed && this.callbacks.isDomainAllowed(targetHost)) {
        continue;
      }

      const scan = HiddenFieldInspector.scanForm(form);
      if (scan.hasTrap) {
        // Превентивне знешкодження
        HiddenFieldInspector.disarmForm(form);
        results.push(scan);
        this.callbacks.onTrapDetected(scan, form);
      }
    }

    return results;
  }

  private static setupObserver(): void {
    if (typeof MutationObserver === 'undefined') return;
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'FORM' || node.querySelector('form') || node.tagName === 'INPUT') {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }
      if (shouldScan) {
        this.scanCurrentDocument();
      }
    });

    try {
      const targetNode = document.body || document.documentElement;
      if (targetNode) {
        this.observer.observe(targetNode, { childList: true, subtree: true });
      }
    } catch (e) {}

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.scanCurrentDocument();
      }, { once: true });
    }
  }

  public static stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.callbacks = null;
  }

  private static getFormTargetHost(form: HTMLFormElement): string {
    const rawAction = form.getAttribute('action') || form.action;
    if (!rawAction || rawAction === '#' || rawAction.startsWith('javascript:')) {
      return this.currentHost;
    }
    try {
      return new URL(rawAction, window.location.href).hostname.toLowerCase();
    } catch {
      return this.currentHost;
    }
  }
}

