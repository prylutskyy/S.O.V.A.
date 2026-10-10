/**
 * SemanticTriggerEngine
 * Семантичний векторний рушій та прагматична матриця намірів (Tier 1.5).
 * Забезпечує миттєвий (0.2-1 мс) векторний аналіз повідомлень без жорстких регулярних виразів.
 * Виявляє семантику пропозицій нелегального заробітку, розвідки, диверсій та фішингу,
 * після чого спрямовує контекст до Groq / Cloud LLM Arbiter для остаточного вердикту.
 */

export interface SemanticSignalBreakdown {
  hasRewardIncentive: boolean;
  hasActionDirective: boolean;
  hasTargetFocus: boolean;
  hasDiscretionUrgency: boolean;
  rewardMatches: string[];
  actionMatches: string[];
  targetMatches: string[];
  discretionMatches: string[];
}

export interface SemanticVectorMatch {
  prototypeId: string;
  similarity: number;
  labelUk: string;
}

export interface SemanticDimensionValue {
  key: string;
  labelUk: string;
  inputWeight: number;     // 0.0 - 1.0 (вага у вхідному повідомленні)
  prototypeWeight: number; // 0.0 - 1.0 (вага в еталонному векторі)
  matchedTokens: string[];
}

export interface SemanticVectorTelemetry {
  rawText: string;
  topPrototypeId: string;
  topPrototypeLabel: string;
  cosineSimilarity: number;
  dimensions: SemanticDimensionValue[];
  allPrototypes: {
    id: string;
    labelUk: string;
    similarity: number;
    prototypeWeights: Record<string, number>;
  }[];
  timestamp: number;
  hasFormedIntent?: boolean;
  intentType?: string;
  confidence?: number;
  reason?: string;
  latestMessage?: string;
}

export interface SemanticEvaluationResult {
  hasFormedIntent: boolean;
  intentType: string;
  intentTitle: string;
  confidence: number;
  similarityScore: number;
  signals: SemanticSignalBreakdown;
  matchedPrototypes: SemanticVectorMatch[];
  matchedKeywords: string[];
  reason: string;
  telemetry: SemanticVectorTelemetry;
}

export class SemanticTriggerEngine {
  // Еталонні семантичні прототипи загроз
  private static readonly PROTOTYPES = [
    {
      id: 'MILITARY_SABOTAGE_RECRUITMENT',
      labelUk: 'Ознаки ворожого вербування або розвідувально-диверсійної діяльності',
      texts: [
        'пропозиція швидкого заробітку криптою або грошима за фотографування, відеозйомку, координати або розвідку будівель, військових обєктів, транспорту',
        'підійди за адресою і зроби фото або відео будівлі, машин, номерів авто за грошову винагороду',
        'підпал релейних шаф, військових автомобілів, бусів, використання запалювальної суміші за оплату в криптовалюті',
        'шукаємо курєрів розвідників для простих завдань з високою щотижневою оплатою на криптогаманець',
        'предложение работы в крипте за фотосъемку зданий, военкоматов, машин с номерами или поджог релейного шкафа',
        'ищем людей на легкую подработку, оплата в криптовалюте или на карту за фото и видео военкоматов, тцк, техники с крестами',
        'подойди по адресу и сфотографируй здание, автомобили с номерами или сделай видеосъемку за вознаграждение в usdt',
        'поджог релейного шкафа жд или военных бусов, машин всу за деньги, оплата сразу после видеоотчета',
        'купи жидкость для розжига или сделай коктейль молотова и подожги релейный шкаф на перегоне за доллары',
        'збираємо координати обєктів місця проживання керівництва тцк стоянки особистих авто склади точна адреса марка номер машини графік виїзду зафіксувати фотографіями',
        'рух опору мережа прямої дії допомога в боротьбі з режимом потрібна точна адреса поверх номер авто та фотографії військових або тцк',
        'сбор координат объектов места проживания руководства тцк стоянки машин точный адрес номер машины график выезда зафиксировать фото',
      ]
    },
    {
      id: 'PAYMENT_CREDENTIAL_THEFT',
      labelUk: 'Виманювання платіжних реквізитів або кодів авторизації',
      texts: [
        'для підтвердження переказу вкажіть повний номер карти, термін дії, свв код та смс пароль від банку',
        'верифікація платіжної операції вимагає введення секретного коду або підтвердження з повідомлення',
        'для подтверждения перевода укажите номер карты, срок действия, cvv код и смс пароль от банка',
        'для получения выплаты или зачисления средств укажите полный номер банковской карты срок и трехзначный код с обратной стороны',
        'введите код подтверждения из смс или пуш уведомления банка для верификации карты и зачисления средств'
      ]
    }
  ];

