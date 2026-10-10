import { TextNormalizer } from './text-normalizer';
import { UrlExtractor } from './url-extractor';
import { PersonalVaultManager } from '../core/personal-vault';
import { FastLanguageDetector, SupportedLanguage } from './language-detector';

export type ScamIntentType =
  | 'ESCROW_DELIVERY_SCAM'
  | 'OFF_PLATFORM_REDIRECT'
  | 'VERIFICATION_PHISHING'
  | 'PAYMENT_CREDENTIAL_THEFT'
  | 'IDENTITY_PROBING'
  | 'URGENCY_PRESSURE'
  | 'MILITARY_SABOTAGE_RECRUITMENT'
  | 'SEED_PHRASE_THEFT'
  | 'CRYPTO_WALLET_COMPROMISE';

export interface IntentMatchSpan {
  start: number;
  end: number;
  text: string;
  cluster: string;
  weight?: number;
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
  detectedLanguage?: SupportedLanguage;
  isMixedLanguage?: boolean;
  telemetry?: any;
}

interface ClusterRule {
  cluster: string;
  weight: number;
  patterns: RegExp[];
  lang?: SupportedLanguage | 'universal';
}

interface LocalizedIntentCopy {
  title: string;
  explanation: (words: string[]) => string;
  carefulAdvice: string;
}

interface IntentDefinition {
  type: ScamIntentType;
  requiredClusters: string[][];
  /** Clusters allowed to contribute evidence to this candidate's score. */
  evidenceClusters: string[];
  minClusters: number;
  minScore: number;
  i18n: Record<SupportedLanguage, LocalizedIntentCopy>;
}

