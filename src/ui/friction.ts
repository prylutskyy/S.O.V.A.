import { i18n } from '../core/i18n';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { HiddenFieldScanResult, HiddenFieldInspector } from '../heuristics/hidden-field-inspector';
import { AIArbiterService } from '../ai/ai-arbiter.service';
import { DESIGN_TOKENS_CSS } from './design-tokens';
import { PersonalVaultManager } from '../core/personal-vault';
import { UserWhitelistManager } from '../core/user-whitelist';
import { DebuggerOverlay } from './debugger-overlay';

export class SecurityFriction {
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
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }

    const supportedIntents = [
      'MILITARY_SABOTAGE_RECRUITMENT',
      'ESCROW_DELIVERY_SCAM',
      'PAYMENT_CREDENTIAL_THEFT',
      'IDENTITY_PROBING',
      'SEED_PHRASE_THEFT',
      'CRYPTO_WALLET_COMPROMISE',
      'OFF_PLATFORM_REDIRECT',
      'VERIFICATION_PHISHING',
      'URGENCY_PRESSURE',
      'UNKNOWN',
    ];

    if (intentType && !supportedIntents.includes(intentType)) {
      return;
    }

    const isSabotage = intentType === 'MILITARY_SABOTAGE_RECRUITMENT';
    const isEscrow = intentType === 'ESCROW_DELIVERY_SCAM';
    const isCredential = intentType === 'PAYMENT_CREDENTIAL_THEFT';
    const isIdentity = intentType === 'IDENTITY_PROBING';
    const isSeed = intentType === 'SEED_PHRASE_THEFT' || intentType === 'CRYPTO_WALLET_COMPROMISE';
    const isOffPlatform = intentType === 'OFF_PLATFORM_REDIRECT';
    const isVerification = intentType === 'VERIFICATION_PHISHING';

    const isCritical = isSabotage || isSeed;

    let themeColor = '#FF9F0A'; // Apple Amber
    let themeBg = 'rgba(255, 159, 10, 0.16)';
    let themeBorder = 'rgba(255, 159, 10, 0.38)';
    let themeGlow = '0 12px 36px rgba(0, 0, 0, 0.40), 0 0 24px rgba(255, 159, 10, 0.16)';

    if (isCritical) {
      themeColor = '#FF453A'; // Apple Crimson Red
      themeBg = 'rgba(255, 69, 58, 0.18)';
      themeBorder = 'rgba(255, 69, 58, 0.42)';
      themeGlow = '0 12px 40px rgba(0, 0, 0, 0.52), 0 0 28px rgba(255, 69, 58, 0.24)';
    }

    let title = 'С.О.В.А. · Застереження безпеки';
    let subtitle = customSubtitle || 'У листуванні виявлено підозрілий намір';
    let explanation = 'Співрозмовник демонструє поведінкові маркери соціальної інженерії. Будьте уважні та уникайте переходу за сумнівними посиланнями чи введення конфіденційних реквізитів.';
    let iconSvg = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

    if (isSabotage) {
      title = 'С.О.В.А. · Ознаки ворожого вербування або диверсії';
      subtitle = 'ст. 111-2, 113 ККУ (Державна зрада / Диверсія)';
      explanation = 'Співрозмовник схиляє до збору координат, фотографування військових об’єктів чи підпалів за винагороду. Контакт тягне кримінальну відповідальність (аж до довічного позбавлення волі). <strong>Поле вводу заблоковано для вашого захисту.</strong>';
      iconSvg = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    } else if (isEscrow) {
      title = 'С.О.В.А. · Застереження: фішинг доставки';
      subtitle = 'Імітація фінансової угоди або фейкової виплати на картку';
      explanation = 'Співрозмовник намагається переконати вас відкрити зовнішнє посилання для «отримання» коштів. Справжні платформи (OLX, Prom) ніколи не вимагають переходу за сторонніми посиланнями та введення реквізитів картки чи CVV для зарахування оплати.';
      iconSvg = '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>';
    } else if (isCredential) {
      title = 'С.О.В.А. · Спроба викрадення платіжних даних';
      subtitle = 'Запит конфіденційного CVV-коду або SMS-пароля';
      explanation = 'Співрозмовник просить вказати CVV/CVC-код зі звороту картки або одноразовий SMS-пароль. Ці реквізити потрібні виключно для списання коштів з рахунку і ніколи не передаються стороннім особам.';
      iconSvg = '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="15" y1="15" x2="19" y2="15"/>';
    } else if (isIdentity) {
      title = 'С.О.В.А. · Випитування особистих даних';
      subtitle = 'Збір банківських та персональних маркерів';
      explanation = 'Співрозмовник збирає персональні маркери (ІПН, дівоче прізвище матері, секретні коди) для компрометації вашого банкінгу через службу підтримки.';
      iconSvg = '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>';
    } else if (isSeed) {
      title = 'С.О.В.А. · Спроба викрадення криптогаманця';
      subtitle = 'Запит Secret Recovery / Seed-фрази або ключів';
      explanation = 'Співрозмовник намагається отримати доступ до вашої мнемонічної фрази (12/24 слів). Розголошення призведе до безповоротної втрати активів. <strong>Поле вводу заблоковано.</strong>';
      iconSvg = '<path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5L13 7l-1.5-1.5L10 7M7 10a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>';
    } else if (isOffPlatform) {
      title = 'С.О.В.А. · Перехід у сторонній месенджер';
      subtitle = 'Спроба виведення комунікації за межі платформи';
      explanation = 'Співрозмовник намагається перевести діалог у сторонній месенджер (Telegram, WhatsApp, Viber), де не діють гарантії безпеки платформи. Залишайтеся в офіційному чаті.';
      iconSvg = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';
    } else if (isVerification) {
      title = 'С.О.В.А. · Фішинг верифікації акаунту';
      subtitle = 'Спроба фейкової перевірки або підтвердження особи';
      explanation = 'Співрозмовник або ресурс схиляє до проходження «верифікації» з метою перехоплення доступу до облікового запису.';
      iconSvg = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 12 14 22 4"/>';
    }

    const snippet = rawTextToScan && rawTextToScan.length > 3
      ? (rawTextToScan.length > 100 ? rawTextToScan.substring(0, 100) + '…' : rawTextToScan)
      : '';

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.style.cssText = `
      position: fixed; 
      top: 18px; 
      left: 50%; 
      transform: translateX(-50%); 
      z-index: 2147483647; 
      background: rgba(16, 16, 22, 0.90); 
      backdrop-filter: blur(28px) saturate(190%); 
      -webkit-backdrop-filter: blur(28px) saturate(190%); 
      border: 1px solid ${themeBorder}; 
      border-radius: 18px; 
      box-shadow: ${themeGlow}; 
      padding: 12px 16px; 
      width: fit-content;
      min-width: 380px;
      max-width: 560px; 
      color: #FFFFFF; 
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif; 
      display: flex; 
      flex-direction: column; 
      gap: 10px; 
      pointer-events: auto;
      user-select: none;
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1; min-width: 0;">
          <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: ${themeBg}; color: ${themeColor};">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              ${iconSvg}
            </svg>
          </div>
          <div style="min-width: 0;">
            <div style="font-weight: 600; font-size: 13px; line-height: 1.25; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
            <div style="font-size: 11px; color: ${themeColor}; margin-top: 1px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${subtitle}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button id="ts-capsule-toggle" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.08); color: #E4E4E7; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s;">
            Згорнути ▴
          </button>
          <button id="ts-capsule-close" title="Закрити" style="background: transparent; border: none; color: rgba(255, 255, 255, 0.5); font-size: 16px; line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: all 0.2s;">
            ✕
          </button>
        </div>
      </div>

      <div id="ts-capsule-drawer" style="display: flex; flex-direction: column; gap: 8px; padding-top: 2px;">
        ${snippet ? `
          <div style="background: rgba(0, 0, 0, 0.25); border-radius: 8px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 12px; font-style: italic; color: #D4D4D8; border-left: 3px solid ${themeColor}; line-height: 1.35;">
            «${snippet}»
          </div>
        ` : ''}

        <div style="font-size: 12px; line-height: 1.4; color: rgba(255, 255, 255, 0.82);">
          ${explanation}
        </div>

        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 2px;">
          ${isSabotage ? `
            <button id="ts-btn-evorog" style="background: #0071E3; color: #FFF; border: none; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 6px;">
              Повідомити СБУ (єВорог)
            </button>
          ` : ''}
          ${isCritical ? `
            <button id="ts-btn-unblock" style="background: transparent; color: rgba(255, 255, 255, 0.5); border: none; padding: 6px 10px; font-size: 11px; cursor: pointer; text-decoration: underline;">
              Це помилка (Розблокувати чат)
            </button>
          ` : `
            <button id="ts-btn-ack" style="background: rgba(255, 255, 255, 0.12); color: #FFF; border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s;">
              Зрозуміло
            </button>
          `}
        </div>
      </div>
    `;

    const drawer = banner.querySelector('#ts-capsule-drawer') as HTMLElement;
    const toggleBtn = banner.querySelector('#ts-capsule-toggle') as HTMLElement;
    const closeBtn = banner.querySelector('#ts-capsule-close') as HTMLElement;
    const ackBtn = banner.querySelector('#ts-btn-ack') as HTMLElement;
    const evorogBtn = banner.querySelector('#ts-btn-evorog') as HTMLElement;
    const unblockBtn = banner.querySelector('#ts-btn-unblock') as HTMLElement;

    let isExpanded = true;
    if (toggleBtn && drawer) {
      toggleBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        drawer.style.display = isExpanded ? 'flex' : 'none';
        toggleBtn.textContent = isExpanded ? 'Згорнути ▴' : 'Деталі ▾';
      });
      toggleBtn.addEventListener('mouseenter', () => (toggleBtn.style.background = 'rgba(255, 255, 255, 0.14)'));
      toggleBtn.addEventListener('mouseleave', () => (toggleBtn.style.background = 'rgba(255, 255, 255, 0.08)'));
    }

    const dismissCapsule = () => {
      ShadowHost.remove(banner);
      if (onClose) onClose();
      if (!isCritical && onClearThreat) {
        onClearThreat();
      }
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', dismissCapsule);
      closeBtn.addEventListener('mouseenter', () => (closeBtn.style.color = '#FFFFFF'));
      closeBtn.addEventListener('mouseleave', () => (closeBtn.style.color = 'rgba(255, 255, 255, 0.5)'));
    }

    if (ackBtn) {
      ackBtn.addEventListener('click', dismissCapsule);
      ackBtn.addEventListener('mouseenter', () => (ackBtn.style.background = 'rgba(255, 255, 255, 0.20)'));
      ackBtn.addEventListener('mouseleave', () => (ackBtn.style.background = 'rgba(255, 255, 255, 0.12)'));
    }

    if (evorogBtn) {
      evorogBtn.addEventListener('click', () => {
        window.open('https://t.me/evorog_bot', '_blank');
      });
      evorogBtn.addEventListener('mouseenter', () => (evorogBtn.style.background = '#0077ED'));
      evorogBtn.addEventListener('mouseleave', () => (evorogBtn.style.background = '#0071E3'));
    }

    if (unblockBtn) {
      unblockBtn.addEventListener('click', () => {
        ShadowHost.remove(banner);
        if (onClearThreat) onClearThreat();
        window.postMessage({ type: 'THREAT_SHIELD_DISABLE_CHAT_FREEZE' }, '*');
      });
      unblockBtn.addEventListener('mouseenter', () => (unblockBtn.style.color = '#FFFFFF'));
      unblockBtn.addEventListener('mouseleave', () => (unblockBtn.style.color = 'rgba(255, 255, 255, 0.5)'));
    }

    root.appendChild(banner);

    if (isCritical) {
      window.postMessage({ type: 'THREAT_SHIELD_ENABLE_CHAT_FREEZE' }, '*');
    }
  }

  /**
   * Очищення банера контексту
   */
  public static removeContextWarningBanner(): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }

  /**
   * Проактивне сповіщення про нейтралізацію пастки автозаповнення:
   * Sanctuary Focus Capsule (Frosted Optical Glass)
   */
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

