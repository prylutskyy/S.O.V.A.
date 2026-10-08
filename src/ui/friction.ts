import { i18n } from '../core/i18n';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { HiddenFieldScanResult, HiddenFieldInspector } from '../heuristics/hidden-field-inspector';
import { DESIGN_TOKENS_CSS, getSovaLogoUrl } from './design-tokens';
import { PersonalVaultManager } from '../core/personal-vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { DebuggerOverlay } from './debugger-overlay';

export class SecurityFriction {
  private static autoTearTimer: any = null;
  private static circuitKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private static veilResizeHandler: (() => void) | null = null;
  private static isChatFreezeActive = false;

  public static positionVeilElement(veil: HTMLElement): void {
    if (typeof document === 'undefined') return;
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(
      'textarea:not([aria-hidden="true"]), [contenteditable="true"]:not([aria-hidden="true"]), [role="textbox"], input[type="text"]:not([aria-hidden="true"]), input:not([type]):not([aria-hidden="true"])'
    )).filter((el) => {
      if (el.closest('threat-shield-host') || el.closest('#threat-shield-context-banner')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 15;
    });

    const targetInput = candidates[candidates.length - 1];
    if (targetInput) {
      const container = (targetInput.closest('form, [class*="composer"], [class*="input-container"], [class*="chat-input"], [class*="message-input"], footer') as HTMLElement) || targetInput;
      const rect = container.getBoundingClientRect();
      const pad = container === targetInput ? 4 : 0;
      veil.style.position = 'fixed';
      veil.style.top = `${Math.max(8, rect.top - pad)}px`;
      veil.style.left = `${Math.max(8, rect.left - pad)}px`;
      veil.style.width = `${Math.min(window.innerWidth - 16, Math.max(280, rect.width + pad * 2))}px`;
      veil.style.height = `${Math.max(48, rect.height + pad * 2)}px`;
      veil.style.bottom = 'auto';
      veil.style.transform = 'none';
      veil.style.borderRadius = '0px';
    } else {
      veil.style.position = 'fixed';
      veil.style.bottom = '24px';
      veil.style.top = 'auto';
      veil.style.left = '50%';
      veil.style.transform = 'translateX(-50%)';
      veil.style.width = 'min(580px, calc(100vw - 32px))';
      veil.style.height = '56px';
      veil.style.borderRadius = '0px';
    }
  }

  private static activeDisarmedForm: {
    form: HTMLFormElement;
    originalBoxShadow: string;
    originalTransition: string;
  } | null = null;

  private static restoreDisarmedFormStyle(): void {
    if (this.activeDisarmedForm) {
      const { form, originalBoxShadow, originalTransition } = this.activeDisarmedForm;
      form.style.boxShadow = originalBoxShadow;
      form.style.transition = originalTransition;
      this.activeDisarmedForm = null;
    }
  }
  /**
   * Застосування адаптивного тертя (Security Friction) через центроване універсальне модальне вікно
   */
  public static apply(
    form: HTMLFormElement,
    assessment: ThreatAssessment,
    anchorElement?: HTMLElement,
    onProceedCallback?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    let targetHost = window.location.hostname;
    const rawAction = form.getAttribute('action') || form.action;
    try {
      if (rawAction) {
        targetHost = new URL(rawAction, window.location.href).hostname;
      }
    } catch {}

    const detectedAmount = XaiEngine.extractFinancialAmount(form) || undefined;
    const vaultScan = VaultScanner.scanFormSync(form, targetHost);

    // Витягуємо заповнені поля форми для ШІ та інспектора
    const formFieldsSummary: string[] = [];
    try {
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
      for (const inp of inputs) {
        if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button' || inp.type === 'reset') continue;
        const val = inp.value?.trim();
        if (!val) continue;
        const placeholder = ('placeholder' in inp) ? (inp as HTMLInputElement).placeholder : '';
        const desc = `${inp.name || inp.id || placeholder || inp.type}`.toLowerCase();
        const isCvv = /(cvv|cvc|csc|pin|код)/i.test(desc);
        const isCard = /(card|pan|номер карт|номер карты)/i.test(desc) || (val.replace(/\D/g, '').length >= 13);
        const isPass = inp.type === 'password' || /(pass|парол)/i.test(desc);
        
        let displayVal = val;
        if (isCvv) displayVal = '*** (CVV/CVC код)';
        else if (isPass) displayVal = '****** (Пароль)';
        else if (isCard) {
          const clean = val.replace(/\D/g, '');
          displayVal = clean.length > 8 ? `${clean.substring(0, 6)}******${clean.substring(clean.length - 4)}` : '**** **** **** ****';
        }
        formFieldsSummary.push(`${inp.name || placeholder || inp.id || 'поле'}: "${displayVal}"`);
      }
    } catch {}

    let rawFormText = `Заповнення форми на сторінці ${window.location.hostname} (Action: ${form.action || targetHost}).`;
    if (formFieldsSummary.length > 0) {
      rawFormText += ` Заповнені поля: ${formFieldsSummary.join('; ')}`;
    }
    if (activeContext?.targetSuspiciousUrl) {
      rawFormText += ` (Перехід здійснено після повідомлення в чаті на ${activeContext.sourcePlatform}: "${activeContext.targetSuspiciousUrl}")`;
    }

    // Чистий Дзен + Ізольований Shadow DOM: жодного втручання в інлайн-стилі форми
    UnifiedFrictionModal.show({
      type: 'form',
      title: i18n.getMessage('frictionModalFormTitle'),
      badgeText: i18n.getMessage('frictionModalFormBadge', [assessment.level, String(assessment.score)]),
      badgeLevel: assessment.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      contextLabel: i18n.getMessage('frictionModalTargetServer'),
      contextValue: targetHost,
      triggers: assessment.triggers,
      assessment,
      activeContext,
      detectedAmount,
      vaultMatches: vaultScan.matches,
      rawTextToScan: rawFormText,
      formDetails: formFieldsSummary.length > 0 ? formFieldsSummary.join('\n') : undefined,
      intentType: activeContext?.scenario || undefined,
      allowRememberDomain: true,
      domainToRemember: targetHost,
      onProceed: () => {
        console.log('[ThreatShield] Користувач усвідомлено розблокував відправку форми');
        form.dataset.threatShieldApproved = 'true';

        if (onProceedCallback) {
          onProceedCallback();
        } else {
          // Повторне легітимне відправлення форми
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        }
      },
      onCancel: () => {
        console.log('[ThreatShield] Користувач скасував відправку підозрілої форми');
        DebuggerOverlay.recordMitigation(
          'Відправку форми заблоковано користувачем',
          assessment.score,
          assessment.level
        );
      },
    });
  }

