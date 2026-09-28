import { HeuristicResult } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { PersonalVaultManager } from '../core/personal-vault';
import { isWhitelisted } from '../core/whitelist';
import { isAccreditedPaymentGateway } from '../core/payment-gateways';
import { UserWhitelistManager } from '../core/user-whitelist';

export class VaultScanner {
  /**
   * Витягує повний контекстний дескриптор поля (лейбли, плейсхолдери, заголовки блоків, camelCase)
   */
  public static extractInputContext(input: HTMLElement, form?: HTMLFormElement): {
    descriptor: string;
    labelText: string;
  } {
    let labelText = '';
    const id = input.id;
    if (id && form) {
      const labelEl = form.querySelector(`label[for="${id}"]`);
      if (labelEl) labelText = labelEl.textContent || '';
    }
    if (!labelText && id && typeof document !== 'undefined') {
      const labelEl = document.querySelector(`label[for="${id}"]`);
      if (labelEl) labelText = labelEl.textContent || '';
    }
    if (!labelText) {
      const parentLabel = input.closest('label');
      if (parentLabel) labelText = parentLabel.textContent || '';
    }
    if (!labelText) {
      const container = input.closest('.question, .form-group, .form-field, .field, fieldset, .form-row, [role="group"]');
      if (container) {
        const titleEl = container.querySelector('.q-title, .title, .label, legend, .q-desc, .desc, .help-block');
        if (titleEl) {
          labelText = titleEl.textContent || '';
        } else {
          try {
            const clone = container.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('input, textarea, select, button').forEach((el) => el.remove());
            labelText = clone.textContent || '';
          } catch {}
        }
      }
    }
    if (!labelText && input.previousElementSibling) {
      const prev = input.previousElementSibling;
      if (['DIV', 'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'LEGEND'].includes(prev.tagName)) {
        labelText = prev.textContent || '';
      }
    }

    const name = input.getAttribute('name') || '';
    const placeholder = input.getAttribute('placeholder') || '';
    const autocomplete = input.getAttribute('autocomplete') || '';
    const ariaLabel = input.getAttribute('aria-label') || '';
    const ariaDesc = input.getAttribute('aria-description') || '';

    // CamelCase splitting (наприклад, 'secretWord' -> 'secret Word', 'taxId' -> 'tax Id')
    const splitName = name.replace(/([a-z\d])([A-Z])/g, '$1 $2');
    const splitId = (id || '').replace(/([a-z\d])([A-Z])/g, '$1 $2');

    const descriptor = `${name} ${splitName} ${id} ${splitId} ${placeholder} ${autocomplete} ${ariaLabel} ${ariaDesc} ${labelText}`.toLowerCase().trim();

    return {
      descriptor,
      labelText: labelText.trim(),
    };
  }

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
      const { descriptor, labelText } = VaultScanner.extractInputContext(input, form);
      const val = input.value?.trim() || '';

      // Перевірка на співпадіння за ключовими словами поля (Field Context Inspection)
      const itemByField = PersonalVaultManager.findMatchingVaultItemForField(descriptor, items, true);
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