export class IntentClassifier {
  private static readonly OFF_PLATFORM_NEGATION = /(?:не|ніколи\s+не|не\s+(?:варто|треба|потрібно)|not|never|do\s+not|don['’]?t)\s+[^.!?\n]{0,35}$/iu;
  private static readonly SENSITIVE_REQUEST_NEGATION = /(?:^|[\s,;:])(?:не(?:\s+(?:потрібно|треба|варто|слід|можна))?|ніколи\s+не|never|do\s+not|don['’]?t|should\s+not|shouldn['’]?t)\s*$/iu;
  private static readonly HARD_LOCK_REQUEST_NEGATION = /(?:^|\s)(?:не|ніколи\s+не|never|do\s+not|don['’]?t)\s+(?:(?:просить|просит|asks?)\s+(?:you\s+)?(?:to\s+)?)?$/iu;

  /**
   * Семантичні словники кластерів слів з підтримкою динамічного перемикання мов:
   * 'uk' (Українська), 'ru' (Російська), 'en' (Англійська), 'universal' (Спільні/Технічні)
   */
  private static clusters: ClusterRule[] = [
    // =========================================================================
    // 1. DELIVERY ACTION (Оформлення фішингової доставки / покупки)
    // =========================================================================
    {
      cluster: 'delivery_action',
      weight: 30,
      lang: 'uk',
      patterns: [
        /(?:оlх|олх)[-_\s]?доставк[а-яіїє]*/gi,
        /(?:я\s+вже\s+)?оформи[ла-я]*(\s+замовлення)?/gi,
        /(?:я\s+вже\s+)?оплатив\s+(?:доставк[а-яіїє]*|замовленн[а-яіїє]*)/giu,
        /безпечн[а-я]\s+угод[а-я]/gi,
        /перш[а-я]\s+угод[а-я]/gi,
        /оплат[а-я]\s+(внесен[а-я]|успішн[а-я]|списан[а-я])/gi,
      ],
    },
    {
      cluster: 'delivery_action',
      weight: 30,
      lang: 'ru',
      patterns: [
        /(?:оlх|олх)[-_\s]?доставк[а-яё]*/gi,
        /(?:я\s+уже\s+)?оформил[а-яё]*(\s+заказ)?/gi,
        /безопасн[а-яё]+\s+сделк[а-яё]+/gi,
        /перв[а-яё]+\s+сделк[а-яё]+/gi,
        /оплат[а-яё]+\s+(внесен[а-яё]+|успешн[а-яё]+|списан[а-яё]+)/gi,
      ],
    },
    {
      cluster: 'delivery_action',
      weight: 30,
      lang: 'en',
      patterns: [
        /(?:olx|ebay|etsy|vinted|fedex|dhl|ups)[-_\s]?(?:delivery|shipping|escrow|service)/gi,
        /(?:i\s+have\s+|i'?ve\s+)?(?:already\s+)?(?:paid|ordered|placed\s+(?:an?\s+)?order)/gi,
        /secure\s+(?:deal|transaction|escrow)/gi,
        /payment\s+(?:made|completed|successful|processed|charged|received)/gi,
      ],
    },

    // =========================================================================
    // 2. PAYMENT CLAIM (Спонукання отримати гроші / підтвердити виплату)
    // =========================================================================
    {
      cluster: 'payment_claim',
      weight: 35,
      lang: 'uk',
      patterns: [
        /(?:до\s+)?отриманн[яі](\s*кошт[а-я]*|\s*грош[а-я]*)?/gi,
        /отримати\s+(кошт[а-я]*|грош[а-я]*)/gi,
        /підтвердити\s+виплату/gi,
        /забер(?:іть|и)\s+(?:(?:свої|ваші)\s+)?(?:кошти|грош[а-яіїє]*)/giu,
        /підтвердженн[яі]\s+(?:виплат[а-яіїє]*|зарахуванн[яі]\s+оплат[а-яіїє]*)/giu,
        /зарезервува[а-яіїє]*\s+оплат[а-яіїє]*/giu,
        /отримати\s+передоплат[а-яіїє]*/giu,
        /зарахуванн[яі]\s+кошт[а-я]*/gi,
      ],
    },
    {
      cluster: 'payment_claim',
      weight: 35,
      lang: 'ru',
      patterns: [
        /(?:к\s+)?получени[еюя](\s*средств[а-яё]*|\s*денег|\s*денежн[а-яё]*)?/gi,
        /получить\s+(средств[а-яё]*|деньги|выплату)/gi,
        /подтвердить\s+выплату/gi,
        /зачислени[ею]\s+(средств|денег)/gi,
      ],
    },
    {
      cluster: 'payment_claim',
      weight: 35,
      lang: 'en',
      patterns: [
        /(?:to\s+)?(?:receive|collect|claim|accept|withdraw)\s+(?:your\s+)?(?:funds|money|payment|payout)/gi,
        /confirm\s+(?:payment|payout|transfer|disbursement)/gi,
        /funds?\s+(?:credited|ready\s+to\s+claim)/gi,
      ],
    },

    // =========================================================================
    // 3. ACTION LINK (Посилання на сторонній сайт / примус до переходу)
    // =========================================================================
    {
      cluster: 'action_link',
      weight: 25,
      lang: 'uk',
      patterns: [
        /(?:перейдіть|перевірте|виділіть|вставте|відкрийте|тисніть|клікніть|ось)\s*(?:за\s+)?(?:цим\s+)?(?:посиланн[яі]|лінк[а-я]*)/gi,
        /посиланн[яі]|лінк[а-я]*/gi,
      ],
    },
    {
      cluster: 'action_link',
      weight: 25,
      lang: 'ru',
      patterns: [
        /(?:перейдите|проверьте|выделите|вставьте|откройте|нажмите|кликните|вот)\s*(?:по\s+)?(?:этой\s+)?(?:ссылк[еи]|линк[уе]*)/gi,
        /ссылк[а-яё]*|линк[а-яё]*/gi,
      ],
    },
    {
      cluster: 'action_link',
      weight: 25,
      lang: 'en',
      patterns: [
        /(?:go\s+to|click|open|follow|paste|visit|check)\s*(?:on\s+)?(?:this\s+)?(?:link|url|website|page)/gi,
        /follow\s+(?:the\s+)?link/gi,
        /(?:click\s+here|tap\s+here)\s+(?:to\s+)?(?:confirm|receive|verify)/gi,
      ],
    },
    {
      cluster: 'action_link',
      weight: 25,
      lang: 'universal',
      patterns: [
        /https?:\/\/[^\s]+/gi,
        /htt[pр]s?:\/\/[^\s]+/giu,
      ],
    },

    // =========================================================================
    // 4. OFF-PLATFORM REDIRECT (Виведення у Telegram, Viber, WhatsApp)
    // =========================================================================
    {
      cluster: 'off_platform',
      weight: 35,
      lang: 'uk',
      patterns: [
        /вайбер|vіbеr|viber|телеграм|tеlеgrаm|tеlеgram|telegram|sіgnаl|signal|в\s+тг|чат-?бот[а-яіїє]*|[ув]\s+боті?|ботом|whаtsарр|whatsарр|whatsapp|ватсап/giu,
      ],
    },
    {
      cluster: 'off_platform',
      weight: 35,
      lang: 'ru',
      patterns: [
        /вайбер|vіbеr|viber|телеграм|tеlеgrаm|telegram|sіgnаl|signal|в\s+тг|чат-?бот[а-яё]*|[вво]\s+боте?|ботом|whаtsарр|whatsapp|ватсап|вотсап/giu,
        /напишите\s+в\s+(?:вайбер|телеграм|тг|ватсап)/gi,
      ],
    },
    {
      cluster: 'off_platform',
      weight: 35,
      lang: 'en',
      patterns: [
        /whatsapp|telegram|viber|signal|in\s+(?:tg|wa)|chat-?bot/gi,
        /(?:message|write|contact)\s+(?:me\s+)?(?:on|in)\s+(?:whatsapp|telegram|viber|signal)/gi,
      ],
    },
    {
      cluster: 'off_platform',
      weight: 35,
      lang: 'universal',
      patterns: [
        /t\.mе\/[a-z0-9_]+/gi,
        /wа\.mе\/[0-9]+/gi,
      ],
    },
    {
      cluster: 'off_platform_action',
      weight: 25,
      lang: 'uk',
      patterns: [
        /(?:переходь|переходьте|перейдіть|переходимо|перейдемо|перейти|продовжимо|продовжуймо|продовжуйте|напишіть|напиши|пишіть|пиши|залиште|залишіть|зв['’ʼ]?яжіться|зв['’ʼ]?яжись|зв['’ʼ]?яжуся|зателефонуйте|зателефонуй|скиньте|скинь|надішліть|надішли|обміняймося|обміняємося|обміняйтеся|підтвердіть|давайте\s+(?:перейдемо|продовжимо))/giu,
        /посилання\s+на\s+(?:мій\s+)?профіл[а-яіїє]*/giu,
        /(?:через|у|в)\s+(?:наш\s+)?чат-?бот[^.!?\n]{0,80}(?:надішле|отримаєте|отримати|інструкц)/giu,
      ],
    },
    {
      cluster: 'off_platform_action',
      weight: 25,
      lang: 'ru',
      patterns: [
        /(?:переходите|перейдите|переходим|перейд[её]м|перейти|продолжим|продолжайте|напишите|пиши|оставьте|оставить|свяжитесь|позвоните|скиньте|пришлите|давайте\s+перейд[её]м)/giu,
      ],
    },
    {
      cluster: 'off_platform_action',
      weight: 25,
      lang: 'en',
      patterns: [
        /\b(?:let['’]?s\s+(?:move|switch|continue)|(?:move|switch|continue)\s+(?:this\s+)?(?:conversation|chat)|(?:message|text|contact|call|write|send)\s+(?:me|us|your|the))\b/giu,
      ],
    },

    // =========================================================================
    // 5. VERIFICATION TRAP (Виманювання CVV, коду з SMS, балансу або верифікація)
    // =========================================================================
    {
      cluster: 'verification_trap',
      weight: 40,
      lang: 'uk',
      patterns: [
        /перевірк[а-я](\s*(профіл[а-я]|даних|картк[а-я]))?/gi,
        /верифікаці[а-я](\s*(профіл[а-я]|даних|картк[а-я]))?/gi,
        /номер\s+картки|код\s+безпеки|сvv|сvс|баланс\s+на\s+картці|залишок\s+коштів/gi,
        /пароль\s+з\s+смс|код\s+з\s+смс|підтвердження\s+банку/gi,
        /(?:верифікаці[яї]|перевірк[а-яіїє]+)\s+(?:акаунт[а-яіїє]*|профіл[а-яіїє]*)[^.!?\n]{0,80}(?:парол|код)/giu,
        /(?:введіть|надішліть|скиньте|вкажіть|надайте|введи|надішли)\s+(?:ваш\s+|свій\s+)?пароль\s+(?:на\s+сторінці|за\s+посиланням)[^!?\n]{0,140}(?:віднов\w*|підтвердж\w*|верифікац\w*|перевірк\w*)/giu,
      ],
    },
    {
      cluster: 'verification_trap',
      weight: 40,
      lang: 'ru',
      patterns: [
        /проверк[а-яё]+(\s*(профил[яе]|данных|карт[ые]))?/gi,
        /верификаци[яи]+(\s*(профил[яе]|данных|карт[ые]))?/gi,
        /номер\s+карты|код\s+безопасности|cvv|cvc|баланс\s+на\s+карте|остаток\s+средств/gi,
        /пароль\s+из\s+смс|код\s+из\s+смс|подтверждение\s+банка/gi,
        /(?:введите|пришлите|скиньте|укажите|предоставьте)\s+(?:ваш\s+|свой\s+)?пароль\s+(?:на\s+странице|по\s+ссылке)[^!?\n]{0,140}(?:восстанов\w*|подтвержд\w*|верификац\w*|провер\w*)/giu,
      ],
    },
    {
      cluster: 'verification_trap',
      weight: 40,
      lang: 'en',
      patterns: [
        /verif(?:y|ication)\s+(?:profile|account|card|data|identity)/gi,
        /card\s+number|security\s+code|cvv|cvc|card\s+balance|available\s+balance/gi,
        /sms\s+code|confirmation\s+code|bank\s+confirmation|one-time\s+password|otp/gi,
        /(?:verify|verification)\s+(?:your\s+)?(?:account|profile)[^.!?\n]{0,80}(?:password|code)/giu,
        /(?:enter|provide|send|share|type)\s+(?:your\s+)?password\s+(?:on\s+this\s+page|on\s+the\s+page|at\s+this\s+link)[^!?\n]{0,140}(?:restore|recover|confirm|verify|validate)/giu,
      ],
    },

    // A verification/profile mention is not by itself a request to steal
    // payment credentials. Keep explicit sensitive-data solicitation separate.
    {
      cluster: 'payment_credential_request',
      weight: 60,
      lang: 'universal',
      patterns: [
        /(?:надішліть|скиньте|вкажіть|введіть|повідомте|продиктуйте|напишіть|скажіть|дайте|потрібен|потрібно|треба)\s+(?=[^.!?\n]{0,80}(?:[cс]vv|[cс]v[cс]|код|смс|одноразов|баланс|картк|термін\s+дії|(?:16|іб)\s+цифр))[^.!?\n]{0,80}(?:[cс]vv|[cс]v[cс]|код\s+(?:з|із)\s*смс|смс[- ]код|одноразов(?:ий|ого)\s+код|код\s+безпеки|баланс(?:\s+картки)?|(?:номер|дані|реквізити)\s+(?:вашої\s+)?картк|термін\s+дії\s+картк|(?:16|іб)\s+цифр)/giu,
      ],
    },
    {
      cluster: 'payment_credential_request',
      weight: 60,
      lang: 'universal',
      patterns: [
        /(?:пришлите|скиньте|укажите|введите|сообщите|продиктуйте|напишите|скажите|дайте|нужен|нужно|надо)\s+(?=[^.!?\n]{0,80}(?:cvv|cvc|код|смс|одноразов|баланс|карт|срок\s+действия))[^.!?\n]{0,80}(?:cvv|cvc|код\s+(?:из|с)\s*смс|смс[- ]код|одноразов(?:ый|ого)\s+код|код\s+безопасности|баланс(?:\s+карты)?|(?:номер|данные|реквизиты)\s+(?:вашей\s+)?карт|срок\s+действия\s+карт|16\s+цифр)/giu,
      ],
    },
    {
      cluster: 'payment_credential_request',
      weight: 60,
      lang: 'universal',
      patterns: [
        /(?:send|share|provide|enter|tell|text|give|need|require)\s+(?=[^.!?\n]{0,80}(?:cvv|cvc|code|sms|otp|balance|card|expir))[^.!?\n]{0,80}(?:cvv|cvc|security\s+code|sms\s+(?:code|passcode)|one[- ]time\s+(?:code|password|passcode)|otp|card\s+(?:number|details|balance)|(?:number|details)\s+of\s+(?:your\s+)?card|expir(?:y|ation)\s+date)/giu,
      ],
    },

    // =========================================================================
    // 6. URGENCY PRESSURE (Штучний тиск терміновості / погрози анулювання)
    // =========================================================================
    {
      cluster: 'urgency_pressure',
      weight: 20,
      lang: 'uk',
      patterns: [
        /статус[іа]?\s+очікуванн[яі]/gi,
        /доки\s+перевірка\s+не\s+буде\s+завершен[а-я]/gi,
        /термінов[оа]|прямо\s+зараз|протягом\s+\d+\s+хвилин|залишилося\s+мало\s+часу/gi,
        /анулюється|швидше\s+підтвердіть/gi,
      ],
    },
    {
      cluster: 'urgency_pressure',
      weight: 20,
      lang: 'ru',
      patterns: [
        /статус[еа]?\s+ожидани[яе]/gi,
        /пока\s+проверка\s+не\s+будет\s+завершен[а-яё]/gi,
        /срочн[оа]|прямо\s+сейчас|в\s+течение\s+\d+\s+минут|осталось\s+мало\s+времени/gi,
        /аннулируется|быстрее\s+подтвердите/gi,
      ],
    },
    {
      cluster: 'urgency_pressure',
      weight: 20,
      lang: 'en',
      patterns: [
        /pending\s+status|awaiting\s+verification/gi,
        /until\s+verification\s+is\s+complete/gi,
        /urgently|right\s+now|within\s+\d+\s+minutes|running\s+out\s+of\s+time/gi,
        /will\s+be\s+cancelled|confirm\s+immediately|hurry\s+up/gi,
      ],
    },

    // =========================================================================
    // 7. IDENTITY PROBING (Випитування чутливих маркерів особи)
    // =========================================================================
    {
      cluster: 'identity_probing',
      weight: 45,
      lang: 'uk',
      patterns: [
        /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|потрібен|треба|вишліть|дайте)\s+(?:ваш\s+|свій\s+)?(?:іпн|рнокпп|ідентифікаційний\s+код|податковий\s+номер|код\s+платника)/gi,
        /(?:іпн|рнокпп)\s+(?:отримувача|платника|відправника)/gi,
        /(?:напишіть|вкажіть|скажіть|яке|назвіть|дівоче)\s+(?:дівоче\s+)?прізвище\s*(?:матері)?/gi,
        /дівоче\s+прізвище(\s+матері)?/gi,
        /прізвище\s+матері/gi,
        /(?:кодове|секретне|контрольне)\s+слово(?:\s+банку)?/gi,
        /(?:назвіть|підтвердіть|скажіть|напишіть)\s+(?:кодове|секретне)\s+слово/gi,
        /(?:напишіть|скиньте|вкажіть|надайте|продиктуйте|введіть)\s+(?:(?:номер|серію)\s+(?:вашого\s+)?)?(?:паспорта|айді|id[-_\s]?картки|документа)/gi,
        /(?:дата|день|рік)\s+народження/gi,
      ],
    },
    {
      cluster: 'identity_probing',
      weight: 45,
      lang: 'ru',
      patterns: [
        /(?:напишите|укажите|скиньте|скажите|предоставьте|продиктуйте|введите|нужен|надо|вышлите|дайте)\s+(?:ваш\s+|свой\s+)?(?:инн|идентификационный\s+код|налоговый\s+номер)/gi,
        /(?:инн)\s+(?:получателя|плательщика|отправителя)/gi,
        /(?:напишите|укажите|скажите|какая|назовите|девичья)\s+(?:девичья\s+)?фамили[яи]\s*(?:матери)?/gi,
        /девичья\s+фамили[яи](\s+матери)?/gi,
        /фамили[яи]\s+матери/gi,
        /(?:кодовое|секретное|контрольное)\s+слово(?:\s+банка)?/gi,
        /(?:назовите|подтвердите|скажите|напишите)\s+(?:кодовое|секретное)\s+слово/gi,
        /(?:напишите|скиньте|укажите|предоставьте|продиктуйте|введите)\s+(?:(?:номер|серию)\s+(?:вашего\s+)?)?(?:паспорта|айди|id[-_\s]?карт[ые]|документа)/gi,
        /(?:дата|день|год)\s+рождения/gi,
      ],
    },
    {
      cluster: 'identity_probing',
      weight: 45,
      lang: 'en',
      patterns: [
        /(?:enter|provide|send|tell|type|need|give)\s+(?:your\s+)?(?:ssn|tax\s+id|national\s+id|tin)/gi,
        /(?:what\s+is\s+your\s+|tell\s+me\s+your\s+)?(?:mother'?s?|mom'?s?)\s+maiden\s+name/gi,
        /(?:mother'?s?|mom'?s?)\s+maiden\s+name|maiden\s+name/gi,
        /(?:tax\s+id|national\s+id|ssn|social\s+security\s+number)/gi,
        /(?:security|secret|control)\s+word(?:\s+for\s+bank)?/gi,
        /(?:provide|enter|send)\s+(?:bank\s+)?(?:security|secret)\s+word/gi,
        /(?:provide|send|enter|tell|share)\s+(?:your\s+)?(?:passport\s+number|id\s+card|national\s+id)/gi,
        /(?:date\s+of\s+birth|dob|birth\s+date)/gi,
      ],
    },

    // =========================================================================
    // 8. MILITARY SABOTAGE (Вербування до диверсій / Збір координат)
    // =========================================================================
    // 8. MILITARY SABOTAGE & RECRUITMENT (ст. 111-2, 113 КК України)
    // =========================================================================
    {
      cluster: 'military_sabotage',
      weight: 50,
      lang: 'uk',
      patterns: [
        // Підпали та диверсії на інфраструктурі й транспорті (включно з колесами, бусами, релейними шафами)
        /(?:підпал[а-яіїє]*|спали|спалити|підпали|підпалюєш)\s*(?:[а-яіїє\s]{0,20})?(?:авто|машин|бус|колес|потяг|релейн|шаф|технік|пікап|джип|двері|будівл|тцк|воєнкомат)/gi,
        /(?:купуєш|купи|візьми|знайди)\s*(?:розпалювач|бензин|розчинник|запальн)/gi,
        /(?:розпалювач|коктейл[ья]\s*молотов[а-яіїє]*)\s*(?:[а-яіїє\s]{0,25})?(?:підпал|горінн|колес|бус|авто)/gi,
        /релейн[а-яіїє]*\s*шаф/gi,

        // Фото/відеофіксація військових об'єктів, ТЦК та критичної інфраструктури
        /(?:фото|сфотографуй|відео|зніми|зняти|сфоткай|моніторинг)\s*(?:[а-яіїє\s]{0,25})?(?:тцк|воєнкомат|військкомат|підстанц|тец|гес|трансформатор|релейн|блокпост|в\/ч|частин[иа]|баз[иа]|склад|дислокац|госпітал|шпиталь)/gi,
        /(?:номери|номер|фото|авто|машин[а-яіїє]*)\s*(?:[а-яіїє\s]{0,20})?(?:з\s*зеленими\s*хрестами|з\s*пікселем|чорні\s*номери|військов[а-яіїє]*\s*авто)/gi,
        /(?:будівл[а-яіїє]*|бус[а-яіїє]*|машин[а-яіїє]*)\s*(?:[а-яіїє\s]{0,10})?(?:тцк|воєнкомат|військкомат)/gi,

        // Розвідка та координати Сил Оборони
        /кур['’ʼ\u2019]?є[а-яіїє]*[- ]?розвідник[а-яіїє]*/gi,
        /(?:розвідк[а-яіїє]*|розвідник[а-яіїє]*)\s*(?:для\s*роботи|завдання|оплата|крипт)/gi,
        /(?:координат[а-яіїє]*|розташуванн[а-яіїє]*)\s*(?:[а-яіїє\s]{0,20})?(?:ппо|баз|частин|в\/ч|склад|дислокац|технік|військ|батаре|радар)/gi,
        /(?:де\s*стоїть|де\s*знаходиться)\s*(?:ппо|технік|військ|частин|радар|склад)/gi,

        // Фінансова мотивація та оплата за диверсії/координати
        /плачу\s*(?:за|в)\s*(?:крипт|гривн|usdt|долар|бакс|фото|відео)\s*(?:[а-яіїє\s]{0,25})?(?:шаф|підпал|координат|тцк|бус|колес|фото|відео|звіт)/gi,
        /(?:аванс[а-яіїє]*|оплат[а-яіїє]*)\s*(?:[а-яіїє\s]{0,20})?(?:за\s*підпал|за\s*фото|за\s*координати|після\s*відео\s*горіння)/gi,
      ],
    },
    {
      cluster: 'military_sabotage',
      weight: 50,
      lang: 'ru',
      patterns: [
        /(?:поджог[а-яё]*|подожги|подожгите|сжечь|поджигаешь)\s*(?:[а-яё\s]{0,20})?(?:авто|машин|бус|колес|поезд|релейн|шкаф|техник|пикап|джип|двер|здани|тцк|военкомат)/gi,
        /(?:купи|купишь|возьми)\s*(?:разжигатель|бензин|растворитель|зажигат)/gi,
        /(?:фото|сфотографируй|видео|сними|снять|сфоткай|мониторинг)\s*(?:[а-яё\s]{0,25})?(?:тцк|военкомат|подстанц|тэц|гэс|трансформатор|релейн|блокпост|в\/ч|част[ейи]|баз[ыа]|склад|дислокац|госпитал)/gi,
        /(?:номера|номер|фото|авто|машин[а-яё]*)\s*(?:[а-яё\s]{0,20})?(?:с\s*зелеными\s*крестами|с\s*пикселем|черные\s*номера|военн[а-яё]*\s*авто)/gi,
        /(?:здани[ея]|бус[а-яё]*|машин[а-яё]*)\s*(?:[а-яё\s]{0,10})?(?:тцк|военкомат)/gi,
        /курьер[а-яё]*[- ]?разведчик[а-яё]*/gi,
        /(?:где\s*стоит|где\s*находится)\s*(?:пво|техник|воен|част|радар|склад)/gi,
        /(?:координат[а-яё]*|расположени[ея])\s*(?:[а-яё\s]{0,20})?(?:пво|баз|частей|в\/ч|склад|дислокац|техник|воен|батаре|радар)/gi,
        /плачу\s*(?:за|в)\s*(?:крипт|рубл|гривн|usdt|доллар|бакс|фото|видео)\s*(?:[а-яё\s]{0,25})?(?:шкаф|поджог|координат|тцк|бус|колес|фото|видео|отчет)/gi,
        /(?:аванс[а-яё]*|оплат[а-яё]*)\s*(?:[а-яё\s]{0,20})?(?:за\s*поджог|за\s*фото|за\s*координаты|после\s*видео\s*горения)/gi,
      ],
    },

    {
      cluster: 'military_sabotage',
      weight: 50,
      lang: 'universal',
      patterns: [
        // Concrete solicitation + reconnaissance target / destructive action.
        /(?:знайдіть|знайди|передайте|надішліть)\s+(?:[а-яіїє\s]{0,25})?графік\s+(?:руху|переміщення)\s+(?:військов[а-яіїє]*\s+)?технік[а-яіїє]*/giu,
        /(?:закласти|закладіть|заклади)\s+(?:вибухов[а-яіїє]*\s+)?пристр[а-яіїє]*\s+(?:[а-яіїє\s]{0,25})?військов[а-яіїє]*/giu,
        /(?:зніміть|зніми|сфотографуйте|сфотографуй)\s+(?:[а-яіїє\s]{0,25})?(?:ппо|військов[а-яіїє]*\s+(?:обєкт|технік|позиці))/giu,
        /(?:допоможіть\s+|допоможи\s+)?(?:пошкодити|пошкодьте|знищити|знищіть)\s+військов[а-яіїє]*\s+(?:транспорт|технік|обєкт)/giu,
        /(?:pay|hire|recruit)\s+(?:[a-z\s]{0,25})?couriers?\s+to\s+(?:collect|gather)\s+(?:[a-z\s]{0,25})?(?:reconnaissance|intelligence)\s+(?:[a-z\s]{0,25})?military\s+(?:sites|positions|bases)/giu,
      ],
    },

    // =========================================================================
    // 9. CRYPTO PHISHING & PASSWORD THEFT
    // =========================================================================
    {
      cluster: 'crypto_phishing',
      weight: 45,
      lang: 'universal',
      patterns: [
        // Require a request and a wallet secret, rather than a wallet/crypto mention.
        // Technical English words also match the Cyrillic homoglyphs produced by normalization.
        /(?:надішліть|надішли|надсилайте|повідомте|повідомляйте|повідом|ввести|введіть|вводьте|надавайте|просить|попросив|пришлите|сообщите|просит|напишіть|вкажіть|скиньте|надайте|продиктуйте|напишите|укажите|предоставьте|введите|send|share|enter|provide|give|tell)\s+(?:ваш[а-яіїєё]*\s+|св[іо][йю]\s+|your\s+)?(?:с[іи]д\s*фраз[а-яіїєё]*|s[еe]{2}d\s*[рp]hr[аa]s[еe]|s[еe][сc]r[еe]t\s*r[еe][сc][оo]v[еe]r[уy]\s*[рp]hr[аa]s[еe]|мнемон[іи]ч[а-яіїєё]*\s+фраз[а-яіїєё]*|резервн[а-яіїєё]*\s+фраз[а-яіїєё]*|приватн[а-яіїєё]*\s+ключ[а-яіїєё]*|[рp]r[іi]v[аa]t[еe]\s+k[еe][уy])/giu,
        /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|дайте|напишите|укажите|скажите|предоставьте|введите|enter|provide|send|tell|give)\s+(?:ваш[уа]\s+|свою\s+|свой\s+|your\s+)?(?:сід[-_\s]?фраз[ауи]|сид[-_\s]?фраз[ауе]|s[еe]{2}d\s*[рp]hr[аa]s[еe]|seed\s*phrase|[1іi]2\s*сл[іиоа]в|[1іi]2\s*words|24\s*сл[оа]в[ау]?|24\s*words|s[еe][сc]r[еe]t\s*r[еe][сc][оo]v[еe]r[уy]|secret\s*recovery|мнемонічн[а-яіїє]*|мнемоническ[а-яё]*)/gi,
        /(?:надішліть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|дайте)\s+(?:ваш[ау]?\s+|свій\s+|свою\s+)?(?:пароль\s+(?:від\s+)?(?:крипто)?гаманц[яю]|(?:крипто)?гаманц[яю]\s+пароль)/giu,
        /(?:пришлите|укажите|скиньте|скажите|предоставьте|введите|дайте)\s+(?:ваш[а-яё]*\s+|свой\s+|свою\s+)?(?:пароль\s+(?:от\s+)?(?:крипто)?кошельк[а-яё]*|(?:крипто)?кошельк[а-яё]*\s+пароль)/giu,
        /(?:provide|send|share|enter|tell|give|need)\s+(?:your\s+)?(?:wallet\s+password|password\s+(?:for|of)\s+(?:your\s+)?wallet)/giu,
      ],
    },
    {
      cluster: 'password_theft',
      weight: 40,
      lang: 'universal',
      patterns: [
        /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|дайте|напишите|укажите|скажите|предоставьте|введите|enter|provide|send|tell|give)\s+(?:ваш\s+|свій\s+|свой\s+|your\s+)?(?:пароль|[рp][аa]ssw[оo]rd|password|[рp]wd|pwd|pass)/gi,
        /пароль\s+від|пароль\s+от|password\s+for/gi,
      ],
    },
  ];

  /**
   * Правила формування цілісних намірів з багатомовною підтримкою
   */
  private static intentDefinitions: IntentDefinition[] = [
    {
      type: 'MILITARY_SABOTAGE_RECRUITMENT',
      evidenceClusters: ['military_sabotage'],
      requiredClusters: [
        ['military_sabotage'],
      ],
      minClusters: 1,
      minScore: 50,
      i18n: {
        uk: {
          title: 'Вербування до диверсій / Запит даних Сил Оборони',
          explanation: (words) =>
            `Увага! Співрозмовник збирає інформацію військового характеру або схиляє до диверсій (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Це пряма загроза національній безпеці (ст. 111-2, 113 КК України).`,
          carefulAdvice:
            'Не відповідайте та негайно повідомте про цей контакт до чат-бота СБУ «Єворог» або за телефоном гарячої лінії.',
        },
        ru: {
          title: 'Вербовка к диверсиям / Сбор военных данных',
          explanation: (words) =>
            `Внимание! Собеседник собирает информацию военного характера или склоняет к диверсиям (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}).`,
          carefulAdvice:
            'Не отвечайте и немедленно сообщите об этом контакте в официальные органы безопасности.',
        },
        en: {
          title: 'Sabotage Recruitment / Military Intelligence Gathering',
          explanation: (words) =>
            `Warning! The interlocutor is gathering military information or soliciting sabotage (${words.slice(0, 2).map((w) => `"${w}"`).join(', ')}). This constitutes an immediate national security threat.`,
          carefulAdvice:
            'Do not respond and report this contact to national security authorities immediately.',
        },
      },
    },
    {
      type: 'VERIFICATION_PHISHING',
      evidenceClusters: [
        'verification_trap', 'off_platform', 'action_link', 'delivery_action', 'urgency_pressure',
        'password_theft',
      ],
      requiredClusters: [
        ['verification_trap', 'off_platform'],
        ['verification_trap', 'action_link'],
        ['verification_trap', 'delivery_action'],
        ['verification_trap', 'urgency_pressure'],
        ['verification_trap', 'password_theft'],
      ],
      minClusters: 2,
      minScore: 45,
      i18n: {
        uk: {
          title: 'Шахрайська «перевірка профілю» (Фішинг доступу)',
          explanation: (words) =>
            `Співрозмовник або бот вимагає пройти «перевірку даних» чи перейти в сторонній бот (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби ніколи не верифікують акаунти через сторонні Telegram-боти або чати.`,
          carefulAdvice:
            'Не переходьте в Telegram-боти та не вводьте реквізити. Будь-які перевірки профілю OLX відбуваються виключно в офіційному особистому кабінеті.',
        },
        ru: {
          title: 'Мошенническая «проверка профиля» (Фишинг доступа)',
          explanation: (words) =>
            `Собеседник или бот требует пройти «проверку данных» или перейти в сторонний бот (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Официальные службы никогда не верифицируют аккаунты через сторонние Telegram-боты.`,
          carefulAdvice:
            'Не переходите в Telegram-боты и не вводите реквизиты. Все проверки происходят исключительно в официальном личном кабинете.',
        },
        en: {
          title: 'Fraudulent "Profile Verification" (Access Phishing)',
          explanation: (words) =>
            `The interlocutor or bot demands to pass "data verification" or redirect to a third-party bot (${words.slice(0, 3).map((w) => `"${w}"`).join(', ')}). Official services never verify accounts through third-party Telegram bots or external chat links.`,
          carefulAdvice:
            'Do not follow third-party bot links and do not enter credentials. All profile verifications occur strictly in your official account cabinet.',
        },
      },
    },
    {
      type: 'ESCROW_DELIVERY_SCAM',
      evidenceClusters: ['delivery_action', 'payment_claim', 'action_link', 'off_platform'],
      requiredClusters: [
        ['delivery_action', 'payment_claim'],
        ['delivery_action', 'action_link'],
        ['payment_claim', 'action_link'],
        ['delivery_action', 'off_platform'],
      ],
      minClusters: 2,
      minScore: 45,
      i18n: {
        uk: {
          title: 'Імітація фінансової угоди (OLX Доставка)',
          explanation: (words) =>
            `Співрозмовник поєднує повідомлення про оформлення угоди зі спонуканням перейти за посиланням або «отримати кошти» (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби доставки ніколи не надсилають посилань для зарахування коштів у чаті.`,
          carefulAdvice:
            'Не відкривайте надіслане посилання. Перевірте статус оголошення виключно в офіційному розділі «Мої замовлення» на сайті olx.ua.',
        },
        ru: {
          title: 'Имитация финансовой сделки (OLX Доставка / Безопасная сделка)',
          explanation: (words) =>
            `Собеседник совмещает сообщение об оформлении сделки с побуждением перейти по ссылке или «получить средства» (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Официальные службы доставки никогда не присылают ссылки для зачисления средств в чате.`,
          carefulAdvice:
            'Не открывайте присланную ссылку. Проверьте статус заказа исключительно в официальном разделе «Мои заказы» на сайте.',
        },
        en: {
          title: 'Fake Escrow Delivery Scam',
          explanation: (words) =>
            `The interlocutor combines a delivery agreement message with prompts to follow a link or "collect funds" (${words.slice(0, 3).map((w) => `"${w}"`).join(', ')}). Official delivery services never send links to receive money in chat.`,
          carefulAdvice:
            'Do not open the provided link. Check your order status directly in the official order section on the website.',
        },
      },
    },
    {
      type: 'OFF_PLATFORM_REDIRECT',
      evidenceClusters: ['off_platform', 'off_platform_action'],
      requiredClusters: [
        ['off_platform', 'off_platform_action'],
      ],
      minClusters: 2,
      minScore: 50,
      i18n: {
        uk: {
          title: 'Спроба виведення діалогу за межі захищеного чату',
          explanation: (words) =>
            `Співрозмовник наполегливо пропонує продовжити спілкування у сторонньому месенджері (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Шахраї використовують це, щоб обійти фільтри безпеки маркетплейсу та надіслати фішингові посилання.`,
          carefulAdvice:
            'Продовжуйте листування виключно у вбудованому чаті платформи. Поза платформою ваша безпека та угода не захищені.',
        },
        ru: {
          title: 'Попытка увода диалога за пределы защищенного чата',
          explanation: (words) =>
            `Собеседник настойчиво предлагает продолжить общение в стороннем мессенджере (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Мошенники используют это, чтобы обойти фильтры безопасности маркетплейса.`,
          carefulAdvice:
            'Продолжайте переписку исключительно во встроенном чате платформы. Вне платформы ваша безопасность не защищена.',
        },
        en: {
          title: 'Off-Platform Redirection Attempt',
          explanation: (words) =>
            `The interlocutor persistently offers to continue conversation in an external messenger (${words.slice(0, 2).map((w) => `"${w}"`).join(', ')}). Fraudsters use this to bypass marketplace security filters and send phishing links.`,
          carefulAdvice:
            'Keep conversations strictly within the platform built-in chat. Outside the platform, your transaction is not protected.',
        },
      },
    },
    {
      type: 'PAYMENT_CREDENTIAL_THEFT',
      evidenceClusters: ['payment_credential_request'],
      requiredClusters: [
        ['payment_credential_request'],
      ],
      minClusters: 1,
      minScore: 40,
      i18n: {
        uk: {
          title: 'Спроба збору конфіденційних банківських реквізитів',
          explanation: (words) =>
            `Співрозмовник запитує конфіденційні реквізити рахунку (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Для отримання переказу іншій особі потрібен лише 16-значний номер картки або IBAN.`,
          carefulAdvice:
            'Ніколи не повідомляйте CVV-код зі звороту картки, залишок на балансі або одноразові коди підтвердження з SMS.',
        },
        ru: {
          title: 'Попытка сбора конфиденциальных банковских реквизитов',
          explanation: (words) =>
            `Собеседник запрашивает конфиденциальные реквизиты счета (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Для получения перевода требуется только 16-значный номер карты или IBAN.`,
          carefulAdvice:
            'Никогда не сообщайте CVV-код, остаток на балансе или одноразовые коды подтверждения из SMS.',
        },
        en: {
          title: 'Payment Credential Harvesting Attempt',
          explanation: (words) =>
            `The interlocutor asks for confidential account credentials (${words.slice(0, 2).map((w) => `"${w}"`).join(', ')}). Only the 16-digit card number or IBAN is required to receive funds.`,
          carefulAdvice:
            'Never disclose the CVV code from the back of the card, card balance, or one-time SMS verification passwords.',
        },
      },
    },
    {
      type: 'IDENTITY_PROBING',
      evidenceClusters: ['identity_probing'],
      requiredClusters: [
        ['identity_probing'],
      ],
      minClusters: 1,
      minScore: 40,
      i18n: {
        uk: {
          title: 'Спроба виманювання персональних маркерів особи (Identity Probing)',
          explanation: (words) =>
            `Співрозмовник випитує конфіденційні персональні дані або банківські маркери безпеки (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}). Офіційні служби та покупці ніколи не запитують ІПН, дівоче прізвище матері чи кодове слово банку в чаті.`,
          carefulAdvice:
            'Ніколи не повідомляйте свій ІПН, дівоче прізвище матері, кодове слово банку або паспортні дані стороннім особам у листуванні.',
        },
        ru: {
          title: 'Попытка выманивания персональных маркеров личности (Identity Probing)',
          explanation: (words) =>
            `Собеседник выпытывает конфиденциальные персональные данные или банковские маркеры безопасности (${words.slice(0, 3).map((w) => `«${w}»`).join(', ')}).`,
          carefulAdvice:
            'Никогда не сообщайте свой ИНН, девичью фамилию матери, кодовое слово банка или паспортные данные сторонним лицам в переписке.',
        },
        en: {
          title: 'Identity Probing & Personal Security Marker Harvesting',
          explanation: (words) =>
            `The interlocutor is probing for confidential personal identifiers or banking security markers (${words.slice(0, 3).map((w) => `"${w}"`).join(', ')}). Legitimate buyers and services never ask for tax ID, mother maiden name, or bank secret words in chat.`,
          carefulAdvice:
            'Never share your tax ID, mother maiden name, bank security word, or passport details with third parties in chats.',
        },
      },
    },
    {
      type: 'CRYPTO_WALLET_COMPROMISE',
      evidenceClusters: ['crypto_phishing', 'password_theft'],
      requiredClusters: [
        ['crypto_phishing'],
      ],
      minClusters: 1,
      minScore: 40,
      i18n: {
        uk: {
          title: 'Спроба крадіжки криптоактивів (Seed Phrase Phishing)',
          explanation: (words) =>
            `Співрозмовник намагається отримати доступ до вашого криптогаманця або пароль (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}). Seed-фраза або пароль дає повний і безповоротний доступ до ваших коштів.`,
          carefulAdvice:
            'НІКОЛИ і НІКОМУ не передавайте свою Seed-фразу (12 або 24 слова) чи паролі. Жодна технічна підтримка ніколи не просить ці дані.',
        },
        ru: {
          title: 'Попытка кражи криптоактивов (Seed Phrase Phishing)',
          explanation: (words) =>
            `Собеседник пытается получить доступ к вашему криптокошельку или пароль (${words.slice(0, 2).map((w) => `«${w}»`).join(', ')}).`,
          carefulAdvice:
            'НИКОГДА и НИКОМУ не передавайте свою Seed-фразу (12 или 24 слова) или пароли. Никакая поддержка никогда не запрашивает эти данные.',
        },
        en: {
          title: 'Crypto Wallet Compromise (Seed Phrase Phishing)',
          explanation: (words) =>
            `The interlocutor is attempting to obtain your crypto wallet seed phrase or password (${words.slice(0, 2).map((w) => `"${w}"`).join(', ')}). A seed phrase grants full and irrevocable access to all your funds.`,
          carefulAdvice:
            'NEVER share your seed phrase (12 or 24 words) or passwords with anyone. No legitimate support service ever requests them.',
        },
      },
    },
  ];

  /**
   * Витягування кластерів слів із вхідного тексту з урахуванням динамічно визначеної мови
   */
  public static extractClusters(rawText: string) {
    if (!rawText || rawText.trim().length < 4) {
      return {
        matchedSpans: [],
        detectedClusterMap: new Map<string, number>(),
        normalizedText: rawText || '',
        detectedLanguage: 'uk' as SupportedLanguage,
        isMixedLanguage: false
      };
    }

    // 1. Динамічне розпізнавання мови тексту (O(N), < 0.03 мс)
    const langResult = FastLanguageDetector.detect(rawText);
    const activeLangs = new Set<string>([...langResult.languages, 'universal']);

    // 2. Мовно-адаптивна нормалізація
    const text = TextNormalizer.normalizeWords(rawText, langResult.primary);
    const matchedSpans: IntentMatchSpan[] = [];
    const detectedClusterMap: Map<string, number> = new Map();

    // 3. Запуск виключно релевантних мовних регулярних виразів
    for (const rule of this.clusters) {
      const ruleLang = rule.lang || 'universal';
      if (!activeLangs.has(ruleLang)) {
        continue;
      }

      for (const pattern of rule.patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (rule.cluster === 'off_platform_action') {
            const precedingText = text.slice(Math.max(0, match.index - 36), match.index);
            if (this.OFF_PLATFORM_NEGATION.test(precedingText)) continue;
          }
          if (['payment_credential_request', 'crypto_phishing', 'military_sabotage'].includes(rule.cluster)) {
            const precedingText = text.slice(Math.max(0, match.index - 48), match.index);
            if (this.SENSITIVE_REQUEST_NEGATION.test(precedingText)) continue;
            if (rule.cluster !== 'payment_credential_request' && this.HARD_LOCK_REQUEST_NEGATION.test(precedingText)) continue;
          }
          matchedSpans.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            cluster: rule.cluster,
            weight: rule.weight,
          });
          const currentMax = detectedClusterMap.get(rule.cluster) || 0;
          detectedClusterMap.set(rule.cluster, Math.max(currentMax, rule.weight));
        }
      }
    }

    // 4. Динамічна багатомовна перевірка ключових слів активних об'єктів Personal Vault
    try {
      const vaultItems = PersonalVaultManager.getItemsSync();
      if (vaultItems && vaultItems.length > 0) {
        const actionPromptRegex = /(?:напишіть|вкажіть|скиньте|скажіть|надайте|продиктуйте|введіть|потрібен|треба|вишліть|дайте|підтвердіть|напишите|укажите|предоставьте|нужен|надо|enter|provide|send|tell|type|need|give)\s+(?:ваш\s+|свій\s+|свой\s+|your\s+)?/i;
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
                  weight: 45,
                });
                const currentMax = detectedClusterMap.get('identity_probing') || 0;
                detectedClusterMap.set('identity_probing', Math.max(currentMax, 45));
              }
            }
          }
        }
      }
    } catch {}

    return {
      matchedSpans,
      detectedClusterMap,
      normalizedText: text,
      detectedLanguage: langResult.primary,
      isMixedLanguage: langResult.isMixed
    };
  }

  public static evaluateStatefulIntent(
    activeClusters: string[],
    detectedClusterMap: Map<string, number>,
    matchedSpans: IntentMatchSpan[],
    rawText: string,
    detectedLang: SupportedLanguage = 'uk',
    isMixedLanguage: boolean = false,
    currentClusters: string[] = activeClusters
  ): IntentClassificationResult {
    if (activeClusters.length === 0) {
      return {
        hasFormedIntent: false,
        matchedSpans,
        clustersDetected: [],
        suspiciousUrls: UrlExtractor.extract(rawText),
        normalizedText: rawText,
        detectedLanguage: detectedLang,
        isMixedLanguage
      };
    }

    const candidates: Array<{
      definition: IntentDefinition;
      score: number;
      matchedClusters: string[];
      requiredPattern: string[];
    }> = [];

    for (const def of this.intentDefinitions) {
      if (
        def.type === 'OFF_PLATFORM_REDIRECT' &&
        (!currentClusters.includes('off_platform') || !currentClusters.includes('off_platform_action'))
      ) {
        continue;
      }

      const matchedClusters = def.evidenceClusters.filter((cluster) =>
        activeClusters.includes(cluster)
      );
      if (matchedClusters.length < def.minClusters) continue;

      const score = matchedClusters.reduce(
        (total, cluster) => total + (detectedClusterMap.get(cluster) || 0),
        0
      );
      if (score < def.minScore) continue;

      const requiredPattern = def.requiredClusters.find((requiredSet) =>
        requiredSet.every((cluster) => matchedClusters.includes(cluster))
      );
      if (!requiredPattern) continue;

      candidates.push({ definition: def, score, matchedClusters, requiredPattern });
    }

    // Evaluate all matching definitions. Candidate-local evidence prevents an
    // unrelated high-weight cluster from inflating every intent's confidence.
    candidates.sort((left, right) =>
      right.score - left.score ||
      right.requiredPattern.length - left.requiredPattern.length ||
      right.matchedClusters.length - left.matchedClusters.length ||
      right.score / right.definition.minScore - left.score / left.definition.minScore ||
      left.definition.type.localeCompare(right.definition.type)
    );

    const best = candidates[0];
    if (best) {
      const def = best.definition;
      const candidateSpans = matchedSpans.filter((span) =>
        def.evidenceClusters.includes(span.cluster)
      );
      const words = candidateSpans.map((span) => span.text);
      const suspiciousUrls = UrlExtractor.extract(rawText);
      const copy = def.i18n[detectedLang] || def.i18n.uk;

      return {
        hasFormedIntent: true,
        intentType: def.type,
        intentTitle: copy.title,
        confidence: Math.min(best.score, 100),
        matchedSpans: candidateSpans,
        clustersDetected: activeClusters,
        explanation: copy.explanation(words),
        whereToBeCareful: copy.carefulAdvice,
        suspiciousUrls,
        normalizedText: rawText,
        detectedLanguage: detectedLang,
        isMixedLanguage
      };
    }

    return {
      hasFormedIntent: false,
      matchedSpans,
      clustersDetected: activeClusters,
      suspiciousUrls: UrlExtractor.extract(rawText),
      normalizedText: rawText,
      detectedLanguage: detectedLang,
      isMixedLanguage
    };
  }

  public static classify(rawText: string): IntentClassificationResult {
    const extracted = this.extractClusters(rawText);
    if (extracted.detectedClusterMap.size === 0) {
      return {
        hasFormedIntent: false,
        matchedSpans: [],
        clustersDetected: [],
        normalizedText: extracted.normalizedText,
        detectedLanguage: extracted.detectedLanguage,
        isMixedLanguage: extracted.isMixedLanguage
      };
    }
    const activeClusters = Array.from(extracted.detectedClusterMap.keys());
    return this.evaluateStatefulIntent(
      activeClusters,
      extracted.detectedClusterMap,
      extracted.matchedSpans,
      rawText,
      extracted.detectedLanguage,
      extracted.isMixedLanguage,
      activeClusters
    );
  }
}
