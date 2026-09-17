import { describe, it, expect } from 'vitest';
import { ChatSimulatorEngine, SimulatorPersona } from '../src/heuristics/chat-simulator';

describe('ChatSimulatorEngine (TDD Suite)', () => {
  describe('Побудова системного промпту для персони (System Prompt Construction)', () => {
    it('створює промпт для шахрая з фішинговою доставкою (SCAMMER_ESCROW)', () => {
      const prompt = ChatSimulatorEngine.buildSystemPrompt('SCAMMER_ESCROW', 'Велосипед гірський, 8500 грн');
      expect(prompt).toContain('шахрай');
      expect(prompt).toContain('посилання');
      expect(prompt).toContain('Велосипед гірський');
      expect(prompt).toContain('українською мовою');
    });

    it('створює промпт для шахрая з переведенням у сторонній месенджер (SCAMMER_OFF_PLATFORM)', () => {
      const prompt = ChatSimulatorEngine.buildSystemPrompt('SCAMMER_OFF_PLATFORM');
      expect(prompt).toContain('Telegram');
      expect(prompt).toContain('Viber');
    });

    it('створює промпт для адекватного покупця (LEGITIMATE_BUYER_BARGAIN)', () => {
      const prompt = ChatSimulatorEngine.buildSystemPrompt('LEGITIMATE_BUYER_BARGAIN', 'Ноутбук Lenovo');
      expect(prompt).toContain('адекватний покупець');
      expect(prompt).toContain('стан');
      expect(prompt).not.toContain('фішинг');
    });

    it('створює промпт для кастомної мети (CUSTOM_GOAL)', () => {
      const customGoal = 'Ти іноземець, який намагається купити товар через кур’єра FedEx';
      const prompt = ChatSimulatorEngine.buildSystemPrompt('CUSTOM', 'Годинник Apple Watch', customGoal);
      expect(prompt).toContain(customGoal);
    });
  });

  describe('Формування промпту з історією діалогу (Prompt with Conversation History)', () => {
    it('включає попередні репліки обох сторін у контекст генерації', () => {
      const history = [
        { role: 'assistant' as const, text: 'Доброго дня! Товар ще в наявності?' },
        { role: 'user' as const, text: 'Так, доброго дня, велосипед є.' },
      ];
      const latestMessage = 'Можете скинути додаткові фото?';

      const fullPrompt = ChatSimulatorEngine.buildPromptWithHistory('SCAMMER_ESCROW', history, latestMessage);
      expect(fullPrompt).toContain('[Співрозмовник]: Доброго дня! Товар ще в наявності?');
      expect(fullPrompt).toContain('[Продавець]: Так, доброго дня, велосипед є.');
      expect(fullPrompt).toContain('[Продавець]: Можете скинути додаткові фото?');
    });
  });

  describe('Автономна генерація відповідей (Fallback Simulation Engine)', () => {
    it('генерує перше повідомлення для шахрая (SCAMMER_ESCROW)', () => {
      const reply = ChatSimulatorEngine.generateFallbackReply('SCAMMER_ESCROW', []);
      expect(reply.length).toBeGreaterThan(10);
      expect(reply).toMatch(/добр|привіт|цікавить|прода/i);
    });

    it('шахрай надсилає фішингове посилання у відповідь на підтвердження наявності', () => {
      const history = [
        { role: 'assistant' as const, text: 'Доброго дня! Велосипед ще продається?' },
      ];
      const reply = ChatSimulatorEngine.generateFallbackReply(
        'SCAMMER_ESCROW',
        history,
        'Так, актуально. Можу відправити сьогодні.'
      );

      expect(reply).toMatch(/посилання|доставк|оплат|https?:\/\//i);
    });

    it('адекватний покупець запитує про стан або можливість переказу на картку', () => {
      const history = [
        { role: 'assistant' as const, text: 'Доброго дня! Велосипед ще продається?' },
      ];
      const reply = ChatSimulatorEngine.generateFallbackReply(
        'LEGITIMATE_BUYER_P2P',
        history,
        'Доброго дня, так, продається.'
      );

      expect(reply).toMatch(/картк|оплат|переказ|реквізит|скиньте/i);
      expect(reply).not.toMatch(/cvv|пароль|перейдіть за посиланням/i);
    });

    it('адекватний покупець дякує, якщо продавець надіслав лише номер картки', () => {
      const history = [
        { role: 'assistant' as const, text: 'Скиньте номер картки для оплати' },
      ];
      const reply = ChatSimulatorEngine.generateFallbackReply(
        'LEGITIMATE_BUYER_P2P',
        history,
        'Ось картка: 4149 4390 1234 5678'
      );

      expect(reply).toMatch(/дякую|переказую|оплачую|зараз/i);
      expect(reply).not.toMatch(/cvv|код безпеки|пароль/i);
    });
  });
});
