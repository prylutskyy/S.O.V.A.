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
  });

  describe('False Positive Protection', () => {
    it('does NOT trigger on innocent delivery questions', () => {
      const text = 'Доброго дня, ви можете відправити товар Новою Поштою? Яка вартість?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });

    it('does NOT trigger on casual friendly chat', () => {
      const text = 'Привіт! Як справи? Коли зустрінемося випити кави?';
      const result = SemanticTriggerEngine.evaluate(text);

      expect(result.hasFormedIntent).toBe(false);
    });
  });
});