  private static readonly REWARD_REGEX = /(?:\$|€|usd|usdt|uah|грн|крипт|биткоин|біткоїн|оплат|заплат|плачу|платим|платимо|тариф|(?<![\p{L}\p{N}])ставк|грош|деньг|бакс|сотк|тысяч|тисяч|тыщ|заробіт|заработ|доход|дохід|заробити|заработать|підробіт|подработ|на карту|на гаманець|на кошелек|на кошелёк|(?<![\p{L}\p{N}])(?:рубл|руб(?![а-яіїєё]))|\b\d+\s*(?:\$|€|usdt|usd|грн|руб|бакс)|фінанс|винагород|кошт|компенсац|премі|бонус|матеріал)/iu;
  private static readonly ACTION_REGEX = /(?:робот|работ|підробіт|подработ|підійди|підійдіть|подойди|подойдите|сходи|пойди|сфоткай|сфотографуй|сфотографируй|зроби\s+фото|сделай\s+фото|зробити|зробіть|зробіть|надіслати|надішліть|сфотографувати|зфотографувати|зняти\s+відео|зніміть|сфотографуйте|зніми\s+відео|сними\s+видео|зафільмуй|засними|оглянь|подивись|посмотри|глянь|перевір|проверь|надішли|отправь|скинь|скинеш|скинешь|скинуть|кинь|(?<![\p{L}\p{N}])(?:купи|купіть|купити|купуй|купуйте|купишь|купите)(?![\p{L}\p{N}])|розпали|підпали|підпалюєш|подожги|сожги|подж[её]г|закинь|віднеси|отнеси|поклади|положи|прикріпи|прикрепи|курєр|курьер|розвідник|разведчик|розвідк|разведк|завдання|задани|тестов|збираєм|собираем|зафіксуй|зафіксувати|зафиксируй|зафиксировать|введіть|введи|введите|укажите|вкажіть|продиктуй|назвіть|назови|дай|дайте)/iu;
  private static readonly TARGET_REGEX = /(?:будівл|здани|споруд|сооружени|обєкт|объект|адміністрац|администрац|стоянц|парковк|стоян|авто|машин|транспорт|бус|номер|(?<!пере)(?<![\p{L}\p{N}])(?:хрест|крест)[а-яіїєё]*(?![\p{L}\p{N}])|піксель|пиксель|паркан|забор|колі[яї]|рельс|пут[еий]|ж\/?д|перегон|релейн|шаф|дріт|провод|веж|вышк|міст|мост|військов|военн|всу|тцк|воєнкомат|военкомат|воєнком|военком|частин|част[иь]|блокпост|патрул|адрес|вулиц|улиц|локац|координат|поверх|склад|завод|інфраструктур|infrastructure|прильот|обстріл|руйнування)/iu;
  private static readonly DISCRETION_REGEX = /(?:швидк|быстр|тишк|тихо|втихую|тихар|анонім|аноним|конфіденційн|конфиденциальн|секрет|видали|удали|очисти|безпечно|безопасно|безпек|легко|не бійся|не бойся|ніхто не взнає|ніхто не побачить|никто не узнает|никто не увидит|перевірен|проверен|прямо зараз|прямо сейчас|закрит[а-яіїєё]*\s+канал|таємн|тайн)/iu;
  private static readonly RECON_REGEX = /(?:координат|точна\s+адрес|поверх|марк[а-яіїєё]*\s+т?а?\s*номер|номер\s+машин|номер\s+авто|графік\s+виїзд|графік\s+(?:руху|переміщення)\s+(?:військов[а-яіїє]*\s+)?технік|чи\s+є\s+охорон|наявніст[ья]\s+охорон|зафіксувати\s+фото|зробити\s+\S+\s+фото|зробити\s+фото|відеозвіт|фотозвіт|розвіддан|збір\s+даних|розвідк|розвідник|місце\s+прильот|місце\s+обстріл|місце\s+удар|місце\s+руйнування)/iu;
  private static readonly IDEOLOGY_COVER_REGEX = /(?:рух[а-яіїєё]*\s+опор|мереж[а-яіїєё]*\s+прямої\s+ді|підпілл|підпільн|каральн[а-яіїєё]*\s+систем|боротьб[а-яіїєё]*\s+з\s+режим|спільн[а-яіїєё]*\s+перемог|однодумець|однодумц)/iu;

