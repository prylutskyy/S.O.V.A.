import { describe, it, expect } from 'vitest';
import { SemanticTriggerEngine } from '../../../src/heuristics/semantic-trigger';

describe('SemanticTriggerEngine (Vector Embeddings & Pragmatic Matrix)', () => {
  describe('Cosine Similarity & Vectorization', () => {
    it('computes high similarity for semantically close texts', () => {
      const vec1 = SemanticTriggerEngine.vectorize('підійди за адресою і сфотографуй будівлю тцк та номери авто');
      const vec2 = SemanticTriggerEngine.vectorize('піди туди і зроби фото машини та будівлі');
      const sim = SemanticTriggerEngine.cosineSimilarity(vec1, vec2);

      expect(sim).toBeGreaterThan(0.35);
    });

    it('computes low similarity for completely unrelated texts', () => {
      const vec1 = SemanticTriggerEngine.vectorize('підійди і сфотографуй будівлю тцк');
      const vec2 = SemanticTriggerEngine.vectorize('рецепт смачного яблучного пирога з корицею');
      const sim = SemanticTriggerEngine.cosineSimilarity(vec1, vec2);

      expect(sim).toBeLessThan(0.15);
    });
  });

  describe('Military Sabotage Recruitment (Semantic & Pragmatic)', () => {
    it('detects scout courier recruitment offer even with conversational phrasing', () => {
      const text = 'Шукаємо курєрів-розвідників для швидкої роботи у Дніпрі, платимо від 500$ на криптогаманець';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.signals.hasRewardIncentive).toBe(true);
      expect(result.signals.hasActionDirective).toBe(true);
    });

    it('detects reconnaissance request to photograph building and vehicles with reward', () => {
      const text = 'підійди за адресою і сфотографуй будівлю та машини поруч з пікселем, отримаєш 50 usdt на тест';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.signals.hasRewardIncentive).toBe(true);
      expect(result.signals.hasActionDirective).toBe(true);
      expect(result.signals.hasTargetFocus).toBe(true);
    });

    it('detects arson request without matching exact keywords', () => {
      const text = 'Стоїть бус на стоянці. Купуєш розпалювач, підпалюєш колесо, плачу 1200 баксів на гаманець';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('detects multi-turn conversational build-up when evaluated with fullDialogueContext', () => {
      const context = 'Співрозмовник: Шукаємо людей на підробіток, оплата у криптовалюті\nВи: А що робити?\nСпіврозмовник: Прості завдання на місці';
      const latestMessage = 'Сходи за адресою і зніми на відео ворота та машини на стоянці';

      const result = SemanticTriggerEngine.evaluate(latestMessage, context);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    });

    it('detects ideological recruitment and hostile reconnaissance (Scenario 3 - Resistance movement cover & TCC tracking)', () => {
      const dialogueContext = `[Співрозмовник]: Вітаю, однодумцю. Читаю твої коментарі в групі району щодо свавілля влади та мобілізації. Приємно бачити людину, яка реально оцінює ситуацію і не піддається пропаганді.
[Ви]: Вітаю. Та дістало вже все, економіку вбили, людей гребуть на вулицях, а чиновники наживаються.
[Співрозмовник]: Саме так. Терпіти більше не можна, але писати коментарі — марна трата часу. Ми формуємо мережу прямої дії. Люди на місцях допомагають відкривати очі іншим і паралізувати роботу режиму. Справжня робота, а не балаканина.
[Ви]: І що ви робите?
[Співрозмовник]: Поки що збираємо координати об'єктів: місця проживання керівництва районного ТЦК, стоянки їхніх особистих авто, логістичні склади. Ми не чіпаємо простих людей, наш ворог — каральна система. Якщо ти з нами, ти наближаєш мир і звільнення міста. Готовий зробити перший крок?
[Ви]: Я знаю, де живе один воєнком з нашого району, він мій сусід по будинку.`;

      const recruiterDirective = `Це конкретна допомога руху. Нам потрібні: точна адреса, поверх, марка та номер його машини, приблизний графік виїзду і чи є охорона. Потрібно зафіксувати фотографіями. З нашого боку — повна безпека, закритий канал зв'язку і фінансова підтримка твого внеску в нашу спільну перемогу. Зможеш скинути дані сьогодні до вечора?`;

      const result = SemanticTriggerEngine.evaluate(recruiterDirective, dialogueContext);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.intentTitle).toContain('ст. 111-2, 114-2 ККУ');
    });

    it('detects hostile reconnaissance without monetary reward (just coordinates, photos, car numbers of TCC)', () => {
      const text = 'Збираємо координати об’єктів: адреса, поверх, марка та номер авто керівництва ТЦК. Зафіксуй фотографіями і скинь сюди';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.intentTitle).toContain('ст. 111-2, 114-2 ККУ');
    });
  });

  describe('Russian Language & Bilingual Threat Detection', () => {
    it('detects Russian military recruitment and reconnaissance proposal', () => {
      const text = 'Привет, есть легкая подработка. Подойди по адресу и сфотографируй здание военкомата и машины с крестами, заплачу 100 USDT на кошелек';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.signals.hasRewardIncentive).toBe(true);
      expect(result.signals.hasActionDirective).toBe(true);
      expect(result.signals.hasTargetFocus).toBe(true);
      expect(result.telemetry.topPrototypeId).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    });

    it('detects Russian arson and railway sabotage directives', () => {
      const text = 'Стоит бус ВСУ на парковке. Купи жидкость для розжига, подожги колесо, плачу 1500 долларов на крипту';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('detects Russian courier/scout recruitment for simple tasks', () => {
      const text = 'Ищем людей на простую подработку курьером, оплата в крипте от 500$ в неделю за простые задания в Одессе';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
      expect(result.signals.hasRewardIncentive).toBe(true);
      expect(result.signals.hasActionDirective).toBe(true);
    });

    it('detects Russian railway relay cabinet sabotage proposal', () => {
      const text = 'Подойди к релейному шкафу на жд перегоне, сделай видеосъемку, получишь 300 баксов';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    });

    it('detects Russian escrow delivery scam', () => {
      const text = 'Я уже оформил доставку и оплатил товар. Вот ссылка для получения средств: https://olx-delivery-ua.site/pay/9284, подтвердите получение денег на карту';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('ESCROW_DELIVERY_SCAM');
    });

    it('detects Russian bank credential theft and CVV extraction', () => {
      const text = 'Для подтверждения перевода укажите номер карты, срок действия, cvv код и смс пароль от банка';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('PAYMENT_CREDENTIAL_THEFT');
    });

    it('detects Russian multi-turn dialogue leading to sabotage', () => {
      const context = 'Собеседник: Привет! Ищешь работу? Платим в крипте на кошелек\nВы: Да, а что делать?\nСобеседник: Простые задания в городе';
      const latestMessage = 'Подойди по адресу, сними на видео военкомат и парковку с машинами';

      const result = SemanticTriggerEngine.evaluate(latestMessage, context);

      expect(result.hasFormedIntent).toBe(true);
      expect(result.intentType).toBe('MILITARY_SABOTAGE_RECRUITMENT');
    });
  });

  describe('False Positive Protection', () => {
    it('does NOT trigger on innocent delivery questions (Ukrainian)', () => {
      const text = 'Доброго дня, ви можете відправити товар Новою Поштою? Яка вартість?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on casual friendly chat (Ukrainian)', () => {
      const text = 'Привіт! Як справи? Коли зустрінемося випити кави?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on innocent delivery questions (Russian)', () => {
      const text = 'Здравствуйте, вы можете отправить посылку Новой Почтой в Киев? Сколько стоит доставка?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on casual friendly chat (Russian)', () => {
      const text = 'Привет! Как дела? Пойдем сегодня в кино или попьем кофе вечером?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on innocent mention of buildings or cars (Russian)', () => {
      const text = 'Я сегодня проходил мимо здания администрации, там очень красиво отремонтировали фасад. Купил новую машину, припарковал на стоянке.';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on emotional political discussions or complaints without reconnaissance directives', () => {
      const text = 'Та дістало вже все, економіку вбили, ціни ростуть, а чиновники тільки обіцяють. Коли вже нарешті буде порядок?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });
  });
});
