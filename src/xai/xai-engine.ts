import { ActiveThreatContext, ThreatAssessment } from '../types';
import { AttackChainStep, XaiExplanation, XaiRiskBreakdown, XaiRiskFactor } from '../types/xai';
import { VaultItem } from '../types/vault';

export interface XaiEvaluationOptions {
  type: 'form' | 'chat';
  targetHost: string;
  activeContext?: ActiveThreatContext | null;
  assessment: ThreatAssessment;
  chatLeakage?: { hasCard: boolean; hasCvv: boolean };
  detectedAmount?: string;
  vaultItems?: VaultItem[];
}

export interface ScenarioDetails {
  diagnosis: string;
  attackScenario: string;
  attackCategory: 'AUTOFILL_TRAP' | 'DELIVERY_SCAM' | 'UNTRUSTED_GATEWAY' | 'CHAT_LEAK' | 'IDENTITY_HARVESTING';
  userIntendedAction: string;
  threatReality: string;
  financialRisk: string;
  exposedAssets: string[];
  shortAttackName: string;
}

/**
 * XAI Engine (Explainable Artificial Intelligence)
 * Аналітичний рушій системи Adaptive Threat Shield.
 * Синтезує авторитетні та зрозумілі пояснення природи вебзагроз для кінцевого користувача
 * за формулою контрасту (очікування vs реальність) та формує декомпозицію ризику.
 */
export class XaiEngine {
  /**
   * Головний метод генерації комплексного пояснення загрози
   */
  public static async generateExplanation(options: XaiEvaluationOptions): Promise<XaiExplanation> {
    // 1. Декомпозиція формули RiskScore = f(R_tech, C_env, A_user)
    const breakdown = this.calculateBreakdown(options);

    // 2. Визначення точного сценарію загрози, матеріальних ризиків (гроші + дані)
    const scenario = this.determineScenario(options);

    // 3. Реконструкція кроків ланцюга атаки
    const chain = this.reconstructAttackChain(options, scenario);

    // 4. Генерація розгорнутого людиноорієнтованого пояснення через Chrome Built-in AI (Prompt API / Gemini Nano)
    let plainLanguageExplanation = '';
    let engineType: 'chrome-builtin-ai' | 'adaptive-contextual-xai' = 'adaptive-contextual-xai';

    try {
      const chromeAiText = await this.tryChromePromptApi(options, scenario);
      if (chromeAiText) {
        plainLanguageExplanation = chromeAiText;
        engineType = 'chrome-builtin-ai';
      }
    } catch {
      // Fallback на детерміністичний синтезатор
    }

    if (!plainLanguageExplanation) {
      plainLanguageExplanation = this.synthesizeExplanation(options, scenario);
    }

    // 5. Формування рекомендацій та порад
    const countermeasures = this.getCounters(options, scenario);
    const educationalTip = this.getEducationalTip(scenario);

    // 6. Формування лаконічного контенту у стилі Apple HIG
    const human = this.determineHumanContent(options, scenario);

    if (plainLanguageExplanation) {
      human.humanCoreWarning = plainLanguageExplanation;
    }

    const summary =
      options.type === 'chat'
        ? 'Спроба відкритої передачі банківських реквізитів у чаті'
        : `Блокування загрози "${scenario.shortAttackName}" на домені ${options.targetHost}`;

    return {
      summary,
      humanTitle: human.humanTitle,
      humanSubtitle: human.humanSubtitle,
      humanCoreWarning: human.humanCoreWarning,
      humanChecklist: human.humanChecklist,
      riskLevel: options.assessment.level,
      totalScore: options.assessment.score,
      diagnosis: scenario.diagnosis,
      attackScenario: scenario.attackScenario,
      chain,
      breakdown,
      plainLanguageExplanation,
      countermeasures,
      educationalTip,
      engineType,
    };
  }

