import { VaultItem, VaultItemCategory, VaultSensitivityTier } from '../types/vault';

const VAULT_STORAGE_KEY = 'threat_shield_personal_vault';

export const DEFAULT_VAULT_ITEMS: VaultItem[] = [
  {
    id: 'vault-default-mother',
    category: 'MOTHER_MAIDEN_NAME',
    label: 'Дівоче прізвище матері',
    realValue: 'Людмила',
    decoyValue: 'Оксана',
    keywords: [
      // UK
      'дівоче', 'дівоче прізвище', 'прізвище матері', 'дівоче прізвище матері',
      // EN
      'maiden', 'maiden name', "mother's maiden name", 'mother maiden',
      // RU
      'девичья фамилия', 'девичья фамилия матери', 'фамилия матери', 'девичья'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-taxid',
    category: 'TAX_ID',
    label: 'РНОКПП (ІПН / Податковий код)',
    realValue: '3124567890',
    decoyValue: '2987654321',
    keywords: [
      // UK
      'рнокпп', 'іпн', 'ідентифікаційний код', 'податковий номер', 'код платника',
      // EN
      'tax id', 'tax number', 'inn', 'ssn', 'taxpayer number', 'national tax',
      // RU
      'инн', 'идентификационный код', 'налоговый номер', 'код налогоплательщика'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-secretword',
    category: 'SECRET_WORD',
    label: 'Секретне / Кодове слово банку',
    realValue: 'Калина',
    decoyValue: 'Дніпро',
    keywords: [
      // UK
      'кодове слово', 'секретне слово', 'слово-пароль', 'контрольне слово',
      // EN
      'codeword', 'secret word', 'security word', 'passphrase', 'control word',
      // RU
      'кодовое слово', 'секретное слово', 'слово-пароль', 'контрольное слово'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-passport',
    category: 'PASSPORT_ID',
    label: 'Номер паспорта / ID-картки',
    realValue: 'АА 123456',
    decoyValue: 'АА 654321',
    keywords: [
      // UK
      'номер паспорта', 'серія паспорта', 'id картка', 'паспортні дані', 'номер документа',
      // EN
      'passport number', 'passport series', 'id card number', 'national id', 'document number', 'passport id',
      // RU
      'номер паспорта', 'серия паспорта', 'id карта', 'паспортные данные', 'номер документа'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-dob',
    category: 'DATE_OF_BIRTH',
    label: 'Дата народження',
    realValue: '15.08.1985',
    decoyValue: '01.01.1990',
    keywords: [
      // UK
      'дата народження', 'день народження', 'число народження', 'рік народження',
      // EN
      'date of birth', 'birth date', 'dob', 'birthday', 'birth year',
      // RU
      'дата рождения', 'день рождения', 'число рождения', 'год рождения'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-phone',
    category: 'FINANCIAL_PHONE',
    label: 'Фінансовий номер телефону',
    realValue: '+380501234567',
    decoyValue: '+380679876543',
    keywords: [
      // UK
      'фінансовий номер', 'прив’язаний телефон', 'привязаний телефон', 'номер телефону банку', 'основний номер', 'фінансовий телефон',
      // EN
      'financial phone', 'registered phone', 'bank mobile', 'verified number', 'primary phone',
      // RU
      'финансовый номер', 'привязанный телефон', 'номер телефона банка', 'основной телефон', 'финансовый телефон'
    ],
    createdAt: Date.now(),
  },
  {
    id: 'vault-default-father',
    category: 'FATHER_NAME',
    label: "Ім'я батька / По батькові",
    realValue: 'Лео',
    decoyValue: 'Олександр',
    keywords: [
      // UK
      'ім’я батька', "ім'я батька", 'по батькові', 'прізвище батька', 'по-батькові',
      // EN
      "father's name", 'father name', 'patronymic', 'middle name',
      // RU
      'имя отца', 'отчество', 'фамилия отца'
    ],
    createdAt: Date.now(),
  },
];

export class PersonalVaultManager {
  private static cachedItems: VaultItem[] = DEFAULT_VAULT_ITEMS;
  private static isInitialized = false;

  /**
   * Визначення рівня чутливості категорії
   * Tier A: Абсолютні маркери відновлення банку (0% легітимності на сторонніх сайтах)
   * Tier B: Умовно-чутливі дані (запитуються разом з KYC або перевіряються на реальне значення)
   */
  public static getCategoryTier(category: VaultItemCategory): VaultSensitivityTier {
    if (category === 'MOTHER_MAIDEN_NAME' || category === 'SECRET_WORD') {
      return 'TIER_A_ABSOLUTE';
    }
    return 'TIER_B_CONDITIONAL';
  }

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
      enabled: item.enabled !== false,
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
      case 'TAX_ID':
        return '2987654321';
      case 'SECRET_WORD':
        return 'Дніпро';
      case 'PASSPORT_ID':
        return 'АА 654321';
      case 'DATE_OF_BIRTH':
        return '01.01.1990';
      case 'FINANCIAL_PHONE':
        return '+380679876543';
      case 'FATHER_NAME':
        return 'Олександр';
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
    const activeItems = items.filter((i) => i.enabled !== false && Boolean(i.realValue));
    for (const item of activeItems) {
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
   * Підтримує нормалізацію телефонів, дат та звичайного тексту
   */
  public static findMatchingVaultItemForValue(
    value: string,
    items: VaultItem[] = this.cachedItems
  ): VaultItem | null {
    const cleanVal = value.trim().toLowerCase();
    if (!cleanVal || cleanVal.length < 2) return null;

    const digitsOnlyVal = cleanVal.replace(/\D/g, '');
    const activeItems = items.filter((i) => i.enabled !== false && Boolean(i.realValue));

    for (const item of activeItems) {
      const realClean = item.realValue.trim().toLowerCase();
      if (!realClean) continue;

      // 1. Спеціальна нормалізація для фінансового номера телефону
      if (item.category === 'FINANCIAL_PHONE') {
        const digitsOnlyReal = realClean.replace(/\D/g, '');
        if (digitsOnlyVal.length >= 7 && digitsOnlyReal.length >= 7) {
          // Порівнюємо останні 7-9 цифр для нівелювання різниці +380 / 0 / 38
          const last7Real = digitsOnlyReal.slice(-7);
          const last7Val = digitsOnlyVal.slice(-7);
          if (last7Real === last7Val) {
            return item;
          }
        }
      }

      // 2. Спеціальна перевірка дат (15.08.1985 чи 1985-08-15 чи 15081985)
      if (item.category === 'DATE_OF_BIRTH') {
        const dateDigitsReal = realClean.replace(/\D/g, '');
        const dateDigitsVal = cleanVal.replace(/\D/g, '');
        if (dateDigitsReal.length >= 6 && dateDigitsReal === dateDigitsVal) {
          return item;
        }
      }

      // 3. Загальне текстове або точне цифрове співпадіння
      if (cleanVal === realClean || (realClean.length >= 3 && cleanVal.includes(realClean))) {
        return item;
      }
    }
    return null;
  }
}
