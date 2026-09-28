// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatSessionState } from '../src/heuristics/chat-session-state';
import { ChatChannelMonitor } from '../src/heuristics/chat-channel';
import { AIHeuristicContext } from '../src/heuristics/ai-provider.interface';
import { OutboundDataSanitizer } from '../src/privacy/outbound-data-sanitizer';

describe('Chat Dialogue Context for AI Arbiter (TDD Suite)', () => {
  beforeEach(() => {
    ChatSessionState.reset();
  });

  describe('ChatSessionState dialogue formatting', () => {
    it('зберігає повідомлення обох сторін (співрозмовник та користувач) у хронологічному порядку', () => {
      ChatSessionState.addMessageAndEvaluate('Доброго дня, товар ще продається?', 'inbound');
      ChatSessionState.addMessageAndEvaluate('Так, актуально. Можу відправити сьогодні.', 'outbound');
      ChatSessionState.addMessageAndEvaluate('Чудово, я оформив доставку, ось посилання на отримання коштів: https://novaposhta-pay.fake.com', 'inbound');

      const messages = ChatSessionState.getRecentMessages();
      expect(messages.length).toBe(3);
      expect(messages[0].direction).toBe('inbound');
      expect(messages[0].rawText).toContain('товар ще продається');
      expect(messages[1].direction).toBe('outbound');
      expect(messages[1].rawText).toContain('Так, актуально');
      expect(messages[2].direction).toBe('inbound');
      expect(messages[2].rawText).toContain('novaposhta-pay');
    });

    it('форматує історію листування з коректними ролями [Співрозмовник] та [Ви]', () => {
      ChatSessionState.addMessageAndEvaluate('Добрий день! Оплатив замовлення через OLX Доставку.', 'inbound');
      ChatSessionState.addMessageAndEvaluate('Дякую, але мені не прийшло сповіщення у додатку.', 'outbound');
      ChatSessionState.addMessageAndEvaluate('Перейдіть за цим лінком щоб підтвердити: https://olx-oplata.store/order123', 'inbound');

      const dialogue = ChatSessionState.getDialogueHistory();

      expect(dialogue).toContain('[Співрозмовник]: Добрий день! Оплатив замовлення через OLX Доставку.');
      expect(dialogue).toContain('[Ви]: Дякую, але мені не прийшло сповіщення у додатку.');
      expect(dialogue).toContain('[Співрозмовник]: Перейдіть за цим лінком щоб підтвердити: https://olx-oplata.store/order123');
    });

    it('додає поточний введений текст у формі/полі як [Ви (Чернетка)]', () => {
      ChatSessionState.addMessageAndEvaluate('Скиньте дані картки для зарахування', 'inbound');

      const draftText = 'Ось моя картка 4149 4390 1234 5678';
      const dialogue = ChatSessionState.getDialogueHistory(draftText);

      expect(dialogue).toContain('[Співрозмовник]: Скиньте дані картки для зарахування');
      expect(dialogue).toContain('[Ви (Чернетка)]: Ось моя картка 4149 4390 1234 5678');
    });

    it('не дублює чернетку, якщо вона порожня або містить лише пробіли', () => {
      ChatSessionState.addMessageAndEvaluate('Привіт!', 'inbound');

      const dialogue = ChatSessionState.getDialogueHistory('   ');
      expect(dialogue).toContain('[Співрозмовник]: Привіт!');
      expect(dialogue).not.toContain('[Ви (Чернетка)]');
    });

    it('обмежує діалогове вікно останніми повідомленнями, щоб не переповнювати контекст LLM', () => {
      for (let i = 1; i <= 10; i++) {
        const direction = i % 2 === 0 ? 'outbound' : 'inbound';
        ChatSessionState.addMessageAndEvaluate(`Повідомлення #${i}`, direction);
      }

      const dialogue = ChatSessionState.getDialogueHistory('Фінальна чернетка');
      // Має містити лише останні повідомлення
      expect(dialogue).toContain('Повідомлення #10');
      expect(dialogue).toContain('[Ви (Чернетка)]: Фінальна чернетка');
    });
  });

  describe('Інтеграція діалогу в AIHeuristicContext', () => {
    it('дозволяє передавати chatDialogue у структурі AIHeuristicContext', () => {
      const context: AIHeuristicContext = {
        detectedKeywords: ['доставка', 'оплата'],
        suspiciousUrls: ['https://fake.link'],
        intentType: 'ESCROW_DELIVERY_SCAM',
        nlpConfidence: 85,
        triggeredClusters: ['payment_escrow', 'suspicious_link'],
        chatDialogue: '[Співрозмовник]: Оплатив\n[Ви]: Очікую\n[Ви (Чернетка)]: 4149...',
      };

      expect(context.chatDialogue).toBeDefined();
      expect(context.chatDialogue).toContain('[Ви (Чернетка)]');
      expect(context.chatDialogue).toContain('[Співрозмовник]');
    });
  });

  describe('DOM-based multi-turn chat dialogue extraction', () => {
    it('успішно витягує весь живий діалог із Bulma/P2P чату без дублювання та системних статусів', () => {
      document.body.innerHTML = `
        <div class="container"><div class="messages" style="height: 100%; width: 100%;"><div class="has-text-centered" style="padding: 0.5rem; font-size: 0.8rem;">Created Peer: 576x5013f496x4k5dx1i64</div><div class="has-text-centered" style="padding: 0.5rem; font-size: 0.8rem;">Connected to Peer: 2r2yt1k2f326x5174bb4d3</div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">привіт. Як справи?)</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">Йоу. Все шикарно, а у тебе?</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">Що плануєш сьогодні робити?</span></div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">Та хуй його зна</span></div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">нічого поки</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">Слухай! я тут тємку знайшов, як бабок заробити</span></div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">Недай бог це будуть офіси)</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">старий, які офіси?))</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">там тєма чуто мутна, слизька, але пару купюр можна заробити</span></div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">Добро. Валяй.</span></div><div class="has-text-right" style="padding: 0.5rem;"><span class="tag is-medium is-primary">що там у тебе?</span></div><div class="has-text-left" style="padding: 0.5rem;"><span class="tag is-medium is-light">заходиш на olx та пишеш повідомлення по типу "Інформація про замовлення: Найменування товару Бавовняна рубашка H&amp;M (S) Сума до отримання 600 грн. Будь ласка, зверніть увагу Оскільки це ваша перша угода через «OLX Доставка», для завершення операції потрібно пройти додаткову перевірку профілю. Що потрібно зробити: Виділіть посилання -t.me/OLXHelpProtect_bot Вставте її у свій браузер або натисніть «Перейти» одразу з меню, що з'явилося Дотримуйтесь інструкцій бота та завершіть миттєву перевірку даних Зверніть увагу: Доки перевірка не буде завершена, замовлення залишатиметься у статусі очікування. Дякуємо, що обираєте OLX"</span></div></div></div>
      `;

      const dialogue = ChatChannelMonitor.getDialogueHistory();

      // Не повинно містити системні повідомлення peer
      expect(dialogue).not.toContain('Created Peer');
      expect(dialogue).not.toContain('Connected to Peer');

      // Повинно містити повідомлення з правильними ролями
      expect(dialogue).toContain('[Ви]: привіт. Як справи?)');
      expect(dialogue).toContain('[Співрозмовник]: Йоу. Все шикарно, а у тебе?');
      expect(dialogue).toContain('[Співрозмовник]: Що плануєш сьогодні робити?');
      expect(dialogue).toContain('[Ви]: Та хуй його зна');
      expect(dialogue).toContain('[Співрозмовник]: Слухай! я тут тємку знайшов, як бабок заробити');
      expect(dialogue).toContain('[Співрозмовник]: заходиш на olx та пишеш повідомлення');
      expect(dialogue).toContain('t.me/OLXHelpProtect_bot');

      // Перевірка кількості рядків: рівно 12 реплік
      const lines = dialogue.split('\n');
      expect(lines.length).toBe(12);
    });

    it('формує промпт з орієнтацією на захист автора [Ви] та розмежуванням цитування шаблонів (isScam: false)', () => {
      const payload = OutboundDataSanitizer.sanitize('заходиш на olx та пишеш повідомлення по типу "OLX Доставка... t.me/bot"');
      const prompt = OutboundDataSanitizer.buildCloudPrompt(payload, {
        intentType: 'VERIFICATION_PHISHING',
        dialogueHistory: '[Співрозмовник]: заробити бабосиків\n[Ви]: валяй\n[Співрозмовник]: заходиш на olx...',
        detectedKeywords: ['olx доставка', 'бот'],
        suspiciousUrls: ['https://t.me/olxhelpprotect_bot'],
      });

      // Перевірка наявності чітких правил щодо захисту автора
      expect(prompt).toContain('IS THE CURRENT USER ([Ви]) PERSONALLY AT RISK');
      expect(prompt).toContain('META-DISCUSSION & TEMPLATE SHARING');
      expect(prompt).toContain('NOT AN ATTACK AGAINST [Ви] / SAFE CONTEXT (isScam: false)');
      expect(prompt).toContain('=== FULL CHAT DIALOGUE HISTORY ===');
      expect(prompt).toContain('[Співрозмовник]: заробити бабосиків');
    });
  });
});
