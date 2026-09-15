import { checkFormActionMismatch } from '../src/heuristics/form-action';
import { checkSensitiveAndHiddenInputs, passesLuhnCheck } from '../src/heuristics/input-detector';
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
      // Сканування кліків по сторонніх лінках (Off-Platform Lure)
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

      // Сканування події копіювання (Clipboard correlation)
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

    // 3. Прослуховування подій форм (submit, focus, paste)
    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement;
        if (!form || !(form instanceof HTMLFormElement)) {
          return;
        }

        const heuristics: HeuristicResult[] = [];

        // Евристика 1: Розбіжність form.action
        heuristics.push(checkFormActionMismatch(form));

        // Евристика 2: Приховані чутливі інпути (Autofill Phishing)
        heuristics.push(...checkSensitiveAndHiddenInputs(form));

        // Евристика 3: Перевірка введених даних на банківську картку (алгоритм Луна)
        const inputs = form.querySelectorAll<HTMLInputElement>('input');
        inputs.forEach((input) => {
          if (input.value && passesLuhnCheck(input.value)) {
            heuristics.push({
              name: 'luhn_card_number_detected',
              triggered: true,
              severity: 'CRITICAL',
              scoreContribution: 40,
              message: 'У формі виявлено валідний номер банківської картки (алгоритм Луна)!',
            });
          }
        });

        // Додавання фактора контексту розірваної сесії
        let contextBonus = 0;
        if (activeContext && !isWhitelisted(currentHost)) {
          contextBonus = 40;
          heuristics.push({
            name: 'tainted_context_window_active',
            triggered: true,
            severity: 'HIGH',
            scoreContribution: 40,
            message: `Зшивання розірваних сесій: перехід здійснено після підозрілої активності на ${activeContext.sourcePlatform} (тригери: ${activeContext.detectedKeywords.join(', ')}).`,
          });
        }

        // Розрахунок інтегрального Risk Score
        const assessment = RiskEngine.evaluate(heuristics, 'submit', contextBonus);
        if (activeContext) {
          assessment.contextActive = true;
        }

        console.log('[ThreatShield:Content] Оцінка загрози форми:', assessment);

        // Застосування Security Friction
        if (assessment.level === 'HIGH' || assessment.level === 'CRITICAL') {
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
