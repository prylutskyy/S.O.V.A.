import { VaultItem, VaultItemCategory, VaultSensitivityTier } from '../types/vault';
import { CryptoService } from './crypto-service';

const VAULT_STORAGE_KEY = 'threat_shield_personal_vault';
const ENCRYPTED_VAULT_KEY = 'threat_shield_personal_vault_encrypted';
const VAULT_SESSION_DECRYPTED_KEY = 'threat_shield_vault_decrypted';
const VAULT_SESSION_KEY_JWK = 'threat_shield_vault_key_jwk';

export const DEFAULT_VAULT_ITEMS: VaultItem[] = [
  {
    id: 'vault-default-mother',
    category: 'MOTHER_MAIDEN_NAME',
    label: 'Дівоче прізвище матері',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'дівоче', 'дівоче прізвище', 'прізвище матері', 'дівоче прізвище матері',
      // EN
      'maiden', 'maiden name', "mother's maiden name", 'mother maiden',
      // RU
      'девичья фамилия', 'девичья фамилия матери', 'фамилия матери', 'девичья'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-taxid',
    category: 'TAX_ID',
    label: 'РНОКПП (ІПН / Податковий код)',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'рнокпп', 'іпн', 'ідентифікаційний код', 'податковий номер', 'код платника',
      // EN
      'tax id', 'tax number', 'inn', 'ssn', 'taxpayer number', 'national tax',
      // RU
      'инн', 'идентификационный код', 'налоговый номер', 'код налогоплательщика'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-secretword',
    category: 'SECRET_WORD',
    label: 'Секретне / Кодове слово банку',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'кодове слово', 'секретне слово', 'слово-пароль', 'контрольне слово',
      // EN
      'codeword', 'secret word', 'security word', 'passphrase', 'control word',
      // RU
      'кодовое слово', 'секретное слово', 'слово-пароль', 'контрольное слово'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-passport',
    category: 'PASSPORT_ID',
    label: 'Номер паспорта / ID-картки',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'номер паспорта', 'серія паспорта', 'id картка', 'паспортні дані', 'номер документа',
      // EN
      'passport number', 'passport series', 'id card number', 'national id', 'document number', 'passport id',
      // RU
      'номер паспорта', 'серия паспорта', 'id карта', 'паспортные данные', 'номер документа'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-dob',
    category: 'DATE_OF_BIRTH',
    label: 'Дата народження',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'дата народження', 'день народження', 'число народження', 'рік народження',
      // EN
      'date of birth', 'birth date', 'dob', 'birthday', 'birth year',
      // RU
      'дата рождения', 'день рождения', 'число рождения', 'год рождения'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-phone',
    category: 'FINANCIAL_PHONE',
    label: 'Фінансовий номер телефону',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'фінансовий номер', 'прив’язаний телефон', 'привязаний телефон', 'номер телефону банку', 'основний номер', 'фінансовий телефон',
      // EN
      'financial phone', 'registered phone', 'bank mobile', 'verified number', 'primary phone',
      // RU
      'финансовый номер', 'привязанный телефон', 'номер телефона банка', 'основной телефон', 'финансовый телефон'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
  {
    id: 'vault-default-father',
    category: 'FATHER_NAME',
    label: "Ім'я батька / По батькові",
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'ім’я батька', "ім'я батька", 'по батькові', 'прізвище батька', 'по-батькові',
      // EN
      "father's name", 'father name', 'patronymic', 'middle name',
      // RU
      'имя отца', 'отчество', 'фамилия отца'
    ],
    createdAt: Date.now(),
    enabled: false,
  },
];

export class PersonalVaultManager {
  private static cachedItems: VaultItem[] = [];
  private static isInitialized = false;
  private static storageListenerAttached = false;

  private static locked: boolean = true;
  private static masterKey: CryptoKey | null = null;

  public static isLocked(): boolean {
    return this.locked;
  }

