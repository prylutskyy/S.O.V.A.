import { HeuristicResult } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { PersonalVaultManager } from '../core/personal-vault';
import { isWhitelisted } from '../core/whitelist';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { UserWhitelistManager } from '../core/user-whitelist';

export class VaultScanner {
  /**
   * Синхронне DLP-сканування форми на наявність запиту або введення маркерів із Vault
   */
  public static scanFormSync(
    form: HTMLFormElement,
    host: string = window.location.hostname
  ): {
    triggers: HeuristicResult[];
    matches: VaultMatchResult[];
  } {
    const items = PersonalVaultManager.getItemsSync();
    const matches: VaultMatchResult[] = [];
    const triggers: HeuristicResult[] = [];

    if (!items || items.length === 0) {
      return { triggers, matches };
    }

    const cleanHost = (host || window.location.hostname || '').toLowerCase().trim();

    // 1. ПРАВИЛО ІМУНІТЕТУ: Державні портали (.gov.ua), акредитовані шлюзи та сайти з білого списку не блокуються
    if (
      isWhitelisted(cleanHost) ||
      cleanHost.endsWith('.gov.ua') ||
      isAccreditedPaymentGateway(cleanHost) ||
      UserWhitelistManager.isDomainAllowedSync(cleanHost)
    ) {
      return { triggers, matches };
    }

    const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

    inputs.forEach((input) => {
      // Отримання повного контексту поля (лейбл, плейсхолдер, ім'я, id, aria)
      let labelText = '';
      if (input.id) {
        const labelEl = form.querySelector(`label[for="${input.id}"]`);
        if (labelEl) labelText = labelEl.textContent || '';
      }
      if (!labelText) {
        const parentLabel = input.closest('label');
        if (parentLabel) labelText = parentLabel.textContent || '';
      }

      const descriptor = `${input.name} ${input.id} ${input.placeholder} ${input.autocomplete} ${input.getAttribute('aria-label') || ''} ${labelText}`.toLowerCase();
      const val = input.value?.trim() || '';

      // Перевірка на співпадіння за ключовими словами поля (Field Context Inspection)
      const itemByField = PersonalVaultManager.findMatchingVaultItemForField(descriptor, items);
      if (itemByField) {
        const tier = PersonalVaultManager.getCategoryTier(itemByField.category);
        matches.push({
          matchedItem: itemByField,
          inputElement: input,
          detectedFieldLabel: labelText.trim() || input.placeholder || itemByField.label,
          matchType: 'FIELD_LABEL_MATCH',
          isDecoyAvailable: Boolean(itemByField.decoyValue),
          tier,
        });
      }

      // Перевірка на присутність реального конфіденційного значення (Value Inspection)
      if (val) {
        const itemByValue = PersonalVaultManager.findMatchingVaultItemForValue(val, items);
        if (itemByValue) {
          const tier = PersonalVaultManager.getCategoryTier(itemByValue.category);
          const existing = matches.find((m) => m.matchedItem.id === itemByValue.id && m.inputElement === input);
          if (existing) {
            existing.matchType = 'VALUE_MATCH'; // Ескалація до реального витоку значення
          } else {
            matches.push({
              matchedItem: itemByValue,
              inputElement: input,
              detectedFieldLabel: labelText.trim() || input.placeholder || itemByValue.label,
              matchType: 'VALUE_MATCH',
              isDecoyAvailable: Boolean(itemByValue.decoyValue),
              tier,
            });
          }
        }
      }
    });

    if (matches.length > 0) {
      const distinctLabels = Array.from(new Set(matches.map((m) => m.matchedItem.label)));
      const hasValueLeak = matches.some((m) => m.matchType === 'VALUE_MATCH');
      const hasTierA = matches.some((m) => m.tier === 'TIER_A_ABSOLUTE');
      const tierBCount = matches.filter((m) => m.tier === 'TIER_B_CONDITIONAL').length;

      let scoreContribution = 15;
      let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      let message = '';

      if (hasValueLeak) {
        // Користувач реально ввів своє секретне значення у форму
        scoreContribution = 45;
        severity = 'CRITICAL';
        message = `Виявлено прямий витік персональних маркерів відновлення банку (${distinctLabels.join(', ')})!`;
      } else if (hasTierA) {
        // Сайт запитує дівоче прізвище матері або кодове слово банку (Категорія А)
        scoreContribution = 45;
        severity = 'CRITICAL';
        message = `Форма випитує абсолютні банківські маркери безпеки (${distinctLabels.join(', ')}), які ніколи не запитуються сторонніми сайтами!`;
      } else if (tierBCount >= 2) {
        // Комбінований збір кількох персональних реквізитів (напр. ІПН + паспорт + дата народження)
        scoreContribution = 35;
        severity = 'HIGH';
        message = `Виявлено масовий збір конфіденційних реквізитів особи (${distinctLabels.join(', ')}) для проходження KYC!`;
      } else {
        // Поодинокий запит умовно-чутливого поля (наприклад, дата народження чи телефон)
        scoreContribution = 15;
        severity = 'MEDIUM';
        message = `Сайт запитує персональний контактний маркер: ${distinctLabels.join(', ')}.`;
      }

      triggers.push({
        name: 'vault_sensitive_data_exposure',
        triggered: true,
        severity,
        scoreContribution,
        message,
        details: {
          itemsCount: matches.length,
          labels: distinctLabels,
          hasValueLeak,
          hasTierA,
          identityProbingActive: true,
        },
      });
    }

    return { triggers, matches };
  }

  /**
   * Синхронне DLP-сканування тексту повідомлення в чаті
   */
  public static scanTextSync(text: string): {
    triggers: HeuristicResult[];
    matchedItems: VaultItem[];
  } {
    const items = PersonalVaultManager.getItemsSync();
    const matchedItems: VaultItem[] = [];
    const triggers: HeuristicResult[] = [];

    if (!items || items.length === 0 || !text) {
      return { triggers, matchedItems };
    }

    for (const item of items) {
      const match = PersonalVaultManager.findMatchingVaultItemForValue(text, [item]);
      if (match) {
        matchedItems.push(match);
      }
    }

    if (matchedItems.length > 0) {
      const distinct = Array.from(new Set(matchedItems.map((i) => i.label)));
      triggers.push({
        name: 'vault_chat_leakage',
        triggered: true,
        severity: 'CRITICAL',
        scoreContribution: 45,
        message: `У тексті повідомлення виявлено конфіденційний маркер особи: ${distinct.join(', ')}!`,
        details: { labels: distinct },
      });
    }

    return { triggers, matchedItems };
  }

  /**
   * Автоматична підстановка безпечних маскувальних даних (Decoy) у форму
   */
  public static applyDecoys(matches: VaultMatchResult[]): number {
    let replacedCount = 0;

    matches.forEach((match) => {
      if (match.inputElement && match.matchedItem.decoyValue) {
        match.inputElement.value = match.matchedItem.decoyValue;

        // Генерація подій, щоб реактивні фреймворки зафіксували підстановку
        match.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        match.inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        replacedCount++;
      }
    });

    return replacedCount;
  }
}
