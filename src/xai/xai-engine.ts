import { ActiveThreatContext, ThreatAssessment } from '../types';
import { AttackChainStep, XaiExplanation, XaiRiskBreakdown, XaiRiskFactor } from '../types/xai';

export interface XaiEvaluationOptions {
  type: 'form' | 'chat';
  targetHost: string;
  activeContext?: ActiveThreatContext | null;
  assessment: ThreatAssessment;
  chatLeakage?: { hasCard: boolean; hasCvv: boolean };
}

/**
 * XAI Engine (Explainable AI)
 * Інтелектуальний інтерфейс пояснення природи вебзагроз, ланцюга атаки та рекомендацій користувачу.
 * Підтримує Chrome Built-in AI (Prompt API / Gemini Nano) та адаптивний контекстний синтезатор.
 */
export class XaiEngine {
  /**
   * Головний метод генерації комплексного пояснення загрози
   */
  public static async generateExplanation(options: XaiEvaluationOptions): Promise<XaiExplanation> {
    // 1. Декомпозиція формули RiskScore = f(R_tech, C_env, A_user)
    const breakdown = this.calculateBreakdown(options);

    // 2. Реконструкція кроків ланцюга атаки (Attack Chain Reconstruction)
    const chain = this.reconstructAttackChain(options);

    // 3. Формування діагнозу та сценарію
    const { diagnosis, attackScenario } = this.determineScenario(options);

    // 4. Генерація зрозумілого тексту: перевірка Chrome Built-in AI або контекстний синтез
    let plainLanguageExplanation = '';
    let engineType: 'chrome-builtin-ai' | 'adaptive-contextual-xai' = 'adaptive-contextual-xai';

    try {
      const chromeAiText = await this.tryChromePromptApi(options, diagnosis, breakdown);
      if (chromeAiText) {
        plainLanguageExplanation = chromeAiText;
        engineType = 'chrome-builtin-ai';
      }
    } catch {
      // Fallback на адаптивний синтезатор
    }

    if (!plainLanguageExplanation) {
      plainLanguageExplanation = this.synthesizeExplanation(options, diagnosis, attackScenario);
    }

    // 5. Формування контрзаходів та освітньої поради
    const countermeasures = this.getCounters(options);
    const educationalTip = this.getEducationalTip(options);

    // 6. Формування людиноорієнтованого контенту для нетехнічних користувачів
    const human = this.determineHumanContent(options);

    const summary =
      options.type === 'chat'
        ? 'Спроба відкритої передачі банківських реквізитів у чаті'
        : `Блокування підозрілої форми на домені ${options.targetHost}`;

    return {
      summary,
      humanTitle: human.humanTitle,
      humanSubtitle: human.humanSubtitle,
      humanCoreWarning: human.humanCoreWarning,
      humanChecklist: human.humanChecklist,
      riskLevel: options.assessment.level,
      totalScore: options.assessment.score,
      diagnosis,
      attackScenario,
      chain,
      breakdown,
      plainLanguageExplanation,
      countermeasures,
      educationalTip,
      engineType,
    };
  }

  /**
   * Розрахунок внеску факторів формули: R_tech, C_env, A_user
   */
  private static calculateBreakdown(options: XaiEvaluationOptions): XaiRiskBreakdown {
    const { assessment, activeContext, type } = options;

    // R_tech (Технічні евристики: Luhn, невідповідність action, приховані поля)
    let techScore = 0;
    const techTriggers: string[] = [];
    assessment.triggers.forEach((t) => {
      if (t.name !== 'tainted_context_window_active') {
        techScore += t.scoreContribution;
        techTriggers.push(t.message);
      }
    });
    const technical: XaiRiskFactor = {
      name: 'R_tech',
      label: 'Технічні евристики форми',
      score: techScore,
      maxScore: 60,
      percentage: Math.min(100, Math.round((techScore / 60) * 100)),
      description: 'Аналіз DOM форми, алгоритм валідації номерів карток Луна та цільового сервера',
      details: techTriggers.length > 0 ? techTriggers : ['Стандартна структура форми без аномалій DOM'],
    };

    // C_env (Контекст середовища / Tainted Context Window)
    let envScore = 0;
    const envDetails: string[] = [];
    if (activeContext) {
      envScore = 35;
      const minutesAgo = Math.max(1, Math.round((Date.now() - activeContext.timestamp) / 60000));
      envDetails.push(`Активне вікно загрози: перехід із платформи ${activeContext.sourcePlatform} (${minutesAgo} хв тому)`);
      if (activeContext.detectedKeywords.length > 0) {
        envDetails.push(`Виявлені ключові фрази приманки: "${activeContext.detectedKeywords.slice(0, 3).join(', ')}"`);
      }
    } else {
      envDetails.push('Міжсесійний контекст чистий (пряме відкриття сторінки)');
    }
    const contextual: XaiRiskFactor = {
      name: 'C_env',
      label: 'Контекст навігації (Tainted Context)',
      score: envScore,
      maxScore: 35,
      percentage: Math.min(100, Math.round((envScore / 35) * 100)),
      description: 'Зшивання розірваних сесій: аналіз історії переходів між захищеними платформами та сторонніми URL',
      details: envDetails,
    };

    // A_user (Дія та намір користувача)
    let actionScore = type === 'chat' ? 45 : 35;
    const actionDetails: string[] = [];
    if (type === 'chat') {
      actionDetails.push('Користувач намагається надіслати повідомлення, що містить номер картки та/або CVV');
    } else {
      actionDetails.push('Користувач ініціював відправку (submit) заповненої платіжної форми');
    }
    const userAction: XaiRiskFactor = {
      name: 'A_user',
      label: 'Дія користувача (User Action)',
      score: actionScore,
      maxScore: 45,
      percentage: Math.min(100, Math.round((actionScore / 45) * 100)),
      description: 'Оцінка чутливості операції, яку виконує користувач (введення/відправка карткових даних)',
      details: actionDetails,
    };

    const formula = `RiskScore = f(R_tech=${techScore}, C_env=${envScore}, A_user=${actionScore}) = ${assessment.score}/100`;

    return {
      technical,
      contextual,
      userAction,
      totalScore: assessment.score,
      formula,
    };
  }

