import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from './unified-modal';
import { ShadowHost } from './shadow-host';
import { XaiEngine } from '../xai/xai-engine';
import { VaultScanner } from '../heuristics/vault-scanner';
import { AILureVerifier } from '../heuristics/ai-verifier';
import { ScamIntentType } from '../heuristics/intent-classifier';
import { DebuggerOverlay } from './debugger-overlay';

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
   * Повідомлення про зшивання сесій (Floating Dynamic Island / Capsule у стилі Apple)
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
      top: 14px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      max-width: calc(100vw - 32px) !important;
      background: #FFFFFF !important;
      border: 1px solid #E5E7EB !important;
      box-shadow: 0 4px 14px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06) !important;
      border-radius: 12px !important;
      padding: 12px 14px 12px 14px !important;
      z-index: 2147483646 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 9px !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      animation: tsCapsuleDrop 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      pointer-events: auto !important;
    `;

    const subtitle = customSubtitle || 'Посилений моніторинг форм';
    const isHardLock = (confidence !== undefined && confidence >= 50) || context.threatLevel === 'HIGH';

    banner.innerHTML = `
      <style>
        @keyframes tsCapsuleDrop {
          from { opacity: 0; transform: translate(-50%, -14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes tsSpin { 100% { transform: rotate(360deg); } }
        .ts-spinner { animation: tsSpin 1s linear infinite; }
      </style>

      <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
        <div style="
          width: 22px; height: 22px; border-radius: 50%;
          background: #FFFBEB; border: 1px solid #FDE68A;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <div style="font-size: 12.5px; color: #1A1A1A; display: flex; flex-direction: column; gap: 2px;">
          <strong style="font-weight: 600; color: #1A1A1A;">${context.sourcePlatform}</strong>
          <span style="color: #D97706; font-weight: 500;">${subtitle}</span>
          ${isHardLock ? '<span style="color:#DC2626; font-size: 11px;">(Блокування вводу)</span>' : ''}
        </div>

        <button id="threat-shield-close-banner" type="button" title="Закрити" ${isHardLock ? 'disabled' : ''} style="
          width: ${isHardLock ? '24px' : '18px'}; height: ${isHardLock ? '24px' : '18px'}; border-radius: 50%; border: none;
          background: #F3F4F6; color: #9CA3AF; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: ${isHardLock ? '11px' : '10px'}; line-height: 1; padding: 0; margin-left: auto;
          transition: opacity 0.2s;
          ${isHardLock ? 'opacity: 0.5; cursor: not-allowed;' : ''}
        ">
          ${isHardLock ? '10s' : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
        </button>
      </div>

      <button id="ts-ask-ai-banner-btn" style="background:#E0E7FF;color:#4338CA;border:1px solid #C7D2FE;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.2s;width:100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Сумніваєтесь? Запитати ШІ
      </button>
      <div id="ts-ai-banner-result" style="display:none;font-size:12px;padding:8px;border-radius:6px;width:100%;box-sizing:border-box;"></div>
    `;

    ShadowHost.append(banner);

    const btnAi = banner.querySelector('#ts-ask-ai-banner-btn') as HTMLButtonElement;
    const resultDiv = banner.querySelector('#ts-ai-banner-result') as HTMLElement;
    const closeBtn = banner.querySelector('#threat-shield-close-banner') as HTMLButtonElement;

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
          closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }
      }, 1000);
    }

    closeBtn.addEventListener('click', () => {
      ShadowHost.remove(banner);
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

          const heuristicContext = {
            intentType: intentLabel,
            detectedKeywords: context.detectedKeywords || [],
            suspiciousUrls: context.targetSuspiciousUrl ? [context.targetSuspiciousUrl] : [],
            triggeredClusters: context.offPlatformLure ? ['off_platform'] : [],
            nlpConfidence: confidence || (context.threatLevel === 'HIGH' ? 75 : 25),
            raisedFlags,
            sourcePlatform: context.sourcePlatform,
            targetHost
          };

          const aiLogId = DebuggerOverlay.logAI('ШІ Арбітр → Аналіз', '⏳ Запит відправлено, очікую відповідь...', '#3B82F6', {
            systemPrompt,
            contextRules,
            textSent: scanText,
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
                ShadowHost.remove(banner);
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
          ShadowHost.remove(banner);
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
}