  /**
   * Створення N-грамного векторного профілю тексту (Subword N-Grams)
   * Працює на рівні 3-грамів та 4-грамів, що робить його нечутливим до одруківок,
   * суфіксів, відмінків та транслітерації.
   */
  public static vectorize(text: string): Map<string, number> {
    const clean = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const vector = new Map<string, number>();
    if (!clean) return vector;

    const words = clean.split(' ');
    // 1. Токени слів
    for (const w of words) {
      if (w.length >= 3) {
        vector.set(w, (vector.get(w) || 0) + 2.0);
      }
    }

    // 2. Символьні 3-грами та 4-грами
    for (const w of words) {
      if (w.length < 3) continue;
      const padded = `_${w}_`;
      for (let i = 0; i <= padded.length - 3; i++) {
        const tri = padded.substring(i, i + 3);
        vector.set(tri, (vector.get(tri) || 0) + 1.0);
      }
      for (let i = 0; i <= padded.length - 4; i++) {
        const quad = padded.substring(i, i + 4);
        vector.set(quad, (vector.get(quad) || 0) + 1.5);
      }
    }

    // 3. Семантичні концептуальні токени (Synonym Concept Expansion - UK/RU)
    const concepts = [
      { name: '__concept_photo__', match: /фото|сфот|знім|сним|відео|видео|зафільм|засним|кадр|зйомк|съемк/i },
      { name: '__concept_vehicle__', match: /(?:авто|машин|бус|транспорт|номер|піксель|пиксель|(?<!пере)(?<![\p{L}\p{N}])(?:хрест|крест)[а-яіїєё]*(?![\p{L}\p{N}])|тачк)/iu },
      { name: '__concept_building__', match: /будівл|здани|споруд|сооружени|тцк|воєнкомат|военкомат|воєнком|военком|адміністрац|администрац|обєкт|объект|стоянц|парковк|стоян|поверх|склад/i },
      { name: '__concept_money__', match: /грош|деньг|кошт|бакс|дол|usdt|крипт|uah|грн|руб|оплат|плачу|платим|заплат|заробіт|заработ|підробіт|подработ|фінанс|винагород|компенсац/i },
      { name: '__concept_task__', match: /підійди|подойди|піди|пойди|сходи|зроби|сделай|перевір|проверь|оглянь|посмотри|глянь|купи|підпали|подожги|сожги|розпали|завданн|задани|робот|работ|збираєм|собираем|зафіксуй|зафіксувати|зафиксируй|зафиксировать/i },
      { name: '__concept_sabotage__', match: /підпал|поджог|сожги|подожги|розпалювач|розжиг|коктейл|молотов|релейн|шаф|диверс|знищ|уничтож/i },
      { name: '__concept_recon__', match: /координат|точна\s+адрес|поверх|марк[а-яіїєё]*\s+т?а?\s*номер|номер\s+машин|номер\s+авто|графік\s+виїзд|чи\s+є\s+охорон|наявніст[ья]\s+охорон|зафіксувати|розвіддан|збір\s+даних|розвідк|розвідник/i },
      { name: '__concept_ideology__', match: /рух[а-яіїєё]*\s+опор|мереж[а-яіїєё]*\s+прямої\s+ді|підпілл|підпільн|каральн[а-яіїєё]*\s+систем|боротьб[а-яіїєё]*\s+з\s+режим|спільн[а-яіїєё]*\s+перемог|однодумець|однодумц/i },
    ];
    for (const c of concepts) {
      if (c.match.test(clean)) {
        vector.set(c.name, (vector.get(c.name) || 0) + 3.0);
      }
    }

    // Нормалізація вектора до одиничної довжини (L2 Normalization)
    let sumSq = 0;
    for (const val of vector.values()) {
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq) || 1;
    for (const [key, val] of vector.entries()) {
      vector.set(key, val / norm);
    }

    return vector;
  }

