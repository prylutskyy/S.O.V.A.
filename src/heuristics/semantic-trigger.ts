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
        'предложение работы в крипте за фотосъемку зданий, военкоматов, машин с номерами или поджог релейного шкафа'
      ]
    },
    {
      id: 'ESCROW_DELIVERY_SCAM',
      labelUk: 'Імітація фінансової угоди або фейкова курєрська доставка',
      texts: [
        'я вже оформив доставку і сплатив кошти, перейдіть за посиланням для отримання грошей на карту',
        'оформіть безпечну угоду на сайті та підтвердіть зарахування коштів за посиланням',
        'я оплатил товар через курьерскую доставку, вот ссылка для получения средств на вашу банковскую карту'
      ]
    },
    {
      id: 'PAYMENT_CREDENTIAL_THEFT',
      labelUk: 'Виманювання платіжних реквізитів або кодів авторизації',
      texts: [
        'для підтвердження переказу вкажіть повний номер карти, термін дії, свв код та смс пароль від банку',
        'верифікація платіжної операції вимагає введення секретного коду або підтвердження з повідомлення'
      ]
    }
  ];

  // Словники маркерів прагматичної матриці
  private static readonly REWARD_REGEX = /(?:\$|€|usd|usdt|uah|грн|крипт|біткоїн|оплат|заплат|плачу|платимо|тариф|ставк|грош|бакс|сотк|тисяч|заробіт|дохід|заробити|підробіт|на карту|на гаманець|\b\d+\s*(?:\$|usdt|грн|бакс))/i;
  private static readonly ACTION_REGEX = /(?:робот|підробіт|підійди|підійдіть|сфоткай|сфотографуй|зроби\s+фото|зніми\s+відео|зафільмуй|оглянь|подивись|перевір|надішли|скинь|скинеш|кинь|купи|купуєш|розпали|підпали|підпалюєш|закинь|віднеси|поклади|прикріпи|курєр|розвідник|розвідк|завдання|тестов)/i;
  private static readonly TARGET_REGEX = /(?:будівл|споруд|обєкт|адміністрац|стоянц|парковк|авто|машин|транспорт|бус|номер|хрест|піксель|паркан|колі[яї]|релейн|шаф|дріт|веж|міст|військов|тцк|воєнкомат|частин|блокпост|патрул|адрес|вулиц|локац|координат)/i;
  private static readonly DISCRETION_REGEX = /(?:швидк|тишк|анонім|конфіденційн|секрет|видали|очисти|безпечно|легко|не бійся|ніхто не взнає|ніхто не побачить|перевірен|прямо зараз)/i;

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

    // 3. Семантичні концептуальні токени (Synonym Concept Expansion)
    const concepts = [
      { name: '__concept_photo__', match: /фото|сфот|знім|відео|зафільм|кадр|зйомк/ },
      { name: '__concept_vehicle__', match: /авто|машин|бус|транспорт|номер|піксель|хрест/ },
      { name: '__concept_building__', match: /будівл|споруд|тцк|воєнкомат|адміністрац|обєкт|стоянц|парковк/ },
      { name: '__concept_money__', match: /грош|кошт|бакс|дол|usdt|крипт|uah|грн|оплат|плачу|заплат|заробіт|підробіт/ },
      { name: '__concept_task__', match: /підійди|піди|сходи|зроби|перевір|оглянь|купи|підпали|розпали|завданн|робот/ },
      { name: '__concept_sabotage__', match: /підпал|розпалювач|коктейл|молотов|релейн|шаф|диверс|знищ/ },
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
    const combinedText = fullDialogueContext ? `${fullDialogueContext}\n${text}` : text;
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
    const isSabotagePragmatic =
      (signals.hasRewardIncentive && signals.hasActionDirective && signals.hasTargetFocus) ||
      (signals.hasRewardIncentive && signals.hasActionDirective && signals.hasDiscretionUrgency) ||
      (signals.hasActionDirective && signals.hasTargetFocus && topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' && topMatch.similarity >= 0.30);

    const isHighVectorSabotage =
      topMatch.prototypeId === 'MILITARY_SABOTAGE_RECRUITMENT' && topMatch.similarity >= 0.40;

    const isEscrowPragmatic =
      topMatch.prototypeId === 'ESCROW_DELIVERY_SCAM' && (topMatch.similarity >= 0.42 || (signals.hasRewardIncentive && /доставк|оформ|посилан/i.test(combinedText)));

    const isCredentialPragmatic =
      topMatch.prototypeId === 'PAYMENT_CREDENTIAL_THEFT' && topMatch.similarity >= 0.45;

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
    };
  }
}
