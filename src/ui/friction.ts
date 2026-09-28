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
import { ToastNotifier } from './toast-notifier';
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
      title: 'Призупинено відправку форми',
      badgeText: `РІВЕНЬ РИЗИКУ: ${assessment.level} (${assessment.score}/100)`,
      badgeLevel: assessment.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      contextLabel: 'Цільовий сервер',
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
      cards: string[];
      isCrossMessage?: boolean;
      customReason?: string;
      customTriggers?: Array<{ message: string; severity: string }>;
    },
    onProceed: () => void,
    onCancel?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    const currentPlatform = window.location.hostname || 'Відкритий чат маркетплейсу';
    const detectedAmount = XaiEngine.extractFinancialAmount(chatInput) || undefined;
    const vaultScan = VaultScanner.scanTextSync(chatInput.value || '');

    const triggers: Array<{ message: string; severity: string }> = [];
    if (leakage.customTriggers && leakage.customTriggers.length > 0) {
      triggers.push(...leakage.customTriggers);
    } else {
      if (leakage.isCrossMessage) {
        triggers.push({
          message: 'У діалозі зафіксовано роздільну передачу платіжних реквізитів: номер картки та CVV-код відправляються різними повідомленнями! Разом це відкриває шахраям прямий доступ до ваших коштів.',
          severity: 'CRITICAL',
        });
      }
      if (leakage.hasCard && (leakage.hasCvv || leakage.hasExpiry)) {
        triggers.push({
          message: 'У тексті повідомлення виявлено повні платіжні реквізити (номер картки + секретні дані авторизації)!',
          severity: 'CRITICAL',
        });
      }
      if (leakage.hasCvv) {
        triggers.push({
          message: 'Виявлено секретний тризначний код безпеки картки (CVV/CVC). Для отримання коштів він ніколи не потрібен!',
          severity: 'CRITICAL',
        });
      }
    if (leakage.hasExpiry) {
      triggers.push({
        message: 'Виявлено термін дії банківської картки (MM/YY)!',
        severity: 'HIGH',
      });
    }
    if (leakage.hasOtp) {
      triggers.push({
        message: 'Виявлено одноразовий SMS-код безпеки / пароль підтвердження операції (OTP)!',
        severity: 'CRITICAL',
      });
    }
    if (vaultScan.triggers.length > 0) {
      triggers.push(...vaultScan.triggers);
    }
  }

    UnifiedFrictionModal.show({
      type: 'chat',
      title: 'Призупинено надсилання в чаті',
      badgeText: 'ВИТІК ПЛАТІЖНИХ ДАНИХ (CRITICAL)',
      badgeLevel: 'CRITICAL',
      contextLabel: 'Платформа діалогу',
      contextValue: currentPlatform,
      triggers,
      activeContext,
      detectedAmount,
      vaultItems: vaultScan.matchedItems,
      chatLeakage: { hasCard: leakage.hasCard, hasCvv: leakage.hasCvv },
      rawTextToScan: chatInput.value || activeContext?.targetSuspiciousUrl || undefined,
      intentType: activeContext?.scenario || 'PAYMENT_CREDENTIAL_THEFT',
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

    const subtitle = customSubtitle || 'Посилений моніторинг форм';
    const message = `Сайт «${context.sourcePlatform}»: ${subtitle}. Форми перебувають під посиленим наглядом.`;

    ToastNotifier.show(message, 'warning', 8500);
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
   * Sanctuary Focus Capsule (Jony Ive Apple HIG & Frosted Optical Glass)
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
            const hasCard = allVaultItems.some((i) => i.category === 'CUSTOM' || i.label.toLowerCase().includes('картк'));
            if (hasCard) vaultProvenanceLabels.push('Платіжна картка');
          } else if (type === 'CVV') {
            vaultProvenanceLabels.push('Код безпеки (CVV)');
          } else if (type === 'PASSWORD' || type === 'PIN') {
            const hasSecret = allVaultItems.some((i) => i.category === 'SECRET_WORD');
            if (hasSecret) vaultProvenanceLabels.push('Секретний код');
          }
        }
      }
    } catch {}

    const hasVaultProvenance = vaultProvenanceLabels.length > 0;
    const count = scan.flaggedInputs.length;
    const countLabel = count === 1 ? '1 поле' : count < 5 ? `${count} поля` : `${count} полів`;

    const sensitiveFieldLabelsUa: Record<string, string> = {
      CARD_NUMBER: 'Номер банківської картки',
      CVV: 'Код безпеки картки (CVV/CVC)',
      CARD_EXPIRY: 'Термін дії картки (MM/YY)',
      PASSWORD: 'Пароль облікового запису',
      PIN: 'Секретний PIN-код',
      OTHER_SENSITIVE: 'Конфіденційні реквізити',
    };

    const formatCloakingTechnique = (reason: string): string => {
      const r = (reason || '').toLowerCase();
      if (r.includes('opacity')) return 'Сховано сайтом (нульова прозорість)';
      if (r.includes('clip')) return 'Обрізано маскою (clip-path)';
      if (r.includes('1px') || r.includes('dimension') || r.includes('size')) return 'Мікроскопічний розмір (1×1 px)';
      if (r.includes('offscreen') || r.includes('left') || r.includes('top') || r.includes('position')) {
        return 'Винесено за межі екрана';
      }
      if (r.includes('transform') || r.includes('scale')) return 'Масштабовано до нуля (scale 0)';
      if (r.includes('visibility') || r.includes('hidden')) return 'Сховано у стилях сторінки';
      return 'Приховано від користувача';
    };

    const detectedTypesSummary = scan.flaggedTypes
      .map((t) => sensitiveFieldLabelsUa[t] || t)
      .join(', ');

    const vaultSubtitle = hasVaultProvenance
      ? `Захищено дані Сховища (${vaultProvenanceLabels.join(', ')}) · Sanctuary Autofill Guard`
      : 'Sanctuary Autofill Guard';

    const humanNarrative = hasVaultProvenance
      ? `Сайт намагався потайки зчитати реквізити вашого Сховища (<strong style="color: var(--sanctuary-ink-primary, #1D1D1F); font-weight: 600;">${vaultProvenanceLabels.join(', ')}</strong>) через автозаповнення браузера. Приховані поля заблоковано, реальні дані не передано.`
      : `Сайт намагався приховано зчитати ваші платіжні реквізити (<strong style="color: var(--sanctuary-ink-primary, #1D1D1F); font-weight: 600;">${detectedTypesSummary}</strong>) через браузерне автозаповнення. Невидимі поля заблоковано. Реальні дані не передано.`;

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
        const label = sensitiveFieldLabelsUa[input.fieldType] || input.fieldType;
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
                <span>Знешкоджено</span>
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
              Форму знешкоджено
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
            Захищено · ${countLabel}
          </span>

          <button id="threat-shield-close-trap-banner" type="button" title="Закрити" style="
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
            <span style="font-size: 12px; font-weight: 600; letter-spacing: -0.01em;">Технічний аналіз пастки (${count})</span>
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
            ">Оптичний аудит</span>
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
            Підсвітити на формі
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
          Окей
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
            <span>Довіряти цьому сайту (якщо це помилка)</span>
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

        const compactFieldTagsUa: Record<string, string> = {
          CARD_NUMBER: 'КАРТКА',
          CVV: 'CVV / CVC',
          CARD_EXPIRY: 'MM / YY',
          PASSWORD: 'ПАРОЛЬ',
          PIN: 'PIN',
          OTHER_SENSITIVE: 'РЕКВІЗИТ',
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

          const fullLabel = sensitiveFieldLabelsUa[flaggedInput.fieldType] || flaggedInput.fieldType;
          const compactTag = compactFieldTagsUa[flaggedInput.fieldType] || flaggedInput.fieldType;
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
          badge.title = `Прихована пастка: ${fullLabel} (${technique}) · Заблоковано Sanctuary`;
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
            <span class="ts-xray-details" style="display: none;">Прихована пастка: ${fullLabel} (заблоковано)</span>
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

        highlightBtn.textContent = '● Підсвічено на формі (4с)';
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
            Підсвітити на формі
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