  /**
   * Обчислення косинусної подібності між двома векторами (Cosine Similarity: 0.0 - 1.0)
   */
  public static cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
    let dot = 0;
    // Ітеруємо по меншому вектору
    const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
    for (const [key, valA] of smaller.entries()) {
      const valB = larger.get(key);
      if (valB !== undefined) {
        dot += valA * valB;
      }
    }
    return Math.max(0, Math.min(1, dot));
  }

  /**
   * Аналіз прагматичних поведінкових сигналів повідомлення (Action-Reward Matrix)
   */
  public static extractBehavioralSignals(text: string): SemanticSignalBreakdown {
    const rewardMatches: string[] = [];
    const actionMatches: string[] = [];
    const targetMatches: string[] = [];
    const discretionMatches: string[] = [];

    const words = text.split(/\s+/);
    for (const w of words) {
      if (this.REWARD_REGEX.test(w)) rewardMatches.push(w);
      if (this.ACTION_REGEX.test(w)) actionMatches.push(w);
      if (this.TARGET_REGEX.test(w)) targetMatches.push(w);
      if (this.DISCRETION_REGEX.test(w)) discretionMatches.push(w);
    }

    return {
      hasRewardIncentive: this.REWARD_REGEX.test(text),
      hasActionDirective: this.ACTION_REGEX.test(text),
      hasTargetFocus: this.TARGET_REGEX.test(text),
      hasDiscretionUrgency: this.DISCRETION_REGEX.test(text),
      rewardMatches: Array.from(new Set(rewardMatches)),
      actionMatches: Array.from(new Set(actionMatches)),
      targetMatches: Array.from(new Set(targetMatches)),
      discretionMatches: Array.from(new Set(discretionMatches)),
    };
  }

  private static readonly PROTOTYPE_PROFILES: Record<string, Record<string, number>> = {
    MILITARY_SABOTAGE_RECRUITMENT: {
      reward: 0.85,
      action: 0.90,
      target: 0.88,
      vehicle: 0.82,
      media: 0.78,
      sabotage: 0.85,
      discretion: 0.70,
      messenger: 0.65,
      escrow: 0.10,
      credential: 0.15,
    },
    PAYMENT_CREDENTIAL_THEFT: {
      reward: 0.40,
      action: 0.70,
      target: 0.10,
      vehicle: 0.05,
      media: 0.05,
      sabotage: 0.05,
      discretion: 0.50,
      messenger: 0.55,
      escrow: 0.60,
      credential: 0.98,
    },
  };

  /**
   * Обчислення 10-вимірного концептуального профілю повідомлення або діалогу
   */
  public static computeInputWeights(
    text: string,
    signals: SemanticSignalBreakdown
  ): Record<string, { weight: number; tokens: string[] }> {
    return {
      reward: {
        weight: signals.hasRewardIncentive ? Math.min(1.0, 0.50 + signals.rewardMatches.length * 0.2) : 0,
        tokens: signals.rewardMatches,
      },
      action: {
        weight: signals.hasActionDirective ? Math.min(1.0, 0.50 + signals.actionMatches.length * 0.2) : 0,
        tokens: signals.actionMatches,
      },
      target: {
        weight: signals.hasTargetFocus ? Math.min(1.0, 0.50 + signals.targetMatches.length * 0.2) : 0,
        tokens: signals.targetMatches,
      },
      vehicle: {
        weight: /(?:авто|машин|бус|номер|піксель|пиксель|(?<!пере)(?<![\p{L}\p{N}])(?:хрест|крест)[а-яіїєё]*(?![\p{L}\p{N}])|тачк)/iu.test(text) ? 0.85 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/авто|машин[а-яіїєё]*|бус[а-яіїєё]*|номер[а-яіїєё]*|піксель[а-яіїєё]*|пиксель[а-яіїєё]*|(?<!пере)(?<![\p{L}\p{N}])(?:хрест|крест)[а-яіїєё]*(?![\p{L}\p{N}])|тачк[а-яіїєё]*/giu)).map(m => m[0]))),
      },
      media: {
        weight: /(?:фото|відео|видео|зніми|сними|сфоткай|засними|кадр|зйомк|съемк)/i.test(text) ? 0.90 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/фото[а-яіїєё]*|відео|видео|знім[а-яіїєё]*|сним[а-яіїєё]*|сфотк[а-яіїєё]*|засним[а-яіїєё]*|кадр|зйомк[а-яіїєё]*|съемк[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      sabotage: {
        weight: /(?:підпал|поджог|розпалювач|розжиг|подожги|сожги|коктейл|релейн|шаф|диверс)/i.test(text) ? 0.95 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/підпал[а-яіїєё]*|поджог[а-яіїєё]*|розпалювач[а-яіїєё]*|розжиг[а-яіїєё]*|подожг[а-яіїєё]*|сожг[а-яіїєё]*|коктейл[а-яіїєё]*|релейн[а-яіїєё]*|шаф[а-яіїєё]*|диверс[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      discretion: {
        weight: signals.hasDiscretionUrgency ? Math.min(1.0, 0.50 + signals.discretionMatches.length * 0.2) : 0,
        tokens: signals.discretionMatches,
      },
      messenger: {
        weight: /(?:телеграм|telegram|t\.me|вайбер|viber|wa\.me|whatsapp|чат-бот|телег[а-яіїєё]*)/i.test(text) ? 0.85 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/телеграм[а-яіїєё]*|telegram|t\.me|вайбер|viber|wa\.me|whatsapp|телег[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      escrow: {
        weight: /(?:безпечна\s+угода|безопасная\s+сделка|получить|отримати|зачислени|оплат[а-яіїєё]*\s+товар|списан[а-яіїєё]*\s+кошт|служб[а-яіїєё]*\s+доставк|курьерск[а-яіїєё]*\s+доставк)/i.test(text) ? 0.90 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/безпечна\s+угода|безопасная\s+сделка|получить|отримати|зачислени[а-яіїєё]*|служб[а-яіїєё]*\s+доставк[а-яіїєё]*|курьерск[а-яіїєё]*\s+доставк[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      credential: {
        weight: /(?:cvv|cvc|парол|смс|код|баланс|термін\s+дії|срок\s+действия|номер\s+карт)/i.test(text) ? 0.95 : 0,
        tokens: Array.from(new Set(Array.from(text.matchAll(/cvv|cvc|парол[а-яіїєё]*|смс|код|баланс|термін\s+дії|срок\s+действия|номер\s+карт[а-яіїєё]*/gi)).map(m => m[0]))),
      },
    };
  }

  /**
   * Обчислення косинусної подібності в 10-вимірному концептуальному просторі
   */
  public static computeConceptCosine(
    inputWeights: Record<string, { weight: number; tokens: string[] }>,
    profile: Record<string, number>
  ): number {
    let dot = 0;
    let sumSqInput = 0;
    let sumSqProto = 0;
    let nonZeroDimensions = 0;

    for (const key of Object.keys(profile)) {
      const wIn = inputWeights[key]?.weight ?? 0;
      const wPr = profile[key] ?? 0;
      if (wIn > 0) {
        nonZeroDimensions++;
        dot += wIn * wPr;
        sumSqInput += wIn * wIn;
      }
      sumSqProto += wPr * wPr;
    }

    if (nonZeroDimensions < 2 || sumSqInput === 0 || sumSqProto === 0) {
      return 0;
    }

    const norm = Math.sqrt(sumSqInput) * Math.sqrt(sumSqProto);
    if (!norm) return 0;
    return Math.max(0, Math.min(1, Math.round((dot / norm) * 100) / 100));
  }

  /**
   * Комплексна семантична оцінка повідомлення або діалогу
   */
  public static evaluate(text: string, fullDialogueContext?: string): SemanticEvaluationResult {
    const combinedText = fullDialogueContext
      ? (fullDialogueContext.includes(text) ? fullDialogueContext : `${fullDialogueContext}\n${text}`)
      : text;

    // 1. Поведінкові сигнали та 10-вимірні концептуальні ваги
    const signals = this.extractBehavioralSignals(combinedText);
    const conceptWeights = this.computeInputWeights(combinedText, signals);

    // 2. Подвійне вікно векторизації (накопичувальний контекст + останнє повідомлення)
    const inputVectorCombined = this.vectorize(combinedText);
    const inputVectorLatest = text && text.trim().length >= 10 ? this.vectorize(text) : null;

    const matches: SemanticVectorMatch[] = [];

    for (const proto of this.PROTOTYPES) {
      let maxNgramSim = 0;
      for (const sample of proto.texts) {
        const protoVec = this.vectorize(sample);
        const simCombined = this.cosineSimilarity(inputVectorCombined, protoVec);
        const simLatest = inputVectorLatest ? this.cosineSimilarity(inputVectorLatest, protoVec) : 0;
        const sim = Math.max(simCombined, simLatest);
        if (sim > maxNgramSim) maxNgramSim = sim;
      }

      // Обчислення подібності у 10-вимірному концептуальному просторі
      const conceptSim = this.computeConceptCosine(
        conceptWeights,
        this.PROTOTYPE_PROFILES[proto.id] || this.PROTOTYPE_PROFILES.MILITARY_SABOTAGE_RECRUITMENT
      );

      // Інтегральна подібність: об'єднує сирий N-грамний збіг та концептуальну щільність
      const effectiveSim = Math.round(Math.max(maxNgramSim, conceptSim) * 100) / 100;

      matches.push({
        prototypeId: proto.id,
        similarity: effectiveSim,
        labelUk: proto.labelUk,
      });
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatch = matches[0];

    // Критерії активації семантичного тригера:
    const hasCourierScoutRecruitment =
      signals.hasRewardIncentive &&
      signals.hasActionDirective &&
      /кур(?:[ь'’]?є|ьер|ер)|розвід|развед/i.test(combinedText);

    // Спеціалізовані правила проти розвідки та ідеологічного вербування
    const hasReconProbing = this.RECON_REGEX.test(combinedText);
    const hasIdeologyCover = this.IDEOLOGY_COVER_REGEX.test(combinedText);
    const hasMedia = /(?:фото|відео|видео|зніми|сними|сфоткай|засними|кадр|зйомк|съемк)/i.test(combinedText);
    const hasVehicle = /(?:авто|машин|бус|номер|піксель|пиксель|(?<!пере)(?<![\p{L}\p{N}])(?:хрест|крест)[а-яіїєё]*(?![\p{L}\p{N}])|тачк)/iu.test(combinedText);

    // Ворожа розвідка (ст. 114-2 ККУ): не вимагає грошей; збір локацій/транспорту/ТЦК
    const isHostileReconnaissance =
      signals.hasTargetFocus &&
      signals.hasActionDirective &&
      (hasReconProbing || (hasMedia && hasVehicle));

    // Ідеологічне вербування: прикриття рухом опору / підпіллям + наведення на військові цілі
    const isIdeologicalRecruitment =
      hasIdeologyCover &&
      signals.hasTargetFocus &&
      signals.hasActionDirective;

    const hasSabotageKeywords = /(?:підпал|поджог|розпалювач|розжиг|подожги|сожги|коктейл|релейн|шаф|диверс)/i.test(combinedText);
    const hasSpecificProtectedTarget = /(?:військов|воєнкомат|военкомат|військкомат|тцк|зсу|всу|ппо|пво|блокпост|в\/ч|релейн|підстанц|трансформатор|тэц|гес|радар|критичн[а-яіїє]*\s+інфраструктур)/iu.test(combinedText);
    const hasPoliteMediaRequest = /(?:чи\s+(?:не\s+)?(?:могли\s+б|можете|можеш)|могли\s+б\s+ви|could\s+you|can\s+you|would\s+you|please)/iu.test(combinedText) && hasMedia;

    // Саботаж або ворожа розвідка ОБОВ'ЯЗКОВО вимагають фізичного об'єкта, розвідки, диверсії або кур'єрського вербування
    const hasPhysicalTargetOrSabotage =
      signals.hasTargetFocus ||
      hasSabotageKeywords ||
      hasCourierScoutRecruitment ||
      hasReconProbing ||
      hasIdeologyCover;

    const isSabotagePragmatic =
      signals.hasActionDirective &&
      hasPhysicalTargetOrSabotage &&
      (
        (signals.hasRewardIncentive && signals.hasTargetFocus) ||
        (signals.hasRewardIncentive && signals.hasDiscretionUrgency) ||
        hasCourierScoutRecruitment ||
        isHostileReconnaissance ||
        isIdeologicalRecruitment ||
        hasSabotageKeywords
      );

    const isHighVectorSabotage =
      topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' &&
      signals.hasActionDirective &&
      hasPhysicalTargetOrSabotage &&
      // Generic words such as "номер" or "надіслати" can create a deceptively
      // high vector score. Require independent evidence tied to reconnaissance,
      // a protected target, sabotage, or recruitment before using the vector fallback.
      (hasReconProbing || hasIdeologyCover || hasSabotageKeywords || hasCourierScoutRecruitment ||
        /(?:військов|воєнком|тцк|зсу|всу|релейн|диверс|координат)/iu.test(combinedText)) &&
      topMatch.similarity >= 0.40;

    // Векторний fallback без явної директиви допускаємо лише для ввічливого
    // прохання сфотографувати конкретний військовий або критичний об'єкт.
    const isPureHighVectorSabotage =
      topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' &&
      !signals.hasActionDirective &&
      hasPoliteMediaRequest &&
      hasSpecificProtectedTarget &&
      topMatch.similarity >= 0.55;

    const isCredentialPragmatic =
      topMatch.prototypeId === 'PAYMENT_CREDENTIAL_THEFT' &&
      signals.hasActionDirective &&
      (topMatch.similarity >= 0.45 || (topMatch.similarity >= 0.38 && /cvv|cvc|срок\s+действия|термін\s+дії|номер\s+карт|парол|смс/i.test(combinedText)));

    let hasFormedIntent = false;
    let intentType = 'UNKNOWN';
    let intentTitle = '';
    let confidence = 0;
    let reason = '';

    // Жорсткий прагматичний гейт (Action Directive Blocker)
    // isPureHighVectorSabotage bypass: висока косинусна схожість без явної директиви дії
    if (signals.hasActionDirective || isPureHighVectorSabotage) {
      if (isSabotagePragmatic || isHighVectorSabotage || isPureHighVectorSabotage) {
        hasFormedIntent = true;
        intentType = 'MILITARY_SABOTAGE_RECRUITMENT';
        intentTitle = isHostileReconnaissance || isIdeologicalRecruitment
          ? 'ст. 111-2, 114-2 ККУ (Ворожа розвідка / Шпигунство)'
          : 'ст. 111-2, 113 ККУ (Вербування / Диверсія)';
        confidence = Math.min(95, Math.round(Math.max(topMatch.similarity * 100, 75)));
        reason = isPureHighVectorSabotage && !isIdeologicalRecruitment && !isHostileReconnaissance
          ? `Семантичний векторний збіг: запит на фото/відео зйомку чутливого об\u2019єкта без явної грошової пропозиції (прихована розвідка)`
          : isIdeologicalRecruitment
            ? 'Семантичний збіг: вербування під прикриттям руху опору та збір військових координат'
            : isHostileReconnaissance
              ? `Семантичний збіг: несанкціонований збір координат військових об\u2019єктів чи транспорту (ст. 114-2 ККУ)`
              : 'Семантичний матричний збіг: пропозиція винагороди за розвідувальні чи диверсійні дії';
      } else if (isCredentialPragmatic) {
        hasFormedIntent = true;
        intentType = 'PAYMENT_CREDENTIAL_THEFT';
        intentTitle = 'Викрадення платіжних реквізитів';
        confidence = Math.min(90, Math.round(topMatch.similarity * 100));
        reason = 'Семантичний векторний збіг з шаблонами викрадення реквізитів';
      }
    }

    const reconMatches = Array.from(new Set(Array.from(combinedText.matchAll(new RegExp(this.RECON_REGEX.source, 'gi'))).map(m => m[0])));
    const ideologyMatches = Array.from(new Set(Array.from(combinedText.matchAll(new RegExp(this.IDEOLOGY_COVER_REGEX.source, 'gi'))).map(m => m[0])));

    const matchedKeywords = [
      ...signals.rewardMatches,
      ...signals.actionMatches,
      ...signals.targetMatches,
      ...signals.discretionMatches,
      ...reconMatches,
      ...ideologyMatches,
    ];

    const telemetry = this.generateTelemetry(
      combinedText,
      signals,
      topMatch,
      matches,
      {
        hasFormedIntent,
        intentType,
        confidence,
        reason,
        latestMessage: text,
      },
      conceptWeights
    );

    return {
      hasFormedIntent,
      intentType,
      intentTitle,
      confidence,
      similarityScore: topMatch.similarity,
      signals,
      matchedPrototypes: matches,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
      reason,
      telemetry,
    };
  }

  /**
   * Генерація 10-вимірної семантичної спектральної телеметрії для візуалізації в DebuggerOverlay
   */
  public static generateTelemetry(
    text: string,
    signals: SemanticSignalBreakdown,
    topMatch: SemanticVectorMatch,
    allMatches: SemanticVectorMatch[],
    evaluationMeta?: {
      hasFormedIntent: boolean;
      intentType: string;
      confidence: number;
      reason: string;
      latestMessage?: string;
    },
    precomputedWeights?: Record<string, { weight: number; tokens: string[] }>
  ): SemanticVectorTelemetry {
    const activeProtoKey = topMatch.prototypeId in this.PROTOTYPE_PROFILES
      ? topMatch.prototypeId
      : 'MILITARY_SABOTAGE_RECRUITMENT';
    
    const activeProfile = this.PROTOTYPE_PROFILES[activeProtoKey];
    const inputWeights = precomputedWeights || this.computeInputWeights(text, signals);

    const DIMENSION_CONFIG: { key: string; labelUk: string }[] = [
      { key: 'reward', labelUk: 'Винагорода' },
      { key: 'action', labelUk: 'Дія / Завдання' },
      { key: 'target', labelUk: 'Об’єкт / Будівлі' },
      { key: 'vehicle', labelUk: 'Транспорт' },
      { key: 'media', labelUk: 'Фото / Відео' },
      { key: 'sabotage', labelUk: 'Диверсія' },
      { key: 'discretion', labelUk: 'Таємність' },
      { key: 'messenger', labelUk: 'Месенджер' },
      { key: 'escrow', labelUk: 'Ескроу' },
      { key: 'credential', labelUk: 'Реквізити' },
    ];

    const dimensions: SemanticDimensionValue[] = DIMENSION_CONFIG.map(({ key, labelUk }) => ({
      key,
      labelUk,
      inputWeight: Math.round(inputWeights[key].weight * 100) / 100,
      prototypeWeight: Math.round((activeProfile[key] || 0.1) * 100) / 100,
      matchedTokens: inputWeights[key].tokens,
    }));

    const allPrototypes = allMatches.map(m => ({
      id: m.prototypeId,
      labelUk: m.labelUk,
      similarity: m.similarity,
      prototypeWeights: this.PROTOTYPE_PROFILES[m.prototypeId] || this.PROTOTYPE_PROFILES.MILITARY_SABOTAGE_RECRUITMENT,
    }));

    return {
      rawText: text,
      latestMessage: evaluationMeta?.latestMessage || text,
      topPrototypeId: topMatch.prototypeId,
      topPrototypeLabel: topMatch.labelUk,
      cosineSimilarity: topMatch.similarity,
      dimensions,
      allPrototypes,
      timestamp: Date.now(),
      hasFormedIntent: evaluationMeta?.hasFormedIntent ?? false,
      intentType: evaluationMeta?.intentType,
      confidence: evaluationMeta?.confidence,
      reason: evaluationMeta?.reason,
    };
  }

  /**
   * Демонстраційний еталонний стан телеметрії до першого вхідного повідомлення
   */
  public static getDefaultTelemetry(): SemanticVectorTelemetry {
    const defaultText = 'Шукаємо кур’єрів-розвідників у Дніпрі, підійди за адресою і сфотографуй будівлю ТЦК та номери машин, плачу 500$ у крипті';
    const signals = this.extractBehavioralSignals(defaultText);
    const topMatch = {
      prototypeId: 'MILITARY_SABOTAGE_RECRUITMENT',
      similarity: 0.84,
      labelUk: 'ст. 111-2, 113 ККУ (Вербування / Диверсія)',
    };
    return this.generateTelemetry(defaultText, signals, topMatch, [
      topMatch,
      { prototypeId: 'PAYMENT_CREDENTIAL_THEFT', similarity: 0.18, labelUk: 'Викрадення платіжних реквізитів' },
    ], {
      hasFormedIntent: true,
      intentType: 'MILITARY_SABOTAGE_RECRUITMENT',
      confidence: 84,
      reason: 'Демонстраційний збіг за матрицею намірів (вербування / розвідка)',
      latestMessage: defaultText,
    });
  }
}
