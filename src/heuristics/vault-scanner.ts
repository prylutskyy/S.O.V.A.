import { HeuristicResult } from '../types';
import { VaultItem, VaultMatchResult } from '../types/vault';
import { PersonalVaultManager } from '../core/personal-vault';

export class VaultScanner {
  /**
   * Синхронне DLP-сканування форми на наявність запиту або введення маркерів із Vault
   */
  public static scanFormSync(form: HTMLFormElement): {
    triggers: HeuristicResult[];
    matches: VaultMatchResult[];
  } {
    const items = PersonalVaultManager.getItemsSync();
    const matches: VaultMatchResult[] = [];
    const triggers: HeuristicResult[] = [];

    if (!items || items.length === 0) {
      return { triggers, matches };
    }

    const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

    inputs.forEach((input) => {
      // 1. Отримання повного контексту поля (лейбл, плейсхолдер, ім'я, id, aria)
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

      // 2. Перевірка на співпадіння за ключовими словами поля
      const itemByField = PersonalVaultManager.findMatchingVaultItemForField(descriptor, items);
      if (itemByField) {
        matches.push({
          matchedItem: itemByField,
          inputElement: input,
          detectedFieldLabel: labelText.trim() || input.placeholder || itemByField.label,
          matchType: 'FIELD_LABEL_MATCH',
          isDecoyAvailable: Boolean(itemByField.decoyValue),
        });
      }

      // 3. Перевірка на присутність реального конфіденційного значення
      if (val) {
        const itemByValue = PersonalVaultManager.findMatchingVaultItemForValue(val, items);
        if (itemByValue && !matches.some((m) => m.matchedItem.id === itemByValue.id && m.inputElement === input)) {
          matches.push({
            matchedItem: itemByValue,
            inputElement: input,
            detectedFieldLabel: labelText.trim() || input.placeholder || itemByValue.label,
            matchType: 'VALUE_MATCH',
            isDecoyAvailable: Boolean(itemByValue.decoyValue),
          });
        }
      }
    });

    if (matches.length > 0) {
      const distinctLabels = Array.from(new Set(matches.map((m) => m.matchedItem.label)));
      triggers.push({
        name: 'vault_sensitive_data_exposure',
        triggered: true,
        severity: 'CRITICAL',
        scoreContribution: 45,
        message: `Форма випитує захищені дані відновлення доступу (${distinctLabels.join(', ')})!`,
        details: {
          itemsCount: matches.length,
          labels: distinctLabels,
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
      const realClean = item.realValue.trim().toLowerCase();
      if (realClean && realClean.length >= 2 && text.toLowerCase().includes(realClean)) {
        matchedItems.push(item);
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
   * Автоматична підстановка безпечних фіктивних даних (Canary Decoy) у форму
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
