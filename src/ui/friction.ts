import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { AILureVerifier } from '../heuristics/ai-verifier';
import { ScamIntentType } from '../heuristics/intent-classifier';
import { DebuggerOverlay } from './debugger-overlay';
import { ChatChannelMonitor } from '../heuristics/chat-channel';
import { HiddenFieldScanResult } from '../heuristics/hidden-field-inspector';

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
            <span style="font-size: 10px; font-weight: 600; background: #E8F2FF; color: #0060DF; padding: 1px 5px; border-radius: 3px;">Firefox Shield</span>
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

    btnAi.addEventListener('click', () => {
      btnAi.disabled = true;
      btnAi.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ts-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ШІ аналізує... (до 30с)';
      btnAi.style.opacity = '0.7';

      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          const scanText = rawTextToScan || context.targetSuspiciousUrl || '';
          const intentLabel = (intentType && intentType !== 'UNKNOWN') ? intentType : (context.scenario || 'UNKNOWN');
          const triggerWord = context.detectedKeywords?.[0];
          
          const contextRules = AILureVerifier.intentContextRules[intentLabel as ScamIntentType] || 'Analyze for social engineering, phishing, and payment credential theft.';
          const systemPrompt = `You are a cybersecurity expert specializing in detecting phishing, payment credential theft, and social engineering attacks on online marketplaces and chats.

IMPORTANT RULES:
1. Respond ONLY with a valid JSON object. Do NOT include markdown blocks or any conversational text.
2. JSON keys MUST strictly be: "isScam", "confidence", "reasoning".
3. Write "reasoning" in English: concise, direct explanation (1-2 sentences, max 30 words).

Required JSON schema:
{
  "isScam": boolean,
  "confidence": number (0-100),
  "reasoning": string (concise explanation in English)
}`;

          const raisedFlags: string[] = [
            `Виявлено загрозу: ${intentLabel}`,
            `Платформа-джерело: ${context.sourcePlatform}`,
            context.offPlatformLure ? 'Спроба переведення в сторонній месенджер' : 'Підозріле посилання у тексті',
            ...(context.detectedKeywords || []).map(k => `Ключове слово: "${k}"`)
          ];

          let targetHost: string | undefined;
          try {
            if (context.targetSuspiciousUrl) targetHost = new URL(context.targetSuspiciousUrl).hostname;
          } catch {}

          const chatDialogue = ChatChannelMonitor.getDialogueHistory();

          const heuristicContext = {
            intentType: intentLabel,
            detectedKeywords: context.detectedKeywords || [],
            suspiciousUrls: context.targetSuspiciousUrl ? [context.targetSuspiciousUrl] : [],
            triggeredClusters: context.offPlatformLure ? ['off_platform'] : [],
            nlpConfidence: confidence || (context.threatLevel === 'HIGH' ? 75 : 25),
            raisedFlags,
            chatDialogue,
            sourcePlatform: context.sourcePlatform,
            targetHost
          };

          const aiLogId = DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', '⏳ Запит відправлено, очікую відповідь...', '#3B82F6', {
            systemPrompt,
            contextRules,
            textSent: scanText,
            chatDialogue,
            raisedFlags
          });

          chrome.runtime.sendMessage({
            type: 'AI_VERIFY',
            payload: {
              text: scanText,
              intentType: intentLabel,
              triggerWord,
              heuristicContext
            }
          }, (response) => {
            const aiResult = response?.aiResult;
            resultDiv.style.display = 'block';

            if (!aiResult) {
              resultDiv.style.background = '#FEF2F2';
              resultDiv.style.color = '#DC2626';
              resultDiv.innerHTML = `<b>Помилка:</b> Gemini Nano недоступний`;
              DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', '❌ Gemini Nano не зміг обробити запит.', '#EF4444', undefined, aiLogId);
            } else if (aiResult.isScam) {
              resultDiv.style.background = '#FEF2F2';
              resultDiv.style.color = '#DC2626';
              resultDiv.innerHTML = `<b>ШІ підтверджує загрозу:</b> ${aiResult.reasoning}`;
              DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', `🔴 СКАМ підтверджено (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`, '#EF4444', { rawResponse: aiResult.rawResponse }, aiLogId);
            } else {
              resultDiv.style.background = '#F0FDF4';
              resultDiv.style.color = '#166534';
              resultDiv.innerHTML = `<b>ШІ спростував загрозу:</b> ${aiResult.reasoning}`;
              DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', `🟢 Загрозу спростовано (Впевненість: ${aiResult.confidence}%)\n\nВисновок: "${aiResult.reasoning}"`, '#22C55E', { rawResponse: aiResult.rawResponse }, aiLogId);
              setTimeout(() => {
                foldAndRemove();
                if (onClearThreat) onClearThreat();
              }, 3000);
            }

            btnAi.style.display = 'none';
          });
        }
      } catch (e) {
        console.error(e);
      }
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
      width: 380px !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #D70022 !important;
      box-shadow: 0 8px 24px rgba(215, 0, 34, 0.18), 0 0 0 1px rgba(215, 0, 34, 0.1) !important;
      border-radius: 8px !important;
      padding: 13px 15px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      transform-origin: calc(100% - 24px) 0px !important;
      animation: fxDoorhangerUnfold 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const sensitiveTypesUa: Record<string, string> = {
      CARD_NUMBER: 'Номер банківської картки',
      CVV: 'CVV/CVC код',
      CARD_EXPIRY: 'Термін дії картки',
      PASSWORD: 'Пароль',
    };

    const detectedTypes = scan.flaggedTypes
      .map((t) => sensitiveTypesUa[t] || t)
      .join(', ');

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

      <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
        <div style="
          width: 30px; height: 30px; border-radius: 6px;
          background: #FDF2F5; border: 1px solid #F8B4C0;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D70022" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 10px; font-weight: 700; background: #FDF2F5; color: #D70022; padding: 1px 5px; border-radius: 3px; text-transform: uppercase;">
              Autofill Trap
            </span>
            <strong style="font-size: 13px; font-weight: 700; color: #D70022;">Виявлено приховані поля!</strong>
          </div>
          <p style="font-size: 12px; color: #5B5B66; margin: 0; line-height: 1.4;">
            Форма намагається викрасти дані: <strong style="color: #15141A;">${detectedTypes}</strong> через браузерне автозаповнення.
          </p>
          <div style="font-size: 11.5px; color: #008A52; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#008A52" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            Захист: приховані поля знешкоджено (disabled & autocomplete="off").
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
  }

  public static removeHiddenFieldTrapBanner(): void {
    const root = ShadowHost.getRoot();
    const existing = root.getElementById('threat-shield-hidden-field-banner');
    if (existing) {
      ShadowHost.remove(existing as HTMLElement);
    }
  }
}

