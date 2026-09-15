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
 * XAI Engine (Explainable Artificial Intelligence)
 * Аналітичний рушій системи Adaptive Threat Shield.
 * Синтезує авторитетні та зрозумілі пояснення природи вебзагроз для кінцевого користувача
 * та декомпонує вектор ризику на математичні складові для аудиту системи.
 */
export class XaiEngine {
  /**
   * Головний метод генерації комплексного пояснення загрози
   */
  public static async generateExplanation(options: XaiEvaluationOptions): Promise<XaiExplanation> {
    // 1. Декомпозиція формули RiskScore = f(R_tech, C_env, A_user)
    const breakdown = this.calculateBreakdown(options);

    // 2. Реконструкція кроків ланцюга атаки
    const chain = this.reconstructAttackChain(options);

    // 3. Формування діагнозу та сценарію
    const { diagnosis, attackScenario } = this.determineScenario(options);

    // 4. Генерація розгорнутого пояснення: перевірка Chrome Built-in AI або синтез
    let plainLanguageExplanation = '';
    let engineType: 'chrome-builtin-ai' | 'adaptive-contextual-xai' = 'adaptive-contextual-xai';

    try {
      const chromeAiText = await this.tryChromePromptApi(options, diagnosis, breakdown);
      if (chromeAiText) {
        plainLanguageExplanation = chromeAiText;
        engineType = 'chrome-builtin-ai';
      }
    } catch {
      // Fallback на детерміністичний синтезатор
    }

    if (!plainLanguageExplanation) {
      plainLanguageExplanation = this.synthesizeExplanation(options);
    }

    // 5. Формування рекомендацій та порад
    const countermeasures = this.getCounters(options);
    const educationalTip = this.getEducationalTip(options);

    // 6. Формування лаконічного людиноорієнтованого контенту (Apple HIG style)
    const human = this.determineHumanContent(options);

    // Якщо Chrome Prompt AI або контекстний синтезатор сформували динамічне пояснення — оновлюємо humanCoreWarning
    if (plainLanguageExplanation) {
      human.humanCoreWarning = plainLanguageExplanation;
    }

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
      description: 'Аналіз структури форми, перевірка алгоритму Луна та ліцензії платіжного еквайрингу',
      details: techTriggers.length > 0 ? techTriggers : ['Форма містить стандартні поля без аномалій DOM'],
    };

    // C_env (Контекст середовища / Tainted Context Window)
    let envScore = 0;
    const envDetails: string[] = [];
    if (activeContext) {
      envScore = 35;
      const minutesAgo = Math.max(1, Math.round((Date.now() - activeContext.timestamp) / 60000));
      envDetails.push(`Активне вікно загрози: перехід із платформенного чату ${activeContext.sourcePlatform} (${minutesAgo} хв тому)`);
      if (activeContext.detectedKeywords.length > 0) {
        envDetails.push(`Ключові фрази приманки: "${activeContext.detectedKeywords.slice(0, 3).join(', ')}"`);
      }
    } else {
      envDetails.push('Міжсесійний контекст чистий: пряме відкриття вебсторінки');
    }
    const contextual: XaiRiskFactor = {
      name: 'C_env',
      label: 'Міжсесійний контекст (Tainted Context)',
      score: envScore,
      maxScore: 35,
      percentage: Math.min(100, Math.round((envScore / 35) * 100)),
      description: 'Зшивання розірваних сесій: виявлення переходу з перевіреного маркетплейсу на невідомий URL',
      details: envDetails,
    };

