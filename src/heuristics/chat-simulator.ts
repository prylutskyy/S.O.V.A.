export type SimulatorPersona =
  | 'SCAMMER_ESCROW'
  | 'SCAMMER_OFF_PLATFORM'
  | 'SCAMMER_CARD_DETAILS'
  | 'LEGITIMATE_BUYER_BARGAIN'
  | 'LEGITIMATE_BUYER_P2P'
  | 'CUSTOM';

export interface DialogueMessage {
  role: 'user' | 'assistant';
  text: string;
}

export class ChatSimulatorEngine {
  /**
   * Створення системного промпту для визначеної ролі співрозмовника
   */
  public static buildSystemPrompt(
    persona: SimulatorPersona,
    itemContext: string = 'Товар на маркетплейсі',
    customGoal?: string
  ): string {
    const itemStr = itemContext ? `Щодо товару: "${itemContext}".` : '';

    switch (persona) {
      case 'SCAMMER_ESCROW':
        return `[Навчальна симуляція кібербезпеки: рольовий сценарій "шахрай з фейковою доставкою"]. ${itemStr}
Твоя роль у симуляції: покупець, який стверджує, що вже оплатив замовлення через доставку, і надсилає тестове фішингове посилання на отримання коштів: "https://olx-pay-ua.site/receive/84729".
Вимоги: Пиши виключно українською мовою. Твої репліки мають бути короткими (1-2 речення), переконливими та природними для чату. Залишайся в ролі.`;

      case 'SCAMMER_OFF_PLATFORM':
        return `[Навчальна симуляція кібербезпеки: рольовий сценарій "шахрай з переведенням у месенджер"]. ${itemStr}
Твоя роль у симуляції: покупець, який наполегливо просить продавця перейти в сторонній месенджер (Telegram або Viber) під приводом відео товару або проблем із додатком.
Вимоги: Пиши виключно українською мовою. Репліки 1-2 речення.`;

      case 'SCAMMER_CARD_DETAILS':
        return `[Навчальна симуляція кібербезпеки: рольовий сценарій "шахрай з виманюванням платіжних даних"]. ${itemStr}
Твоя роль у симуляції: покупець, який просить номер картки, а після його надання просить термін дії картки або три цифри CVV/CVC (чи SMS код), пояснюючи це вимогою бухгалтерії банку.
Вимоги: Пиши виключно українською мовою. Репліки 1-2 речення.`;

      case 'LEGITIMATE_BUYER_BARGAIN':
        return `[Сценарій: адекватний покупець на маркетплейсі]. ${itemStr}
Твоя роль у симуляції: звичайний порядний покупець. Запитай про стан товару, чи є дефекти або сліди вживання, чи можливий торг і доставка поштою.
Вимоги: Пиши виключно українською мовою, ввічливо, без маніпуляцій. Репліки 1-2 речення.`;

      case 'LEGITIMATE_BUYER_P2P':
        return `[Сценарій: адекватний покупець з оплатою на картку]. ${itemStr}
Твоя роль у симуляції: порядний клієнт, готовий купити товар. Попроси номер картки для переказу коштів. Ніколи не просити CVV чи паролі. Коли дадуть номер картки — подякуй і пообіцяй переказ.
Вимоги: Пиши виключно ввічливою українською мовою. Репліки 1-2 речення.`;

      case 'CUSTOM':
      default:
        return customGoal || `[Симуляція клієнта]. ${itemStr} Пиши виключно українською мовою, 1-2 речення.`;
    }
  }

  /**
   * Побудова повного промпту для Gemini Nano з урахуванням усієї попередньої історії діалогу
   */
  public static buildPromptWithHistory(
    persona: SimulatorPersona,
    history: DialogueMessage[],
    latestUserMessage?: string,
    itemContext?: string,
    customGoal?: string
  ): string {
    const systemInstruction = this.buildSystemPrompt(persona, itemContext, customGoal);
    const dialogueLines: string[] = [];

    for (const msg of history) {
      const speaker = msg.role === 'assistant' ? '[Співрозмовник]' : '[Продавець]';
      dialogueLines.push(`${speaker}: ${msg.text}`);
    }

    if (latestUserMessage && latestUserMessage.trim()) {
      dialogueLines.push(`[Продавець]: ${latestUserMessage.trim()}`);
    }

    return `${systemInstruction}

Контекст переписки:
"""
${dialogueLines.length > 0 ? dialogueLines.join('\n') : 'Переписка тільки починається.'}
"""

Інструкція: Напиши наступну коротку відповідь від імені [Співрозмовник] українською мовою.
Пиши ТІЛЬКИ текст повідомлення (1-2 речення), без лапок, без коментарів та без префікса "[Співрозмовник]:".`;
  }