  public static async lock(): Promise<void> {
    this.locked = true;
    this.masterKey = null;
    this.cachedItems = [];
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove([
        VAULT_SESSION_DECRYPTED_KEY,
        VAULT_SESSION_KEY_JWK,
      ]);
    }
  }

  public static async hasVaultSetup(): Promise<boolean> {
    if (!chrome?.storage?.local) return false;
    const result = await chrome.storage.local.get(ENCRYPTED_VAULT_KEY);
    return !!result[ENCRYPTED_VAULT_KEY];
  }

  public static async setupMasterPassword(password: string): Promise<void> {
    const salt = CryptoService.generateSalt();
    const key = await CryptoService.deriveKey(password, salt);
    
    this.masterKey = key;
    this.locked = false;
    this.cachedItems = DEFAULT_VAULT_ITEMS.map((item) => ({ ...item, createdAt: Date.now() }));
    
    await this.persistEncrypted(salt);
  }

  public static async unlock(password: string): Promise<boolean> {
    try {
      if (!chrome?.storage?.local) return false;
      const result = await chrome.storage.local.get(ENCRYPTED_VAULT_KEY);
      const payload = result[ENCRYPTED_VAULT_KEY];
      if (!payload || !payload.salt) {
        return false;
      }
      
      const salt = new Uint8Array(payload.salt);
      const key = await CryptoService.deriveKey(password, salt);
      
      const decryptedJson = await CryptoService.decryptText(payload, key);
      const parsedItems = JSON.parse(decryptedJson);
      
      this.masterKey = key;
      this.locked = false;
      this.cachedItems = parsedItems;
      
      if (chrome?.storage?.session) {
        const jwk = await CryptoService.exportKeyToJwk(key);
        await chrome.storage.session.set({
          [VAULT_SESSION_DECRYPTED_KEY]: parsedItems,
          [VAULT_SESSION_KEY_JWK]: jwk,
        });
      }
      
      return true;
    } catch (e) {
      console.warn('[ThreatShield] Failed to unlock vault', e);
      return false; // Wrong password or corrupted data
    }
  }

  private static async persistEncrypted(salt?: Uint8Array): Promise<boolean> {
    if (!this.masterKey || this.locked) {
      console.warn('[ThreatShield:Vault] Cannot persist: vault is locked or key is missing');
      return false;
    }
    
    try {
      if (!chrome?.storage?.local) return false;
      
      let currentSalt = salt;
      if (!currentSalt) {
        const result = await chrome.storage.local.get(ENCRYPTED_VAULT_KEY);
        const payload = result[ENCRYPTED_VAULT_KEY];
        if (payload && payload.salt) {
          currentSalt = new Uint8Array(payload.salt);
        } else {
          currentSalt = CryptoService.generateSalt();
        }
      }
      
      const json = JSON.stringify(this.cachedItems);
      const encrypted = await CryptoService.encryptText(json, this.masterKey);
      
      const storagePayload = {
        salt: Array.from(currentSalt),
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext
      };
      
      await chrome.storage.local.set({ [ENCRYPTED_VAULT_KEY]: storagePayload });
      
      // Update session storage as well (both decrypted items and exported JWK key)
      if (chrome?.storage?.session) {
        const jwk = await CryptoService.exportKeyToJwk(this.masterKey);
        await chrome.storage.session.set({
          [VAULT_SESSION_DECRYPTED_KEY]: this.cachedItems,
          [VAULT_SESSION_KEY_JWK]: jwk,
        });
      }
      return true;
    } catch (e) {
      console.error('[ThreatShield] Error saving encrypted vault', e);
      return false;
    }
  }

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
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const result = await chrome.storage.session.get([
          VAULT_SESSION_DECRYPTED_KEY,
          VAULT_SESSION_KEY_JWK,
        ]);
        const items = result[VAULT_SESSION_DECRYPTED_KEY];
        const jwk = result[VAULT_SESSION_KEY_JWK];

        if (Array.isArray(items) && jwk) {
          try {
            this.masterKey = await CryptoService.importKeyFromJwk(jwk);
            this.cachedItems = items;
            this.locked = false;
          } catch (keyErr) {
            console.warn('[ThreatShield:Vault] Could not import key from session:', keyErr);
            this.masterKey = null;
            this.cachedItems = [];
            this.locked = true;
          }
        } else {
          this.masterKey = null;
          this.cachedItems = [];
          this.locked = true;
        }

        // Слухаємо зміни з інших контекстів (наприклад, розблокування в Popup)
        if (!this.storageListenerAttached && chrome.storage?.onChanged) {
          chrome.storage.onChanged.addListener(async (changes, area) => {
            if (area === 'session') {
              if (changes[VAULT_SESSION_DECRYPTED_KEY] || changes[VAULT_SESSION_KEY_JWK]) {
                const sessionData = await chrome.storage.session.get([
                  VAULT_SESSION_DECRYPTED_KEY,
                  VAULT_SESSION_KEY_JWK,
                ]);
                const newItems = sessionData[VAULT_SESSION_DECRYPTED_KEY];
                const newJwk = sessionData[VAULT_SESSION_KEY_JWK];
                if (Array.isArray(newItems) && newJwk) {
                  try {
                    this.masterKey = await CryptoService.importKeyFromJwk(newJwk);
                    this.cachedItems = newItems;
                    this.locked = false;
                  } catch {
                    this.masterKey = null;
                    this.cachedItems = [];
                    this.locked = true;
                  }
                } else {
                  this.masterKey = null;
                  this.cachedItems = [];
                  this.locked = true;
                }
              }
            }
          });
          this.storageListenerAttached = true;
        }
      }
      this.isInitialized = true;
    } catch (e) {
      console.error('[ThreatShield:Vault] Помилка ініціалізації сховища:', e);
    }
  }

  /**
   * Синхронне миттєве отримання маркерів (для обробників click/submit/input)
   */
  public static getItemsSync(): VaultItem[] {
    return this.locked ? [] : this.cachedItems;
  }

  /**
   * Отримати всі збережені маркери з локального сховища
   */
  public static async getItems(): Promise<VaultItem[]> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.getItemsSync();
  }

  /**
   * Додати або оновити маркер безпеки
   */
  public static async saveItem(
    item: Omit<VaultItem, 'id' | 'createdAt'> & { id?: string }
  ): Promise<VaultItem | null> {
    if (this.locked || !this.masterKey) return null;

    const items = await this.getItems();
    const existingIndex = item.id ? items.findIndex((i) => i.id === item.id) : -1;

    const trimmedReal = (item.realValue || '').trim();
    const hasReal = trimmedReal.length > 0;
    // Якщо значення заповнено: активуємо автоматично, якщо користувач явно не вимкнув (item.enabled === false)
    // Якщо значення порожнє: деактивуємо (enabled: false)
    const isEnabled = hasReal ? item.enabled !== false : false;

    const savedItem: VaultItem = {
      id: item.id || `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: item.category,
      label: item.label.trim(),
      realValue: trimmedReal,
      decoyValue: (item.decoyValue || '').trim() || (hasReal ? this.generateDefaultDecoy(item.category) : ''),
      keywords: (item.keywords || []).map((k) => k.trim().toLowerCase()).filter(Boolean),
      createdAt: Date.now(),
      enabled: isEnabled,
    };

    if (existingIndex >= 0) {
      items[existingIndex] = savedItem;
    } else {
      items.push(savedItem);
    }

    this.cachedItems = items;
    const persisted = await this.persistEncrypted();
    if (!persisted) {
      return null;
    }

    return savedItem;
  }

  /**
   * Видалити маркер за ID
   */
  public static async deleteItem(id: string): Promise<void> {
    if (this.locked || !this.masterKey) return;
    
    const items = await this.getItems();
    const filtered = items.filter((i) => i.id !== id);
    this.cachedItems = filtered;
    
    await this.persistEncrypted();
  }

  /**
   * Скинути до дефолтних налаштувань (порожні маркери, відстеження вимкнено)
   */
  public static async resetToDefaults(): Promise<void> {
    if (this.locked || !this.masterKey) return;
    
    this.cachedItems = DEFAULT_VAULT_ITEMS.map((item) => ({ ...item, createdAt: Date.now() }));
    await this.persistEncrypted();
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
