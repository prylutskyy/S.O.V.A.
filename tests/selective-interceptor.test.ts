import { describe, it, expect, beforeEach } from 'vitest';
import { SensitiveAssetDetector } from '../src/heuristics/sensitive-asset-detector';
import { ActiveThreatContext } from '../src/types';
import { VaultItem } from '../src/types/vault';

describe('Selective Asset Interceptor Logic (Integration Suite)', () => {
  let mockThreatContext: ActiveThreatContext;

  beforeEach(() => {
    mockThreatContext = {
      sessionId: '#S-TEST1',
      sourcePlatform: 'olx.ua',
      scenario: 'ESCROW_DELIVERY_FRAUD',
      threatLevel: 'HIGH',
      detectedKeywords: ['доставка', 'оплата'],
      offPlatformLure: true,
      timestamp: Date.now(),
      ttlMs: 60000,
    };
  });

  describe('Поведінка під час активної загрози в чаті (Armed / Guarded Mode)', () => {
    it('дозволяє відправку звичайного тексту навіть при наявності активного контексту загрози', () => {
      const payload = {
        text: 'Дякую, але я не буду переходити за вашим лінком.',
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(false);
      expect(assessment.action).toBe('ALLOW');
      expect(assessment.riskLevel).toBe('SAFE');
    });

    it('дозволяє відправку 16-значного номера картки (PAN) для P2P-переказу при активному контексті', () => {
      const payload = {
        text: 'Мій номер картки: 4149 4390 1234 5678, чекаю оплату',
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(false);
      expect(assessment.action).toBe('ALLOW');
      expect(assessment.detectedAssets.hasCard).toBe(true);
      expect(assessment.detectedAssets.cards[0]).toBe('4149439012345678');
      expect(assessment.detectedAssets.hasCvv).toBe(false);
      expect(assessment.detectedAssets.hasExpiry).toBe(false);
    });

    it('перехоплює відправку, якщо разом з карткою передається CVV/CVC код', () => {
      const payload = {
        text: 'Картка 4149 4390 1234 5678 і три цифри ззаду: 391',
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(true);
      expect(assessment.action).toBe('BLOCK');
      expect(assessment.riskLevel).toBe('CRITICAL');
      expect(assessment.reason).toContain('CVV');
    });

    it('перехоплює відправку, якщо разом з карткою передається термін дії (MM/YY)', () => {
      const payload = {
        text: 'Картка 4149 4390 1234 5678 діє до 09/28',
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(true);
      expect(assessment.action).toBe('BLOCK');
      expect(assessment.riskLevel).toBe('HIGH');
      expect(assessment.detectedAssets.hasExpiry).toBe(true);
      expect(assessment.reason).toContain('термін дії');
    });

    it('перехоплює передачу одноразового банківського SMS коду (OTP)', () => {
      const payload = {
        text: 'Мені щойно прийшов код підтвердження від банку: 739102',
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(true);
      expect(assessment.action).toBe('BLOCK');
      expect(assessment.riskLevel).toBe('CRITICAL');
      expect(assessment.detectedAssets.hasOtp).toBe(true);
    });
  });

  describe('Інтеграція з Private Vault: Відкритий vs Закритий стан', () => {
    const unlockedItems: VaultItem[] = [
      {
        id: 'v-mother',
        category: 'MOTHER_MAIDEN_NAME',
        label: 'Дівоче прізвище матері',
        realValue: 'Шевченко',
        decoyValue: 'Франко',
        keywords: ['дівоче прізвище'],
        createdAt: Date.now(),
      },
    ];

    it('перехоплює передачу секрету, коли сховище РОЗБЛОКОВАНЕ', () => {
      const payload = {
        text: 'Моє дівоче прізвище Шевченко',
        unlockedVaultItems: unlockedItems,
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(true);
      expect(assessment.action).toBe('BLOCK');
      expect(assessment.riskLevel).toBe('CRITICAL');
      expect(assessment.detectedAssets.vaultMatches.length).toBe(1);
      expect(assessment.detectedAssets.vaultMatches[0].label).toBe('Дівоче прізвище матері');
    });

    it('не блокує за Vault-правилом, коли сховище ЗАБЛОКОВАНЕ (порожній кеш відкритих ключів)', () => {
      const payload = {
        text: 'Шевченко написав багато творів',
        unlockedVaultItems: [], // Сховище замкнене
      };

      const assessment = SensitiveAssetDetector.evaluateOutboundPayload(payload);
      expect(assessment.shouldBlock).toBe(false);
      expect(assessment.action).toBe('ALLOW');
      expect(assessment.detectedAssets.vaultMatches.length).toBe(0);
    });
  });
});
