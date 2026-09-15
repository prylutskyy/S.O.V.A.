import { checkFormActionMismatch } from '../src/heuristics/form-action';
import { checkSensitiveAndHiddenInputs, passesLuhnCheck } from '../src/heuristics/input-detector';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { HeuristicResult } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[ThreatShield] Content Script активовано на сторінці:', window.location.href);

    // 1. Прослуховування події submit на рівні документа (делегування)
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

        // Розрахунок Risk Score
        const assessment = RiskEngine.evaluate(heuristics, 'submit');

        console.log('[ThreatShield] Оцінка форми перед відправленням:', assessment);

        // Якщо рівень ризику високий або критичний — блокуємо сабміт та застосовуємо тертя
        if (assessment.level === 'HIGH' || assessment.level === 'CRITICAL') {
          event.preventDefault();
          event.stopPropagation();

          SecurityFriction.apply(form, assessment);

          // Сповіщення фонового воркера про виявлену спробу крадіжки даних
          chrome.runtime.sendMessage({
            type: 'THREAT_DETECTED',
            payload: {
              url: window.location.href,
              assessment,
            },
          });
        }
      },
      true // Capture фаза для гарантованого перехоплення перед скриптами сторінки
    );

    // 2. Прослуховування подій focus та paste для раннього моніторингу
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (target && target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.type === 'password' || /(card|cvv|pin)/i.test(input.name || input.id)) {
          console.log('[ThreatShield] Зафіксовано фокус на чутливому полі:', input.name || input.id);
        }
      }
    });

    document.addEventListener('paste', (event) => {
      const target = event.target as HTMLElement;
      if (target && target.tagName === 'INPUT') {
        console.log('[ThreatShield] Зафіксовано подію paste у поле вводу');
      }
    });
  },
});