    // A_user (Дія та намір користувача)
    let actionScore = type === 'chat' ? 45 : 35;
    const actionDetails: string[] = [];
    if (type === 'chat') {
      actionDetails.push('Користувач ініціював надсилання повідомлення, що містить номер картки та/або CVV-код');
    } else {
      actionDetails.push('Користувач ініціював відправку заповненої платіжної форми з банківськими даними');
    }
    const userAction: XaiRiskFactor = {
      name: 'A_user',
      label: 'Намір дії користувача (User Action)',
      score: actionScore,
      maxScore: 45,
      percentage: Math.min(100, Math.round((actionScore / 45) * 100)),
      description: 'Оцінка потенційного збитку від виконання поточної дії користувача',
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
        description: `Спілкування на платформі ${options.targetHost || 'маркетплейсу'}`,
        sourceNode: options.targetHost || 'Чат',
        severity: 'LOW',
        timestamp: now - 30000,
        icon: '1',
      });
      steps.push({
        id: 'step-chat-2',
        stepNumber: 2,
        title: 'Введення платіжних реквізитів',
        description: 'У текстовому полі введено номер картки або секретний код безпеки',
        sourceNode: 'Поле вводу',
        severity: 'HIGH',
        timestamp: now - 5000,
        icon: '2',
        evidence: options.chatLeakage?.hasCvv ? 'Виявлено секретний CVV-код' : 'Виявлено номер банківської картки',
      });
      steps.push({
        id: 'step-chat-3',
        stepNumber: 3,
        title: 'Витік платіжних даних',
        description: 'Відправка повідомлення передасть конфіденційні реквізити співрозмовнику',
        sourceNode: 'Сервер чату',
        severity: 'CRITICAL',
        timestamp: now,
        icon: '3',
      });
      return steps;
    }

    if (options.activeContext) {
      steps.push({
        id: 'step-chain-1',
        stepNumber: 1,
        title: 'Соцінженерна приманка',
        description: `Спілкування на перевіреній платформі ${options.activeContext.sourcePlatform}`,
        sourceNode: options.activeContext.sourcePlatform,
        severity: 'MEDIUM',
        timestamp: options.activeContext.timestamp,
        icon: '1',
        evidence: options.activeContext.detectedKeywords.join(', '),
      });
      steps.push({
        id: 'step-chain-2',
        stepNumber: 2,
        title: 'Перехід за зовнішнім посиланням',
        description: `Вихід за межі захищеної платформи на сторонній вузол ${options.targetHost}`,
        sourceNode: options.targetHost,
        severity: 'HIGH',
        timestamp: now - 10000,
        icon: '2',
      });
      steps.push({
        id: 'step-chain-3',
        stepNumber: 3,
        title: 'Неліцензована платіжна форма',
        description: 'Спроба передачі реквізитів картки серверу без банківської сертифікації',
        sourceNode: 'Платіжна форма',
        severity: 'CRITICAL',
        timestamp: now,
        icon: '3',
        evidence: 'Номер картки верифіковано алгоритмом Луна',
      });
      return steps;
    }

    steps.push({
      id: 'step-direct-1',
      stepNumber: 1,
      title: 'Недовірений домен',
      description: `Вебсайт ${options.targetHost} не зареєстрований як офіційний платіжний провайдер`,
      sourceNode: options.targetHost,
      severity: 'MEDIUM',
      timestamp: now - 15000,
      icon: '1',
    });
    steps.push({
      id: 'step-direct-2',
      stepNumber: 2,
      title: 'Збір реквізитів',
      description: 'Спроба відправки повних реквізитів банківської картки на сторонній сервер',
      sourceNode: 'Платіжна форма',
      severity: 'CRITICAL',
      timestamp: now,
      icon: '2',
      evidence: 'Відсутній акредитований банківський шлюз',
    });

    return steps;
  }

  /**
   * Визначення назви сценарію та діагнозу
   */
  private static determineScenario(options: XaiEvaluationOptions): { diagnosis: string; attackScenario: string } {
    if (options.type === 'chat') {
      return {
        diagnosis: 'Спроба передачі конфіденційних банківських реквізитів у відкритому чаті',
        attackScenario: 'Direct Card Credential Leakage',
      };
    }

    if (options.activeContext) {
      return {
        diagnosis: `Міжсесійний фішинг під виглядом доставки (${options.activeContext.sourcePlatform} → ${options.targetHost})`,
        attackScenario: 'Cross-Session Marketplace Delivery Scam',
      };
    }

    return {
      diagnosis: `Несанкціонований збір банківських реквізитів на недовіреному сервері ${options.targetHost}`,
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

      const lureContext = options.activeContext
        ? `Користувач перейшов із платформи ${options.activeContext.sourcePlatform}, де в чаті було зафіксовано приманку: "${options.activeContext.detectedKeywords.join(', ')}".`
        : 'Прямий візит на вебсторінку.';

      const triggersList = options.assessment.triggers.map((t) => t.message).join('; ');

      const prompt = `
Виявлена загроза кібербезпеки:
- Сценарій: ${diagnosis}
- Рівень загрози: ${options.assessment.level} (${options.assessment.score}/100)
- Домен форми/дії: ${options.targetHost}
- Контекст сесії: ${lureContext}
- Виявлені симптоми: ${triggersList}
${options.chatLeakage?.hasCvv ? '- Небезпека: спроба передачі захисного коду CVV у чаті.' : ''}

Завдання:
Сформулюй для користувача зрозуміле пояснення загрози (2-3 спокійні речення) українською мовою у стилі Apple. Поясни, чому це призведе до крадіжки коштів і чому не можна продовжувати. Без емодзі.
      `.trim();

      const aiPromise = (async () => {
        const session = await factory.create({
          systemPrompt:
            'Ви — інтелектуальний асистент безпеки в стилі Apple. Пояснюйте суть загрози авторитетно, стисло, спокійно та українською мовою без емодзі.',
        });
        const resp = await session.prompt(prompt);
        session.destroy?.();
        return resp && resp.trim().length > 15 ? resp.trim() : null;
      })();

      // Запобігаємо зависанню інтерфейсу: жорсткий таймаут 1200 мс на відповідь LLM
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200));

      return await Promise.race([aiPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  /**
   * Адаптивний контекстний синтезатор (Primary / High-Reliability XAI)
   */
  private static synthesizeExplanation(options: XaiEvaluationOptions): string {
    if (options.type === 'chat') {
      if (options.chatLeakage?.hasCvv) {
        return (
          'У тексті повідомлення виявлено секретний CVV-код картки. ' +
          'Для переказу чи отримання коштів іншій стороні ніколи не потрібен захисний код зі звороту картки. ' +
          'Його відправка відкриє стороннім доступ до списання всіх ваших заощаджень.'
        );
      }
      return (
        'У тексті повідомлення виявлено реквізити банківської картки. ' +
        'Для переказу чи отримання коштів іншій особі достатньо лише 16-значного номера картки або IBAN. ' +
        'Ніколи не надсилайте термін дії або коди безпеки у відкритому діалозі.'
      );
    }

    if (options.activeContext) {
      const kw =
        options.activeContext.detectedKeywords.length > 0
          ? ` (виявлено маніпулятивні маркери: «${options.activeContext.detectedKeywords.slice(0, 2).join(', ')}»)`
          : '';
      return (
        `Цей сайт імітує сторінку сервісу після переходу з чату ${options.activeContext.sourcePlatform}${kw}. ` +
        `Форма запитує платіжні реквізити та секретний код безпеки CVV. ` +
        `Офіційні сервіси доставки ніколи не вимагають введення CVV для зарахування коштів — заповнення призведе до списання грошей з вашого рахунку.`
      );
    }

    return (
      `Вебсайт ${options.targetHost} запитує реквізити банківської картки, але не використовує акредитований банківський шлюз ` +
      `(LiqPay, Portmone, Stripe). Форма передає дані на неліцензований сторонній сервер, що створює пряму загрозу втрати грошей.`
    );
  }

  /**
   * Контрзаходи (Countermeasures)
   */
  private static getCounters(options: XaiEvaluationOptions): string[] {
    if (options.type === 'chat') {
      return [
        'Видаліть CVV-код та термін дії картки з тексту повідомлення.',
        'Для отримання коштів іншій особі достатньо надати лише номер картки або IBAN.',
        'Ніколи не повідомляйте одноразові коди підтвердження з SMS або банківських додатків.',
      ];
    }

    if (options.activeContext) {
      return [
        `Залиште сторінку ${options.targetHost} та поверніться до додатку ${options.activeContext.sourcePlatform}.`,
        'Здійснюйте доставку та оплату виключно через офіційний функціонал платформи.',
        'Пам\'ятайте: для зарахування коштів за товар банк ніколи не вимагає вводити CVV чи паролі.',
      ];
    }

    return [
      `Не надсилайте платіжні реквізити серверу ${options.targetHost}.`,
      'Здійснюйте оплату лише на сайтах із підключеними сертифікованими шлюзами банків.',
      'Перевіряйте правильність написання адреси сайту в рядку браузера.',
    ];
  }

  /**
   * Освітня порада
   */
  private static getEducationalTip(options: XaiEvaluationOptions): string {
    if (options.type === 'chat') {
      return 'Код CVV на звороті картки призначений виключно для авторизації списання коштів власником. Жоден покупець не потребує його для здійснення переказу.';
    }

    return 'Акредитовані платіжні шлюзи (LiqPay, Stripe, Portmone) завжди працюють на виділених доменах банків із сертифікатами PCI DSS і ніколи не використовують сторонні сторінки.';
  }

  /**
   * Лаконічний контент у стилі Apple Human Interface Guidelines (без емодзі)
   */
  private static determineHumanContent(options: XaiEvaluationOptions): {
    humanTitle: string;
    humanSubtitle: string;
    humanCoreWarning: string;
    humanChecklist: { good: string[]; bad: string[] };
  } {
    if (options.type === 'chat') {
      return {
        humanTitle: 'Витік платіжних реквізитів',
        humanSubtitle: 'У тексті повідомлення виявлено конфіденційні банківські дані.',
        humanCoreWarning:
          'Ви намагаєтеся надіслати секретний код безпеки CVV або термін дії картки. ' +
          'Для отримання оплати іншій людині потрібен лише 16-значний номер картки. ' +
          'Передача коду зі звороту картки дозволяє співрозмовнику безперешкодно списати всі кошти з вашого рахунку.',
        humanChecklist: {
          good: [
            'Для переказу достатньо лише 16 цифр картки або номера IBAN',
            'Спілкуйтеся виключно через офіційні канали платформи',
          ],
          bad: [
            'Передавати тризначний код CVV на звороті картки',
            'Повідомляти термін дії або одноразові коди з SMS',
          ],
        },
      };
    }

    if (options.activeContext) {
      return {
        humanTitle: 'Підозріла платіжна форма',
        humanSubtitle: 'Спроба несанкціонованого списання коштів через сторонній сайт.',
        humanCoreWarning:
          `Цей вебсайт імітує сторінку оплати після переходу з чату ${options.activeContext.sourcePlatform}. ` +
          'Форма запитує секретний код безпеки CVV. Для отримання грошей за товар цей код ніколи не потрібен — ' +
          'його введення призведе до списання коштів сторонніми особами.',
        humanChecklist: {
          good: [
            'Для зарахування оплати потрібен виключно номер картки',
            'Оформлюйте замовлення лише в офіційному додатку платформи',
          ],
          bad: [
            'Вводити код CVV (три цифри на звороті) для «отримання» оплати',
            'Переходити за платіжними посиланнями у сторонніх месенджерах',
          ],
        },
      };
    }

    return {
      humanTitle: 'Неліцензована форма оплати',
      humanSubtitle: 'Вебсайт не підключений до сертифікованого банківського шлюзу.',
      humanCoreWarning:
        'Цей сайт намагається отримати реквізити вашої банківської картки напряму, без використання офіційного еквайрингу ' +
        '(LiqPay, Portmone, Stripe). Відправка даних на неперевірений сервер загрожує втратою грошей.',
      humanChecklist: {
        good: [
          'Здійснювати оплату через офіційні банківські сервіси',
          'Перевіряти доменне ім’я сайту перед введенням реквізитів',
        ],
        bad: [
          'Вводити реквізити картки на сторонніх невідомих сторінках',
          'Ігнорувати попередження системи безпеки браузера',
        ],
      },
    };
  }
}
