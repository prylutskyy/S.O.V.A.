import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { DebuggerOverlay } from './debugger-overlay';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { HiddenFieldScanResult } from '../heuristics/hidden-field-inspector';
import { AIArbiterService } from '../ai/ai-arbiter.service';

export class SecurityFriction {
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
        const desc = `${inp.name || inp.id || inp.placeholder || inp.type}`.toLowerCase();
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
        formFieldsSummary.push(`${inp.name || inp.placeholder || inp.id || 'поле'}: "${displayVal}"`);
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
      },
    });
  }

  /**
   * Застосування тертя при спробі надіслати карткові дані в чаті
   */
  public static applyToChat(
    chatInput: HTMLInputElement | HTMLTextAreaElement,
    leakage: { hasCard: boolean; hasCvv: boolean; hasExpiry?: boolean; hasOtp?: boolean; cards: string[] },
    onProceed: () => void,
    onCancel?: () => void,
    activeContext?: ActiveThreatContext | null
  ): void {
    const currentPlatform = window.location.hostname || 'Відкритий чат маркетплейсу';
    const detectedAmount = XaiEngine.extractFinancialAmount(chatInput) || undefined;
    const vaultScan = VaultScanner.scanTextSync(chatInput.value || '');

    const triggers: Array<{ message: string; severity: string }> = [];
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
        if (onCancel) onCancel();
      },
    });
  }

  /**
   * Повідомлення про зшивання сесій (Firefox Doorhanger, розгортання з іконки розширення)
   */
  public static showContextWarningBanner(context: ActiveThreatContext, customSubtitle?: string, rawTextToScan?: string, intentType?: string, onClose?: () => void, confidence?: number): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }

    const banner = document.createElement('div');
    banner.id = 'threat-shield-context-banner';
    banner.style.cssText = `
      position: fixed !important;
      top: 12px !important;
      right: 18px !important;
      width: 370px !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #CFCFD8 !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
      border-radius: 8px !important;
      padding: 13px 15px !important;
      z-index: 2147483646 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 10px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      transform-origin: calc(100% - 24px) 0px !important;
      animation: fxDoorhangerUnfold 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const subtitle = customSubtitle || 'Посилений моніторинг форм';
    const isHardLock = (confidence !== undefined && confidence >= 50) || context.threatLevel === 'HIGH';

    banner.innerHTML = `
      <style>
        @keyframes fxDoorhangerUnfold {
          0%   { opacity: 0; transform: scale(0.15) translateY(-14px); }
          75%  { opacity: 1; transform: scale(1.02) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fxDoorhangerFold {
          0%   { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.15) translateY(-14px); }
        }
        @keyframes tsSpin { 100% { transform: rotate(360deg); } }
        .ts-spinner { animation: tsSpin 1s linear infinite; }
      </style>

      <!-- Firefox Doorhanger Anchor Caret -->
      <div style="
        position: absolute;
        top: -6px;
        right: 22px;
        width: 10px;
        height: 10px;
        background: #FFFFFF;
        border-left: 1px solid #CFCFD8;
        border-top: 1px solid #CFCFD8;
        transform: rotate(45deg);
        z-index: 1;
      "></div>

      <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
        <div style="
          width: 28px; height: 28px; border-radius: 6px;
          background: #FFF4E5; border: 1px solid #FFD599;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
        ">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D76E00" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <div style="font-size: 12.5px; color: #15141A; display: flex; flex-direction: column; gap: 2px; flex: 1;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-weight: 600; color: #15141A; font-size: 13px;">${context.sourcePlatform}</strong>
            <span style="font-size: 10px; font-weight: 600; background: #E8F2FF; color: #0060DF; padding: 1px 5px; border-radius: 3px;">Active Shield</span>
          </div>
          <span style="color: #D76E00; font-weight: 500; font-size: 12px; line-height: 1.3;">${subtitle}</span>
          ${isHardLock ? '<span style="color:#D70022; font-size: 11px; font-weight: 600;">(Блокування вводу чутливих реквізитів)</span>' : ''}
        </div>

        <button id="threat-shield-close-banner" type="button" title="Закрити" ${isHardLock ? 'disabled' : ''} style="
          width: 22px; height: 22px; border-radius: 4px; border: none;
          background: #F0F0F4; color: #5B5B66; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: ${isHardLock ? '11px' : '10px'}; line-height: 1; padding: 0; margin-left: auto;
          transition: background 0.15s, opacity 0.2s;
          ${isHardLock ? 'opacity: 0.5; cursor: not-allowed;' : ''}
        ">
          ${isHardLock ? '10s' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
        </button>
      </div>

      <button id="ts-ask-ai-banner-btn" style="background:#0060DF;color:#FFFFFF;border:none;border-radius:4px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background 0.15s;width:100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Сумніваєтесь? Запитати ШІ
      </button>
      <div id="ts-ai-banner-result" style="display:none;font-size:12px;padding:8px 10px;border-radius:4px;width:100%;box-sizing:border-box;border:1px solid transparent;"></div>
    `;

    ShadowHost.append(banner);

    const btnAi = banner.querySelector('#ts-ask-ai-banner-btn') as HTMLButtonElement;
    const resultDiv = banner.querySelector('#ts-ai-banner-result') as HTMLElement;
    const closeBtn = banner.querySelector('#threat-shield-close-banner') as HTMLButtonElement;

    const foldAndRemove = () => {
      banner.style.animation = 'fxDoorhangerFold 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        ShadowHost.remove(banner);
      }, 170);
    };

    if (isHardLock) {
      let timeLeft = 10;
      const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
          closeBtn.innerText = `${timeLeft}s`;
        } else {
          clearInterval(interval);
          closeBtn.disabled = false;
          closeBtn.style.opacity = '1';
          closeBtn.style.cursor = 'pointer';
          closeBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }
      }, 1000);
    }

    closeBtn.addEventListener('click', () => {
      foldAndRemove();
    });

    btnAi.addEventListener('click', async () => {
      btnAi.disabled = true;
      btnAi.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ts-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ШІ аналізує... (до 30с)';
      btnAi.style.opacity = '0.7';

      const aiResult = await AIArbiterService.verify({
        context,
        rawTextToScan,
        intentType,
        confidence,
      });

      resultDiv.style.display = 'block';

      if (!aiResult) {
        resultDiv.style.background = '#FEF2F2';
        resultDiv.style.color = '#DC2626';
        resultDiv.innerHTML = `<b>Помилка:</b> Gemini Nano недоступний`;
      } else if (aiResult.isScam) {
        resultDiv.style.background = '#FEF2F2';
        resultDiv.style.color = '#DC2626';
        resultDiv.innerHTML = `<b>ШІ підтверджує загрозу:</b> ${aiResult.reasoning}`;
      } else {
        resultDiv.style.background = '#F0FDF4';
        resultDiv.style.color = '#166534';
        resultDiv.innerHTML = `<b>ШІ спростував загрозу:</b> ${aiResult.reasoning}`;
        setTimeout(() => {
          foldAndRemove();
          if (onClearThreat) onClearThreat();
        }, 3000);
      }

      btnAi.style.display = 'none';
    });

    // Don't auto-close if it's a Hard Lock. The user must manually close it.
    if (!isHardLock) {
      setTimeout(() => {
        if (root.contains(banner) && btnAi.style.display !== 'none' && !btnAi.disabled) {
          foldAndRemove();
        }
      }, 10000);
    }
  }

  /**
   * Примусове видалення банера контексту з Shadow DOM (наприклад, при скиданні Tainted Context)
   */
  public static removeContextWarningBanner(): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-context-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }

  /**
   * Проактивне сповіщення про виявлення пастки автозаповнення (Firefox Doorhanger, розгортання з іконки розширення)
   */
  public static showHiddenFieldTrapBanner(scan: HiddenFieldScanResult, form?: HTMLFormElement): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-hidden-field-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
    // Також прибираємо загальний банер сесії, якщо він був відкритий, щоб уникнути накладання
    const contextBanner = root.getElementById('threat-shield-context-banner');
    if (contextBanner) {
      ShadowHost.remove(contextBanner as HTMLElement);
    }

    if (form) {
      form.style.outline = '2px dashed #D70022';
      form.style.outlineOffset = '4px';
    }

    const banner = document.createElement('div');
    banner.id = 'threat-shield-hidden-field-banner';
    banner.style.cssText = `
      position: fixed !important;
      top: 12px !important;
      right: 18px !important;
      width: 385px !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #D70022 !important;
      box-shadow: 0 10px 28px rgba(215, 0, 34, 0.2), 0 0 0 1px rgba(215, 0, 34, 0.12) !important;
      border-radius: 8px !important;
      padding: 14px 16px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      transform-origin: calc(100% - 24px) 0px !important;
      animation: fxDoorhangerUnfold 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
      box-sizing: border-box !important;
    `;

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
      if (r.includes('opacity')) return 'Нульова прозорість (CSS opacity: 0)';
      if (r.includes('clip')) return 'Обрізано маскою (clip / clip-path)';
      if (r.includes('1px') || r.includes('dimension') || r.includes('size')) return 'Мікро-розмір (1px × 1px)';
      if (r.includes('offscreen') || r.includes('left') || r.includes('top') || r.includes('position')) {
        return 'Винесено за межі екрана (offscreen)';
      }
      if (r.includes('transform') || r.includes('scale')) return 'Масштабування до нуля (scale(0))';
      if (r.includes('visibility') || r.includes('hidden')) return 'Сховано стилями (visibility: hidden)';
      return reason || 'CSS-маскування від користувача';
    };

    const detectedTypesSummary = scan.flaggedTypes
      .map((t) => sensitiveFieldLabelsUa[t] || t)
      .join(', ');

    const fieldsDetailsHtml = scan.flaggedInputs
      .map((input) => {
        const label = sensitiveFieldLabelsUa[input.fieldType] || input.fieldType;
        const attrDesc = input.name
          ? `name="${input.name}"`
          : input.element.id
          ? `id="${input.element.id}"`
          : `type="${input.type}"`;
        const technique = formatCloakingTechnique(input.cloakingReason);

        return `
          <div style="display:flex; flex-direction:column; gap:3px; padding:6px 8px; background:#FFFFFF; border:1px solid #E0E0E6; border-radius:4px; font-size:11px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
              <strong style="color:#15141A; font-weight:600;">${label}</strong>
              <span style="font-size:9.5px; font-weight:600; color:#008A52; background:#EAF7F3; border:1px solid #A3E5D0; padding:1px 5px; border-radius:3px;">🔒 Знешкоджено</span>
            </div>
            <div style="font-size:10px; color:#5B5B66; display:flex; align-items:center; gap:4px; font-family:ui-monospace,SFMono-Regular,monospace;">
              <span>Поле:</span> <code style="color:#0060DF;">${attrDesc}</code>
            </div>
            <div style="font-size:10px; color:#D76E00; display:flex; align-items:center; gap:4px;">
              <span>Маскування:</span> <span>${technique}</span>
            </div>
          </div>
        `;
      })
      .join('');

    banner.innerHTML = `
      <style>
        @keyframes fxDoorhangerUnfold {
          0%   { opacity: 0; transform: scale(0.15) translateY(-14px); }
          75%  { opacity: 1; transform: scale(1.02) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fxDoorhangerFold {
          0%   { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.15) translateY(-14px); }
        }
        details.fx-trap-accordion summary::-webkit-details-marker { display: none; }
      </style>

      <!-- Firefox Doorhanger Anchor Caret -->
      <div style="
        position: absolute;
        top: -6px;
        right: 22px;
        width: 10px;
        height: 10px;
        background: #FFFFFF;
        border-left: 1px solid #D70022;
        border-top: 1px solid #D70022;
        transform: rotate(45deg);
        z-index: 1;
      "></div>

      <!-- Header Row -->
      <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
        <div style="
          width: 32px; height: 32px; border-radius: 6px;
          background: #FDF2F5; border: 1px solid #F8B4C0;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D70022" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 13px; font-weight: 700; color: #15141A;">Захист від автозаповнення</strong>
            <span style="font-size: 10px; font-weight: 600; background: #E8F2FF; color: #0060DF; border: 1px solid #B0D5FF; padding: 1px 5px; border-radius: 3px;">Active Shield</span>
          </div>
          <div style="font-size: 12px; font-weight: 600; color: #D70022;">
            Виявлено приховані поля у формі!
          </div>
        </div>

        <button id="threat-shield-close-trap-banner" type="button" title="Закрити" style="
          width: 22px; height: 22px; border-radius: 4px; border: none;
          background: #F0F0F4; color: #5B5B66; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0; flex-shrink: 0; transition: background 0.15s;
        ">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Description -->
      <p style="font-size: 12px; color: #5B5B66; margin: 0; line-height: 1.45;">
        Форма намагається непомітно зчитати ваші платіжні чи конфіденційні реквізити (<strong style="color: #15141A;">${detectedTypesSummary}</strong>) через функцію браузерного автозаповнення.
      </p>

      <!-- Protection Status Pill -->
      <div style="display: flex; align-items: center; gap: 6px; background: #EAF7F3; border: 1px solid #A3E5D0; border-radius: 4px; padding: 6px 9px; font-size: 11.5px; color: #008A52; font-weight: 600;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#008A52" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        <span>Знешкоджено: ${scan.flaggedInputs.length} прихованих полів заблоковано</span>
      </div>

      <!-- Expandable Accordion with Technical Details -->
      <details class="fx-trap-accordion" style="background: #F0F0F4; border: 1px solid #CFCFD8; border-radius: 4px; overflow: hidden; font-size: 11.5px;">
        <summary style="padding: 7px 10px; font-weight: 600; color: #15141A; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; user-select: none;">
          <span style="display: flex; align-items: center; gap: 5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Технічні подробиці аналізу (${scan.flaggedInputs.length})
          </span>
          <span style="font-size: 10px; color: #5B5B66;">▼ Розгорнути</span>
        </summary>
        <div style="padding: 8px; border-top: 1px solid #CFCFD8; background: #F8F8FA; display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto;">
          ${fieldsDetailsHtml}
        </div>
      </details>

      <!-- Action Buttons Row -->
      <div style="display: flex; gap: 6px; margin-top: 2px;">
        ${
          form
            ? `
          <button id="ts-highlight-form-btn" type="button" style="
            flex: 1; background: #F0F0F4; border: 1px solid #CFCFD8; border-radius: 4px;
            padding: 7px 10px; font-size: 11.5px; font-weight: 600; color: #15141A;
            cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
            transition: all 0.12s;
          ">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Показати поля
          </button>
        `
            : ''
        }
        <button id="ts-dismiss-trap-banner-btn" type="button" style="
          flex: 1; background: #0060DF; color: #FFFFFF; border: none; border-radius: 4px;
          padding: 7px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
          transition: background 0.12s;
        ">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="20 6 9 17 4 12"/></svg>
          Зрозуміло, захистити
        </button>
      </div>
    `;

    ShadowHost.append(banner);

    const foldAndRemove = () => {
      banner.style.animation = 'fxDoorhangerFold 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        ShadowHost.remove(banner);
      }, 170);
    };

    const closeBtn = banner.querySelector('#threat-shield-close-trap-banner') as HTMLButtonElement;
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        foldAndRemove();
      });
    }

    const highlightBtn = banner.querySelector('#ts-highlight-form-btn') as HTMLButtonElement | null;
    if (highlightBtn && form) {
      highlightBtn.addEventListener('click', () => {
        const REVEAL_DURATION_MS = 4000;

        type Snapshot = {
          el: HTMLElement;
          originalClassName: string;
          originalStyleAttr: string | null;
          originalType: string | null;
          wasDisabled: boolean;
          originalTabIndex: number;
        };

        const fieldSnapshots: Snapshot[]  = [];
        const parentSnapshots: Snapshot[] = [];
        const processedParents = new Set<HTMLElement>();
        let firstEl: HTMLElement | null = null;

        // — Знімаємо стилі з самої форми —
        const formSnapshot: Snapshot = {
          el:                form,
          originalClassName: form.getAttribute('class') ?? '',
          originalStyleAttr: form.getAttribute('style'),
          originalType:      null,
          wasDisabled:       false,
          originalTabIndex:  -1,
        };
        form.removeAttribute('class');
        form.removeAttribute('style');

        // — Обробляємо кожне приховане поле —
        for (const flaggedInput of scan.flaggedInputs) {
          const el = flaggedInput.element as HTMLElement;

          // Зберігаємо та чистимо безпосередній батьківський контейнер (div тощо)
          const parentEl = el.parentElement;
          if (parentEl && parentEl !== form && !processedParents.has(parentEl)) {
            processedParents.add(parentEl);
            parentSnapshots.push({
              el:                parentEl,
              originalClassName: parentEl.getAttribute('class') ?? '',
              originalStyleAttr: parentEl.getAttribute('style'),
              originalType:      null,
              wasDisabled:       false,
              originalTabIndex:  -1,
            });
            parentEl.removeAttribute('class');
            parentEl.removeAttribute('style');
          }

          fieldSnapshots.push({
            el,
            originalClassName: el.getAttribute('class') ?? '',
            originalStyleAttr: el.getAttribute('style'),
            originalType:      el.getAttribute('type'),
            wasDisabled:       (el as HTMLInputElement).disabled,
            originalTabIndex:  el.tabIndex,
          });

          // type="hidden": браузер не рендерить — міняємо на text
          if ((el as HTMLInputElement).type === 'hidden') {
            el.setAttribute('type', 'text');
          }

          el.removeAttribute('class');
          el.removeAttribute('style');
          (el as HTMLInputElement).disabled = false;
          el.tabIndex = 0;

          if (!firstEl) firstEl = el;
        }

        // Прокрутка до першого поля
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Кнопка — заблокована на час показу
        highlightBtn.textContent       = `👁 Показано ${scan.flaggedInputs.length}с — ховаємо...`;
        highlightBtn.style.background  = '#EAF7F3';
        highlightBtn.style.color       = '#008A52';
        highlightBtn.style.borderColor = '#A3E5D0';
        highlightBtn.disabled = true;

        // — Через REVEAL_DURATION_MS — відновлюємо все і реактивуємо кнопку —
        setTimeout(() => {
          // Відновлення форми
          form.setAttribute('class', formSnapshot.originalClassName);
          if (formSnapshot.originalStyleAttr !== null) form.setAttribute('style', formSnapshot.originalStyleAttr);
          else                                         form.removeAttribute('style');

          // Відновлення батьківських контейнерів
          for (const snap of parentSnapshots) {
            snap.el.setAttribute('class', snap.originalClassName);
            if (snap.originalStyleAttr !== null) snap.el.setAttribute('style', snap.originalStyleAttr);
            else                                 snap.el.removeAttribute('style');
          }

          // Відновлення полів
          for (const snap of fieldSnapshots) {
            if (snap.originalType !== null) snap.el.setAttribute('type', snap.originalType);
            else                            snap.el.removeAttribute('type');

            snap.el.setAttribute('class', snap.originalClassName);
            if (snap.originalStyleAttr !== null) snap.el.setAttribute('style', snap.originalStyleAttr);
            else                                 snap.el.removeAttribute('style');

            (snap.el as HTMLInputElement).disabled = snap.wasDisabled;
            snap.el.tabIndex = snap.originalTabIndex;
          }

          // Реактивуємо кнопку
          highlightBtn.textContent       = 'Показати поля';
          highlightBtn.style.background  = '#F0F0F4';
          highlightBtn.style.color       = '#15141A';
          highlightBtn.style.borderColor = '#CFCFD8';
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
  }

  public static removeHiddenFieldTrapBanner(): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-hidden-field-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }
}