  /**
   * Застосування тертя при спробі надіслати карткові дані в чаті
   */
  public static applyToChat(
    chatInput: HTMLInputElement | HTMLTextAreaElement,
    leakage: {
      hasCard: boolean;
      hasCvv: boolean;
      hasExpiry?: boolean;
      hasOtp?: boolean;
      hasGps?: boolean;
      hasSabotage?: boolean;
      cards: string[];
      isCrossMessage?: boolean;
      customReason?: string;
      customTitle?: string;
      customBadgeText?: string;
      customTriggers?: Array<{ message: string; severity: string }>;
    },
    onProceed: () => void,
    onCancel?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    const currentPlatform = window.location.hostname || i18n.getMessage('frictionChatPlatformDefault');
    const detectedAmount = XaiEngine.extractFinancialAmount(chatInput) || undefined;
    const vaultScan = VaultScanner.scanTextSync(chatInput.value || '');

    const triggers: Array<{ message: string; severity: string }> = [];
    if (leakage.customTriggers && leakage.customTriggers.length > 0) {
      triggers.push(...leakage.customTriggers);
    } else {
      if (leakage.isCrossMessage) {
        triggers.push({
          message: i18n.getMessage('frictionChatTriggerCrossMessage'),
          severity: 'CRITICAL',
        });
      }
      if (leakage.hasCard && (leakage.hasCvv || leakage.hasExpiry)) {
        triggers.push({
          message: i18n.getMessage('frictionChatTriggerFullPayment'),
          severity: 'CRITICAL',
        });
      }
      if (leakage.hasCvv) {
        triggers.push({
          message: i18n.getMessage('frictionChatTriggerCvv'),
          severity: 'CRITICAL',
        });
      }
      if (leakage.hasExpiry) {
        triggers.push({
          message: i18n.getMessage('frictionChatTriggerExpiry'),
          severity: 'HIGH',
        });
      }
      if (leakage.hasOtp) {
        triggers.push({
          message: i18n.getMessage('frictionChatTriggerOtp'),
          severity: 'CRITICAL',
        });
      }
    if (vaultScan.triggers.length > 0) {
      triggers.push(...vaultScan.triggers);
    }
  }

    const isCivicDefense = leakage.hasGps || leakage.hasSabotage || triggers.some(t =>
      t.message.toLowerCase().includes('геолокац') ||
      t.message.toLowerCase().includes('диверсій') ||
      t.message.toLowerCase().includes('ппо') ||
      t.message.toLowerCase().includes('координат') ||
      t.message.toLowerCase().includes('підпал')
    );

    const modalTitle = leakage.customTitle || (isCivicDefense ? i18n.getMessage('frictionModalChatCivicTitle') : i18n.getMessage('frictionModalChatTitle'));
    const modalBadge = leakage.customBadgeText || (isCivicDefense ? i18n.getMessage('frictionModalChatCivicBadge') : i18n.getMessage('frictionModalChatBadge'));

    UnifiedFrictionModal.show({
      type: 'chat',
      title: modalTitle,
      badgeText: modalBadge,
      badgeLevel: 'CRITICAL',
      contextLabel: i18n.getMessage('frictionModalContextLabel'),
      contextValue: currentPlatform,
      triggers,
      activeContext,
      detectedAmount,
      vaultItems: vaultScan.matchedItems,
      chatLeakage: { hasCard: leakage.hasCard, hasCvv: leakage.hasCvv },
      rawTextToScan: chatInput.value || activeContext?.targetSuspiciousUrl || undefined,
      intentType: activeContext?.scenario || (isCivicDefense ? 'CIVIC_DEFENSE_COMPROMISE' : 'PAYMENT_CREDENTIAL_THEFT'),
      allowRememberDomain: false,
      onProceed: () => {
        console.log('[ThreatShield] Користувач свідомо розблокував відправку повідомлення в чаті');
        chatInput.dataset.threatShieldApproved = 'true';
        onProceed();
      },
      onCancel: () => {
        console.log('[ThreatShield] Користувач скасував відправку повідомлення в чаті');
        DebuggerOverlay.recordMitigation(
          'Відправку реквізитів у чаті заблоковано користувачем',
          95,
          'CRITICAL'
        );
        if (onCancel) onCancel();
      },
    });
  }

  /**
   * Сповіщення про зшивання сесій та підозрілий контекст (Sanctuary Dynamic Capsule)
   * Повністю ліквідовано старий Firefox Doorhanger "Active Shield" на користь невагомої капсули.
   */
  public static showContextWarningBanner(
    context: ActiveThreatContext,
    customSubtitle?: string,
    rawTextToScan?: string,
    intentType?: string,
    onClose?: () => void,
    confidence?: number,
    onClearThreat?: () => void
  ): void {
    const root = ShadowHost.getRoot();

    if (this.autoTearTimer) {
      clearTimeout(this.autoTearTimer);
      this.autoTearTimer = null;
    }
    if (this.circuitKeyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.circuitKeyHandler, true);
      this.circuitKeyHandler = null;
    }
    this.isChatFreezeActive = false;