  /**
   * Реконструкція кроків ланцюга атаки
   */
  private static reconstructAttackChain(options: XaiEvaluationOptions): AttackChainStep[] {
    const steps: AttackChainStep[] = [];
    const now = Date.now();

    if (options.type === 'chat') {
      steps.push({
        id: 'step-chat-1',
        stepNumber: 1,
        title: 'Діалог у чаті',
        description: `Користувач веде розмову на ${options.targetHost || 'платформі'}`,
        sourceNode: options.targetHost || 'Чат',
        severity: 'LOW',
        timestamp: now - 30000,
        icon: '💬',
      });
      steps.push({
        id: 'step-chat-2',
        stepNumber: 2,
        title: 'Ввід платіжних даних',
        description: 'У текстовому полі набрано номер картки або секретний тризначний код безпеки',
        sourceNode: 'Поле вводу',
        severity: 'HIGH',
        timestamp: now - 5000,
        icon: '⚠️',
        evidence: options.chatLeakage?.hasCvv ? 'Виявлено CVV/CVC код' : 'Виявлено номер картки',
      });
      steps.push({
        id: 'step-chat-3',
        stepNumber: 3,
        title: 'Загроза витоку коштів',
        description: 'Відправка повідомлення передасть повні реквізити співрозмовнику у відкритому вигляді',
        sourceNode: 'Сервер чату',
        severity: 'CRITICAL',
        timestamp: now,
        icon: '🚨',
      });
      return steps;
    }

    // Сценарій форми з активним контекстом (Cross-session Phishing)
    if (options.activeContext) {
      steps.push({
        id: 'step-chain-1',
        stepNumber: 1,
        title: 'Соцінженерна приманка',
        description: `Спілкування на довіреній платформі ${options.activeContext.sourcePlatform}`,
        sourceNode: options.activeContext.sourcePlatform,
        severity: 'MEDIUM',
        timestamp: options.activeContext.timestamp,
        icon: '💬',
        evidence: options.activeContext.detectedKeywords.join(', '),
      });
      steps.push({
        id: 'step-chain-2',
        stepNumber: 2,
        title: 'Перехід за посиланням',
        description: `Вихід за межі захищеного маркетплейсу на сторонній сервер ${options.targetHost}`,
        sourceNode: options.targetHost,
        severity: 'HIGH',
        timestamp: now - 10000,
        icon: '🔗',
      });
      steps.push({
        id: 'step-chain-3',
        stepNumber: 3,
        title: 'Фішингова форма оплати',
        description: 'Спроба передачі реквізитів банківської картки серверу без банківської акредитації',
        sourceNode: 'Фішингова форма',
        severity: 'CRITICAL',
        timestamp: now,
        icon: '💳',
        evidence: 'Номер картки підтверджено алгоритмом Луна',
      });
      return steps;
    }

    // Сценарій форми без попереднього контексту (прямий перехід / відкриття)
    steps.push({
      id: 'step-direct-1',
      stepNumber: 1,
      title: 'Недовірений домен',
      description: `Вебсторінка на домені ${options.targetHost} не є офіційним платіжним еквайрингом`,
      sourceNode: options.targetHost,
      severity: 'MEDIUM',
      timestamp: now - 15000,
      icon: '🌐',
    });
    steps.push({
      id: 'step-direct-2',
      stepNumber: 2,
      title: 'Передача даних',
      description: 'Спроба сабміту форми з реквізитами банківської картки',
      sourceNode: 'Форма оплати',
      severity: 'CRITICAL',
      timestamp: now,
      icon: '🚨',
      evidence: 'Форма не захищена банківським шлюзом',
    });

    return steps;
  }

