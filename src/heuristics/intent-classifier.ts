import { TextNormalizer } from './text-normalizer';
import { UrlExtractor } from './url-extractor';
import { PersonalVaultManager } from '../core/personal-vault';

export type ScamIntentType =
  | 'ESCROW_DELIVERY_SCAM'
  | 'OFF_PLATFORM_REDIRECT'
  | 'VERIFICATION_PHISHING'
  | 'PAYMENT_CREDENTIAL_THEFT'
  | 'IDENTITY_PROBING'
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
  suspiciousUrls?: string[];
  normalizedText: string;
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
   * Семантичні словники кластерів слів (без використання нестійкого ASCII \b для кирилиці)
   */
  private static clusters: ClusterRule[] = [
    {
      cluster: 'delivery_action',
      weight: 30,
      patterns: [
        /(?:оlх|олх)[-_\s]?доставк[а-яіїє]*/gi,
        /(?:я\s+вже\s+)?оформи[ла-я]*(\s+замовлення)?/gi,
        /безпечн[а-я]\s+угод[а-я]/gi,
        /перш[а-я]\s+угод[а-я]/gi,
        /оплат[а-я]\s+(внесен[а-я]|успішн[а-я]|списан[а-я])/gi,
      ],
    },
    {
      cluster: 'payment_claim',
      weight: 35,
      patterns: [
        /(?:до\s+)?отриманн[яі](\s*кошт[а-я]*|\s*грош[а-я]*)?/gi,
        /отримати\s+(кошт[а-я]*|грош[а-я]*)/gi,
        /підтвердити\s+виплату/gi,
        /зарахуванн[яі]\s+кошт[а-я]*/gi,
      ],
    },
    {
      cluster: 'action_link',
      weight: 25,
      patterns: [
        /(?:перейдіть|перевірте|виділіть|вставте|відкрийте|тисніть|клікніть|ось)\s*(?:за\s+)?(?:цим\s+)?(?:посиланн[яі]|лінк[а-я]*)/gi,
        /посиланн[яі]|лінк[а-я]*/gi,
        /httрs?:\/\/[^\s]+/gi,
      ],
    },
    {
      cluster: 'off_platform',
      weight: 35,
      patterns: [
        /t\.mе\/[a-z0-9_]+/gi,
        /вайбер|vіbеr|телеграм|tеlеgram|в\s+тг|чат-?бот[а-я]*|боті?|ботом|whatsарр|ватсап/gi,
        /wа\.mе\/[0-9]+/gi,
      ],
    },
    {
      cluster: 'verification_trap',
      weight: 40,
      patterns: [
        /перевірк[а-я](\s*(профіл[а-я]|даних|картк[а-я]))?/gi,
        /верифікаці[а-я](\s*(профіл[а-я]|даних|картк[а-я]))?/gi,
        /номер\s+картки|код\s+безпеки|сvv|сvс|баланс\s+на\s+картці|залишок\s+коштів/gi,
        /пароль\s+з\s+смс|код\s+з\s+смс|підтвердження\s+банку/gi,
      ],
    },
    {
      cluster: 'urgency_pressure',
      weight: 20,
      patterns: [
        /статус[іа]?\s+очікуванн[яі]/gi,
        /доки\s+перевірка\s+не\s+буде\s+завершен[а-я]/gi,
        /термінов[оа]|прямо\s+зараз|протягом\s+\d+\s+хвилин|залишилося\s+мало\s+часу/gi,
        /анулюється|швидше\s+підтвердіть/gi,
      ],
    },
    {
      cluster: 'identity_probing',
      weight: 45,
      patterns: [
        // Запит ІПН / РНОКПП / податкового коду
        /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|потрібен|треба|вишліть|дайте)\s+(?:ваш\s+|свій\s+)?(?:іпн|рнокпп|ідентифікаційний\s+код|податковий\s+номер|код\s+платника)/gi,
        /(?:іпн|рнокпп)\s+(?:отримувача|платника|відправника)/gi,
        // Запит дівочого прізвища матері (Tier A)
        /(?:напишіть|вкажіть|скажіть|яке|назвіть|дівоче)\s+(?:дівоче\s+)?прізвище\s*(?:матері)?/gi,
        /дівоче\s+прізвище(\s+матері)?/gi,
        /прізвище\s+матері/gi,
        // Запит кодового слова банку (Tier A)
        /(?:кодове|секретне|контрольне)\s+слово(?:\s+банку)?/gi,
        /(?:назвіть|підтвердіть|скажіть|напишіть)\s+(?:кодове|секретне)\s+слово/gi,
        // Запит паспорта / ID картки
        /(?:напишіть|скиньте|вкажіть|номер|серія)\s+(?:паспорта|айді|id[-_\s]?картки|документа)/gi,
        // Запит дати народження
        /(?:дата|день|рік)\s+народження/gi,
      ],
    },
  ];

  /**
   * Правила формування цілісних намірів
   */
  private static intentDefinitions: IntentDefinition[] = [
    {
      type: 'VERIFICATION_PHISHING',
      title: 'Шахрайська «перевірка профілю» (Фішинг доступу)',
      requiredClusters: [
        ['verification_trap', 'off_platform'],
        ['verification_trap', 'action_link'],
        ['verification_trap', 'delivery_action'],
        ['verification_trap', 'urgency_pressure'],
      ],
      minClusters: 2,
      minScore: 45,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник або бот вимагає пройти «перевірку даних» чи перейти в сторонній бот (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби ніколи не верифікують акаунти через сторонні Telegram-боти або чати.`,
      carefulAdvice:
        'Не переходьте в Telegram-боти та не вводьте реквізити. Будь-які перевірки профілю OLX відбуваються виключно в офіційному особистому кабінеті.',
    },
    {
      type: 'ESCROW_DELIVERY_SCAM',
      title: 'Імітація фінансової угоди (OLX Доставка)',
      requiredClusters: [
        ['delivery_action', 'payment_claim'],
        ['delivery_action', 'action_link'],
        ['payment_claim', 'action_link'],
        ['delivery_action', 'off_platform'],
      ],
      minClusters: 2,
      minScore: 45,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник поєднує повідомлення про оформлення угоди зі спонуканням перейти за посиланням або «отримати кошти» (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби доставки ніколи не надсилають посилань для зарахування коштів у чаті.`,
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
        ['verification_trap'],
      ],
      minClusters: 1,
      minScore: 40,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник запитує конфіденційні реквізити рахунку (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Для отримання переказу іншій особі потрібен лише 16-значний номер картки або IBAN.`,
      carefulAdvice:
        'Ніколи не повідомляйте CVV-код зі звороту картки, залишок на балансі або одноразові коди підтвердження з SMS.',
    },
    {
      type: 'IDENTITY_PROBING',
      title: 'Спроба виманювання персональних маркерів особи (Identity Probing)',
      requiredClusters: [
        ['identity_probing'],
      ],
      minClusters: 1,
      minScore: 40,
      explanationTemplate: (_clusters, words) =>
        `Співрозмовник випитує конфіденційні персональні дані або банківські маркери безпеки (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби та покупці ніколи не запитують ІПН, дівоче прізвище матері чи кодове слово банку в чаті.`,
      carefulAdvice:
        'Ніколи не повідомляйте свій ІПН, дівоче прізвище матері, кодове слово банку або паспортні дані стороннім особам у листуванні.',
    },
  ];

  /**
   * Класифікація вхідного тексту на наявність сформованого наміру
   */
  public static extractClusters(rawText: string) {
    if (!rawText || rawText.trim().length < 4) {
      return { matchedSpans: [], detectedClusterMap: new Map<string, number>(), normalizedText: rawText || '' };
    }
    const text = TextNormalizer.normalizeWords(rawText);
    const matchedSpans: IntentMatchSpan[] = [];
    const detectedClusterMap: Map<string, number> = new Map();

    for (const rule of this.clusters) {
      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          matchedSpans.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            cluster: rule.cluster,
          });
          const currentMax = detectedClusterMap.get(rule.cluster) || 0;
          detectedClusterMap.set(rule.cluster, Math.max(currentMax, rule.weight));
        }
      }
    }

    // Динамічна перевірка ключових слів активних об'єктів Personal Vault
    try {
      const vaultItems = PersonalVaultManager.getItemsSync();
      if (vaultItems && vaultItems.length > 0) {
        const actionPromptRegex = /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|потрібен|треба|вишліть|дайте|підтвердіть)\s+(?:ваш\s+|свій\s+)?/i;
        for (const item of vaultItems) {
          if (!item.enabled && item.enabled !== undefined) continue;
          for (const kw of item.keywords) {
            const kwClean = kw.trim().toLowerCase();
            if (kwClean.length >= 3 && text.includes(kwClean)) {
              const kwIdx = text.indexOf(kwClean);
              const preceding = text.slice(Math.max(0, kwIdx - 40), kwIdx);
              if (
                actionPromptRegex.test(preceding) ||
                item.category === 'MOTHER_MAIDEN_NAME' ||
                item.category === 'SECRET_WORD'
              ) {
                matchedSpans.push({
                  start: kwIdx,
                  end: kwIdx + kwClean.length,
                  text: text.slice(kwIdx, kwIdx + kwClean.length),
                  cluster: 'identity_probing',
                });
                const currentMax = detectedClusterMap.get('identity_probing') || 0;
                detectedClusterMap.set('identity_probing', Math.max(currentMax, 45));
              }
            }
          }
        }
      }
    } catch {}

    return { matchedSpans, detectedClusterMap, normalizedText: text };
  }

  public static evaluateStatefulIntent(activeClusters: string[], detectedClusterMap: Map<string, number>, matchedSpans: IntentMatchSpan[], rawText: string): IntentClassificationResult {
    if (activeClusters.length === 0) {
      return { hasFormedIntent: false, matchedSpans, clustersDetected: [], suspiciousUrls: UrlExtractor.extract(rawText), normalizedText: rawText };
    }

    for (const def of this.intentDefinitions) {
      const hasMinClusters = activeClusters.length >= def.minClusters;

      let score = 0;
      for (const c of activeClusters) {
        score += detectedClusterMap.get(c) || 35;
      }
      const hasMinScore = score >= def.minScore;

      let hasRequiredPattern = false;
      for (const requiredSet of def.requiredClusters) {
        if (requiredSet.every((c) => activeClusters.includes(c))) {
          hasRequiredPattern = true;
          break;
        }
      }

      if (hasMinClusters && hasMinScore && hasRequiredPattern) {
        const words = matchedSpans.map((s) => s.text);
        const suspiciousUrls = UrlExtractor.extract(rawText);

        return {
          hasFormedIntent: true,
          intentType: def.type,
          intentTitle: def.title,
          confidence: Math.min(score, 100),
          matchedSpans,
          clustersDetected: activeClusters,
          explanation: def.explanationTemplate(activeClusters, words),
          whereToBeCareful: def.carefulAdvice,
          suspiciousUrls,
          normalizedText: rawText,
        };
      }
    }

    return {
      hasFormedIntent: false,
      matchedSpans,
      clustersDetected: activeClusters,
      suspiciousUrls: UrlExtractor.extract(rawText),
      normalizedText: rawText,
    };
  }

  public static classify(rawText: string): IntentClassificationResult {
    const extracted = this.extractClusters(rawText);
    if (extracted.detectedClusterMap.size === 0) {
      return { hasFormedIntent: false, matchedSpans: [], clustersDetected: [], normalizedText: extracted.normalizedText };
    }
    const activeClusters = Array.from(extracted.detectedClusterMap.keys());
    return this.evaluateStatefulIntent(activeClusters, extracted.detectedClusterMap, extracted.matchedSpans, rawText);
  }
}