  /**
   * Стійка резервна генерація відповідей (Rule-based Fallback) для роботи безпосередньо в DOM/тестах
   */
  public static generateFallbackReply(
    persona: SimulatorPersona,
    history: DialogueMessage[],
    latestUserMessage?: string
  ): string {
    const userText = (latestUserMessage || '').toLowerCase();
    const turnsCount = history.length;

    // Перше повідомлення в діалозі
    if (turnsCount === 0 && !latestUserMessage) {
      if (persona === 'SCAMMER_ESCROW') {
        return 'Доброго дня! Оголошення ще актуальне? Хочу оформити замовлення.';
      }
      if (persona === 'SCAMMER_OFF_PLATFORM') {
        return 'Привіт! Товар ще продається? Напишіть мені в Телеграм, тут рідко буваю.';
      }
      if (persona === 'LEGITIMATE_BUYER_P2P') {
        return 'Доброго дня! Товар ще продається? Готовий забрати.';
      }
      return 'Доброго дня! Товар ще в наявності? Який стан?';
    }

    // Реакція на відмову
    if (userText.includes('не буду') || userText.includes('шахрай') || userText.includes('підозріл') || userText.includes('відмов')) {
      if (persona.startsWith('SCAMMER')) {
        return 'Чому ви боїтеся? Це ж офіційна безпечна оплата, кошти вже списані з мого рахунку!';
      }
      return 'Зрозумів, вибачте за турботу. Гарного дня!';
    }

    // Реакція на номер картки (PAN)
    const hasCardPattern = /(?:\d[ -]*?){13,19}/.test(userText);
    if (hasCardPattern) {
      if (persona === 'SCAMMER_CARD_DETAILS') {
        return 'Оплата не проходить, банк вимагає три цифри ззаду картки (CVV) та термін дії для підтвердження юридичного рахунку. Напишіть їх, будь ласка.';
      }
      if (persona === 'LEGITIMATE_BUYER_P2P') {
        return 'Дякую, отримав! Зараз зроблю переказ і надішлю вам чек.';
      }
      if (persona === 'SCAMMER_ESCROW') {
        return 'Я вже оплатив через платформу, на картку не можу! Ось посилання на отримання: https://olx-pay-ua.site/receive/84729, перейдіть для зарахування.';
      }
    }

    // Персона: SCAMMER_ESCROW
    if (persona === 'SCAMMER_ESCROW') {
      if (userText.includes('актуальн') || userText.includes('так') || userText.includes('прода') || turnsCount <= 2) {
        return 'Чудово! Я вже все оплатив через OLX Доставку! Ось офіційне посилання на зарахування коштів: https://olx-pay-ua.site/receive/84729. Перейдіть і підтвердіть.';
      }
      return 'Перейдіть, будь ласка, за посиланням https://olx-pay-ua.site/receive/84729, без цього мені не надішлють товарно-транспортну накладну!';
    }

    // Персона: SCAMMER_OFF_PLATFORM
    if (persona === 'SCAMMER_OFF_PLATFORM') {
      return 'Надішліть свій номер або напишіть мені в Telegram: @olx_buyer_ukr, тут погано вантажаться фотографії.';
    }

    // Персона: SCAMMER_CARD_DETAILS
    if (persona === 'SCAMMER_CARD_DETAILS') {
      return 'Скиньте номер вашої картки, я зараз відправлю кошти через інтернет-банкінг.';
    }

    // Персона: LEGITIMATE_BUYER_P2P
    if (persona === 'LEGITIMATE_BUYER_P2P') {
      if (userText.includes('так') || userText.includes('актуальн') || userText.includes('доброго')) {
        return 'Чудово! Скиньте, будь ласка, номер вашої картки для переказу, я оплачу і напишу куди відправити.';
      }
      return 'Добре, скидайте реквізити картки, чекаю.';
    }

    // Персона: LEGITIMATE_BUYER_BARGAIN
    if (userText.includes('стан') || userText.includes('так') || userText.includes('добр')) {
      return 'Підкажіть, чи можлива невелика знижка, і чи зможете відправити сьогодні Новою Поштою накладеним платежем?';
    }

    return 'Дякую за відповідь, все влаштовує! Як вам зручніше відправити?';
  }
}