  /**
   * Сканування DOM для визначення фінансової суми операції
   */
  public static extractFinancialAmount(container?: HTMLElement | null): string {
    try {
      if (container) {
        const amountInputs = container.querySelectorAll<HTMLInputElement>(
          'input[name*="amount" i], input[name*="sum" i], input[name*="price" i], input[id*="amount" i]'
        );
        for (const input of amountInputs) {
          const val = parseFloat(input.value);
          if (!isNaN(val) && val > 0) {
            return `${val.toLocaleString('uk-UA')} грн`;
          }
        }
      }

      const scope =
        container?.closest('.reddit-post, .chat-msg, form, article, main') ||
        container ||
        (typeof document !== 'undefined' ? document.body : null);

      if (scope) {
        const text = scope.textContent || '';
        const match = text.match(
          /(?:сума|до\s+отримання|до\s+сплати|ціна|вартість|разом)?\s*:?\s*(\d[\d\s,.]*)\s*(?:грн|uah|₴)/i
        );
        if (match && match[1]) {
          const clean = match[1].trim().replace(/\s+/g, ' ');
          if (clean.length > 0 && clean.length <= 12) {
            return `${clean} грн`;
          }
        }
      }
    } catch {}

    return 'кошти на балансі вашої картки';
  }

  /**
   * Класифікація точного сценарію загрози, формування контрасту та переліку активів
   */
  public static determineScenario(options: XaiEvaluationOptions): ScenarioDetails {
    const financialRisk = options.detectedAmount || this.extractFinancialAmount() || 'кошти на балансі вашої картки';
    const triggersText = options.assessment.triggers.map((t) => t.message).join(' ').toLowerCase();
    const hasVaultItems = options.vaultItems && options.vaultItems.length > 0;
    const vaultItemLabels = hasVaultItems ? options.vaultItems!.map((i) => i.label) : [];

    // 0. Запит захищених персональних маркерів (дівоче прізвище, ІПН) без картки
    if (hasVaultItems && options.type !== 'chat') {
      const isCardPresent = triggersText.includes('лун') || triggersText.includes('номер банківськ') || triggersText.includes('картк');
      if (!isCardPresent) {
        return {
          attackCategory: 'IDENTITY_HARVESTING',
          attackScenario: 'Збір персональних банківських маркерів',
          diagnosis: `Спроба випитування відповідей на контрольні запитання банків (${vaultItemLabels.join(', ')})`,
          userIntendedAction: 'Ви заповнюєте анкету або підтверджуєте особу',
          threatReality: `цей сайт випитує захищені маркери відновлення доступу (${vaultItemLabels.join(', ')}), які банки використовують для авторизації клієнтів`,
          financialRisk: 'всі банківські рахунки та облікові записи',
          exposedAssets: vaultItemLabels,
          shortAttackName: 'викрадення маркерів особи (Identity Theft)',
        };
      }
    }

    // 1. Атака прихованого автозаповнення (Autofill Trap)
    const isAutofill = options.assessment.triggers.some(
      (t) =>
        t.name === 'hidden_sensitive_fields' ||
        t.message.toLowerCase().includes('прихован') ||
        t.message.toLowerCase().includes('autofill')
    );

    if (isAutofill) {
      const exposedAssets = ['номер банківської картки', 'секретний CVV-код', 'термін дії картки', ...vaultItemLabels];
      return {
        attackCategory: 'AUTOFILL_TRAP',
        attackScenario: 'Прихована DOM-пастка автозаповнення (Autofill Trap)',
        diagnosis: 'Потайне зчитування збережених платіжних даних браузера через невидимі поля',
        userIntendedAction: 'Ви заповнили лише видимі звичайні поля форми (ім\'я чи логін)',
        threatReality: 'ця сторінка потай викрадає збережені в браузері реквізити картки через невидимі поля автозаповнення',
        financialRisk,
        exposedAssets,
        shortAttackName: 'атака прихованого автозаповнення (Autofill Trap)',
      };
    }

    // 2. Шахрайство під виглядом доставки (Escrow Delivery Scam)
    const isDelivery =
      !!options.activeContext ||
      triggersText.includes('доставк') ||
      triggersText.includes('escrow') ||
      triggersText.includes('виплат') ||
      triggersText.includes('отриманн');

    if (isDelivery) {
      const platform = options.activeContext?.sourcePlatform || 'маркетплейсу';
      const exposedAssets = ['номер банківської картки', 'секретний код безпеки CVV', ...vaultItemLabels];
      return {
        attackCategory: 'DELIVERY_SCAM',
        attackScenario: `Шахрайство під виглядом безпечної угоди (${platform})`,
        diagnosis: `Підміна платіжної сторінки ${platform} для списання коштів жертви замість зарахування`,
        userIntendedAction: `Вам обіцяли зарахувати ${financialRisk} за товар`,
        threatReality: 'ця сторінка вимагає секретний код CVV і насправді надішле банку запит на списання грошей з вашої картки',
        financialRisk,
        exposedAssets,
        shortAttackName: 'шахрайство з підробленою доставкою (Escrow Scam)',
      };
    }

    // 3. Відкритий витік у чаті (Chat Leak)
    if (options.type === 'chat') {
      const hasCvv = !!options.chatLeakage?.hasCvv || triggersText.includes('cvv');
      const exposedAssets = hasCvv
        ? ['секретний тризначний код CVV', 'номер банківської картки', ...vaultItemLabels]
        : ['номер банківської картки', ...vaultItemLabels];

      return {
        attackCategory: 'CHAT_LEAK',
        attackScenario: 'Відкрита передача платіжних даних у чаті',
        diagnosis: 'Спроба надсилання конфіденційних реквізитів картки у незахищеному повідомленні',
        userIntendedAction: 'Ви вводите платіжні реквізити у відкритому чаті',
        threatReality: hasCvv
          ? 'передача секретного CVV дозволить співрозмовнику списати гроші без вашого відома (покупцеві CVV не потрібен)'
          : 'відправка реквізитів картки сторонній особі створює пряму загрозу несанкціонованого списання',
        financialRisk: 'всі кошти на балансі вашої картки',
        exposedAssets,
        shortAttackName: 'витік платіжних даних у чаті',
      };
    }

    // 4. Недовірений платіжний вузол (Untrusted Gateway / Action Mismatch)
    const exposedAssets = ['номер банківської картки', 'секретний код CVV', ...vaultItemLabels];
    return {
      attackCategory: 'UNTRUSTED_GATEWAY',
      attackScenario: 'Неліцензований платіжний вузол',
      diagnosis: `Відправка банківських реквізитів на неакредитований сервер ${options.targetHost}`,
      userIntendedAction: `Ви намагаєтеся сплатити замовлення на суму ${financialRisk}`,
      threatReality: `сайт надсилає реквізити не банку, а на сторонній неперевірений сервер (${options.targetHost}) без банківської акредитації`,
      financialRisk,
      exposedAssets,
      shortAttackName: 'фішинговий платіжний вузол',
    };
  }

