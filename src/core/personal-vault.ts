import { VaultItem, VaultItemCategory } from '../types/vault';

const VAULT_STORAGE_KEY = 'threat_shield_personal_vault';

export const DEFAULT_VAULT_ITEMS: VaultItem[] = [
  {
    id: 'vault-default-mother',
    category: 'MOTHER_MAIDEN_NAME',
    label: 'Дівоче прізвище матері',
    realValue: 'Людмила',
    decoyValue: 'Оксана',
    keywords: ['дівоче', 'дівоче прізвище', 'прізвище матері', 'дівоче прізвище матері', 'maiden', 'mother'],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-father',
    category: 'FATHER_NAME',
    label: "Ім'я батька",
    realValue: 'Лео',
    decoyValue: 'Олександр',
    keywords: ['батька', "ім'я батька", 'по батькові', 'father', 'patronymic'],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-taxid',
    category: 'TAX_ID',
    label: 'РНОКПП (ІПН)',
    realValue: '3124567890',
    decoyValue: '2987654321',
    keywords: ['рнокпп', 'іпн', 'ідентифікаційний код', 'код платника', 'tax_id', 'inn'],
    createdAt: Date.now(),
  },
];

export class PersonalVaultManager {
  private static cachedItems: VaultItem[] = DEFAULT_VAULT_ITEMS;
  private static isInitialized = false;

  /**
   * Ініціалізація кешу при завантаженні скрипта
   */
  public static async init(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(VAULT_STORAGE_KEY);
        if (result && Array.isArray(result[VAULT_STORAGE_KEY]) && result[VAULT_STORAGE_KEY].length > 0) {
          this.cachedItems = result[VAULT_STORAGE_KEY];
        } else {
          await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: DEFAULT_VAULT_ITEMS });
          this.cachedItems = DEFAULT_VAULT_ITEMS;
        }
        this.isInitialized = true;

        // Підписка на оновлення з Popup
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[VAULT_STORAGE_KEY]) {
            this.cachedItems = changes[VAULT_STORAGE_KEY].newValue || DEFAULT_VAULT_ITEMS;
          }
        });
      }
    } catch (e) {
      console.error('[ThreatShield:Vault] Помилка ініціалізації сховища:', e);
    }
  }

  /**
   * Синхронне миттєве отримання маркерів (для обробників click/submit/input)
   */
  public static getItemsSync(): VaultItem[] {
    return this.cachedItems;
  }

  /**
   * Отримати всі збережені маркери з локального сховища
   */
  public static async getItems(): Promise<VaultItem[]> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.cachedItems;
  }

  /**
   * Додати або оновити маркер безпеки
   */
  public static async saveItem(
    item: Omit<VaultItem, 'id' | 'createdAt'> & { id?: string }
  ): Promise<VaultItem> {
    const items = await this.getItems();
    const existingIndex = item.id ? items.findIndex((i) => i.id === item.id) : -1;

    const savedItem: VaultItem = {
      id: item.id || `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: item.category,
      label: item.label.trim(),
      realValue: item.realValue.trim(),
      decoyValue: item.decoyValue.trim() || this.generateDefaultDecoy(item.category),
      keywords: item.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
      createdAt: Date.now(),
    };

    if (existingIndex >= 0) {
      items[existingIndex] = savedItem;
    } else {
      items.push(savedItem);
    }

    this.cachedItems = items;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: items });
    }

    return savedItem;
  }

  /**
   * Видалити маркер за ID
   */
  public static async deleteItem(id: string): Promise<void> {
    const items = await this.getItems();
    const filtered = items.filter((i) => i.id !== id);
    this.cachedItems = filtered;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: filtered });
    }
  }

  /**
   * Скинути до дефолтних налаштувань
   */
  public static async resetToDefaults(): Promise<void> {
    this.cachedItems = DEFAULT_VAULT_ITEMS;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: DEFAULT_VAULT_ITEMS });
    }
  }

  /**
   * Генерація автоматичного decoy-значення відповідно до категорії
   */
  public static generateDefaultDecoy(category: VaultItemCategory): string {
    switch (category) {
      case 'MOTHER_MAIDEN_NAME':
        return 'Оксана';
      case 'FATHER_NAME':
        return 'Олександр';
      case 'TAX_ID':
        return '2987654321';
      case 'PASSPORT_ID':
        return 'АА 123456';
      case 'SECRET_WORD':
        return 'Калина';
      case 'CUSTOM':
      default:
        return 'DecoyValue';
    }
  }

  /**
   * Пошук збігів за ключовими словами поля введення (Field Inspection)
   */
  public static findMatchingVaultItemForField(
    descriptor: string,
    items: VaultItem[] = this.cachedItems
  ): VaultItem | null {
    const lower = descriptor.toLowerCase();
    for (const item of items) {
      for (const kw of item.keywords) {
        if (kw && lower.includes(kw.toLowerCase())) {
          return item;
        }
      }
    }
    return null;
  }

  /**
   * Перевірка введеного тексту на присутність справжнього значення з Vault (Value Inspection)
   */
  public static findMatchingVaultItemForValue(
    value: string,
    items: VaultItem[] = this.cachedItems
  ): VaultItem | null {
    const cleanVal = value.trim().toLowerCase();
    if (!cleanVal || cleanVal.length < 2) return null;

    for (const item of items) {
      const realClean = item.realValue.trim().toLowerCase();
      if (realClean && (cleanVal === realClean || (realClean.length >= 4 && cleanVal.includes(realClean)))) {
        return item;
      }
    }
    return null;
  }
}
