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
});