  /**
   * Інтеграція з Chrome Built-in AI (Prompt API / Gemini Nano)
   * Формулювання попередження за суворими правилами контрасту та захисту активів
   */
  private static async tryChromePromptApi(
    options: XaiEvaluationOptions,
    scenario: ScenarioDetails
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

      const prompt = `
Виявлена вебзагроза для аналізу:
- Ситуація користувача: ${scenario.userIntendedAction}
- Фактична прихована загроза: ${scenario.threatReality}
- Фінансовий збиток (сума під загрозою): ${scenario.financialRisk}
- Чутливі дані, які будуть вкрадені: ${scenario.exposedAssets.join(', ')}
- Сторонній сервер: ${options.targetHost}
- Короткий тип атаки: ${scenario.shortAttackName}

Завдання:
Сформулюй чітке та спокійне попередження (2-3 речення) українською мовою у стилі Apple для звичайної людини (наприклад, працівниці бухгалтерії):
1. Застосуй формулу контрасту: поясни людині різницю між тим, що вона хотіла зробити, і тим, що насправді відбудеться з її грошима та даними.
2. Обов'язково вкажи суму (${scenario.financialRisk}) та які конкретно реквізити (${scenario.exposedAssets.join(', ')}) опиняться в руках зловмисників.
3. Заверши реченням з назвою загрози: «— це ${scenario.shortAttackName}».

Суворі обмеження:
- Категорично заборонено використовувати слова «маркери», «змінні», службові назви або технічні ідентифікатори в лапках («підтвердження_оплати», «заклик_до_переходу»).
- Без емодзі та без складного комп'ютерного сленгу. Текст має бути зрозумілим для будь-якої людини.
`.trim();

      const aiPromise = (async () => {
        const session = await factory.create({
          systemPrompt:
            'Ви — асистент кібербезпеки Apple. Ваше завдання — вберегти людину від крадіжки грошей та витоку персональних даних. ' +
            'Пояснюйте суть загрози простою людською мовою через контраст «очікування користувача проти реальної загрози». ' +
            'Обов\'язково називайте конкретні фінансові втрати та перелік даних, які будуть викрадені. Без сленгу, без емодзі.',
        });
        const resp = await session.prompt(prompt);
        session.destroy?.();
        return resp && resp.trim().length > 25 ? resp.trim() : null;
      })();

      // Запобігаємо зависанню інтерфейсу: 1500 мс на відповідь Local LLM
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));

      return await Promise.race([aiPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  /**
   * Адаптивний контекстний синтезатор (Primary / High-Reliability Fallback XAI)
   * Реалізує ту ж саму формулу контрасту зі 100% гарантією швидкості та якості
   */
  private static synthesizeExplanation(
    options: XaiEvaluationOptions,
    scenario: ScenarioDetails
  ): string {
    const assetsStr = scenario.exposedAssets.join(', ');

    switch (scenario.attackCategory) {
      case 'AUTOFILL_TRAP':
        return (
          `${scenario.userIntendedAction}, але ця сторінка потай зчитує збережені дані вашої картки (${assetsStr}) через невидимі поля автозаповнення. ` +
          `Якщо продовжити, ви ризикуєте втратити ${scenario.financialRisk} та розкрити реквізити картки стороннім особам — це ${scenario.shortAttackName}.`
        );

      case 'DELIVERY_SCAM':
        return (
          `${scenario.userIntendedAction}, але ця сторінка вимагає секретний тризначний код CVV і насправді надішле запит на списання коштів з вашої картки. ` +
          `Ви ризикуєте втратити ${scenario.financialRisk} та передати шахраям ${assetsStr} — це ${scenario.shortAttackName}.`
        );

      case 'CHAT_LEAK':
        return (
          `${scenario.userIntendedAction}. ` +
          `Для переказу чи зарахування коштів іншій стороні потрібен виключно 16-значний номер картки. ` +
          `Передача ${assetsStr} дозволить співрозмовнику списати ${scenario.financialRisk} без вашого відома — це ${scenario.shortAttackName}.`
        );

      case 'IDENTITY_HARVESTING':
        return (
          `${scenario.userIntendedAction}, але ця сторінка випитує захищені банківські маркери відновлення доступу (${assetsStr}). ` +
          `Ці дані використовуються банками для підтвердження особи власника — їх розголошення сторонньому сайту дозволить шахраям перехопити доступ до ваших рахунків — це ${scenario.shortAttackName}.`
        );

      case 'UNTRUSTED_GATEWAY':
      default:
        return (
          `${scenario.userIntendedAction}, але сайт передає реквізити не банку, а на сторонній неперевірений сервер (${options.targetHost}). ` +
          `Ви ризикуєте втратити ${scenario.financialRisk} та скомпрометувати ${assetsStr} — це ${scenario.shortAttackName}.`
        );
    }
  }

  /**
   * Розрахунок внеску факторів формули: R_tech, C_env, A_user
   */
  private static calculateBreakdown(options: XaiEvaluationOptions): XaiRiskBreakdown {
    const { assessment, activeContext, type } = options;

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
      description: 'Аналіз структури форми, валідація Луна та перевірка платіжного еквайрингу',
      details: techTriggers.length > 0 ? techTriggers : ['Форма містить стандартні поля без аномалій DOM'],
    };

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
      description: 'Зшивання сесій: перехід із платформи комунікації на платіжний вузол',
      details: envDetails,
    };

    let actionScore = type === 'chat' ? 45 : 35;
    const actionDetails: string[] = [];
    if (type === 'chat') {
      actionDetails.push('Користувач ініціював надсилання повідомлення, що містить банківські реквізити');
    } else {
      actionDetails.push('Користувач ініціював відправку платіжної форми з банківськими даними');
    }

    const userAction: XaiRiskFactor = {
      name: 'A_user',
      label: 'Намір дії користувача (User Action)',
      score: actionScore,
      maxScore: 45,
      percentage: Math.min(100, Math.round((actionScore / 45) * 100)),
      description: 'Оцінка потенційного матеріального збитку від поточної дії',
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
  private static reconstructAttackChain(
    options: XaiEvaluationOptions,
    scenario: ScenarioDetails
  ): AttackChainStep[] {
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
        description: 'У текстовому полі введено номер картки або секретний код CVV',
        sourceNode: 'Поле вводу',
        severity: 'HIGH',
        timestamp: now - 5000,
        icon: '2',
        evidence: scenario.exposedAssets.join(', '),
      });
      steps.push({
        id: 'step-chat-3',
        stepNumber: 3,
        title: 'Витік платіжних даних',
        description: 'Відправка повідомлення передасть реквізити співрозмовнику',
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
        description: `Спілкування на платформі ${options.activeContext.sourcePlatform}`,
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
        evidence: scenario.exposedAssets.join(', '),
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
      description: 'Спроба відправки банківських даних на сторонній сервер',
      sourceNode: 'Платіжна форма',
      severity: 'CRITICAL',
      timestamp: now,
      icon: '2',
      evidence: scenario.exposedAssets.join(', '),
    });

    return steps;
  }

  /**
   * Контрзаходи (Countermeasures)
   */
  private static getCounters(options: XaiEvaluationOptions, scenario: ScenarioDetails): string[] {
    switch (scenario.attackCategory) {
      case 'AUTOFILL_TRAP':
        return [
          'Негайно залиште сторінку та не надсилайте форму.',
          'Перевірте налаштування автозаповнення браузера та видаліть збережені картки з пам’яті.',
          'Ніколи не підтверджуйте автозаповнення на сторонніх чи невідомих сайтах.',
        ];

      case 'DELIVERY_SCAM':
        return [
          `Залиште сторінку ${options.targetHost} та поверніться до офіційного додатку ${options.activeContext?.sourcePlatform || 'маркетплейсу'}.`,
          'Для зарахування коштів за товар покупцеві достатньо знати лише 16 цифр картки або IBAN.',
          'Ніколи не вказуйте тризначний код CVV чи баланс картки для «отримання виплати».',
        ];

      case 'CHAT_LEAK':
        return [
          'Видаліть CVV-код та термін дії картки з поля вводу повідомлення.',
          'Для отримання переказу надішліть лише номер картки або розрахунковий рахунок IBAN.',
          'Ніколи не повідомляйте одноразові коди безпеки з SMS або push-повідомлень банку.',
        ];

      case 'IDENTITY_HARVESTING':
        return [
          'Не вказуйте дівоче прізвище матері або контрольні слова на цьому вебсайті.',
          'Скористайтеся функцією «Підставити Canary Decoy» або залиште сторінку.',
          'Пам\'ятайте: справжні банки ніколи не запитують дівоче прізвище через відкриті вебформи.',
        ];

      case 'UNTRUSTED_GATEWAY':
      default:
        return [
          `Не надсилайте платіжні реквізити серверу ${options.targetHost}.`,
          'Здійснюйте оплату лише через акредитовані банківські шлюзи (LiqPay, Portmone, WayForPay).',
          'Перевіряйте правильність адреси сайту в рядку браузера.',
        ];
    }
  }

  /**
   * Освітня порада
   */
  private static getEducationalTip(scenario: ScenarioDetails): string {
    switch (scenario.attackCategory) {
      case 'AUTOFILL_TRAP':
        return 'Шахраї часто використовують звичайну форму підписки чи входу, приховуючи за межами екрана поля «Номер картки» та «CVV», які браузер автоматично заповнює з вашої пам’яті.';

      case 'DELIVERY_SCAM':
        return 'Код CVV (3 цифри на звороті) призначений виключно для зняття або списання коштів. Банківські системи ніколи не вимагають введення CVV для зарахування грошей продавцю.';

      case 'CHAT_LEAK':
        return 'Секретний тризначний код CVV разом із номером картки дає змогу розрахуватися нею в інтернеті без вашої згоди. Тримайте його в таємниці навіть від покупців.';

      case 'IDENTITY_HARVESTING':
        return 'Дівоче прізвище матері та РНОКПП (ІПН) є основними маркерами верифікації клієнта під час звернення до контакт-центрів банків. Їх витік ставить під загрозу всі ваші рахунки.';

      case 'UNTRUSTED_GATEWAY':
      default:
        return 'Акредитовані платіжні шлюзи захищені міжнародним стандартом безпеки PCI DSS і приймають дані картки на захищених захищених серверах банку, а не на сайті магазину.';
    }
  }

  /**
   * Лаконічний контент у стилі Apple Human Interface Guidelines
   */
  private static determineHumanContent(
    options: XaiEvaluationOptions,
    scenario: ScenarioDetails
  ): {
    humanTitle: string;
    humanSubtitle: string;
    humanCoreWarning: string;
    humanChecklist: { good: string[]; bad: string[] };
  } {
    switch (scenario.attackCategory) {
      case 'AUTOFILL_TRAP':
        return {
          humanTitle: 'Прихована пастка автозаповнення',
          humanSubtitle: 'Спроба таємного зчитування карткових даних через невидимі поля.',
          humanCoreWarning: this.synthesizeExplanation(options, scenario),
          humanChecklist: {
            good: [
              'Заповнювати лише ті поля, які ви бачите на власні очі',
              'Перевіряти, які саме дані браузер підставляє в автозаповнення',
            ],
            bad: [
              'Дозволяти автоматичне заповнення платіжних реквізитів на підозрілих сайтах',
              'Ігнорувати попередження системи безпеки про невидимі інпути',
            ],
          },
        };

      case 'DELIVERY_SCAM':
        return {
          humanTitle: 'Шахрайство під виглядом доставки',
          humanSubtitle: 'Спроба несанкціонованого списання коштів замість зарахування.',
          humanCoreWarning: this.synthesizeExplanation(options, scenario),
          humanChecklist: {
            good: [
              'Для зарахування коштів передавати лише 16 цифр картки або IBAN',
              'Перевіряти статус угоди виключно в офіційному додатку маркетплейсу',
            ],
            bad: [
              'Вводити код CVV (три цифри на звороті) для «отримання» грошей',
              'Переходити за платіжними посиланнями у сторонніх месенджерах',
            ],
          },
        };

      case 'CHAT_LEAK':
        return {
          humanTitle: 'Витік платіжних реквізитів у чаті',
          humanSubtitle: 'У відкритому діалозі виявлено конфіденційні банківські реквізити.',
          humanCoreWarning: this.synthesizeExplanation(options, scenario),
          humanChecklist: {
            good: [
              'Для переказу повідомляти виключно 16-значний номер картки',
              'Спілкуватися лише всередині захищених чатів платформи',
            ],
            bad: [
              'Надсилати тризначний код CVV зі звороту картки або термін дії',
              'Передавати одноразові коди підтвердження з банківських SMS',
            ],
          },
        };

      case 'IDENTITY_HARVESTING':
        return {
          humanTitle: 'Спроба викрадення особистих маркерів',
          humanSubtitle: 'Сайт випитує секретні контрольні дані для банківської верифікації.',
          humanCoreWarning: this.synthesizeExplanation(options, scenario),
          humanChecklist: {
            good: [
              'Тримати дівоче прізвище матері та секретні слова в таємниці',
              'Використовувати підставні Canary-дані для перевірки сумнівних сайтів',
            ],
            bad: [
              'Вводити контрольні питання банку на будь-яких сторонніх сайтах',
              'Передавати РНОКПП (ІПН) чи паспорт неперевіреним ресурсам',
            ],
          },
        };

      case 'UNTRUSTED_GATEWAY':
      default:
        return {
          humanTitle: 'Неліцензована форма оплати',
          humanSubtitle: 'Сайт не підключений до сертифікованого банківського шлюзу.',
          humanCoreWarning: this.synthesizeExplanation(options, scenario),
          humanChecklist: {
            good: [
              'Здійснювати оплату через офіційні банківські шлюзи (LiqPay, Portmone)',
              'Перевіряти адресу сайту в адресному рядку браузера',
            ],
            bad: [
              'Вводити реквізити картки на сторонніх сторінках без сертифікату PCI DSS',
              'Ігнорувати попередження браузера про ненадійні вузли',
            ],
          },
        };
    }
  }
}