  /**
   * Визначення назви сценарію та діагнозу
   */
  private static determineScenario(options: XaiEvaluationOptions): { diagnosis: string; attackScenario: string } {
    if (options.type === 'chat') {
      return {
        diagnosis: 'Небезпечний витік платіжних реквізитів у відкритому чаті',
        attackScenario: 'Пряма передача банківських реквізитів (Direct Card Credential Leakage)',
      };
    }

    if (options.activeContext) {
      return {
        diagnosis: `Міжсесійний фішинг типу "Псевдодоставка" (зшивання контексту ${options.activeContext.sourcePlatform} → ${options.targetHost})`,
        attackScenario: 'Cross-Session Marketplace Delivery Scam',
      };
    }

    return {
      diagnosis: `Несанкціонований збір банківських реквізитів на недовіреному сайті ${options.targetHost}`,
      attackScenario: 'Unauthorized Payment Gateway Harvest',
    };
  }

  /**
   * Спроба використати Chrome Built-in AI (Prompt API / Gemini Nano)
   */
  private static async tryChromePromptApi(
    options: XaiEvaluationOptions,
    diagnosis: string,
    breakdown: XaiRiskBreakdown
  ): Promise<string | null> {
    try {
      const win = window as any;
      const ai = win.ai || win.model || (navigator as any).ai;
      if (!ai || (!ai.languageModel && !ai.assistant)) {
        return null;
      }

      const factory = ai.languageModel || ai.assistant;
      const capabilities = await factory.capabilities?.();
      if (capabilities && capabilities.available === 'no') {
        return null;
      }

      const session = await factory.create({
        systemPrompt:
          'Ви — експерт з кібербезпеки в браузерному розширенні Adaptive Threat Shield. Поясніть користувачеві виявлену вебзагрозу коротко, переконливо та простою мовою (до 3 речень) українською мовою. Опишіть, у чому ризик і чому не варто продовжувати.',
      });

      const prompt = `
        Загроза: ${diagnosis}
        Рівень ризику: ${options.assessment.level} (${options.assessment.score}/100)
        Домен: ${options.targetHost}
        Фактори ризику: R_tech=${breakdown.technical.score}, C_env=${breakdown.contextual.score}, A_user=${breakdown.userAction.score}.
        Коротко поясни небезпеку для користувача.
      `;

      const response = await session.prompt(prompt);
      session.destroy?.();
      return response && response.trim().length > 10 ? response.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Адаптивний контекстний синтезатор (Primary / High-Reliability XAI)
   */
  private static synthesizeExplanation(
    options: XaiEvaluationOptions,
    diagnosis: string,
    attackScenario: string
  ): string {
    if (options.type === 'chat') {
      return (
        '⚠️ У тексті вашого повідомлення виявлено повні платіжні реквізити (номер картки та/або CVV-код). ' +
        'У публічних чатах та діалогах маркетплейсів інша сторона ніколи не потребує ваш тризначний CVV-код або термін дії картки. ' +
        'Відправка цих даних у відкритий канал дозволяє зловмиснику здійснити миттєве несанкціоноване списання коштів із вашого банківського рахунку.'
      );
    }

    if (options.activeContext) {
      return (
        `🛡️ Система зафіксувала шахрайський ланцюг: спочатку на захищеній платформі (${options.activeContext.sourcePlatform}) ` +
        `вам запропонували перейти за стороннім посиланням (приманка: "${options.activeContext.detectedKeywords[0] || 'безпечна угода'}"). ` +
        `Зараз ви намагаєтесь ввести дані банківської картки на сервері ${options.targetHost}, який не має відношення до офіційних сервісів доставки чи акредитованого еквайрингу. ` +
        `Це типова схема викрадення грошей під виглядом "отримання оплати за товар".`
      );
    }

    return (
      `🛡️ Вебсервер ${options.targetHost} запитує конфіденційні банківські дані, але не є верифікованим платіжним шлюзом ` +
      `(LiqPay, Portmone, Stripe, WayForPay). Форма передає реквізити вашої картки напряму власнику сайту. ` +
      `Це створює критичний ризик крадіжки коштів або продажу ваших платіжних даних у тіньовому інтернеті.`
    );
  }

  /**
   * Рекомендації та заходи безпеки (Countermeasures)
   */
  private static getCounters(options: XaiEvaluationOptions): string[] {
    if (options.type === 'chat') {
      return [
        'Видаліть CVV/CVC код та термін дії з тексту повідомлення перед відправкою.',
        'Для безпечного отримання грошового переказу достатньо надати лише 16 цифр картки або IBAN.',
        'Ніколи не диктуйте та не пересилайте одноразові коди підтвердження з банківських SMS/Push.',
      ];
    }

    if (options.activeContext) {
      return [
        `Негайно закрийте сторінку ${options.targetHost} та поверніться до чату ${options.activeContext.sourcePlatform}.`,
        'Здійснюйте доставку та оплату виключно через вбудований функціонал офіційного застосунку платформи.',
        'Пам\'ятайте: для отримання коштів за проданий товар банк ніколи не вимагає вводити баланс, термін дії чи CVV картки.',
      ];
    }

    return [
      `Не заповнюйте форму та не надсилайте дані на сторонній сервер ${options.targetHost}.`,
      'Перевірте адресу сайту в рядку браузера — фішингові ресурси часто змінюють одну або дві літери в домені.',
      'Використовуйте лише офіційні сайти з наявністю ліцензованих платіжних шлюзів.',
    ];
  }

  /**
   * Освітня порада
   */
  private static getEducationalTip(options: XaiEvaluationOptions): string {
    if (options.type === 'chat') {
      return '💡 Порада XAI: CVV-код на звороті картки — це аналог електронного підпису. Той, хто знає номер картки + CVV, може оплачувати товари в інтернеті від вашого імені без додаткового дозволу.';
    }

    return '💡 Порада XAI: Реальні поштові та фінансові сервіси ніколи не перенаправляють на сторонні домени сумнівної реєстрації. Усі платежі мають проходити через акредитовані шлюзи банків України (НБУ).';
  }

  /**
   * Спрощений контент простою людською мовою (Human-Centric XAI) для кінцевих користувачів
   */
  private static determineHumanContent(options: XaiEvaluationOptions): {
    humanTitle: string;
    humanSubtitle: string;
    humanCoreWarning: string;
    humanChecklist: { good: string[]; bad: string[] };
  } {
    if (options.type === 'chat') {
      return {
        humanTitle: '⛔ СТОП! Не надсилайте це повідомлення',
        humanSubtitle: 'У тексті повідомлення знайдено секретні реквізити вашої банківської картки.',
        humanCoreWarning:
          'Для отримання грошей на картку іншій людині потрібен ТІЛЬКИ її 16-значний номер. Якщо надіслати тризначний секретний CVV-код на звороті або термін дії — з вашої картки вкрадуть усі кошти!',
        humanChecklist: {
          good: [
            'Повідомляти лише 16 цифр картки або IBAN рахунок',
            'Спілкуватися виключно в офіційному чаті маркетплейсу',
          ],
          bad: [
            'Писати CVV/CVC код (3 цифри на звороті картки)',
            'Повідомляти термін дії або PIN-код',
            'Передавати одноразові коди з SMS від банку',
          ],
        },
      };
    }

    if (options.activeContext) {
      return {
        humanTitle: '🛑 СТОП! Небезпека крадіжки грошей',
        humanSubtitle: 'Це шахрайський сайт-підробка, що імітує службу доставки чи оплати.',
        humanCoreWarning:
          'Вам надіслали посилання в чаті під виглядом «безпечної угоди» або «отримання оплати». Насправді цей сайт не належить жодній пошті чи банку. Якщо ви введете реквізити своєї картки — з неї спишуть усі збереження!',
        humanChecklist: {
          good: [
            'Пам’ятайте: щоб скинути вам кошти, покупцю потрібен ЛИШЕ номер картки',
            'Оформлювати доставку та оплату виключно у додатку OLX / Prom / Нової Пошти',
          ],
          bad: [
            'Вводити три секретні цифри CVV на звороті',
            'Вводити паролі або залишок на картці',
            'Переходити за посиланнями, надісланими у сторонніх месенджерах (Viber, WhatsApp)',
          ],
        },
      };
    }

    return {
      humanTitle: '🛑 СТОП! Небезпечна форма оплати',
      humanSubtitle: 'Цей сайт не має офіційного банківського захисту для прийому карткових платежів.',
      humanCoreWarning:
        'Форма намагається зберегти реквізити вашої банківської картки на сторонній підозрілий сервер без перевіреного шлюзу (LiqPay, Portmone, Stripe). Передача даних призведе до втрати грошей!',
      humanChecklist: {
        good: [
          'Платити лише через ліцензовані платіжні шлюзи з логотипом банку',
          'Перевіряти точну адресу сайту вгорі браузера перед вводом картки',
        ],
        bad: [
          'Вводити банківські реквізити на незнайомих сайтах',
          'Ігнорувати попередження системи безпеки',
        ],
      },
    };
  }
}

