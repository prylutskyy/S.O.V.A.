import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { DEFAULT_VAULT_ITEMS } from '../../../src/core/personal-vault';

// Mock chrome API
const mockStorage: Record<string, any> = {};
const mockSessionStorage: Record<string, any> = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn().mockImplementation(async (keys) => {
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) {
            if (k in mockStorage) res[k] = mockStorage[k];
          }
          return res;
        } else if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        return { ...mockStorage };
      }),
      set: vi.fn().mockImplementation(async (obj) => {
        Object.assign(mockStorage, obj);
      }),
      remove: vi.fn().mockImplementation(async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) {
          delete mockStorage[k];
        }
      }),
    },
    session: {
      get: vi.fn().mockImplementation(async (keys) => {
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) {
            if (k in mockSessionStorage) res[k] = mockSessionStorage[k];
          }
          return res;
        } else if (typeof keys === 'string') {
          return { [keys]: mockSessionStorage[keys] };
        }
        return { ...mockSessionStorage };
      }),
      set: vi.fn().mockImplementation(async (obj) => {
        Object.assign(mockSessionStorage, obj);
      }),
      remove: vi.fn().mockImplementation(async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) {
          delete mockSessionStorage[k];
        }
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
} as any;

describe('PersonalVaultManager', () => {
  beforeEach(async () => {
    // Clear storage and reset state
    for (const key in mockStorage) delete mockStorage[key];
    for (const key in mockSessionStorage) delete mockSessionStorage[key];
    PersonalVaultManager['isInitialized'] = false;
    PersonalVaultManager['storageListenerAttached'] = false;
    PersonalVaultManager['cachedItems'] = [];
    PersonalVaultManager['masterKey'] = null;
    PersonalVaultManager['locked'] = true;
    PersonalVaultManager['blindSalt'] = null;
    PersonalVaultManager['blindSignatures'] = [];
    vi.clearAllMocks();
  });


  it('should be locked by default', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);
    expect(PersonalVaultManager.getItemsSync().length).toBe(0);
  });

  it('should correctly report if vault is setup', async () => {
    expect(await PersonalVaultManager.hasVaultSetup()).toBe(false);
    await PersonalVaultManager.setupMasterPassword('password');
    expect(await PersonalVaultManager.hasVaultSetup()).toBe(true);
  });

  it('should initialize with locked state if encrypted data exists', async () => {
    // Pre-populate mock storage with "encrypted" payload format
    mockStorage['threat_shield_personal_vault_encrypted'] = {
      salt: [1,2,3], iv: [1,2,3], ciphertext: [1,2,3]
    };
    
    await PersonalVaultManager.init();
    
    expect(PersonalVaultManager.isLocked()).toBe(true);
    expect(PersonalVaultManager.getItemsSync().length).toBe(0);
  });

  it('should unlock successfully with correct password', async () => {
    // Setup a new vault with a password
    await PersonalVaultManager.setupMasterPassword('my-strong-password');
    expect(PersonalVaultManager.isLocked()).toBe(false);
    expect(PersonalVaultManager.getItemsSync().length).toBe(DEFAULT_VAULT_ITEMS.length);
    
    // Now simulate browser restart
    await PersonalVaultManager.lock();
    PersonalVaultManager['isInitialized'] = false;
    expect(PersonalVaultManager.isLocked()).toBe(true);
    
    // Try to unlock
    const success = await PersonalVaultManager.unlock('my-strong-password');
    expect(success).toBe(true);
    expect(PersonalVaultManager.isLocked()).toBe(false);
    expect(PersonalVaultManager.getItemsSync().length).toBe(DEFAULT_VAULT_ITEMS.length);
  });

  it('should fail to unlock with wrong password', async () => {
    await PersonalVaultManager.setupMasterPassword('my-strong-password');
    
    await PersonalVaultManager.lock();
    
    const success = await PersonalVaultManager.unlock('wrong-password');
    expect(success).toBe(false);
    expect(PersonalVaultManager.isLocked()).toBe(true);
  });
  
  it('should encrypt items when saved while unlocked', async () => {
    await PersonalVaultManager.setupMasterPassword('password');
    
    await PersonalVaultManager.saveItem({
      category: 'CUSTOM',
      label: 'My Secret',
      realValue: '12345',
      decoyValue: '54321',
      keywords: ['secret']
    });
    
    // Check storage - it should be encrypted payload, not raw array
    const rawData = mockStorage['threat_shield_personal_vault_encrypted'];
    expect(rawData).toBeDefined();
    expect(rawData.ciphertext).toBeDefined();
    expect(rawData.salt).toBeDefined();
    expect(rawData.iv).toBeDefined();
    expect(Array.isArray(rawData)).toBe(false); // Should not be a raw array
  });

  it('should initialize with all default items empty and disabled', async () => {
    await PersonalVaultManager.setupMasterPassword('password');
    const items = PersonalVaultManager.getItemsSync();
    expect(items.length).toBe(DEFAULT_VAULT_ITEMS.length);
    for (const item of items) {
      expect(item.realValue).toBe('');
      expect(item.decoyValue).toBe('');
      expect(item.enabled).toBe(false);
    }
  });

  it('should automatically activate item when realValue is provided', async () => {
    await PersonalVaultManager.setupMasterPassword('password');
    const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;

    const updated = await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: 'Людмила',
      decoyValue: 'Оксана',
      keywords: motherItem.keywords,
    });

    expect(updated).toBeDefined();
    expect(updated?.realValue).toBe('Людмила');
    expect(updated?.enabled).toBe(true);
  });

  it('should allow explicitly disabling an item even when realValue is present', async () => {
    await PersonalVaultManager.setupMasterPassword('password');
    const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;

    const updated = await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: 'Людмила',
      decoyValue: 'Оксана',
      keywords: motherItem.keywords,
      enabled: false,
    });

    expect(updated).toBeDefined();
    expect(updated?.realValue).toBe('Людмила');
    expect(updated?.enabled).toBe(false);
  });

  it('should automatically deactivate item when realValue is cleared', async () => {
    await PersonalVaultManager.setupMasterPassword('password');
    const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;

    // First fill it
    await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: 'Людмила',
      decoyValue: 'Оксана',
      keywords: motherItem.keywords,
    });

    // Now clear it
    const cleared = await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: '',
      decoyValue: '',
      keywords: motherItem.keywords,
      enabled: true, // even if UI sends true, empty value must deactivate
    });

    expect(cleared).toBeDefined();
    expect(cleared?.realValue).toBe('');
    expect(cleared?.enabled).toBe(false);
  });

  it('should preserve masterKey across popup reopen sessions and allow saving multiple different fields', async () => {
    // 1. Initial setup in first popup session
    await PersonalVaultManager.setupMasterPassword('secure-pass-123');
    const initialItems = PersonalVaultManager.getItemsSync();
    const motherItem = initialItems.find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;
    
    // Save Mother's maiden name
    await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: 'Шевченко',
      decoyValue: 'Коваленко',
      keywords: motherItem.keywords,
      enabled: true,
    });

    // 2. Simulate popup closed (memory wiped clean, but chrome.storage.session & local remain)
    PersonalVaultManager['isInitialized'] = false;
    PersonalVaultManager['storageListenerAttached'] = false;
    PersonalVaultManager['cachedItems'] = [];
    PersonalVaultManager['masterKey'] = null;
    PersonalVaultManager['locked'] = true;

    // 3. User reopens popup: init() is called
    await PersonalVaultManager.init();
    expect(PersonalVaultManager.isLocked()).toBe(false);
    expect(PersonalVaultManager['masterKey']).not.toBeNull();

    // Verify mother's maiden name is still there
    const session1Items = PersonalVaultManager.getItemsSync();
    expect(session1Items.find((i) => i.category === 'MOTHER_MAIDEN_NAME')?.realValue).toBe('Шевченко');

    // 4. In this second session, user fills and saves a DIFFERENT field (TAX_ID / РНОКПП)
    const taxItem = session1Items.find((i) => i.category === 'TAX_ID')!;
    const savedTax = await PersonalVaultManager.saveItem({
      id: taxItem.id,
      category: taxItem.category,
      label: taxItem.label,
      realValue: '3123456789',
      decoyValue: '2987654321',
      keywords: taxItem.keywords,
      enabled: true,
    });

    expect(savedTax).not.toBeNull();
    expect(savedTax?.realValue).toBe('3123456789');
    expect(savedTax?.enabled).toBe(true);

    // 5. Simulate popup closed AGAIN (second exit)
    PersonalVaultManager['isInitialized'] = false;
    PersonalVaultManager['storageListenerAttached'] = false;
    PersonalVaultManager['cachedItems'] = [];
    PersonalVaultManager['masterKey'] = null;
    PersonalVaultManager['locked'] = true;

    // 6. User reopens popup a third time
    await PersonalVaultManager.init();
    expect(PersonalVaultManager.isLocked()).toBe(false);

    // 7. Verify BOTH fields are retained and intact!
    const session2Items = PersonalVaultManager.getItemsSync();
    const loadedMother = session2Items.find((i) => i.category === 'MOTHER_MAIDEN_NAME');
    const loadedTax = session2Items.find((i) => i.category === 'TAX_ID');

    expect(loadedMother?.realValue).toBe('Шевченко');
    expect(loadedMother?.enabled).toBe(true);
    expect(loadedTax?.realValue).toBe('3123456789');
    expect(loadedTax?.enabled).toBe(true);

    // 8. Verify that chrome.storage.local encrypted payload also holds both values
    // by locking, resetting session storage, and unlocking from scratch with master password
    await PersonalVaultManager.lock();
    for (const key in mockSessionStorage) delete mockSessionStorage[key];
    PersonalVaultManager['isInitialized'] = false;

    const unlockSuccess = await PersonalVaultManager.unlock('secure-pass-123');
    expect(unlockSuccess).toBe(true);
    expect(PersonalVaultManager.isLocked()).toBe(false);

    const reloadedItems = PersonalVaultManager.getItemsSync();
    expect(reloadedItems.find((i) => i.category === 'MOTHER_MAIDEN_NAME')?.realValue).toBe('Шевченко');
    expect(reloadedItems.find((i) => i.category === 'TAX_ID')?.realValue).toBe('3123456789');
  });

  describe('Zero-Knowledge Blind Indexing & Salted HMAC Protection (Variant 1)', () => {
    it('should generate salted blind tokens and store blind signatures without realValue in local storage', async () => {
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;

      await PersonalVaultManager.saveItem({
        id: motherItem.id,
        category: motherItem.category,
        label: motherItem.label,
        realValue: 'Людмила',
        decoyValue: 'Оксана',
        keywords: motherItem.keywords,
        enabled: true,
      });

      const blindSalt = mockStorage['threat_shield_vault_blind_salt'];
      expect(blindSalt).toBeDefined();
      expect(blindSalt.length).toBe(32); // 32-byte salt

      const blindSignatures = mockStorage['threat_shield_vault_blind_signatures'];
      expect(blindSignatures).toBeDefined();
      expect(Array.isArray(blindSignatures)).toBe(true);

      const motherSig = blindSignatures.find((s: any) => s.category === 'MOTHER_MAIDEN_NAME');
      expect(motherSig).toBeDefined();
      expect(motherSig.blindTokens.length).toBeGreaterThan(0);
      expect((motherSig as any).realValue).toBeUndefined(); // Zero-knowledge: realValue NEVER stored in blind table!
      expect(motherSig.decoyValue).toBe('Оксана');
      expect(motherSig.enabled).toBe(true);
    });

    it('should perform Zero-Knowledge field and value detection when vault is locked', async () => {
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;

      await PersonalVaultManager.saveItem({
        id: motherItem.id,
        category: motherItem.category,
        label: motherItem.label,
        realValue: 'Людмила',
        decoyValue: 'Оксана',
        keywords: motherItem.keywords,
        enabled: true,
      });

      // Тепер блокуємо сховище (Lock)
      await PersonalVaultManager.lock();
      expect(PersonalVaultManager.isLocked()).toBe(true);

      // Перевіряємо, що у кеші пам'яті відкриті значення ВИДАЛЕНО (Zero-Knowledge)
      const lockedItems = PersonalVaultManager.getItemsSync();
      expect(lockedItems.length).toBeGreaterThan(0);
      const lockedMother = lockedItems.find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;
      expect(lockedMother.realValue).toBe(''); // Відсутнє відкрите значення у пам'яті!
      expect(lockedMother.blindTokens?.length).toBeGreaterThan(0);

      // 1. Field Inspection працює у заблокованому сховищі
      const fieldMatch = PersonalVaultManager.findMatchingVaultItemForField('вкажіть дівоче прізвище матері');
      expect(fieldMatch).not.toBeNull();
      expect(fieldMatch?.category).toBe('MOTHER_MAIDEN_NAME');
      expect(fieldMatch?.decoyValue).toBe('Оксана');

      // 2. Точне значення співпадає за сліпими HMAC токенами
      const exactValueMatch = PersonalVaultManager.findMatchingVaultItemForValue('Людмила');
      expect(exactValueMatch).not.toBeNull();
      expect(exactValueMatch?.category).toBe('MOTHER_MAIDEN_NAME');
      expect(exactValueMatch?.decoyValue).toBe('Оксана');

      // 3. Співпадіння у вільному тексті / чаті за хешованими токенами
      const sentenceMatch = PersonalVaultManager.findMatchingVaultItemForValue('Моє прізвище Людмила, передайте кошти');
      expect(sentenceMatch).not.toBeNull();
      expect(sentenceMatch?.category).toBe('MOTHER_MAIDEN_NAME');

      // 4. Невідомі значення не дають хибних спрацьовувань
      const noMatch = PersonalVaultManager.findMatchingVaultItemForValue('Іваненко Петро Олексійович');
      expect(noMatch).toBeNull();
    });

    it('should seamlessly match financial phone and date of birth in locked state', async () => {
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const phoneItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'FINANCIAL_PHONE')!;
      const dobItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'DATE_OF_BIRTH')!;

      await PersonalVaultManager.saveItem({
        id: phoneItem.id,
        category: phoneItem.category,
        label: phoneItem.label,
        realValue: '+380671234567',
        decoyValue: '+380679876543',
        keywords: phoneItem.keywords,
        enabled: true,
      });

      await PersonalVaultManager.saveItem({
        id: dobItem.id,
        category: dobItem.category,
        label: dobItem.label,
        realValue: '15.08.1985',
        decoyValue: '01.01.1990',
        keywords: dobItem.keywords,
        enabled: true,
      });

      await PersonalVaultManager.lock();
      expect(PersonalVaultManager.isLocked()).toBe(true);

      // Тест нормалізації телефону: останні 7 цифр
      expect(PersonalVaultManager.findMatchingVaultItemForValue('1234567')).not.toBeNull();
      // Тест нормалізації телефону: локальний формат 0671234567
      expect(PersonalVaultManager.findMatchingVaultItemForValue('0671234567')).not.toBeNull();
      // Тест нормалізації телефону у повідомленні чату
      expect(PersonalVaultManager.findMatchingVaultItemForValue('надішліть на 0671234567 будь ласка')).not.toBeNull();

      // Тест дати народження лише цифрами
      expect(PersonalVaultManager.findMatchingVaultItemForValue('15081985')).not.toBeNull();
      // Тест дати народження у тексті
      expect(PersonalVaultManager.findMatchingVaultItemForValue('я народився 15.08.1985 року')).not.toBeNull();
    });

    it('should retain 24/7 background DLP protection after browser restart without master password', async () => {
      // 1. Первинне налаштування та збереження
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const taxItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'TAX_ID')!;
      await PersonalVaultManager.saveItem({
        id: taxItem.id,
        category: taxItem.category,
        label: taxItem.label,
        realValue: '3124567890',
        decoyValue: '2987654321',
        keywords: taxItem.keywords,
        enabled: true,
      });

      // 2. Симуляція перезапуску браузера (пам'ять і сесійне сховище стерто, local storage збережено)
      for (const key in mockSessionStorage) delete mockSessionStorage[key];
      PersonalVaultManager['isInitialized'] = false;
      PersonalVaultManager['storageListenerAttached'] = false;
      PersonalVaultManager['cachedItems'] = [];
      PersonalVaultManager['masterKey'] = null;
      PersonalVaultManager['locked'] = true;
      PersonalVaultManager['blindSalt'] = null;
      PersonalVaultManager['blindSignatures'] = [];

      // 3. Ініціалізація розширення при відкритті нової вкладки
      await PersonalVaultManager.init();

      // Сховище ЗАБЛОКОВАНЕ: пароль ніхто не вводив!
      expect(PersonalVaultManager.isLocked()).toBe(true);
      expect(PersonalVaultManager.hasOperationalProtection()).toBe(true);
      expect(PersonalVaultManager.getActiveSignaturesCount()).toBeGreaterThan(0);

      // Захист ВЖЕ працює 24/7 у фоні!
      const match = PersonalVaultManager.findMatchingVaultItemForValue('3124567890');
      expect(match).not.toBeNull();
      expect(match?.category).toBe('TAX_ID');
      expect(match?.decoyValue).toBe('2987654321');
      expect(match?.realValue).toBe(''); // Відкритий пароль або дані відсутні у пам'яті

      // Ключові слова полів також перевіряються
      const fieldMatch = PersonalVaultManager.findMatchingVaultItemForField('введіть свій рнокпп');
      expect(fieldMatch).not.toBeNull();
      expect(fieldMatch?.category).toBe('TAX_ID');
    });

    it('should match compound secrets with punctuation (e.g. "Super!Secret2026") embedded in sentences while locked', async () => {
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const secretWordItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'SECRET_WORD')!;

      await PersonalVaultManager.saveItem({
        id: secretWordItem.id,
        category: secretWordItem.category,
        label: secretWordItem.label,
        realValue: 'Super!Secret2026',
        decoyValue: 'DecoyPass123',
        keywords: secretWordItem.keywords,
        enabled: true,
      });

      // Блокуємо сховище
      await PersonalVaultManager.lock();
      expect(PersonalVaultManager.isLocked()).toBe(true);

      // 1. Точний ввід
      expect(PersonalVaultManager.findMatchingVaultItemForValue('Super!Secret2026')).not.toBeNull();

      // 2. Ввід всередині речення з розділовими знаками навколо
      const sentenceMatch = PersonalVaultManager.findMatchingVaultItemForValue(
        'Моє секретне кодове слово: Super!Secret2026, нікому не кажи!'
      );
      expect(sentenceMatch).not.toBeNull();
      expect(sentenceMatch?.category).toBe('SECRET_WORD');

      // 3. Ввід у дужках
      const parenMatch = PersonalVaultManager.findMatchingVaultItemForValue(
        'Пароль для входу: (Super!Secret2026)'
      );
      expect(parenMatch).not.toBeNull();
      expect(parenMatch?.category).toBe('SECRET_WORD');
    });

    it('should match multi-word phrases (Sliding N-grams) like "київ мій дім" in locked state', async () => {
      await PersonalVaultManager.setupMasterPassword('admin-password');
      const secretWordItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'SECRET_WORD')!;

      await PersonalVaultManager.saveItem({
        id: secretWordItem.id,
        category: secretWordItem.category,
        label: secretWordItem.label,
        realValue: 'київ мій дім',
        decoyValue: 'дніпро наше місто',
        keywords: secretWordItem.keywords,
        enabled: true,
      });

      // Блокуємо сховище
      await PersonalVaultManager.lock();
      expect(PersonalVaultManager.isLocked()).toBe(true);

      // 1. Точний збіг
      expect(PersonalVaultManager.findMatchingVaultItemForValue('київ мій дім')).not.toBeNull();

      // 2. Багатослівна фраза всередині діалогу в чаті
      const chatMatch = PersonalVaultManager.findMatchingVaultItemForValue(
        'Доброго дня! Моє контрольне слово київ мій дім, розблокуйте картку будь ласка.'
      );
      expect(chatMatch).not.toBeNull();
      expect(chatMatch?.category).toBe('SECRET_WORD');

      // 3. Фраза з пунктуацією на краях
      const punctMatch = PersonalVaultManager.findMatchingVaultItemForValue(
        'Підказка: «київ мій дім»!'
      );
      expect(punctMatch).not.toBeNull();
      expect(punctMatch?.category).toBe('SECRET_WORD');
    });
  });
});


