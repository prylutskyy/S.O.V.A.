import { VaultItem, VaultItemCategory, VaultSensitivityTier, VaultBlindSignature } from '../types/vault';
import { CryptoService } from './crypto-service';
import { FuzzyMatcher } from '../heuristics/fuzzy-matcher';

export const VAULT_STORAGE_KEY = 'threat_shield_personal_vault';
export const ENCRYPTED_VAULT_KEY = 'threat_shield_personal_vault_encrypted';
export const VAULT_SESSION_DECRYPTED_KEY = 'threat_shield_vault_decrypted';
export const VAULT_SESSION_KEY_JWK = 'threat_shield_vault_key_jwk';
export const VAULT_BLIND_SIGNATURES_KEY = 'threat_shield_vault_blind_signatures';
export const VAULT_BLIND_SALT_KEY = 'threat_shield_vault_blind_salt';


export const DEFAULT_VAULT_ITEMS: VaultItem[] = [
  {
    id: 'vault-default-mother',
    category: 'MOTHER_MAIDEN_NAME',
    label: 'Дівоче прізвище матері',
    realValue: '',
    decoyValue: '',
    keywords: [
      // UK
      'дівоче', 'дівоче прізвище', 'прізвище матері', 'дівоче прізвище матері', 'дівочепрізвище',
      // EN
      'maiden', 'maiden name', "mother's maiden name", 'mother maiden', 'maidenname', 'mothersmaidenname',
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
      'рнокпп', 'іпн', 'ідентифікаційний код', 'податковий номер', 'код платника', 'податковий код',
      // EN
      'tax id', 'tax number', 'inn', 'ssn', 'taxpayer number', 'national tax', 'taxid', 'taxnumber',
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
      'кодове слово', 'секретне слово', 'слово-пароль', 'контрольне слово', 'кодовеслово', 'секретнеслово',
      // EN
      'codeword', 'secret word', 'security word', 'passphrase', 'control word', 'secretword',
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
  private static blindSignatures: VaultBlindSignature[] = [];
  private static blindSalt: Uint8Array | null = null;
  private static isInitialized = false;
  private static storageListenerAttached = false;

  private static locked: boolean = true;
  private static masterKey: CryptoKey | null = null;

  public static isLocked(): boolean {
    return this.locked;
  }

  public static getMasterKey(): CryptoKey | null {
    return this.masterKey;
  }

  public static getBlindSalt(): Uint8Array | null {
    return this.blindSalt;
  }

  public static setBlindSalt(salt: Uint8Array): void {
    this.blindSalt = salt;
  }

  /**
   * Створює оперативний набір елементів без чутливих відкритих даних (Zero-Knowledge)
   * realValue встановлено в '', проте присутні blindTokens, keywords, decoyValue, enabled.
   */
  private static deriveOperationalItems(signatures: VaultBlindSignature[]): VaultItem[] {
    return signatures.map((sig) => ({
      id: sig.id,
      category: sig.category,
      label: sig.label,
      realValue: '', // ZERO-KNOWLEDGE: no plaintext in memory while locked!
      decoyValue: sig.decoyValue,
      keywords: sig.keywords,
      createdAt: 0,
      enabled: sig.enabled,
      blindTokens: sig.blindTokens,
    }));
  }

  /**
   * Чи є активний фоновий захист за сліпими сигнатурами (працює навіть при заблокованому сховищі)
   */
  public static hasOperationalProtection(): boolean {
    return this.blindSignatures.some(
      (s) => s.enabled !== false && s.blindTokens && s.blindTokens.length > 0
    );
  }

  /**
   * Кількість активованих рубежів захисту у сліпих сигнатурах
   */
  public static getActiveSignaturesCount(): number {
    return this.blindSignatures.filter(
      (s) => s.enabled !== false && s.blindTokens && s.blindTokens.length > 0
    ).length;
  }

  public static async lock(): Promise<void> {
    this.locked = true;
    this.masterKey = null;

    if (this.blindSignatures.length === 0 && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const localData = await chrome.storage.local.get([
          VAULT_BLIND_SIGNATURES_KEY,
          VAULT_BLIND_SALT_KEY,
        ]);
        if (localData[VAULT_BLIND_SALT_KEY]) {
          this.blindSalt = new Uint8Array(localData[VAULT_BLIND_SALT_KEY]);
        }
        if (Array.isArray(localData[VAULT_BLIND_SIGNATURES_KEY])) {
          this.blindSignatures = localData[VAULT_BLIND_SIGNATURES_KEY];
        }
      } catch {}
    }

    this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove([
        VAULT_SESSION_DECRYPTED_KEY,
        VAULT_SESSION_KEY_JWK,
      ]);
    }
  }

  /**
   * Чи є активна захисна сесія в пам'яті браузера (DLP Enclave daemon)
   */
  public static async hasActiveSession(): Promise<boolean> {
    if (this.hasOperationalProtection()) return true;
    if (!this.locked && this.cachedItems.length > 0) return true;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(VAULT_SESSION_DECRYPTED_KEY);
        const items = res[VAULT_SESSION_DECRYPTED_KEY];
        return Array.isArray(items) && items.length > 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  public static async hasVaultSetup(): Promise<boolean> {
    if (!chrome?.storage?.local) return false;
    const result = await chrome.storage.local.get(ENCRYPTED_VAULT_KEY);
    return !!result[ENCRYPTED_VAULT_KEY];
  }

  /**
   * Генерація хешованих токенів (Salted HMAC-SHA256) для сліпого пошуку без розшифрування
   */
  public static generateBlindTokens(
    realValue: string,
    category: VaultItemCategory,
    salt: Uint8Array
  ): string[] {
    const trimmed = realValue.trim();
    if (!trimmed || trimmed.length < 2) return [];

    const candidates = new Set<string>();
    const lower = trimmed.toLowerCase();
    candidates.add(lower);

    const normalizedSpaces = lower.replace(/\s+/g, ' ');
    if (normalizedSpaces.length >= 2) {
      candidates.add(normalizedSpaces);
    }

    const stripped = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (stripped.length >= 2) {
      candidates.add(stripped);
    }

    // ── CANONICAL & TRANSLITERATION TOKENS (ZERO-KNOWLEDGE TOLERANCE) ──
    const canonical = FuzzyMatcher.canonicalFold(lower);
    if (canonical && canonical.length >= 2) {
      candidates.add(canonical);
    }

    const translits = FuzzyMatcher.transliterateCyrillic(lower);
    for (const tr of translits) {
      if (tr && tr.length >= 2) {
        candidates.add(tr);
        const canonTr = FuzzyMatcher.canonicalFold(tr);
        if (canonTr && canonTr.length >= 2) candidates.add(canonTr);
      }
    }

    const digits = trimmed.replace(/\D/g, '');

    if (category === 'FINANCIAL_PHONE') {
      if (digits.length >= 7) {
        candidates.add(digits);
        candidates.add(digits.slice(-7));
        if (digits.length >= 9) candidates.add(digits.slice(-9));
        if (digits.length >= 10) candidates.add(digits.slice(-10));
      }
    } else if (category === 'DATE_OF_BIRTH') {
      if (digits.length >= 6) {
        candidates.add(digits);
      }
    } else if (category === 'TAX_ID') {
      if (digits.length >= 8) {
        candidates.add(digits);
      }
    } else if (category === 'PASSPORT_ID') {
      const noSpaces = lower.replace(/[\s-_]/g, '');
      if (noSpaces.length >= 5) {
        candidates.add(noSpaces);
      }
      if (digits.length >= 6) {
        candidates.add(digits);
      }
    }

    const tokens: string[] = [];
    for (const c of candidates) {
      if (c.length >= 2) {
        tokens.push(CryptoService.computeHmacSync(c, salt));
      }
    }
    return Array.from(new Set(tokens));
  }

  private static updateBlindSignatures(): void {
    if (!this.blindSalt) {
      this.blindSalt = CryptoService.generateBlindSalt();
    }
    this.blindSignatures = this.cachedItems.map((item) => {
      const blindTokens =
        item.blindTokens && item.blindTokens.length > 0
          ? item.blindTokens
          : (item.realValue
              ? this.generateBlindTokens(item.realValue, item.category, this.blindSalt!)
              : []);
      item.blindTokens = blindTokens;

      const isEnabled = item.enabled !== false && (blindTokens.length > 0 || Boolean(item.realValue));
      return {
        id: item.id,
        category: item.category,
        label: item.label,
        blindTokens,
        decoyValue: item.decoyValue || '',
        keywords: item.keywords || [],
        tier: this.getCategoryTier(item.category),
        enabled: isEnabled,
      };
    });
  }

  public static async setupMasterPassword(password: string): Promise<void> {
    const salt = CryptoService.generateSalt();
    const key = await CryptoService.deriveKey(password, salt);

    if (!this.blindSalt) {
      this.blindSalt = CryptoService.generateBlindSalt();
    }

    this.masterKey = key;
    this.locked = false;
    this.cachedItems = DEFAULT_VAULT_ITEMS.map((item) => ({ ...item, createdAt: Date.now() }));
    this.updateBlindSignatures();

    await this.persistEncrypted(salt);
  }

  public static async unlock(password: string): Promise<boolean> {
    try {
      if (!chrome?.storage?.local) return false;
      const result = await chrome.storage.local.get([
        ENCRYPTED_VAULT_KEY,
        VAULT_BLIND_SIGNATURES_KEY,
        VAULT_BLIND_SALT_KEY,
      ]);
      const payload = result[ENCRYPTED_VAULT_KEY];
      if (!payload || !payload.salt) {
        return false;
      }

      if (result[VAULT_BLIND_SALT_KEY]) {
        this.blindSalt = new Uint8Array(result[VAULT_BLIND_SALT_KEY]);
      } else if (!this.blindSalt) {
        this.blindSalt = CryptoService.generateBlindSalt();
      }

      const salt = new Uint8Array(payload.salt);
      const key = await CryptoService.deriveKey(password, salt);

      const decryptedJson = await CryptoService.decryptText(payload, key);
      const parsedItems: VaultItem[] = JSON.parse(decryptedJson);

      this.masterKey = key;
      this.locked = false;
      this.cachedItems = parsedItems;

      let needsRePersist = false;
      for (const item of this.cachedItems) {
        if ((!item.blindTokens || item.blindTokens.length === 0) && item.realValue) {
          item.blindTokens = this.generateBlindTokens(item.realValue, item.category, this.blindSalt!);
          needsRePersist = true;
        }
      }

      this.updateBlindSignatures();

      if (needsRePersist || !result[VAULT_BLIND_SIGNATURES_KEY]) {
        await this.persistEncrypted(salt);
      } else if (chrome?.storage?.session) {
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

      if (!this.blindSalt) {
        this.blindSalt = CryptoService.generateBlindSalt();
      }
      this.updateBlindSignatures();

      const json = JSON.stringify(this.cachedItems);
      const encrypted = await CryptoService.encryptText(json, this.masterKey);

      const storagePayload = {
        salt: Array.from(currentSalt),
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext
      };

      await chrome.storage.local.set({
        [ENCRYPTED_VAULT_KEY]: storagePayload,
        [VAULT_BLIND_SIGNATURES_KEY]: this.blindSignatures,
        [VAULT_BLIND_SALT_KEY]: Array.from(this.blindSalt),
      });

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
      // 1. Спочатку завантажуємо сліпі підписи та сіль з local storage (завжди доступно)
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const localData = await chrome.storage.local.get([
          VAULT_BLIND_SIGNATURES_KEY,
          VAULT_BLIND_SALT_KEY,
        ]);
        if (localData[VAULT_BLIND_SALT_KEY]) {
          this.blindSalt = new Uint8Array(localData[VAULT_BLIND_SALT_KEY]);
        }
        if (Array.isArray(localData[VAULT_BLIND_SIGNATURES_KEY])) {
          this.blindSignatures = localData[VAULT_BLIND_SIGNATURES_KEY];
        }
      }

      // 2. Перевіряємо наявність активної сесії у session storage (розблокований стан)
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
            this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
            this.locked = true;
          }
        } else {
          this.masterKey = null;
          this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
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
                    this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
                    this.locked = true;
                  }
                } else {
                  this.masterKey = null;
                  if (this.blindSignatures.length === 0 && typeof chrome !== 'undefined' && chrome.storage?.local) {
                    try {
                      const localData = await chrome.storage.local.get([
                        VAULT_BLIND_SIGNATURES_KEY,
                        VAULT_BLIND_SALT_KEY,
                      ]);
                      if (localData[VAULT_BLIND_SALT_KEY]) {
                        this.blindSalt = new Uint8Array(localData[VAULT_BLIND_SALT_KEY]);
                      }
                      if (Array.isArray(localData[VAULT_BLIND_SIGNATURES_KEY])) {
                        this.blindSignatures = localData[VAULT_BLIND_SIGNATURES_KEY];
                      }
                    } catch {}
                  }
                  this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
                  this.locked = true;
                }
              }
            } else if (area === 'local') {
              if (changes[VAULT_BLIND_SIGNATURES_KEY] || changes[VAULT_BLIND_SALT_KEY]) {
                const localData = await chrome.storage.local.get([
                  VAULT_BLIND_SIGNATURES_KEY,
                  VAULT_BLIND_SALT_KEY,
                ]);
                if (localData[VAULT_BLIND_SALT_KEY]) {
                  this.blindSalt = new Uint8Array(localData[VAULT_BLIND_SALT_KEY]);
                }
                if (Array.isArray(localData[VAULT_BLIND_SIGNATURES_KEY])) {
                  this.blindSignatures = localData[VAULT_BLIND_SIGNATURES_KEY];
                  if (this.locked) {
                    this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
                  }
                }
              }
            }
          });
          this.storageListenerAttached = true;
        }
      } else {
        this.masterKey = null;
        this.cachedItems = this.deriveOperationalItems(this.blindSignatures);
        this.locked = true;
      }
      this.isInitialized = true;
    } catch (e) {
      console.error('[ThreatShield:Vault] Помилка ініціалізації сховища:', e);
    }
  }

  /**
   * Синхронне миттєве отримання маркерів (для обробників click/submit/input)
   * У заблокованому стані повертає оперативні сигнатури з blindTokens і порожнім realValue (Zero-Knowledge)
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
    const isEnabled = hasReal ? item.enabled !== false : false;

    if (!this.blindSalt) {
      this.blindSalt = CryptoService.generateBlindSalt();
    }

    const blindTokens = hasReal
      ? this.generateBlindTokens(trimmedReal, item.category, this.blindSalt)
      : [];

    const savedItem: VaultItem = {
      id: item.id || `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: item.category,
      label: item.label.trim(),
      realValue: trimmedReal,
      decoyValue: (item.decoyValue || '').trim() || (hasReal ? this.generateDefaultDecoy(item.category) : ''),
      keywords: (item.keywords || []).map((k) => k.trim().toLowerCase()).filter(Boolean),
      createdAt: Date.now(),
      enabled: isEnabled,
      blindTokens,
    };

    if (existingIndex >= 0) {
      items[existingIndex] = savedItem;
    } else {
      items.push(savedItem);
    }

    this.cachedItems = items;
    this.updateBlindSignatures();
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
    this.updateBlindSignatures();
    
    await this.persistEncrypted();
  }

  /**
   * Скинути до дефолтних налаштувань (порожні маркери, відстеження вимкнено)
   */
  public static async resetToDefaults(): Promise<void> {
    if (this.locked || !this.masterKey) return;
    
    this.cachedItems = DEFAULT_VAULT_ITEMS.map((item) => ({ ...item, createdAt: Date.now() }));
    this.updateBlindSignatures();
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
   * Працює як у розблокованому, так і у заблокованому (Zero-Knowledge) стані
   */
  public static findMatchingVaultItemForField(
    descriptor: string,
    items: VaultItem[] = this.cachedItems,
    includeTemplates: boolean = false
  ): VaultItem | null {
    const lower = descriptor.toLowerCase();
    const activeItems = items.filter(
      (i) => i.enabled !== false && (Boolean(i.realValue) || (i.blindTokens && i.blindTokens.length > 0))
    );
    for (const item of activeItems) {
      for (const kw of item.keywords) {
        if (kw && lower.includes(kw.toLowerCase())) {
          return item;
        }
      }
    }

    if (includeTemplates) {
      for (const item of DEFAULT_VAULT_ITEMS) {
        for (const kw of item.keywords) {
          if (kw && lower.includes(kw.toLowerCase())) {
            return item;
          }
        }
      }
    }

    return null;
  }

  /**
   * Екстракція хешів кандидатів із вхідного значення для сліпого пошуку (HMAC-SHA256)
   */
  private static extractCandidateHashes(cleanVal: string, salt: Uint8Array): Set<string> {
    const map = this.extractCandidateHashMap(cleanVal, salt);
    return new Set(map.keys());
  }

  /**
   * Співставлення кандидатів із їхніми Salted HMAC хешами.
   * Використовує Dual-Stream Tokenizer зі Sliding N-grams (n=1..4),
   * що дозволяє надійно знаходити:
   * 1. Токени з внутрішньою пунктуацією та спецсимволами (наприклад: "Super!Secret2026", "pass#123", "user@test")
   * 2. Багатослівні фрази-паролі (наприклад: "київ мій дім", "червона калина") у вільному тексті/чаті
   * 3. Окремі атомарні слова без пунктуації
   * 4. Числові послідовності та телефонні суфікси
   */
  private static extractCandidateHashMap(cleanVal: string, salt: Uint8Array): Map<string, string> {
    const map = new Map<string, string>();
    const candidates = new Set<string>();

    const normalizedFull = cleanVal.replace(/\s+/g, ' ').trim();
    if (normalizedFull.length >= 2) {
      candidates.add(normalizedFull);
    }

    // ── STREAM 1: Raw Whitespace Stream (збереження внутрішньої пунктуації) ──
    const rawWhitespaceTokens = cleanVal.split(/\s+/).filter(Boolean);
    const cleanTokens: string[] = [];

    for (const raw of rawWhitespaceTokens) {
      if (raw.length >= 2) {
        candidates.add(raw);
        const canonRaw = FuzzyMatcher.canonicalFold(raw);
        if (canonRaw && canonRaw.length >= 2) candidates.add(canonRaw);
      }
      // Очищуємо ТІЛЬКИ зовнішню пунктуацію на краях (напр. "(Super!Secret2026)," -> "Super!Secret2026")
      const stripped = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (stripped && stripped.length >= 2) {
        candidates.add(stripped);
        cleanTokens.push(stripped);

        // Канонічний вигляд (гомогліфи + звуки)
        const canon = FuzzyMatcher.canonicalFold(stripped);
        if (canon && canon.length >= 2) candidates.add(canon);

        // Транслітерація
        const cyr = FuzzyMatcher.transliterateLatinToCyrillic(stripped);
        if (cyr && cyr !== stripped && cyr.length >= 2) {
          candidates.add(cyr);
          const canonCyr = FuzzyMatcher.canonicalFold(cyr);
          if (canonCyr && canonCyr.length >= 2) candidates.add(canonCyr);
        }
        const lats = FuzzyMatcher.transliterateCyrillic(stripped);
        for (const lat of lats) {
          if (lat && lat.length >= 2) candidates.add(lat);
        }
      } else if (raw.length >= 1) {
        cleanTokens.push(raw);
      }
    }

    // ── STREAM 2: Sliding N-grams (для багатослівних фраз-секретів від 2 до 4 слів) ──
    if (cleanTokens.length >= 2) {
      const maxN = Math.min(4, cleanTokens.length);
      for (let n = 2; n <= maxN; n++) {
        for (let i = 0; i <= cleanTokens.length - n; i++) {
          const ngram = cleanTokens.slice(i, i + n).join(' ');
          if (ngram.length >= 3) {
            candidates.add(ngram);
            const canonNgram = FuzzyMatcher.canonicalFold(ngram);
            if (canonNgram && canonNgram.length >= 3) candidates.add(canonNgram);
          }
        }
      }
    }

    // ── STREAM 3: Атомарні слова (класичний спліт для простих ізольованих слів) ──
    const atomWords = cleanVal.split(/[\s,.;:!?+/'"()\[\]{}]+/).filter((w) => w.length >= 2);
    for (const w of atomWords) {
      candidates.add(w);
      const canonW = FuzzyMatcher.canonicalFold(w);
      if (canonW && canonW.length >= 2) candidates.add(canonW);
    }

    // ── STREAM 4: Числові послідовності в тексті ──
    const digits = cleanVal.replace(/\D/g, '');
    if (digits.length >= 6) {
      candidates.add(digits);
      if (digits.length >= 7) candidates.add(digits.slice(-7));
      if (digits.length >= 9) candidates.add(digits.slice(-9));
      if (digits.length >= 10) candidates.add(digits.slice(-10));
    }

    const digitMatches = cleanVal.match(/\d{6,14}/g);
    if (digitMatches) {
      for (const d of digitMatches) {
        candidates.add(d);
        if (d.length >= 7) candidates.add(d.slice(-7));
        if (d.length >= 9) candidates.add(d.slice(-9));
        if (d.length >= 10) candidates.add(d.slice(-10));
      }
    }

    // Хешування унікальних кандидатів
    for (const cand of candidates) {
      if (cand.length >= 2) {
        const h = CryptoService.computeHmacSync(cand, salt);
        if (!map.has(h)) {
          map.set(h, cand);
        }
      }
    }

    return map;
  }

  /**
   * Перевірка введеного тексту на присутність конфіденційного значення з Vault (Value Inspection)
   * Підтримує пряме співставлення (у розблокованому стані) та Zero-Knowledge Salted HMAC (у заблокованому)
   */
  public static findMatchingVaultItemForValue(
    value: string,
    items: VaultItem[] = this.cachedItems
  ): VaultItem | null {
    const cleanVal = value.trim().toLowerCase();
    if (!cleanVal || cleanVal.length < 2) return null;

    const digitsOnlyVal = cleanVal.replace(/\D/g, '');
    const activeItems = items.filter(
      (i) => i.enabled !== false && (Boolean(i.realValue) || (i.blindTokens && i.blindTokens.length > 0))
    );
    if (activeItems.length === 0) return null;

    // 1. Пряма перевірка (якщо сховище розблоковано та значення realValue наявні у пам'яті)
    for (const item of activeItems) {
      const realClean = (item.realValue || '').trim().toLowerCase();
      if (!realClean) continue;

      // 1a. Спеціальна нормалізація для фінансового номера телефону
      if (item.category === 'FINANCIAL_PHONE') {
        const digitsOnlyReal = realClean.replace(/\D/g, '');
        if (digitsOnlyVal.length >= 7 && digitsOnlyReal.length >= 7) {
          const last7Real = digitsOnlyReal.slice(-7);
          const last7Val = digitsOnlyVal.slice(-7);
          if (last7Real === last7Val) {
            (item as any).matchedValue = item.realValue;
            return item;
          }
        }
      }

      // 1b. Спеціальна перевірка дат (15.08.1985 чи 1985-08-15 чи 15081985)
      if (item.category === 'DATE_OF_BIRTH') {
        const dateDigitsReal = realClean.replace(/\D/g, '');
        const dateDigitsVal = cleanVal.replace(/\D/g, '');
        if (dateDigitsReal.length >= 6 && dateDigitsReal === dateDigitsVal) {
          (item as any).matchedValue = item.realValue;
          return item;
        }
      }

      // 1c. Спеціальна цифрова перевірка для ІПН / РНОКПП (включно з одруківкою в 1 цифру)
      if (item.category === 'TAX_ID') {
        const digitsOnlyReal = realClean.replace(/\D/g, '');
        if (digitsOnlyReal.length >= 8 && digitsOnlyVal.includes(digitsOnlyReal)) {
          (item as any).matchedValue = item.realValue || digitsOnlyReal;
          return item;
        }
        // Перевірка 10-значних чисел на одруківку в 1 цифру (Levenshtein distance = 1)
        if (digitsOnlyReal.length === 10) {
          const candidateNumbers = cleanVal.match(/\b\d{10}\b/g) || [];
          for (const candNum of candidateNumbers) {
            if (FuzzyMatcher.isTypoTaxId(candNum, digitsOnlyReal)) {
              (item as any).matchedValue = candNum;
              (item as any).isTypoMatch = true;
              return item;
            }
          }
        }
      }

      // 1d. Загальне текстове або точне цифрове співпадіння
      if (cleanVal === realClean || (realClean.length >= 3 && cleanVal.includes(realClean))) {
        (item as any).matchedValue = item.realValue;
        return item;
      }

      // 1e. In-Memory NLP & Fuzzy Matching (Levenshtein + Transliteration + Homoglyphs)
      if (realClean.length >= 4) {
        // Перевірка транслітерації (напр. "Смирнова" <-> "Smirnova" / "Smyrnova")
        if (FuzzyMatcher.isTranslitMatch(cleanVal, realClean)) {
          (item as any).matchedValue = item.realValue;
          (item as any).matchMode = 'TRANSLIT';
          return item;
        }

        // Перевірка окремих слів на нечіткий збіг (одруківки: "Смирноваа", "Смірнова", "Смирнва")
        const words = cleanVal.split(/[\s,.;:!?+/'"()\[\]{}]+/).filter((w) => w.length >= 3);
        for (const w of words) {
          if (FuzzyMatcher.isFuzzyMatch(w, realClean) || FuzzyMatcher.canonicalFold(w) === FuzzyMatcher.canonicalFold(realClean)) {
            (item as any).matchedValue = w;
            (item as any).matchMode = 'FUZZY';
            return item;
          }
          if (FuzzyMatcher.isTranslitMatch(w, realClean)) {
            (item as any).matchedValue = w;
            (item as any).matchMode = 'TRANSLIT';
            return item;
          }
        }

        // Для багатослівних секретів (напр. "київ мій дім")
        const secretWords = realClean.split(/\s+/).filter(Boolean);
        if (secretWords.length >= 2 && words.length >= secretWords.length) {
          for (let i = 0; i <= words.length - secretWords.length; i++) {
            const ngram = words.slice(i, i + secretWords.length).join(' ');
            if (FuzzyMatcher.isFuzzyMatch(ngram, realClean) || FuzzyMatcher.canonicalFold(ngram) === FuzzyMatcher.canonicalFold(realClean)) {
              (item as any).matchedValue = ngram;
              (item as any).matchMode = 'FUZZY';
              return item;
            }
          }
        }
      }
    }

    // 2. ZERO-KNOWLEDGE BLIND TOKEN MATCHING (HMAC-SHA256)
    // Працює 24/7 у фоні навіть при заблокованому сховищі!
    if (this.blindSalt) {
      const candidateMap = this.extractCandidateHashMap(cleanVal, this.blindSalt);
      if (candidateMap.size > 0) {
        for (const item of activeItems) {
          if (!item.blindTokens || item.blindTokens.length === 0) continue;
          for (const token of item.blindTokens) {
            if (candidateMap.has(token)) {
              (item as any).matchedValue = candidateMap.get(token) || item.realValue;
              return item;
            }
          }
        }
      }
    }

    return null;
  }
}
