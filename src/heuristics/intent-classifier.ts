export type ScamIntentType =
  | 'ESCROW_DELIVERY_SCAM'
  | 'OFF_PLATFORM_REDIRECT'
  | 'PAYMENT_CREDENTIAL_THEFT'
  | 'URGENCY_PRESSURE';

export interface IntentMatchSpan {
  start: number;
  end: number;
  text: string;
  cluster: string;
}

export interface IntentClassificationResult {
  hasFormedIntent: boolean;
  intentType?: ScamIntentType;
  intentTitle?: string;
  confidence?: number;
  matchedSpans: IntentMatchSpan[];
  clustersDetected: string[];
  explanation?: string;
  whereToBeCareful?: string;
}

interface ClusterRule {
  cluster: string;
  weight: number;
  patterns: RegExp[];
}

interface IntentDefinition {
  type: ScamIntentType;
  title: string;
  requiredClusters: string[][];
  minClusters: number;
  minScore: number;
  explanationTemplate: (clusters: string[], words: string[]) => string;
  carefulAdvice: string;
}

export class IntentClassifier {
  /**
   * Семантичні словники кластерів слів
   */
  private static clusters: ClusterRule[] = [
    {
      cluster: 'delivery_action',
      weight: 30,
      patterns: [
        /\b(olx[-_\s]?доставка|олх[-_\s]?доставка|безпечна угода|доставка nova poshta|нова пошта доставка)\b/gi,
        /\b(я оформив|я вже оформила|оформив замовлення|оформила замовлення|замовлення створено)\b/gi,
        /\b(оплатив|оплатила|кошти списано|оплату внесено)\b/gi,
      ],
    },
    {
      cluster: 'payment_claim',
      weight: 35,
      patterns: [
        /\b(отримати кошти|отримання коштів|зарахування коштів|забрати гроші|підтвердити виплату)\b/gi,
        /\b(підтвердити отримання|переказ коштів|виплата коштів|кошти на картку)\b/gi,
      ],
    },
    {
      cluster: 'action_link',
      weight: 25,
      patterns: [
        /\b(перейдіть за посиланням|перейдіть за цим посиланням|ось посилання|тисніть тут|ось лінк)\b/gi,
        /\b(перевірте за посиланням|посилання для підтвердження|форма для виплати)\b/gi,
        /(https?:\/\/[^\s]+)/gi,
      ],
    },
    {
      cluster: 'off_platform',
      weight: 35,
      patterns: [
        /\b(вайбер|viber|телеграм|telegram|в тг|напишіть у вайбер|скиньте у телеграм|пишіть у ватсап|whatsapp)\b/gi,
        /\b(номер телефону|перейдемо в|скину фото туди|там зручніше)\b/gi,
        /(t\.me\/[a-z0-9_]+|wa\.me\/[0-9]+)/gi,
      ],
    },
    {
      cluster: 'credential_harvest',
      weight: 40,
      patterns: [
        /\b(номер картки|термін дії|код безпеки|cvv|cvc|баланс на картці|залишок коштів)\b/gi,
        /\b(пароль з смс|одноразовий пароль|підтвердження банку|дівоче прізвище)\b/gi,
      ],
    },
    {
      cluster: 'urgency_pressure',
      weight: 20,
      patterns: [
        /\b(терміново|прямо зараз|протягом \d+ хвилин|залишилося мало часу|скасується замовлення)\b/gi,
        /\b(анулюється|швидше підтвердіть)\b/gi,
      ],
    },
  ];

