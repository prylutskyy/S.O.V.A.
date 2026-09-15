import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
} from '../src/heuristics/input-detector';
import { scanTextForLures } from '../src/heuristics/lure-detector';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { ActiveThreatContext, HeuristicResult } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    const currentHost = window.location.hostname.toLowerCase();
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    let activeContext: ActiveThreatContext | null = null;

    // 1. Запит до Background Worker щодо наявності активного контексту (Tainted Context Window)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' });
      if (response && response.context) {
        activeContext = response.context;
        console.log('[ThreatShield:Content] Отримано активний контекст загрози:', activeContext);

        // Якщо сайт не в Whitelist і це сторонній ресурс — показуємо банер
        if (!isWhitelisted(currentHost) && currentHost !== activeContext.sourcePlatform) {
          SecurityFriction.showContextWarningBanner(activeContext);
        }
      }
    } catch {
      // Background worker ще завантажується
    }

    // 2. Детекція соцінженерії та виведення в месенджери на платформах комунікації
    const isPlatform = isMonitoredPlatform(currentHost) || window.location.protocol === 'file:';

    if (isPlatform) {
      // 2.1 Сканування кліків по сторонніх лінках (Off-Platform Lure)
      document.addEventListener(
        'click',
        (event) => {
          const target = (event.target as HTMLElement).closest('a');
          if (target && target.href) {
            const scan = scanTextForLures(target.href + ' ' + target.innerText);
            if (scan.detected) {
              console.warn('[ThreatShield:Content] Зафіксовано клік по маніпулятивному лінку:', target.href);
              chrome.runtime.sendMessage({
                type: 'LURE_DETECTED',
                payload: {
                  sourcePlatform: currentHost || 'marketplace-chat',
                  keywords: scan.keywords,
                  offPlatformLure: scan.isOffPlatformLure,
                  suspiciousUrl: target.href,
                },
              });
            }
          }
        },
        true
      );

      // 2.2 Сканування події копіювання (Clipboard correlation)
      document.addEventListener('copy', () => {
        const selection = window.getSelection()?.toString() || '';
        if (selection) {
          const scan = scanTextForLures(selection);
          if (scan.detected) {
            console.warn('[ThreatShield:Content] Зафіксовано копіювання підозрілого контакту/посилання:', selection);
            chrome.runtime.sendMessage({
              type: 'LURE_DETECTED',
              payload: {
                sourcePlatform: currentHost || 'marketplace-chat',
                keywords: scan.keywords,
                offPlatformLure: scan.isOffPlatformLure,
              },
            });
          }
        }
      });
    }

    // 3. Захист від передачі реквізитів картки у звичайному чаті платформи (Outbound Chat Leak Protection)
    const handleChatInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
      const text = target.value || '';
      const leakage = checkOutboundChatLeakage(text);

      if (leakage.isLeaking) {
        target.style.outline = '3px solid #ef4444';
        target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';

        // Виводимо підказку-попередження поруч із полем
        let warningBadge = target.parentElement?.querySelector('.threat-shield-chat-warning') as HTMLElement;
        if (!warningBadge && target.parentElement) {
          warningBadge = document.createElement('div');
          warningBadge.className = 'threat-shield-chat-warning';
          warningBadge.style.cssText = `
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #f87171;
            padding: 6px 10px;
            font-size: 12px;
            border-radius: 6px;
            margin-top: 6px;
            font-weight: 500;
          `;
          target.parentElement.appendChild(warningBadge);
        }

        if (warningBadge) {
          warningBadge.innerText = leakage.warningMessage || 'Увага: виявлено реквізити картки в повідомленні!';
        }
      } else {
        target.style.outline = '';
        target.style.backgroundColor = '';
        const warningBadge = target.parentElement?.querySelector('.threat-shield-chat-warning');
        if (warningBadge) warningBadge.remove();
      }
    };

    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        handleChatInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    });

    // Блокування відправки повідомлення в чат через Enter, якщо в ньому є картка/CVV
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const target = event.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            const leakage = checkOutboundChatLeakage((target as HTMLInputElement).value || '');
            if (leakage.isLeaking) {
              event.preventDefault();
              event.stopPropagation();
              alert(
                `🛑 [ДІЮ ЗАБЛОКОВАНО: ВИТІК РЕКВІЗИТІВ КАРТКИ В ЧАТІ]\n\n` +
                `Система виявила номер банківської картки або CVV у тексті вашого повідомлення.\n\n` +
                `Пам'ятайте: покупець на маркетплейсі не повинен знати ваш CVV або номер картки для переказу коштів за схемою OLX Доставка.\n` +
                `Очистіть чутливі дані перед відправленням повідомлення!`
              );
            }
          }
        }
      },
      true
    );

    // 4. Прослуховування подій форм (submit) з перевіркою фактичного заповнення даних
    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement;
        if (!form || !(form instanceof HTMLFormElement)) {
          return;
        }

        const heuristics: HeuristicResult[] = [];

        // Перевіряємо фактичний стан заповнення полів форми
        const formState = getFormFilledState(form);

        // Евристика 1: Розбіжність form.action
        heuristics.push(checkFormActionMismatch(form));

        // Евристика 2: Приховані чутливі інпути (Autofill Phishing)
        heuristics.push(...checkSensitiveAndHiddenInputs(form));

        // Евристика 3: Перевірка реально введених даних на банківську картку (алгоритм Луна)
        if (formState.hasFilledCard) {
          heuristics.push({
            name: 'luhn_card_number_detected',
            triggered: true,
            severity: 'CRITICAL',
            scoreContribution: 40,
            message: 'У формі введено валідний номер банківської картки (алгоритм Луна)!',
          });
        }

        // Внесок Tainted Context Window (якщо домен не в Whitelist)
        let contextBonus = 0;
        if (activeContext && !isWhitelisted(currentHost)) {
          contextBonus = 35;
          heuristics.push({
            name: 'tainted_context_window_active',
            triggered: true,
            severity: 'HIGH',
            scoreContribution: 35,
            message: `Зшивання розірваних сесій: сторінка відкрита після підозрілого діалогу на ${activeContext.sourcePlatform} (тригери: ${activeContext.detectedKeywords.join(', ')}).`,
          });
        }

        // Розрахунок Risk Score з урахуванням намірів користувача (A_user)
        const assessment = RiskEngine.evaluate(
          heuristics,
          {
            action: 'submit',
            hasFilledSensitive: formState.hasFilledAnySensitive,
            isEntirelyEmpty: formState.isEntirelyEmpty,
          },
          contextBonus
        );

        if (activeContext) {
          assessment.contextActive = true;
        }

        console.log('[ThreatShield:Content] Динамічна оцінка форми перед відправкою:', {
          assessment,
          formState,
        });

        // Блокуємо ТІЛЬКИ якщо рівень загрози CRITICAL (або HIGH при наявності заповнених даних)
        // Якщо користувач навмисно очистив поля картки, assessment.level буде LOW/MEDIUM!
        if (assessment.level === 'CRITICAL' || (assessment.level === 'HIGH' && formState.hasFilledAnySensitive)) {
          event.preventDefault();
          event.stopPropagation();

          SecurityFriction.apply(form, assessment);

          chrome.runtime.sendMessage({
            type: 'THREAT_DETECTED',
            payload: {
              url: window.location.href,
              assessment,
            },
          });
        } else {
          console.log('[ThreatShield:Content] Сабміт дозволено: платіжні чи облікові дані не передаються.');
        }
      },
      true
    );

    // Моніторинг фокусу на чутливих полях
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (target && target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.type === 'password' || /(card|cvv|pin)/i.test(input.name || input.id)) {
          if (activeContext && !isWhitelisted(currentHost)) {
            console.warn('[ThreatShield:Content] Фокус на картковому полі у стані підвищеної підозри!');
            input.style.border = '2px solid #ea580c';
          }
        }
      }
    });
  },
});