    const existingVeil = root.getElementById('threat-shield-circuit-breaker-veil');
    if (existingVeil) {
      ShadowHost.remove(existingVeil as HTMLElement);
    }
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }

    const effectiveIntent = (intentType || context?.scenario || 'UNKNOWN').toUpperCase();
    const isSabotage = effectiveIntent === 'MILITARY_SABOTAGE_RECRUITMENT';
    const isEscrow = effectiveIntent === 'ESCROW_DELIVERY_SCAM';
    const isCredential = effectiveIntent === 'PAYMENT_CREDENTIAL_THEFT';
    const isIdentity = effectiveIntent === 'IDENTITY_PROBING';
    const isSeed = effectiveIntent === 'SEED_PHRASE_THEFT' || effectiveIntent === 'CRYPTO_WALLET_COMPROMISE';
    const isOffPlatform = effectiveIntent === 'OFF_PLATFORM_REDIRECT';
    const isVerification = effectiveIntent === 'VERIFICATION_PHISHING';
    const isSuspiciousLure = effectiveIntent === 'SUSPICIOUS_LURE';

    const isCritical = isSabotage || isSeed;

    let tag = 'Кібербезпека';
    let subtag = customSubtitle ? 'ШІ-Арбітр' : 'Соціальна інженерія';
    let title = 'С.О.В.А. · Застереження безпеки';
    let heading = 'С.О.В.А. · Підозра на шахрайство';
    let tagColor = 'var(--sanctuary-amber-ink)';
    let emblemBg = 'var(--sanctuary-amber-bg)';

    if (isSabotage) {
      tag = 'Державна безпека';
      subtag = 'Контррозвідка СБУ';
      tagColor = 'var(--sanctuary-red-ink)';
      emblemBg = 'var(--sanctuary-red-bg)';
      title = 'С.О.В.А. · Ознаки ворожого вербування або диверсії';
      heading = 'С.О.В.А. · Загроза вербування (Ознаки ворожого вербування або диверсії)';
    } else if (isEscrow) {
      tag = 'Кібербезпека';
      subtag = 'Фішинг доставки';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Застереження: фішинг доставки';
      heading = 'С.О.В.А. · Застереження: фішинг доставки';
    } else if (isCredential) {
      tag = 'Кібербезпека';
      subtag = 'Викрадення реквізитів';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Спроба викрадення платіжних даних';
      heading = 'С.О.В.А. · Спроба викрадення платіжних даних';
    } else if (isIdentity) {
      tag = 'Кібербезпека';
      subtag = 'Персональні дані';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Випитування особистих даних';
      heading = 'С.О.В.А. · Випитування особистих даних';
    } else if (isSeed) {
      tag = 'Кібербезпека';
      subtag = 'Криптозахист';
      tagColor = 'var(--sanctuary-red-ink)';
      emblemBg = 'var(--sanctuary-red-bg)';
      title = 'С.О.В.А. · Спроба викрадення криптогаманця';
      heading = 'С.О.В.А. · Спроба викрадення криптогаманця';
    } else if (isOffPlatform) {
      tag = 'Кібербезпека';
      subtag = 'Виведення в месенджер';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Перехід у сторонній месенджер';
      heading = 'С.О.В.А. · Перехід у сторонній месенджер';
    } else if (isVerification) {
      tag = 'Кібербезпека';
      subtag = 'Фейкова верифікація';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Фішинг верифікації акаунту';
      heading = 'С.О.В.А. · Фішинг верифікації акаунту';
    } else if (isSuspiciousLure) {
      tag = 'Кібербезпека';
      subtag = customSubtitle ? 'ШІ-Арбітр' : 'Соціальна інженерія';
      tagColor = 'var(--sanctuary-amber-ink)';
      title = 'С.О.В.А. · Підозра на шахрайство';
      heading = 'С.О.В.А. · Підозра на шахрайство';
    }

    const snippet = rawTextToScan && rawTextToScan.length > 3
      ? (rawTextToScan.length > 120 ? rawTextToScan.substring(0, 120) + '…' : rawTextToScan)
      : '';

    const sabotageExpandedHtml = `
      <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 10px; font-family: var(--font-sanctuary);">
        <!-- Insight Card -->
        <div style="padding: 16px; border-radius: var(--radius-card); background: var(--sanctuary-surface); border: 1px solid var(--sanctuary-hairline); box-shadow: var(--shadow-sm);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 2px; background: var(--sanctuary-red); display: inline-block;"></span>
            <span style="font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sanctuary-red-ink);">Критична загроза</span>
          </div>
          <p style="font-size: 13px; color: var(--sanctuary-ink-primary); line-height: 1.45; margin: 0 0 14px 0; font-weight: 500;">
            Ворог використовує соціальні платформи для вербування. Під виглядом швидкого заробітку вас намагаються втягнути у диверсійну діяльність. Це несе пряму загрозу національній безпеці та вашому життю.
          </p>

          <!-- Legal Shield -->
          <div style="padding: 12px 14px; border-radius: 10px; background: var(--sanctuary-green-bg); border: 1px solid var(--sanctuary-green-bd); margin-bottom: 12px; display: flex; gap: 10px;">
            <svg style="width: 16px; height: 16px; color: var(--sanctuary-green-ink); flex-shrink: 0; margin-top: 1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div style="font-weight: 600; color: var(--sanctuary-green-ink); font-size: 12px; margin-bottom: 2px;">Закон на вашому боці (ч. 3 ст. 111 ККУ)</div>
              <p style="font-size: 11.5px; color: var(--sanctuary-green-ink); line-height: 1.4; margin: 0; opacity: 0.9;">
                Добровільне повідомлення органів влади про спробу вербування повністю звільняє вас від відповідальності.
              </p>
            </div>
          </div>

          <!-- Action Protocol -->
          <div style="padding: 12px 14px; border-radius: 10px; background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline);">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sanctuary-ink-secondary); margin-bottom: 6px;">Рекомендації</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--sanctuary-ink-primary); line-height: 1.4;">
              <div style="display: flex; gap: 8px;"><span style="color: var(--sanctuary-ink-tertiary);">1.</span> <span>Не відповідайте. Ваші можливості вводу тексту заблоковані для безпеки.</span></div>
              <div style="display: flex; gap: 8px;"><span style="color: var(--sanctuary-ink-tertiary);">2.</span> <span>Передайте інформацію до офіційного бота <strong>«єВорог»</strong>.</span></div>
            </div>
          </div>
        </div>

        ${snippet ? `
          <div class="ts-capsule-snippet" style="padding: 12px 16px; border-radius: var(--radius-card); background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); border-left: 3px solid var(--sanctuary-red); font-size: 12.5px; font-style: italic; color: var(--sanctuary-ink-secondary); line-height: 1.45;">
            «${snippet}»
          </div>
        ` : ''}
      </div>
    `;

    const scamExpandedHtml = `
      <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 10px; font-family: var(--font-sanctuary);">
        <!-- Insight Card -->
        <div style="padding: 16px; border-radius: var(--radius-card); background: var(--sanctuary-surface); border: 1px solid var(--sanctuary-hairline); box-shadow: var(--shadow-sm);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 2px; background: var(--sanctuary-amber); display: inline-block;"></span>
            <span style="font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sanctuary-amber-ink);">Ознаки маніпуляції</span>
          </div>
          ${customSubtitle ? `<div style="font-size: 12px; color: var(--sanctuary-ink-secondary); margin-bottom: 8px;">Вердикт: <strong>${customSubtitle}</strong></div>` : ''}
          <p style="font-size: 13px; color: var(--sanctuary-ink-primary); line-height: 1.45; margin: 0; font-weight: 500;">
            Виявлено психологічний тиск та спробу створення штучної терміновості. Мета співрозмовника — змусити вас розкрити конфіденційні дані або перейти за небезпечним посиланням.
          </p>
        </div>

        <!-- Rules -->
        <div style="padding: 14px 16px; border-radius: var(--radius-card); background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); box-shadow: var(--shadow-sm);">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sanctuary-ink-secondary); margin-bottom: 8px;">Золоті правила безпеки</div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--sanctuary-ink-primary); line-height: 1.4;">
            <div style="display: flex; gap: 8px;"><span style="color: var(--sanctuary-amber-ink);">•</span> <span>Офіційні сервіси ніколи не запитують CVV2 або SMS-коди.</span></div>
            <div style="display: flex; gap: 8px;"><span style="color: var(--sanctuary-amber-ink);">•</span> <span>Справжні служби доставки не спілкуються в особистих чатах.</span></div>
            <div style="display: flex; gap: 8px;"><span style="color: var(--sanctuary-amber-ink);">•</span> <span>При найменших сумнівах зупиніть комунікацію.</span></div>
          </div>
        </div>

        ${snippet ? `
          <div class="ts-capsule-snippet" style="padding: 12px 16px; border-radius: var(--radius-card); background: var(--sanctuary-surface-subtle); border: 1px solid var(--sanctuary-hairline); border-left: 3px solid var(--sanctuary-amber); font-size: 12.5px; font-style: italic; color: var(--sanctuary-ink-secondary); line-height: 1.45;">
            «${snippet}»
          </div>
        ` : ''}
      </div>
    `;

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.className = `dynamic-island-anchor summoning${isSabotage ? ' single-action' : ''}`;

    banner.innerHTML = `
      <svg class="sr-only" width="0" height="0" style="position: absolute; width: 0; height: 0; pointer-events: none;">
        <defs>
          <filter id="apple-liquid-tearing-filter" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6.5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" 
              values="1 0 0 0 0  
                      0 1 0 0 0  
                      0 0 1 0 0  
                      0 0 0 25 -12" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <style>
        ${DESIGN_TOKENS_CSS}

        #threat-shield-context-banner.dynamic-island-anchor {
          --banner-width: 620px;
          --banner-height: 56px;
          --btn-size: 56px;
          --gap: 12px;
          --shrunk-pill-width: 484px;
          --spring-snap: var(--ease-apple-rebound, cubic-bezier(0.34, 1.56, 0.64, 1));
          --spring-morph: var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1));
          --ease-apple: var(--ease-apple-press, cubic-bezier(0.25, 1, 0.5, 1));

          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          width: var(--banner-width);
          max-width: calc(100vw - 32px);
          z-index: 2147483647;
          isolation: isolate;
          transition: transform 0.6s var(--spring-morph), opacity 0.5s ease;
          font-family: var(--font-sanctuary, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif);
          user-select: none;
          box-sizing: border-box;
        }

        #threat-shield-context-banner.single-action {
          --shrunk-pill-width: calc(var(--banner-width) - var(--btn-size) - var(--gap));
        }

        .liquid-glass-shell {
          background: var(--sanctuary-glass-elevated, rgba(255, 255, 255, 0.92));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
          box-shadow: var(--shadow-modal, 0 8px 24px rgba(0, 0, 0, 0.08));
        }

        .specular-rim {
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
        }

        .crisp-foreground-layer {
          position: relative;
          z-index: 20;
          width: 100%;
          isolation: isolate;
        }

        .crisp-info-pill {
          width: 100%;
          min-height: var(--banner-height);
          border-radius: var(--radius-modal, 22px);
          background: var(--sanctuary-glass-elevated, rgba(255, 255, 255, 0.92));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
          transition: width 0.65s var(--spring-snap),
                      border-radius 0.45s ease,
                      box-shadow 0.4s ease,
                      border-color 0.25s ease;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transform: translateZ(0);
          box-sizing: border-box;
        }

        .crisp-info-pill:hover {
          border-color: var(--sanctuary-hairline-subtle, rgba(0, 0, 0, 0.04));
          
        }

        .ts-action-btn {
          position: absolute;
          top: 0;
          height: var(--btn-size);
          border-radius: 16px;
          background: var(--sanctuary-glass-elevated, rgba(255, 255, 255, 0.92));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
          box-shadow: var(--shadow-knob, 0 2px 5px rgba(0, 0, 0, 0.16));
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 16px;
          opacity: 0;
          pointer-events: none;
          transform: scale(0.95) translateX(-10px);
          transition: transform 0.62s var(--spring-snap), 
                      opacity 0.28s var(--ease-apple),
                      box-shadow 0.25s ease,
                      border-color 0.25s ease;
          z-index: 10;
          text-decoration: none;
          cursor: pointer;
          box-sizing: border-box;
          outline: none;
          color: var(--sanctuary-ink-primary);
        }

        .ts-action-btn:hover {
          background: var(--sanctuary-surface, #FFFFFF);
          border-color: var(--sanctuary-hairline-subtle, rgba(0, 0, 0, 0.04));
          
        }

        #threat-shield-context-banner.is-torn .crisp-info-pill {
          width: var(--shrunk-pill-width);
        }

        #threat-shield-context-banner.is-torn .btn-action-1 {
          opacity: 1;
          pointer-events: auto;
          left: calc(var(--shrunk-pill-width) + var(--gap));
          transform: scale(1) translateX(0);
          transition-delay: 0.04s;
        }

        #threat-shield-context-banner.is-torn .btn-action-2 {
          opacity: 1;
          pointer-events: auto;
          left: calc(var(--shrunk-pill-width) + var(--gap) + 110px + var(--gap));
          transform: scale(1) translateX(0);
          transition-delay: 0.08s;
        }

        .expandable-grid {
          display: grid;
          grid-template-rows: 1fr;
          transition: grid-template-rows 0.58s var(--spring-morph);
        }

        .expandable-grid > .grid-inner {
          overflow: hidden;
        }

        .crisp-info-pill.is-expanded {
          border-radius: var(--radius-modal, 22px);
          background: var(--sanctuary-surface, #FFFFFF);
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
          
        }

        .crisp-info-pill:not(.is-expanded) .expandable-grid {
          grid-template-rows: 0fr;
        }

        .crisp-info-pill .reveal-content {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0px);
          transition: opacity 0.4s var(--ease-apple), transform 0.5s var(--spring-morph), filter 0.4s ease;
        }

        .crisp-info-pill:not(.is-expanded) .reveal-content {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
          filter: blur(4px);
        }

        .summoning {
          animation: dynamic-island-drop 0.65s var(--spring-morph) forwards;
        }

        @keyframes dynamic-island-drop {
          0% {
            transform: translateX(-50%) translateY(-40px) scale(0.92);
            opacity: 0;
            filter: blur(12px);
          }
          100% {
            transform: translateX(-50%) translateY(0) scale(1);
            opacity: 1;
            filter: blur(0px);
          }
        }

        .dismissing {
          transition: transform 0.52s cubic-bezier(0.4, 0, 0.2, 1), 
                      opacity 0.42s ease, 
                      filter 0.42s ease !important;
          transform: translateX(-50%) translateY(-36px) scale(0.92) !important;
          opacity: 0 !important;
          filter: blur(10px) !important;
          pointer-events: none !important;
        }

        .circuit-breaker-veil {
          position: fixed;
          z-index: 2147483646;
          background: var(--sanctuary-glass-elevated, rgba(255, 255, 255, 0.92));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          
          
          
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
          cursor: not-allowed;
          user-select: none;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sanctuary, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif);
          pointer-events: auto;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* Dignified instant specular glint upon refusal / click / keystroke */
        .circuit-breaker-veil.glint-active,
        .circuit-breaker-veil.shimmer-active {
          background: var(--sanctuary-surface-subtle, #FAFAFC) !important;
          border-color: var(--sanctuary-hairline, rgba(0, 0, 0, 0.07)) !important;
          animation: apple-refusal-glint 0.52s var(--ease-apple-spring, cubic-bezier(0.16, 1, 0.3, 1)) !important;
        }

        @keyframes apple-refusal-glint {
          0% { transform: translateX(0); filter: brightness(1); }
          15% { transform: translateX(-4px); filter: brightness(0.96); }
          30% { transform: translateX(4px); }
          45% { transform: translateX(-2.5px); }
          60% { transform: translateX(2.5px); }
          75% { transform: translateX(-1px); }
          100% { transform: translateX(0); filter: brightness(1); }
        }
          30% { filter: brightness(0.96); transform: scale(0.998); }
          100% { filter: brightness(1); transform: scale(1); }
        }

        /* Central indicator badge with subtle breathing seal */
        .circuit-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 16px;
          border-radius: var(--radius-pill, 9999px);
          background: var(--sanctuary-surface-subtle, #FAFAFC);
          border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.03));
          transition: transform 0.3s var(--ease-apple-press, cubic-bezier(0.25, 1, 0.5, 1)), background-color 0.3s ease, border-color 0.3s ease;
        }

        /* SOVA emblem micro-pulse on refusal */
        .circuit-badge-refusal #circuit-owl-box,
        .micro-shake #circuit-owl-box {
          animation: apple-owl-refusal 0.46s var(--ease-apple-press, cubic-bezier(0.25, 1, 0.5, 1)) both;
        }

        @keyframes apple-owl-refusal {
          0% { transform: scale(1); }
          20% { transform: scale(0.92); }
          48% { transform: scale(1.06); }
          75% { transform: scale(0.98); }
          100% { transform: scale(1); }
        }

        /* Noble Apple damped spring refusal */
        .circuit-badge-refusal,
        .micro-shake {
          animation: apple-spring-refusal 0.46s var(--ease-apple-press, cubic-bezier(0.25, 1, 0.5, 1)) both !important;
        }

        @keyframes apple-spring-refusal {
          0% { transform: scale(1) translate3d(0, 0, 0); }
          16% { transform: scale(0.968) translate3d(-7px, 0, 0); }
          34% { transform: scale(0.985) translate3d(5.5px, 0, 0); }
          54% { transform: scale(0.995) translate3d(-3px, 0, 0); }
          74% { transform: scale(0.998) translate3d(1.2px, 0, 0); }
          90% { transform: scale(1) translate3d(-0.4px, 0, 0); }
          100% { transform: scale(1) translate3d(0, 0, 0); }
        }
      </style>

      <!-- 1. BACKSTAGE VISCOUS MEMBRANE LAYER -->
      <div class="liquid-membrane-layer" aria-hidden="true">
        <div class="membrane-pill"></div>
        <div class="membrane-droplet droplet-action-1"></div>
        ${!isSabotage ? '<div class="membrane-droplet droplet-action-2"></div>' : ''}
      </div>

      <!-- 2. FOREGROUND CRISP OPTICAL STAGE -->
      <div class="crisp-foreground-layer">
        <!-- Main Pill -->
        <div id="crisp-info-pill" class="crisp-info-pill liquid-glass-shell" role="alert" tabindex="0" aria-expanded="false" style="display: flex; flex-direction: column;">
          <!-- 56px Header Bar -->
          <div id="ts-pill-header" style="height: var(--banner-height, 56px); padding: 0 14px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; cursor: pointer;">
            <div style="display: flex; align-items: center; min-width: 0; flex: 1; margin-right: 8px; pointer-events: none;">
              <!-- Emblem -->
              <div id="banner-emblem" style="width: 36px; height: 36px; border-radius: 8px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative; margin-right: 12px; background: var(--sanctuary-surface, #FFFFFF); border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.12)); box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));">
                <img class="ts-sova-logo-img" src="${getSovaLogoUrl()}" alt="С.О.В.А." style="width: 100%; height: 100%; object-fit: cover; display: block;" />
              </div>

              <!-- Narrative typography -->
              <div style="min-width: 0; flex: 1; padding-right: 4px;">
                <div style="display: flex; align-items: center; gap: 6px; line-height: 1;">
                  <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${tagColor};">${tag}</span>
                  <span style="color: var(--sanctuary-hairline-glass, #D1D5DB); font-size: 10px;">•</span>
                  <span style="font-size: 10px; color: var(--sanctuary-ink-tertiary, #86868B); font-weight: 500;">${subtag}</span>
                </div>
                <h2 style="font-size: 13.5px; font-weight: 600; color: var(--sanctuary-ink-primary, #1D1D1F); letter-spacing: -0.015em; line-height: 1.3; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0;">
                  ${heading}
                </h2>
              </div>
            </div>

            <!-- Minimalist Circular Chevron Micro-Button (Apple Liquid Glass Chevron) -->
            <div style="display: flex; align-items: center; flex-shrink: 0; padding-left: 4px;">
              <button id="ts-capsule-toggle" class="ts-btn-capsule-toggle" aria-label="Згорнути або розгорнути деталі" style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--sanctuary-surface-subtle, rgba(0, 0, 0, 0.04)); border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.08)); transition: all 0.2s var(--ease-apple-spring); cursor: pointer; padding: 0; outline: none;">
                <svg id="chevron-indicator" style="width: 14px; height: 14px; color: var(--sanctuary-ink-secondary, #6E6E73); transition: transform 0.5s var(--ease-apple-spring); transform: rotate(0deg);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Organic Accordion Drawer -->
          <div id="ts-capsule-drawer" class="expandable-grid" style="display: none;">
            <div class="grid-inner">
              <div id="banner-expanded-content" class="reveal-content" style="padding: 4px 20px 20px 20px; border-top: 1px solid rgba(0, 0, 0, 0.06); color: #374151;">
                ${isSabotage ? sabotageExpandedHtml : scamExpandedHtml}
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        ${isSabotage ? `
          <a id="ts-btn-evorog" href="https://t.me/evorog_bot" target="_blank" rel="noopener noreferrer" class="ts-action-btn btn-action-1" style="width: 110px;" title="Повідомити в офіційний чат-бот оборони України «єВорог»">
            <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
            </svg>
            <span style="font-size: 11px; font-weight: 600; letter-spacing: -0.01em;">єВорог</span>
          </a>
        ` : (isCritical ? `
          <button id="ts-btn-ack" class="ts-action-btn btn-action-1" style="width: 110px; color: var(--sanctuary-amber-ink);" title="Зрозуміло">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span style="font-size: 11px; font-weight: 600; letter-spacing: -0.01em;">Зрозуміло</span>
          </button>

          <button id="ts-btn-unblock" class="ts-action-btn btn-action-2" style="width: 110px;" title="Розблокувати ввід та зняти сповіщення">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span style="font-size: 11px; font-weight: 600; letter-spacing: -0.01em;">Зняти</span>
          </button>
        ` : `
          <button id="ts-btn-ack" class="ts-action-btn btn-action-1" style="width: 110px; color: var(--sanctuary-amber-ink);" title="Зрозуміло">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span style="font-size: 11px; font-weight: 600; letter-spacing: -0.01em;">Зрозуміло</span>
          </button>

          <button id="ts-capsule-close" class="ts-action-btn btn-action-2" style="width: 110px;" title="Закрити сповіщення">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span style="font-size: 11px; font-weight: 600; letter-spacing: -0.01em;">Закрити</span>
          </button>
        `)}
      </div>
    `;

    const pill = banner.querySelector('#crisp-info-pill') as HTMLElement;
    const headerBar = banner.querySelector('#ts-pill-header') as HTMLElement;
    const drawer = banner.querySelector('#ts-capsule-drawer') as HTMLElement;
    const toggleBtn = banner.querySelector('#ts-capsule-toggle') as HTMLElement;
    const chevron = banner.querySelector('#chevron-indicator') as HTMLElement;
    const closeBtn = banner.querySelector('#ts-capsule-close') as HTMLElement;
    const ackBtn = banner.querySelector('#ts-btn-ack') as HTMLElement;
    const evorogBtn = banner.querySelector('#ts-btn-evorog') as HTMLElement;
    const unblockBtn = banner.querySelector('#ts-btn-unblock') as HTMLElement;

    let isTorn = false;
    let isExpanded = false;

    const triggerTear = () => {
      if (isTorn) return;
      isTorn = true;
      banner.classList.add('is-torn');
      if (SecurityFriction.autoTearTimer) {
        clearTimeout(SecurityFriction.autoTearTimer);
        SecurityFriction.autoTearTimer = null;
      }
    };

    SecurityFriction.autoTearTimer = setTimeout(() => {
      triggerTear();
    }, 2000);

    banner.addEventListener('mouseenter', triggerTear);
    banner.addEventListener('touchstart', triggerTear, { passive: true });

    const toggleAccordion = (e?: Event) => {
      if (e) e.stopPropagation();
      triggerTear();
      isExpanded = !isExpanded;
      if (drawer) {
        drawer.style.display = isExpanded ? 'flex' : 'none';
      }
      if (pill) {
        pill.classList.toggle('is-expanded', isExpanded);
        pill.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      }
      if (chevron) {
        chevron.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleAccordion);
    }
    if (headerBar) {
      headerBar.addEventListener('click', (e) => {
        if (e.target !== toggleBtn && !toggleBtn.contains(e.target as Node)) {
          toggleAccordion();
        }
      });
    }

    const dismissCapsule = (shouldClearThreat: boolean = false) => {
      if (SecurityFriction.autoTearTimer) {
        clearTimeout(SecurityFriction.autoTearTimer);
        SecurityFriction.autoTearTimer = null;
      }
      if (SecurityFriction.circuitKeyHandler && typeof window !== 'undefined') {
        window.removeEventListener('keydown', SecurityFriction.circuitKeyHandler, true);
        SecurityFriction.circuitKeyHandler = null;
      }
      if (SecurityFriction.veilResizeHandler && typeof window !== 'undefined') {
        window.removeEventListener('resize', SecurityFriction.veilResizeHandler);
        window.removeEventListener('scroll', SecurityFriction.veilResizeHandler);
        SecurityFriction.veilResizeHandler = null;
      }
      SecurityFriction.isChatFreezeActive = false;
      const activeVeil = root.getElementById('threat-shield-circuit-breaker-veil');
      if (activeVeil) {
        ShadowHost.remove(activeVeil as HTMLElement);
      }
      ShadowHost.remove(banner);
      if (typeof document !== 'undefined') {
        document.querySelectorAll<HTMLElement>('[data-ts-ambient-amber="true"]').forEach((el) => {
          el.removeAttribute('data-ts-ambient-amber');
          el.style.boxShadow = '';
          el.style.borderColor = '';
        });
      }
      if (onClose) onClose();
      if (shouldClearThreat && !isCritical && onClearThreat) {
        onClearThreat();
      }
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Просто закриття банера (✕) - приховуємо інтерфейс, але НЕ скидаємо рівень загрози
        dismissCapsule(false);
      });
    }

    if (ackBtn) {
      ackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Користувач ознайомився («Зрозуміло») - підтверджує перегляд застереження
        dismissCapsule(true);
      });
    }

    if (evorogBtn) {
      evorogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open('https://t.me/evorog_bot', '_blank');
      });
    }

    if (unblockBtn) {
      unblockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (SecurityFriction.circuitKeyHandler && typeof window !== 'undefined') {
          window.removeEventListener('keydown', SecurityFriction.circuitKeyHandler, true);
          SecurityFriction.circuitKeyHandler = null;
        }
        if (SecurityFriction.veilResizeHandler && typeof window !== 'undefined') {
          window.removeEventListener('resize', SecurityFriction.veilResizeHandler);
          window.removeEventListener('scroll', SecurityFriction.veilResizeHandler);
          SecurityFriction.veilResizeHandler = null;
        }
        SecurityFriction.isChatFreezeActive = false;
        const activeVeil = root.getElementById('threat-shield-circuit-breaker-veil');
        if (activeVeil) {
          ShadowHost.remove(activeVeil as HTMLElement);
        }
        ShadowHost.remove(banner);
        if (typeof document !== 'undefined') {
          document.querySelectorAll<HTMLElement>('[data-ts-ambient-amber="true"]').forEach((el) => {
            el.removeAttribute('data-ts-ambient-amber');
            el.style.boxShadow = '';
            el.style.borderColor = '';
          });
        }
        if (onClearThreat) onClearThreat();
        if (typeof window !== 'undefined') {
          window.postMessage({ type: 'THREAT_SHIELD_DISABLE_CHAT_FREEZE' }, '*');
        }
      });
    }

    root.appendChild(banner);

    // CIRCUIT BREAKER KEYBOARD INTERCEPTION
    if (isCritical) {
      const veil = document.createElement('div');
      veil.id = 'threat-shield-circuit-breaker-veil';
      veil.className = 'circuit-breaker-veil';
      veil.innerHTML = `
        <div id="circuit-badge" class="circuit-badge">
          <div id="circuit-owl-box" style="width: 22px; height: 22px; border-radius: 5px; overflow: hidden; background: var(--sanctuary-surface, #FFFFFF); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.12)); transition: transform 0.25s var(--ease-apple-press, cubic-bezier(0.25, 1, 0.5, 1));">
            <img class="ts-sova-logo-img" src="${getSovaLogoUrl()}" alt="С.О.В.А." style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          </div>
          <div style="text-align: left;">
            <p style="font-size: 11.5px; font-weight: 600; color: var(--sanctuary-ink-primary, #1D1D1F); margin: 0; line-height: 1.25;">Поле захищено · Ввід заблоковано С.О.В.А.</p>
            <p id="circuit-hint-text" style="font-size: 10px; color: var(--sanctuary-ink-secondary, #6E6E73); margin: 0; line-height: 1.25; transition: color 0.3s var(--ease-apple-press), transform 0.25s var(--ease-apple-press), font-weight 0.2s ease;">Enter / Ctrl+C / копіювання вимкнено для безпеки</p>
          </div>
        </div>
      `;
      root.appendChild(veil);
      SecurityFriction.positionVeilElement(veil);

      SecurityFriction.isChatFreezeActive = true;

      SecurityFriction.veilResizeHandler = () => {
        const activeVeil = root.getElementById('threat-shield-circuit-breaker-veil');
        if (activeVeil) {
          SecurityFriction.positionVeilElement(activeVeil as HTMLElement);
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', SecurityFriction.veilResizeHandler);
        window.addEventListener('scroll', SecurityFriction.veilResizeHandler, { passive: true });
      }

      const flashCircuitInterception = () => {
        const activeVeil = root.getElementById('threat-shield-circuit-breaker-veil');
        const badge = root.getElementById('circuit-badge');
        const hint = root.getElementById('circuit-hint-text');
        if (activeVeil) {
          activeVeil.classList.remove('glint-active', 'shimmer-active');
          void activeVeil.offsetWidth;
          activeVeil.classList.add('glint-active');
        }
        if (badge) {
          badge.classList.remove('circuit-badge-refusal', 'micro-shake');
          void badge.offsetWidth;
          badge.classList.add('circuit-badge-refusal');
        }
        if (hint) {
          hint.textContent = isSabotage
            ? 'Дію відхилено · Ввід повідомлень заблоковано С.О.В.А.'
            : 'Дію відхилено · Ввід заблоковано системою С.О.В.А.';
          hint.style.color = '#991B1B';
          hint.style.fontWeight = '600';
          setTimeout(() => {
            if (hint) {
              hint.textContent = 'Enter / Ctrl+C / копіювання вимкнено для безпеки';
              hint.style.color = '#6B7280';
              hint.style.fontWeight = 'normal';
            }
          }, 2400);
        }
      };

      veil.addEventListener('click', flashCircuitInterception);

      SecurityFriction.circuitKeyHandler = (e: KeyboardEvent) => {
        if (!SecurityFriction.isChatFreezeActive) return;
        const target = e.target as HTMLElement | null;
        if (target && typeof target.closest === 'function' && (target.closest('#threat-shield-context-banner') || target.closest('threat-shield-host'))) {
          return;
        }
        if (
          e.key === 'Enter' ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) ||
          (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          flashCircuitInterception();
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', SecurityFriction.circuitKeyHandler, true);
        window.postMessage({ type: 'THREAT_SHIELD_ENABLE_CHAT_FREEZE' }, '*');
      }
    }
  }

  /**
   * Очищення банера контексту
   */
  public static removeContextWarningBanner(): void {
    const root = ShadowHost.getRoot();
    if (this.autoTearTimer) {
      clearTimeout(this.autoTearTimer);
      this.autoTearTimer = null;
    }
    if (this.circuitKeyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.circuitKeyHandler, true);
      this.circuitKeyHandler = null;
    }
    if (this.veilResizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.veilResizeHandler);
      window.removeEventListener('scroll', this.veilResizeHandler);
      this.veilResizeHandler = null;
    }
    this.isChatFreezeActive = false;

    const veil = root.getElementById('threat-shield-circuit-breaker-veil');
    if (veil) {
      ShadowHost.remove(veil as HTMLElement);
    }
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll<HTMLElement>('[data-ts-ambient-amber="true"]').forEach((el) => {
        el.removeAttribute('data-ts-ambient-amber');
        el.style.boxShadow = '';
        el.style.borderColor = '';
      });
    }
    if (typeof window !== 'undefined') {
      window.postMessage({ type: 'THREAT_SHIELD_DISABLE_CHAT_FREEZE' }, '*');
    }
  }

  public static showHiddenFieldTrapBanner(scan: HiddenFieldScanResult, form?: HTMLFormElement): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-hidden-field-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
    // Також прибираємо старі X-Ray бейджі, якщо залишилися
    root.querySelectorAll('.ts-xray-badge').forEach((b) => b.remove());

    // Прибираємо загальний банер сесії, якщо він був відкритий
    const contextBanner = root.getElementById('threat-shield-context-banner');
    if (contextBanner) {
      ShadowHost.remove(contextBanner as HTMLElement);
    }

    // Знімаємо попередню ауру форми, якщо була активна
    SecurityFriction.restoreDisarmedFormStyle();

    // Шляхетна сапфірово-смарагдова аура спокою на нейтралізовану форму замість агресивного червоного пунктиру
    if (form) {
      SecurityFriction.activeDisarmedForm = {
        form,
        originalBoxShadow: form.style.boxShadow,
        originalTransition: form.style.transition,
      };
      form.style.transition = 'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      form.style.boxShadow = '0 0 0 2px rgba(0, 113, 227, 0.35), 0 8px 24px rgba(0, 113, 227, 0.08)';
    }

    // Зв'язок із Personal Vault: шукаємо збіги реквізитів зі сховища
    let vaultProvenanceLabels: string[] = [];
    try {
      if (form) {
        const vaultRes = VaultScanner.scanFormSync(form);
        if (vaultRes.matches.length > 0) {
          vaultProvenanceLabels = Array.from(new Set(vaultRes.matches.map((m) => m.matchedItem.label)));
        }
      }
      if (vaultProvenanceLabels.length === 0) {
        const allVaultItems = PersonalVaultManager.getItemsSync();
        for (const type of scan.flaggedTypes) {
          if (type === 'CARD_NUMBER') {
            const hasCard = allVaultItems.some((i) => i.category === 'CUSTOM' || i.label.toLowerCase().includes('картк') || i.label.toLowerCase().includes('card'));
            if (hasCard) vaultProvenanceLabels.push(i18n.getMessage('modalTitleCardNumber'));
          } else if (type === 'CVV') {
            vaultProvenanceLabels.push(i18n.getMessage('modalTitleCvv'));
          } else if (type === 'PASSWORD' || type === 'PIN') {
            const hasSecret = allVaultItems.some((i) => i.category === 'SECRET_WORD');
            if (hasSecret) vaultProvenanceLabels.push(i18n.getMessage('fieldPillPersonalSecret'));
          }
        }
      }
    } catch {}

    const hasVaultProvenance = vaultProvenanceLabels.length > 0;
    const count = scan.flaggedInputs.length;
    const countLabel = count === 1 ? i18n.getMessage('frictionFieldCountOne') : i18n.getMessage('frictionFieldCountMany', [String(count)]);

    const sensitiveFieldLabels: Record<string, string> = {
      CARD_NUMBER: i18n.getMessage('modalTitleCardNumber'),
      CVV: i18n.getMessage('modalTitleCvv'),
      CARD_EXPIRY: i18n.getMessage('fieldPillExpiryLabel'),
      PASSWORD: i18n.getMessage('frictionFieldPassword'),
      PIN: i18n.getMessage('frictionFieldPin'),
      OTHER_SENSITIVE: i18n.getMessage('frictionFieldOther'),
    };

    const formatCloakingTechnique = (reason: string): string => {
      const r = (reason || '').toLowerCase();
      if (r.includes('opacity')) return i18n.getMessage('frictionCloakOpacity');
      if (r.includes('clip')) return i18n.getMessage('frictionCloakClip');
      if (r.includes('1px') || r.includes('dimension') || r.includes('size')) return i18n.getMessage('frictionCloakMicro');
      if (r.includes('offscreen') || r.includes('left') || r.includes('top') || r.includes('position')) {
        return i18n.getMessage('frictionCloakOffscreen');
      }
      if (r.includes('transform') || r.includes('scale')) return i18n.getMessage('frictionCloakScale');
      if (r.includes('visibility') || r.includes('hidden')) return i18n.getMessage('frictionCloakVisibility');
      return i18n.getMessage('frictionCloakHidden');
    };

    const detectedTypesSummary = scan.flaggedTypes
      .map((t) => sensitiveFieldLabels[t] || t)
      .join(', ');

    const vaultSubtitle = hasVaultProvenance
      ? i18n.getMessage('frictionTrapDescVault', [vaultProvenanceLabels.join(', ')])
      : i18n.getMessage('frictionTrapDescGeneric');

    const humanNarrative = hasVaultProvenance
      ? i18n.getMessage('frictionTrapBodyVault', [`<strong style="color: var(--sanctuary-ink-primary, #1D1D1F); font-weight: 600;">${vaultProvenanceLabels.join(', ')}</strong>`])
      : i18n.getMessage('frictionTrapBodyGeneric', [`<strong style="color: var(--sanctuary-ink-primary, #1D1D1F); font-weight: 600;">${detectedTypesSummary}</strong>`]);

    const banner = document.createElement('div');
    banner.id = 'threat-shield-hidden-field-banner';
    banner.style.cssText = `
      position: fixed !important;
      top: 16px !important;
      right: 20px !important;
      width: 400px !important;
      max-width: calc(100vw - 32px) !important;
      background: rgba(255, 255, 255, 0.92) !important;
      backdrop-filter: blur(28px) saturate(190%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(190%) !important;
      border-radius: 18px !important;
      border: 1px solid rgba(255, 255, 255, 0.90) !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.03), 0 0 0 1px rgba(0, 0, 0, 0.05) !important;
      padding: 16px 18px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      color: #1D1D1F !important;
      transform-origin: calc(100% - 24px) 0px !important;
      animation: capsuleEntrance 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      pointer-events: auto !important;
      box-sizing: border-box !important;
    `;

    const fieldsDetailsHtml = scan.flaggedInputs
      .map((input, idx, arr) => {
        const label = sensitiveFieldLabels[input.fieldType] || input.fieldType;
        const technique = formatCloakingTechnique(input.cloakingReason);
        const isLast = idx === arr.length - 1;

        return `
          <div class="ts-telemetry-row" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 9px 12px;
            ${isLast ? '' : 'border-bottom: 0.5px solid rgba(0, 0, 0, 0.05);'}
            transition: background 0.12s;
          ">
            <!-- Left: Human Identifier & Technique -->
            <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1;">
              <div style="font-size: 11.5px; font-weight: 600; color: #1D1D1F; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${label}
              </div>
              <div style="font-size: 10.5px; color: #6E6E73; display: flex; align-items: center; gap: 4px;">
                <span>${technique}</span>
              </div>
            </div>

            <!-- Right: Status Capsule -->
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0;">
              <div style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                font-weight: 600;
                color: #1E7E34;
                background: rgba(52, 199, 89, 0.12);
                border: 1px solid rgba(52, 199, 89, 0.25);
                padding: 2px 7px;
                border-radius: 9999px;
              ">
                <span style="width: 4px; height: 4px; border-radius: 50%; background: #34C759; display: inline-block;"></span>
                <span>${i18n.getMessage('frictionTrapNeutralizedBadge')}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    banner.innerHTML = `
      <style>
        ${DESIGN_TOKENS_CSS}

        @keyframes capsuleEntrance {
          0%   { opacity: 0; transform: translateY(-16px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes capsuleExit {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-12px) scale(0.96); }
        }
        details.ts-disarm-accordion summary::-webkit-details-marker { display: none; }
        details.ts-disarm-accordion summary { list-style: none; }
        details.ts-disarm-accordion summary:hover {
          background: rgba(0, 0, 0, 0.025);
        }
        details.ts-disarm-accordion[open] .ts-chevron {
          transform: rotate(90deg);
          color: #0071E3 !important;
        }
        .ts-telemetry-row:hover {
          background: rgba(0, 0, 0, 0.015);
        }
        .ts-telemetry-list::-webkit-scrollbar {
          width: 4px;
        }
        .ts-telemetry-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .ts-telemetry-list::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.14);
          border-radius: 9999px;
        }
        #threat-shield-close-trap-banner:hover {
          color: var(--sanctuary-ink-primary, #1D1D1F) !important;
          background: var(--sanctuary-surface-hover, rgba(0, 0, 0, 0.05)) !important;
        }
        #threat-shield-close-trap-banner:active {
          transform: scale(0.92) !important;
        }
        #ts-highlight-form-btn:hover {
          background: var(--sanctuary-surface-hover, rgba(0, 0, 0, 0.04)) !important;
        }
        #ts-highlight-form-btn:active {
          transform: scale(0.98) !important;
        }
        #ts-dismiss-trap-banner-btn:hover {
          background: var(--sanctuary-blue-hover, #0077ED) !important;
        }
        #ts-dismiss-trap-banner-btn:active {
          transform: scale(0.98) !important;
        }
      </style>

      <!-- Header Row -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <!-- Swiss Loupe Brand Icon -->
          <div style="
            width: 32px; height: 32px; border-radius: 9px;
            background: var(--sanctuary-blue-bg, rgba(0, 113, 227, 0.08));
            border: 1px solid var(--sanctuary-blue-bd, rgba(0, 113, 227, 0.20));
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2.2">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="5" stroke-opacity="0.6"/>
              <line x1="12" y1="2" x2="12" y2="4.5"/>
              <line x1="12" y1="19.5" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="4.5" y2="12"/>
              <line x1="19.5" y1="12" x2="22" y2="12"/>
              <circle cx="12" cy="12" r="1.8" fill="#1E7E34"/>
            </svg>
          </div>
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <div style="font-size: 13.5px; font-weight: 600; color: var(--sanctuary-ink-primary, #1D1D1F); letter-spacing: -0.015em; line-height: 1.2;">
              ${i18n.getMessage('frictionTrapNeutralizedTitle')}
            </div>
            <div style="font-size: 11px; color: var(--sanctuary-ink-secondary, #6E6E73); line-height: 1.2; margin-top: 2px;">
              ${vaultSubtitle}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span style="
            font-size: 10.5px; font-weight: 600;
            background: var(--sanctuary-green-bg, rgba(52, 199, 89, 0.12));
            color: var(--sanctuary-green-ink, #1E7E34);
            border: 1px solid var(--sanctuary-green-bd, rgba(52, 199, 89, 0.25));
            padding: 3px 8px; border-radius: 9999px;
            letter-spacing: -0.01em; display: inline-flex; align-items: center; gap: 4px;
          ">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #34C759; display: inline-block;"></span>
            ${i18n.getMessage('frictionTrapProtectedLabel', [countLabel])}
          </span>

          <button id="threat-shield-close-trap-banner" type="button" title="${i18n.getMessage('frictionTrapBtnClose')}" style="
            width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.07));
            background: var(--sanctuary-surface-subtle, #FAFAFC); color: var(--sanctuary-ink-tertiary, #8E8E93); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            padding: 0; flex-shrink: 0; transition: all 0.15s cubic-bezier(0.25, 1, 0.5, 1);
          ">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Human Narrative -->
      <p style="font-size: 12px; color: var(--sanctuary-ink-secondary, #6E6E73); margin: 0; line-height: 1.45;">
        ${humanNarrative}
      </p>

      <!-- Precision Cloaking Inspector (Inset Grouped Slab) -->
      <details class="ts-disarm-accordion" style="
        background: rgba(0, 0, 0, 0.025);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        overflow: hidden;
        font-size: 11.5px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      ">
        <summary style="
          padding: 9px 12px; font-weight: 500; color: #1D1D1F;
          cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;
          transition: background 0.15s cubic-bezier(0.25, 1, 0.5, 1);
        ">
          <span style="display: flex; align-items: center; gap: 7px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="5" stroke-opacity="0.6"/>
              <line x1="12" y1="2" x2="12" y2="4.5"/>
              <line x1="12" y1="19.5" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="4.5" y2="12"/>
              <line x1="19.5" y1="12" x2="22" y2="12"/>
              <circle cx="12" cy="12" r="1.8" fill="#0071E3"/>
            </svg>
            <span style="font-size: 12px; font-weight: 600; letter-spacing: -0.01em;">${i18n.getMessage('frictionTrapTechAnalysis', [String(count)])}</span>
          </span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="
              font-family: var(--font-mono, 'SF Mono', Menlo, monospace);
              font-size: 9px;
              font-weight: 600;
              color: #6E6E73;
              letter-spacing: 0.04em;
              background: rgba(0, 0, 0, 0.04);
              padding: 2px 6px;
              border-radius: 4px;
            ">${i18n.getMessage('frictionTrapOpticalAudit')}</span>
            <svg class="ts-chevron" width="7" height="10" viewBox="0 0 8 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #6E6E73; transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
              <path d="M1.5 1.5L6 6L1.5 10.5"/>
            </svg>
          </div>
        </summary>
        <div class="ts-telemetry-list" style="
          border-top: 0.5px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.70);
          display: flex;
          flex-direction: column;
          max-height: 180px;
          overflow-y: auto;
        ">
          ${fieldsDetailsHtml}
        </div>
      </details>

      <!-- Action Buttons Row -->
      <div style="display: flex; gap: 8px; margin-top: 2px;">
        ${
          form
            ? `
          <button id="ts-highlight-form-btn" type="button" style="
            flex: 1; background: var(--sanctuary-surface-subtle, #FAFAFC);
            border: 1px solid var(--sanctuary-hairline, rgba(0, 0, 0, 0.08));
            border-radius: 10px; padding: 8px 12px; font-size: 11.5px; font-weight: 500;
            color: var(--sanctuary-ink-primary, #1D1D1F); cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            transition: all 0.15s cubic-bezier(0.25, 1, 0.5, 1);
          ">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            ${i18n.getMessage('frictionTrapBtnHighlight')}
          </button>
        `
            : ''
        }
        <button id="ts-dismiss-trap-banner-btn" type="button" style="
          flex: 1; background: var(--sanctuary-blue, #0071E3);
          color: #FFFFFF; border: none; border-radius: 10px;
          padding: 8px 14px; font-size: 11.5px; font-weight: 600; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          transition: all 0.15s cubic-bezier(0.25, 1, 0.5, 1);
          box-shadow: 0 1px 2px rgba(0, 113, 227, 0.25);
        ">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          ${i18n.getMessage('frictionTrapBtnOk')}
        </button>
      </div>
      ${
        form
          ? `
        <div style="display: flex; justify-content: center; margin-top: 2px;">
          <button id="ts-unblock-trap-form-btn" type="button" style="
            background: none; border: none; font-size: 11px; color: #6E6E73;
            cursor: pointer; padding: 3px 8px; font-family: inherit;
            display: inline-flex; align-items: center; gap: 4px;
            transition: color 0.15s;
          ">
            <span>${i18n.getMessage('frictionTrapBtnTrustDomain')}</span>
          </button>
        </div>
      `
          : ''
      }
    `;

    ShadowHost.append(banner);

    const foldAndRemove = () => {
      SecurityFriction.restoreDisarmedFormStyle();
      root.querySelectorAll('.ts-xray-badge').forEach((b) => b.remove());
      banner.style.animation = 'capsuleExit 0.22s cubic-bezier(0.25, 1, 0.5, 1) forwards';
      setTimeout(() => {
        ShadowHost.remove(banner);
      }, 210);
    };

    const closeBtn = banner.querySelector('#threat-shield-close-trap-banner') as HTMLButtonElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        foldAndRemove();
      });
    }

    const highlightBtn = banner.querySelector('#ts-highlight-form-btn') as HTMLButtonElement | null;
    if (highlightBtn && form) {
      highlightBtn.addEventListener('click', () => {
        const REVEAL_DURATION_MS = 4000;

        // Плавний фокус на формі без руйнування стилів
        if (typeof form.scrollIntoView === 'function') {
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Сапфіровий рентген-ореол навколо форми (БЕЗ здирання класів чи інлайн-стилів!)
        const prevBoxShadow = form.style.boxShadow;
        const prevTransition = form.style.transition;
        form.style.transition = 'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        form.style.boxShadow = '0 0 0 3px rgba(0, 113, 227, 0.65), 0 12px 36px rgba(0, 113, 227, 0.20)';

        // Створюємо оптичні неруйнівні X-Ray мікро-капсули (Swiss Caliper) та рентген-рамки
        const xrayBadges: HTMLElement[] = [];
        let formRect = { top: 0, left: 0, width: 300, height: 100, bottom: 100 };
        try {
          if (typeof form.getBoundingClientRect === 'function') {
            formRect = form.getBoundingClientRect();
          }
        } catch {}

        const compactFieldTags: Record<string, string> = {
          CARD_NUMBER: i18n.getMessage('frictionTagCard'),
          CVV: 'CVV / CVC',
          CARD_EXPIRY: 'MM / YY',
          PASSWORD: i18n.getMessage('frictionTagPassword'),
          PIN: 'PIN',
          OTHER_SENSITIVE: i18n.getMessage('frictionTagOther'),
        };

        const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
        const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;

        const placedPills: { left: number; top: number; right: number; bottom: number }[] = [];
        let offscreenIdx = 0;

        scan.flaggedInputs.forEach((flaggedInput, idx) => {
          const el = flaggedInput.element as HTMLElement;
          let rect = { top: 0, left: 0, width: 0, height: 0, bottom: 0 };
          try {
            if (typeof el.getBoundingClientRect === 'function') {
              rect = el.getBoundingClientRect();
            }
          } catch {}

          const fullLabel = sensitiveFieldLabels[flaggedInput.fieldType] || flaggedInput.fieldType;
          const compactTag = compactFieldTags[flaggedInput.fieldType] || flaggedInput.fieldType;
          const technique = formatCloakingTechnique(flaggedInput.cloakingReason);

          const isOffscreenOrTiny = rect.left < 0 || rect.top < 0 || rect.width <= 2 || rect.height <= 2;

          let pillTop = 0;
          let pillLeft = 0;

          if (isOffscreenOrTiny) {
            // Винесені або нульові поля шикуємо у витончений вертикальний каскад збоку форми
            pillTop = scrollY + formRect.top + 8 + (offscreenIdx * 28);
            pillLeft = scrollX + formRect.left + 12;
            offscreenIdx++;
          } else {
            // Відображаємо напівпрозору сапфірову рентген-рамку (Phantom Frame) навколо видимих меж інпута
            const frame = document.createElement('div');
            frame.className = 'ts-xray-badge ts-xray-frame';
            frame.style.cssText = `
              position: absolute !important;
              top: ${scrollY + rect.top}px !important;
              left: ${scrollX + rect.left}px !important;
              width: ${Math.max(rect.width, 24)}px !important;
              height: ${Math.max(rect.height, 22)}px !important;
              border: 1.5px dashed rgba(0, 113, 227, 0.85) !important;
              background: rgba(0, 113, 227, 0.07) !important;
              border-radius: 6px !important;
              box-sizing: border-box !important;
              pointer-events: none !important;
              z-index: 2147483645 !important;
            `;
            root.appendChild(frame);
            xrayBadges.push(frame);

            // Базова позиція мікро-капсули: над інпутом
            pillTop = scrollY + rect.top - 23;
            pillLeft = scrollX + rect.left;

            if (pillTop < scrollY + 4) {
              pillTop = scrollY + rect.bottom + 4;
            }

            // Розумна анти-колізія: якщо сусідній бейдж перекриває цей, застосовуємо шахове зміщення
            const isColliding = (t: number, l: number) => {
              const r = l + 72;
              const b = t + 22;
              return placedPills.some((p) => !(r < p.left || l > p.right || b < p.top || t > p.bottom));
            };

            if (isColliding(pillTop, pillLeft)) {
              const bottomCandidate = scrollY + rect.bottom + 4;
              if (!isColliding(bottomCandidate, pillLeft)) {
                pillTop = bottomCandidate;
              } else {
                pillTop = scrollY + rect.top - 23 - (((idx % 2) + 1) * 24);
                pillLeft = scrollX + rect.left + ((idx % 3) * 12);
              }
            }

            placedPills.push({
              left: pillLeft,
              top: pillTop,
              right: pillLeft + 72,
              bottom: pillTop + 22,
            });
          }

          const badge = document.createElement('div');
          badge.className = 'ts-xray-badge';
          badge.title = i18n.getMessage('frictionXrayBadgeTitle', [fullLabel, technique]);
          badge.style.cssText = `
            position: absolute !important;
            top: ${pillTop}px !important;
            left: ${pillLeft}px !important;
            z-index: 2147483646 !important;
            background: rgba(0, 113, 227, 0.94) !important;
            backdrop-filter: blur(16px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
            color: #FFFFFF !important;
            padding: 3px 8px !important;
            border-radius: 7px !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
            box-shadow: 0 4px 12px rgba(0, 113, 227, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.25) !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            pointer-events: auto !important;
            cursor: help !important;
            white-space: nowrap !important;
            line-height: 1.2 !important;
            box-sizing: border-box !important;
            transform-origin: center !important;
            transition: transform 0.15s ease, box-shadow 0.15s ease !important;
          `;
          badge.innerHTML = `
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>${compactTag}</span>
            <span class="ts-xray-details" style="display: none;">${i18n.getMessage('frictionXrayBlocked', [fullLabel])}</span>
          `;

          badge.addEventListener('mouseenter', () => {
            badge.style.transform = 'scale(1.06)';
            badge.style.boxShadow = '0 6px 16px rgba(0, 113, 227, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.4)';
          });
          badge.addEventListener('mouseleave', () => {
            badge.style.transform = 'scale(1)';
            badge.style.boxShadow = '0 4px 12px rgba(0, 113, 227, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.25)';
          });

          root.appendChild(badge);
          xrayBadges.push(badge);
        });

        highlightBtn.textContent = i18n.getMessage('frictionTrapBtnHighlighted');
        highlightBtn.style.background = 'var(--sanctuary-blue-bg, rgba(0, 113, 227, 0.08))';
        highlightBtn.style.color = 'var(--sanctuary-blue, #0071E3)';
        highlightBtn.style.borderColor = 'var(--sanctuary-blue-bd, rgba(0, 113, 227, 0.20))';
        highlightBtn.disabled = true;

        setTimeout(() => {
          if (SecurityFriction.activeDisarmedForm?.form === form) {
            form.style.boxShadow = prevBoxShadow;
            form.style.transition = prevTransition;
          }

          xrayBadges.forEach((b) => {
            if (b.parentNode) b.parentNode.removeChild(b);
          });

          highlightBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            ${i18n.getMessage('frictionTrapBtnHighlight')}
          `;
          highlightBtn.style.background = 'var(--sanctuary-surface-subtle, #FAFAFC)';
          highlightBtn.style.color = 'var(--sanctuary-ink-primary, #1D1D1F)';
          highlightBtn.style.borderColor = 'var(--sanctuary-hairline, rgba(0, 0, 0, 0.08))';
          highlightBtn.disabled = false;
        }, REVEAL_DURATION_MS);
      });
    }

    const dismissBtn = banner.querySelector('#ts-dismiss-trap-banner-btn') as HTMLButtonElement | null;
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        foldAndRemove();
      });
    }

    const unblockBtn = banner.querySelector('#ts-unblock-trap-form-btn') as HTMLButtonElement | null;
    if (unblockBtn && form) {
      unblockBtn.addEventListener('click', async () => {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host) {
          try {
            await UserWhitelistManager.allowDomain(host);
          } catch {}
        }
        HiddenFieldInspector.restoreForm(form);
        foldAndRemove();
      });
    }
  }

  public static removeHiddenFieldTrapBanner(): void {
    SecurityFriction.restoreDisarmedFormStyle();
    const root = ShadowHost.getRoot();
    root.querySelectorAll('.ts-xray-badge').forEach((b) => b.remove());
    const existing = root.getElementById('threat-shield-hidden-field-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }
}

