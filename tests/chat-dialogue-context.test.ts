import { describe, it, expect, beforeEach } from 'vitest';
import { ChatSessionState } from '../src/heuristics/chat-session-state';
import { AIHeuristicContext } from '../src/heuristics/ai-provider.interface';

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
});