  /**
   * Правила формування цілісних намірів
   */
  private static intentDefinitions: IntentDefinition[] = [
    {
      type: 'ESCROW_DELIVERY_SCAM',
      title: 'Імітація фінансової угоди (OLX Доставка)',
      requiredClusters: [
        ['delivery_action', 'payment_claim'],
        ['delivery_action', 'action_link'],
        ['payment_claim', 'action_link'],
      ],
      minClusters: 2,
      minScore: 50,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник поєднує повідомлення про фіктивне оформлення угоди зі спонуканням перейти за зовнішнім посиланням або «отримати кошти» (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби доставки ніколи не надсилають посилання для зарахування оплати у відкритому чаті.`,
      carefulAdvice:
        'Не відкривайте надіслане посилання. Перевірте статус оголошення виключно в офіційному розділі «Мої замовлення» на сайті olx.ua.',
    },
    {
      type: 'OFF_PLATFORM_REDIRECT',
      title: 'Спроба виведення діалогу за межі захищеного чату',
      requiredClusters: [
        ['off_platform'],
      ],
      minClusters: 1,
      minScore: 35,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник наполегливо пропонує продовжити спілкування у сторонньому месенджері (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Шахраї використовують це, щоб обійти фільтри безпеки маркетплейсу та надіслати фішингові посилання.`,
      carefulAdvice:
        'Продовжуйте листування виключно у вбудованому чаті платформи. Поза платформою ваша безпека та угода не захищені.',
    },
    {
      type: 'PAYMENT_CREDENTIAL_THEFT',
      title: 'Спроба збору конфіденційних банківських реквізитів',
      requiredClusters: [
        ['credential_harvest'],
      ],
      minClusters: 1,
      minScore: 40,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник запитує конфіденційні реквізити рахунку (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Для отримання переказу іншій особі потрібен лише 16-значний номер картки або IBAN.`,
      carefulAdvice:
        'Ніколи не повідомляйте CVV-код зі звороту картки, залишок на балансі або одноразові коди підтвердження з SMS.',
    },
  ];

  /**
   * Класифікація вхідного тексту на наявність сформованого наміру
   */
  public static classify(text: string): IntentClassificationResult {
    if (!text || text.trim().length < 6) {
      return { hasFormedIntent: false, matchedSpans: [], clustersDetected: [] };
    }

    const matchedSpans: IntentMatchSpan[] = [];
    const detectedClusterMap: Map<string, number> = new Map();

    // 1. Пошук збігів за всіма кластерами
    for (const rule of this.clusters) {
      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          const matchText = match[0];
          const start = match.index;
          const end = start + matchText.length;

          // Уникаємо накладання
          const exists = matchedSpans.some(
            (s) => Math.abs(s.start - start) < 3 && Math.abs(s.end - end) < 3
          );

          if (!exists) {
            matchedSpans.push({
              start,
              end,
              text: matchText,
              cluster: rule.cluster,
            });

            const currentScore = detectedClusterMap.get(rule.cluster) || 0;
            detectedClusterMap.set(rule.cluster, currentScore + rule.weight);
          }
        }
      }
    }

    if (matchedSpans.length === 0) {
      return { hasFormedIntent: false, matchedSpans: [], clustersDetected: [] };
    }

    // Сортуємо спани за позицією в тексті
    matchedSpans.sort((a, b) => a.start - b.start);
    const clustersDetected = Array.from(detectedClusterMap.keys());
    const totalScore = Array.from(detectedClusterMap.values()).reduce((a, b) => a + b, 0);

    // 2. Зіставлення з визначеннями намірів
    for (const def of this.intentDefinitions) {
      const matchesRule = def.requiredClusters.some((reqList) =>
        reqList.every((req) => clustersDetected.includes(req))
      );

      if (matchesRule && clustersDetected.length >= def.minClusters && totalScore >= def.minScore) {
        const words = matchedSpans.map((s) => s.text);
        const explanation = def.explanationTemplate(clustersDetected, words);
        const confidence = Math.min(96, 50 + totalScore / 2);

        return {
          hasFormedIntent: true,
          intentType: def.type,
          intentTitle: def.title,
          confidence: Math.round(confidence),
          matchedSpans,
          clustersDetected,
          explanation,
          whereToBeCareful: def.carefulAdvice,
        };
      }
    }

    return {
      hasFormedIntent: false,
      matchedSpans,
      clustersDetected,
    };
  }
}
