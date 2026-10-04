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
        'купи жидкость для розжига или сделай коктейль молотова и подожги релейный шкаф на перегоне за доллары'
      ]
    },
    {
      id: 'ESCROW_DELIVERY_SCAM',
      labelUk: 'Імітація фінансової угоди або фейкова курєрська доставка',
      texts: [
        'я вже оформив доставку і сплатив кошти, перейдіть за посиланням для отримання грошей на карту',
        'оформіть безпечну угоду на сайті та підтвердіть зарахування коштів за посиланням',
        'я оплатил товар через курьерскую доставку, вот ссылка для получения средств на вашу банковскую карту',
        'я оформил олх доставку и оплатил товар, перейдите по ссылке чтобы получить деньги на карту',
        'безопасная сделка оформлена, вот ссылка на получение средств, подтвердите перевод на карту',
        'средства зарезервированы службой доставки, откройте ссылку и введите реквизиты для зачисления оплаты'
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

  private static readonly REWARD_REGEX = /(?:\$|€|usd|usdt|uah|грн|крипт|биткоин|біткоїн|оплат|заплат|плачу|платим|платимо|тариф|(?<![\p{L}\p{N}])ставк|грош|деньг|бакс|сотк|тысяч|тисяч|тыщ|заробіт|заработ|доход|дохід|заробити|заработать|підробіт|подработ|на карту|на гаманець|на кошелек|на кошелёк|(?<![\p{L}\p{N}])(?:рубл|руб(?![а-яіїєё]))|\b\d+\s*(?:\$|€|usdt|usd|грн|руб|бакс))/iu;
  private static readonly ACTION_REGEX = /(?:робот|работ|підробіт|подработ|підійди|підійдіть|подойди|подойдите|сходи|пойди|сфоткай|сфотографуй|сфотографируй|зроби\s+фото|сделай\s+фото|зніми\s+відео|сними\s+видео|зафільмуй|засними|оглянь|подивись|посмотри|глянь|перевір|проверь|надішли|отправь|скинь|скинеш|скинешь|скинуть|кинь|купи|купуєш|купишь|розпали|підпали|підпалюєш|подожги|сожги|подж[её]г|закинь|віднеси|отнеси|поклади|положи|прикріпи|прикрепи|курєр|курьер|розвідник|разведчик|розвідк|разведк|завдання|задани|тестов)/i;
  private static readonly TARGET_REGEX = /(?:будівл|здани|споруд|сооружени|обєкт|объект|адміністрац|администрац|стоянц|парковк|стоян|авто|машин|транспорт|бус|номер|хрест|крест|піксель|пиксель|паркан|забор|колі[яї]|рельс|пут[еий]|ж\/?д|перегон|релейн|шаф|дріт|провод|веж|вышк|міст|мост|військов|военн|всу|тцк|воєнкомат|военкомат|частин|част[иь]|блокпост|патрул|адрес|вулиц|улиц|локац|координат)/i;
  private static readonly DISCRETION_REGEX = /(?:швидк|быстр|тишк|тихо|втихую|тихар|анонім|аноним|конфіденційн|конфиденциальн|секрет|видали|удали|очисти|безпечно|безопасно|легко|не бійся|не бойся|ніхто не взнає|ніхто не побачить|никто не узнает|никто не увидит|перевірен|проверен|прямо зараз|прямо сейчас)/i;

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
      { name: '__concept_vehicle__', match: /авто|машин|бус|транспорт|номер|піксель|пиксель|хрест|крест|тачк/i },
      { name: '__concept_building__', match: /будівл|здани|споруд|сооружени|тцк|воєнкомат|военкомат|адміністрац|администрац|обєкт|объект|стоянц|парковк|стоян/i },
      { name: '__concept_money__', match: /грош|деньг|кошт|бакс|дол|usdt|крипт|uah|грн|руб|оплат|плачу|платим|заплат|заробіт|заработ|підробіт|подработ/i },
      { name: '__concept_task__', match: /підійди|подойди|піди|пойди|сходи|зроби|сделай|перевір|проверь|оглянь|посмотри|глянь|купи|підпали|подожги|сожги|розпали|завданн|задани|робот|работ/i },
      { name: '__concept_sabotage__', match: /підпал|поджог|сожги|подожги|розпалювач|розжиг|коктейл|молотов|релейн|шаф|диверс|знищ|уничтож/i },
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

  /**
   * Комплексна семантична оцінка повідомлення або діалогу
   */
  public static evaluate(text: string, fullDialogueContext?: string): SemanticEvaluationResult {
    const combinedText = fullDialogueContext
      ? (fullDialogueContext.includes(text) ? fullDialogueContext : `${fullDialogueContext}\n${text}`)
      : text;
    const inputVector = this.vectorize(combinedText);
    const signals = this.extractBehavioralSignals(combinedText);

    const matches: SemanticVectorMatch[] = [];

    for (const proto of this.PROTOTYPES) {
      let maxSim = 0;
      for (const sample of proto.texts) {
        const protoVec = this.vectorize(sample);
        const sim = this.cosineSimilarity(inputVector, protoVec);
        if (sim > maxSim) maxSim = sim;
      }
      matches.push({
        prototypeId: proto.id,
        similarity: Math.round(maxSim * 100) / 100,
        labelUk: proto.labelUk,
      });
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatch = matches[0];

    // Критерії активації семантичного тригера:
    // 1. Пряма векторна подібність високого рівня (>= 0.45)
    // 2. Прагматичний перетин: Винагорода + Дія + Ціль/Об'єкт
    // 3. Прагматичний перетин: Винагорода + Дія + Терміновість/Конфіденційність
    // 4. Дія + Ціль + середня векторна подібність (>= 0.35)
    const hasCourierScoutRecruitment =
      signals.hasRewardIncentive &&
      signals.hasActionDirective &&
      /кур(?:[ь'’]?є|ьер|ер)|розвід|развед/i.test(combinedText) &&
      topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' &&
      topMatch.similarity >= 0.30;

    const isSabotagePragmatic =
      (signals.hasRewardIncentive && signals.hasActionDirective && signals.hasTargetFocus) ||
      (signals.hasRewardIncentive && signals.hasActionDirective && signals.hasDiscretionUrgency) ||
      hasCourierScoutRecruitment ||
      (signals.hasActionDirective && signals.hasTargetFocus && topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' && topMatch.similarity >= 0.30);

    const isHighVectorSabotage =
      topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' && topMatch.similarity >= 0.40;

    const isEscrowPragmatic =
      topMatch.prototypeId === 'ESCROW_DELIVERY_SCAM' &&
      (topMatch.similarity >= 0.42 ||
        (topMatch.similarity >= 0.28 &&
          signals.hasRewardIncentive &&
          /посилан|ссылк|перейдіть|перейдите|получить|отримати|зачислени/i.test(combinedText)));

    const isCredentialPragmatic =
      topMatch.prototypeId === 'PAYMENT_CREDENTIAL_THEFT' &&
      (topMatch.similarity >= 0.45 || (topMatch.similarity >= 0.38 && /cvv|cvc|срок\s+действия|термін\s+дії|номер\s+карт|парол|смс/i.test(combinedText)));

    let hasFormedIntent = false;
    let intentType = 'UNKNOWN';
    let intentTitle = '';
    let confidence = 0;
    let reason = '';

    if (isSabotagePragmatic || isHighVectorSabotage) {
      hasFormedIntent = true;
      intentType = 'MILITARY_SABOTAGE_RECRUITMENT';
      intentTitle = 'ст. 111-2, 113 ККУ (Вербування / Диверсія)';
      confidence = Math.min(95, Math.round(Math.max(topMatch.similarity * 100, 75)));
      reason = 'Семантичний матричний збіг: пропозиція винагороди за розвідувальні чи диверсійні дії';
    } else if (isEscrowPragmatic) {
      hasFormedIntent = true;
      intentType = 'ESCROW_DELIVERY_SCAM';
      intentTitle = 'Імітація фінансової угоди (Ескроу-шахрайство)';
      confidence = Math.min(90, Math.round(topMatch.similarity * 100));
      reason = 'Семантичний векторний збіг з шаблонами фішингу доставки';
    } else if (isCredentialPragmatic) {
      hasFormedIntent = true;
      intentType = 'PAYMENT_CREDENTIAL_THEFT';
      intentTitle = 'Викрадення платіжних реквізитів';
      confidence = Math.min(90, Math.round(topMatch.similarity * 100));
      reason = 'Семантичний векторний збіг з шаблонами викрадення реквізитів';
    }

    const matchedKeywords = [
      ...signals.rewardMatches,
      ...signals.actionMatches,
      ...signals.targetMatches,
      ...signals.discretionMatches,
    ];

    const telemetry = this.generateTelemetry(combinedText, signals, topMatch, matches, {
      hasFormedIntent,
      intentType,
      confidence,
      reason,
      latestMessage: text,
    });

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
    ESCROW_DELIVERY_SCAM: {
      reward: 0.75,
      action: 0.60,
      target: 0.15,
      vehicle: 0.10,
      media: 0.05,
      sabotage: 0.05,
      discretion: 0.40,
      messenger: 0.80,
      escrow: 0.95,
      credential: 0.85,
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
    }
  ): SemanticVectorTelemetry {
    const activeProtoKey = topMatch.prototypeId in this.PROTOTYPE_PROFILES
      ? topMatch.prototypeId
      : 'MILITARY_SABOTAGE_RECRUITMENT';
    
    const activeProfile = this.PROTOTYPE_PROFILES[activeProtoKey];

    const inputWeights: Record<string, { weight: number; tokens: string[] }> = {
      reward: {
        weight: signals.hasRewardIncentive ? Math.min(1.0, 0.45 + signals.rewardMatches.length * 0.2) : 0.05,
        tokens: signals.rewardMatches,
      },
      action: {
        weight: signals.hasActionDirective ? Math.min(1.0, 0.40 + signals.actionMatches.length * 0.2) : 0.05,
        tokens: signals.actionMatches,
      },
      target: {
        weight: signals.hasTargetFocus ? Math.min(1.0, 0.40 + signals.targetMatches.length * 0.2) : 0.05,
        tokens: signals.targetMatches,
      },
      vehicle: {
        weight: /(?:авто|машин|бус|номер|піксель|пиксель|хрест|крест|тачк)/i.test(text) ? 0.85 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/авто|машин[а-яіїєё]*|бус[а-яіїєё]*|номер[а-яіїєё]*|піксель[а-яіїєё]*|пиксель[а-яіїєё]*|хрест[а-яіїєё]*|крест[а-яіїєё]*|тачк[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      media: {
        weight: /(?:фото|відео|видео|зніми|сними|сфоткай|засними|кадр|зйомк|съемк)/i.test(text) ? 0.90 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/фото[а-яіїєё]*|відео|видео|знім[а-яіїєё]*|сним[а-яіїєё]*|сфотк[а-яіїєё]*|засним[а-яіїєё]*|кадр|зйомк[а-яіїєё]*|съемк[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      sabotage: {
        weight: /(?:підпал|поджог|розпалювач|розжиг|подожги|сожги|коктейл|релейн|шаф|диверс)/i.test(text) ? 0.95 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/підпал[а-яіїєё]*|поджог[а-яіїєё]*|розпалювач[а-яіїєё]*|розжиг[а-яіїєё]*|подожг[а-яіїєё]*|сожг[а-яіїєё]*|коктейл[а-яіїєё]*|релейн[а-яіїєё]*|шаф[а-яіїєё]*|диверс[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      discretion: {
        weight: signals.hasDiscretionUrgency ? Math.min(1.0, 0.50 + signals.discretionMatches.length * 0.2) : 0.05,
        tokens: signals.discretionMatches,
      },
      messenger: {
        weight: /(?:телеграм|telegram|t\.me|вайбер|viber|wa\.me|whatsapp|чат-бот|телег[а-яіїєё]*)/i.test(text) ? 0.85 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/телеграм[а-яіїєё]*|telegram|t\.me|вайбер|viber|wa\.me|whatsapp|телег[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      escrow: {
        weight: /(?:доставк|безпечна\s+угода|безопасная\s+сделка|получить|отримати|зачислени|оплат|кур(?:[ь'’]?є|ьер|ер))/i.test(text) ? 0.90 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/доставк[а-яіїєё]*|безпечна\s+угода|безопасная\s+сделка|получить|отримати|зачислени[а-яіїєё]*|оплачен[а-яіїєё]*|кур(?:[ь'’]?є|ьер|ер)[а-яіїєё]*/gi)).map(m => m[0]))),
      },
      credential: {
        weight: /(?:cvv|cvc|парол|смс|код|баланс|термін\s+дії|срок\s+действия|номер\s+карт)/i.test(text) ? 0.95 : 0.05,
        tokens: Array.from(new Set(Array.from(text.matchAll(/cvv|cvc|парол[а-яіїєё]*|смс|код|баланс|термін\s+дії|срок\s+действия|номер\s+карт[а-яіїєё]*/gi)).map(m => m[0]))),
      },
    };

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
      { prototypeId: 'ESCROW_DELIVERY_SCAM', similarity: 0.22, labelUk: 'Імітація фінансової угоди (Ескроу)' },
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
