import { checkFormActionMismatch } from '../src/heuristics/form-action';
import {
  checkSensitiveAndHiddenInputs,
  passesLuhnCheck,
  getFormFilledState,
  checkOutboundChatLeakage,
} from '../src/heuristics/input-detector';
import { scanTextForLures } from '../src/heuristics/lure-detector';
import { isWhitelisted, isMonitoredPlatform } from '../src/core/whitelist';
import { isAccreditedPaymentGateway } from '../src/core/payment-gateways';
import { UserWhitelistManager } from '../src/core/user-whitelist';
import { RiskEngine } from '../src/core/risk-engine';
import { SecurityFriction } from '../src/ui/friction';
import { ActiveThreatContext, HeuristicResult } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    const currentHost = window.location.hostname.toLowerCase();
    console.log('[ThreatShield:Content] Ініціалізація на хості:', currentHost || 'local file');

    // 1. Ініціалізація кешу користувацького білого списку
    await UserWhitelistManager.init();

    let activeContext: ActiveThreatContext | null = null;

    // 2. Запит до Background Worker щодо наявності активного контексту (Tainted Context Window)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CONTEXT' });
      if (response && response.context) {
        activeContext = response.context;
        console.log('[ThreatShield:Content] Отримано активний контекст загрози:', activeContext);

        const isUserAllowed = UserWhitelistManager.isDomainAllowedSync(currentHost);
        if (!isWhitelisted(currentHost) && !isUserAllowed && currentHost !== activeContext.sourcePlatform) {
          SecurityFriction.showContextWarningBanner(activeContext);
        }
      }
    } catch {
      // Background worker ще завантажується
    }

    // 3. Детекція соцінженерії та виведення в месенджери на платформах комунікації
    const isPlatform = isMonitoredPlatform(currentHost) || window.location.protocol === 'file:';

    if (isPlatform) {
      // Кліки по сторонніх лінках (Off-Platform Lure)
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

      // Копіювання реквізитів/посилань
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

    // 4. Захист від передачі реквізитів картки у звичайному чаті платформи (Outbound Chat Leak Protection)
    const handleChatInput = (target: HTMLInputElement | HTMLTextAreaElement) => {
      const text = target.value || '';
      const leakage = checkOutboundChatLeakage(text);

      if (leakage.isLeaking) {
        target.style.outline = '3px solid #ef4444';
        target.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';

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

    // Блокування Enter у чаті при спробі відправити реквізити
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
              event.stopImmediatePropagation();
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

    // 5. ПОВНІСТЮ СИНХРОННЕ ПРОСЛУХОВУВАННЯ ТА ПЕРЕХОПЛЕННЯ САБМІТУ
    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement;
        if (!form || !(form instanceof HTMLFormElement)) {
          return;
        }

        // Якщо користувач вже свідомо розблокував цю форму — пропускаємо сабміт
        if (form.dataset.threatShieldApproved === 'true') {
          console.log('[ThreatShield:Content] Сабміт форми дозволено (усвідомлене розблокування користувачем).');
          delete form.dataset.threatShieldApproved;
          return;
        }

        const rawAction = form.getAttribute('action') || form.action;
        let targetHost = currentHost;
        try {
          if (rawAction && rawAction !== '#') {
            targetHost = new URL(rawAction, window.location.href).hostname.toLowerCase();
          }
        } catch {}

        // Синхронна перевірка білого списку користувача
        if (UserWhitelistManager.isDomainAllowedSync(targetHost)) {
          console.log(`[ThreatShield:Content] Домен ${targetHost} є в білому списку користувача. Дозволено.`);
          return;
        }

        // Синхронна перевірка акредитованого платіжного шлюзу
        if (isAccreditedPaymentGateway(targetHost)) {
          console.log(`[ThreatShield:Content] Акредитований платіжний шлюз (${targetHost}). Дозволено.`);
          return;
        }

        const heuristics: HeuristicResult[] = [];
        const formState = getFormFilledState(form);

        heuristics.push(checkFormActionMismatch(form));
        heuristics.push(...checkSensitiveAndHiddenInputs(form));

        if (formState.hasFilledCard) {
          heuristics.push({
            name: 'luhn_card_number_detected',
            triggered: true,
            severity: 'CRITICAL',
            scoreContribution: 40,
            message: 'У формі введено валідний номер банківської картки (алгоритм Луна)!',
          });
        }

        let contextBonus = 0;
        if (activeContext && !isWhitelisted(currentHost)) {
          contextBonus = 35;
          heuristics.push({
            name: 'tainted_context_window_active',
            triggered: true,
            severity: 'HIGH',
            scoreContribution: 35,
            message: `Зшивання розірваних сесій: перехід після підозрілої активності на ${activeContext.sourcePlatform}.`,
          });
        }

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

        console.log('[ThreatShield:Content] Синхронна оцінка сабміту форми:', {
          score: assessment.score,
          level: assessment.level,
          formState,
        });

        // НЕГАЙНЕ ТА СИНХРОННЕ ПРИПИНЕННЯ САБМІТУ
        if (assessment.level === 'CRITICAL' || (assessment.level === 'HIGH' && formState.hasFilledAnySensitive)) {
          // Блокуємо стандартну дію браузера та всі inline onsubmit обробники сторінки!
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Відображаємо модальне вікно Security Friction
          SecurityFriction.apply(form, assessment);

          // Сповіщення фонового воркера (асинхронно у фоні)
          chrome.runtime.sendMessage({
            type: 'THREAT_DETECTED',
            payload: {
              url: window.location.href,
              assessment,
            },
          });
        }
      },
      true // КРИТИЧНО: Capture фаза перехоплює подію першою до обробників сторінки
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
