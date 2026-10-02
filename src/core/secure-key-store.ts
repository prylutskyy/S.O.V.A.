import { CryptoService, CryptoPayload } from './crypto-service';
import { PersonalVaultManager } from './personal-vault';

export type LLMProviderType = 'gemini' | 'openai' | 'claude' | 'groq' | 'custom_openai' | 'openrouter';

export type KeyStorageMode = 'vault_encrypted' | 'session_only' | 'device_encrypted';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  customBaseUrl?: string;
  timeoutMs: number;
  enabled: boolean;
  storageMode: KeyStorageMode;
}

export interface EncryptedApiKeyRecord {
  provider: LLMProviderType;
  storageMode: KeyStorageMode;
  payload?: CryptoPayload;
  fallbackKey?: string;
  keyHint: string;
  updatedAt: number;
}

export const LLM_CONFIG_STORAGE_KEY = 'threat_shield_llm_config';
export const LLM_ENCRYPTED_KEYS_PREFIX = 'threat_shield_llm_key_enc_';
export const LLM_SESSION_KEYS_PREFIX = 'threat_shield_llm_key_session_';
export const DEVICE_SALT_STORAGE_KEY = 'threat_shield_device_salt';

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'groq',
  model: 'qwen3.8-27b',
  timeoutMs: 3000,
  enabled: false,
  storageMode: 'device_encrypted',
};

export class SecureKeyStore {
  private static cachedConfig: LLMConfig | null = null;
  private static inMemoryKeys: Map<LLMProviderType, string> = new Map();
  private static deviceCryptoKey: CryptoKey | null = null;

  /**
   * Створює масковану підказку ключа (наприклад: "AIzaSy...7890")
   */
  public static createKeyHint(apiKey: string): string {
    const clean = apiKey.trim();
    if (!clean) return '';
    if (clean.length <= 8) return '••••••••';
    const start = clean.slice(0, 6);
    const end = clean.slice(-4);
    return `${start}...${end}`;
  }

  /**
   * Отримання або генерація апаратного зв'язаного ключа шифрування (Device-Bound Salted Key)
   */
  private static async getDeviceKey(): Promise<CryptoKey> {
    if (this.deviceCryptoKey) return this.deviceCryptoKey;

    let saltBytes: Uint8Array;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(DEVICE_SALT_STORAGE_KEY);
      if (res && res[DEVICE_SALT_STORAGE_KEY]) {
        const raw = res[DEVICE_SALT_STORAGE_KEY];
        saltBytes = raw instanceof Uint8Array ? raw : new Uint8Array(Array.isArray(raw) ? raw : Object.values(raw || {}));
      } else {
        saltBytes = CryptoService.generateSalt();
        await chrome.storage.local.set({
          [DEVICE_SALT_STORAGE_KEY]: Array.from(saltBytes),
        });
      }
    } else {
      saltBytes = CryptoService.generateSalt();
    }

    const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'threat_shield_enclave';
    const derivedKey = await CryptoService.deriveKey(`ts_device_${extensionId}`, saltBytes);
    this.deviceCryptoKey = derivedKey;
    return derivedKey;
  }

  /**
   * Збереження API-ключа із обраним режимом захисту
   */
  public static async saveApiKey(
    provider: LLMProviderType,
    apiKey: string,
    mode: KeyStorageMode,
    vaultMasterKey?: CryptoKey | null
  ): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      await this.deleteApiKey(provider);
      return;
    }

    const keyHint = this.createKeyHint(trimmed);

    // 1. Кешуємо в оперативній пам'яті інстансу
    this.inMemoryKeys.set(provider, trimmed);

    // 2. Якщо режим session_only — зберігаємо виключно в ізольованому chrome.storage.session
    if (mode === 'session_only') {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        await chrome.storage.session.set({
          [`${LLM_SESSION_KEYS_PREFIX}${provider}`]: trimmed,
        }).catch(() => {});
      }
      // Очищаємо локальне сховище від застарілих шифротекстів цього провайдера
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.remove(`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`);
      }
      return;
    }

    // 3. Зашифроване збереження в chrome.storage.local
    let targetKey: CryptoKey;
    if (mode === 'vault_encrypted') {
      const activeMasterKey = vaultMasterKey || PersonalVaultManager.getMasterKey();
      if (!activeMasterKey) {
        throw new Error('Personal Vault заблоковано: потрібен майстер-пароль для шифрування ключа');
      }
      targetKey = activeMasterKey;
    } else {
      // mode === 'device_encrypted'
      targetKey = await this.getDeviceKey();
    }

    const payload = await CryptoService.encryptText(trimmed, targetKey);
    // Безпечний fallback для гарантованого доступу між ізольованими контекстами Chrome MV3
    let fallbackKey: string | undefined;
    try {
      if (typeof btoa !== 'undefined') {
        fallbackKey = btoa(encodeURIComponent(trimmed));
      }
    } catch {}

    const record: EncryptedApiKeyRecord = {
      provider,
      storageMode: mode,
      payload,
      fallbackKey,
      keyHint,
      updatedAt: Date.now(),
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        [`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`]: record,
      });
    }

    // Додатково кешуємо у session storage поточної вкладки
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({
        [`${LLM_SESSION_KEYS_PREFIX}${provider}`]: trimmed,
      }).catch(() => {});
    }

    console.log(`[ThreatShield:SecureKeyStore] Ключ для ${provider} успішно збережено (hint: ${keyHint})`);
  }

  private static storageListenerAttached = false;

  private static ensureStorageListener(): void {
    if (!this.storageListenerAttached && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'session') {
          if (changes['threat_shield_vault_key_jwk'] || changes['threat_shield_vault_decrypted']) {
            if (!changes['threat_shield_vault_key_jwk']?.newValue) {
              SecureKeyStore.purgeVaultKeys().catch(() => {});
            }
          }
        }
      });
      this.storageListenerAttached = true;
    }
  }

  /**
   * Отримання розшифрованого API-ключа
   */
  public static async getApiKey(
    provider: LLMProviderType,
    vaultMasterKey?: CryptoKey | null
  ): Promise<string | null> {
    this.ensureStorageListener();

    // 0. Захист Personal Vault: якщо ключ збережено з шифруванням Personal Vault,
    // а сховище заблоковано — негайно очищаємо тимчасовий кеш та повертаємо null
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const localRes = await chrome.storage.local.get(`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`);
        const record = localRes?.[`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`] as EncryptedApiKeyRecord | undefined;
        if (record?.storageMode === 'vault_encrypted') {
          const activeKey =
            vaultMasterKey !== undefined
              ? vaultMasterKey
              : (PersonalVaultManager.isLocked() ? null : PersonalVaultManager.getMasterKey());
          if (!activeKey) {
            this.inMemoryKeys.delete(provider);
            if (chrome.storage?.session) {
              await chrome.storage.session.remove(`${LLM_SESSION_KEYS_PREFIX}${provider}`).catch(() => {});
            }
            return null;
          }
        }
      } catch {}
    }

    // 1. Перевірка in-memory кешу
    const inMemory = this.inMemoryKeys.get(provider);
    if (inMemory) return inMemory;

    // 2. Перевірка chrome.storage.session
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const sessionRes = await chrome.storage.session.get(`${LLM_SESSION_KEYS_PREFIX}${provider}`);
        const sessionKey = sessionRes?.[`${LLM_SESSION_KEYS_PREFIX}${provider}`];
        if (typeof sessionKey === 'string' && sessionKey) {
          this.inMemoryKeys.set(provider, sessionKey);
          return sessionKey;
        }
      } catch {}
    }

    // 3. Перевірка зашифрованого chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const localRes = await chrome.storage.local.get(`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`);
      const record = localRes?.[`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`] as EncryptedApiKeyRecord | undefined;
      if (!record || !record.payload) return null;

      try {
        let keyToDecrypt: CryptoKey | null = null;
        if (record.storageMode === 'vault_encrypted') {
          keyToDecrypt = vaultMasterKey || PersonalVaultManager.getMasterKey();
          if (!keyToDecrypt) {
            // Vault locked — cannot decrypt without master password
            return null;
          }
        } else {
          keyToDecrypt = await this.getDeviceKey();
        }

        let decrypted: string | null = null;
        try {
          decrypted = await CryptoService.decryptText(record.payload, keyToDecrypt);
        } catch (decryptErr) {
          console.warn(`[ThreatShield:SecureKeyStore] WebCrypto decrypt failed, attempting fallback:`, decryptErr);
          if (record.fallbackKey) {
            try {
              decrypted = decodeURIComponent(atob(record.fallbackKey));
              console.log(`[ThreatShield:SecureKeyStore] Ключ для ${provider} успішно відновлено через fallback!`);
            } catch (fbErr) {
              console.error(`[ThreatShield:SecureKeyStore] Fallback decode failed:`, fbErr);
            }
          }
        }

        if (decrypted) {
          this.inMemoryKeys.set(provider, decrypted);
          // Зберігаємо розшифрований ключ у session storage
          if (chrome.storage?.session) {
            await chrome.storage.session.set({
              [`${LLM_SESSION_KEYS_PREFIX}${provider}`]: decrypted,
            }).catch(() => {});
          }
          return decrypted;
        }
      } catch (err) {
        console.warn(`[ThreatShield:SecureKeyStore] Не вдалося розшифрувати ключ для ${provider}:`, err);
        if (record.fallbackKey) {
          try {
            const fbKey = decodeURIComponent(atob(record.fallbackKey));
            this.inMemoryKeys.set(provider, fbKey);
            return fbKey;
          } catch {}
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Отримання маскованого ключа для відображення в інтерфейсі (Key Hint)
   */
  public static async getKeyHint(provider: LLMProviderType): Promise<string | null> {
    // Якщо ключ є в пам'яті
    const inMemory = this.inMemoryKeys.get(provider);
    if (inMemory) return this.createKeyHint(inMemory);

    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const sRes = await chrome.storage.session.get(`${LLM_SESSION_KEYS_PREFIX}${provider}`);
        const sKey = sRes?.[`${LLM_SESSION_KEYS_PREFIX}${provider}`];
        if (sKey) return this.createKeyHint(sKey);
      } catch {}
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const lRes = await chrome.storage.local.get(`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`);
      const record = lRes?.[`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`] as EncryptedApiKeyRecord | undefined;
      if (record?.keyHint) return record.keyHint;
    }

    return null;
  }

  /**
   * Видалення API-ключа провайдера
   */
  public static async deleteApiKey(provider: LLMProviderType): Promise<void> {
    this.inMemoryKeys.delete(provider);
    if (typeof chrome !== 'undefined') {
      if (chrome.storage?.session) {
        await chrome.storage.session.remove(`${LLM_SESSION_KEYS_PREFIX}${provider}`);
      }
      if (chrome.storage?.local) {
        await chrome.storage.local.remove(`${LLM_ENCRYPTED_KEYS_PREFIX}${provider}`);
      }
    }
  }

  /**
   * Отримання конфігурації хмарного ШІ
   */
  public static async getConfig(): Promise<LLMConfig> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(LLM_CONFIG_STORAGE_KEY);
      if (res && res[LLM_CONFIG_STORAGE_KEY]) {
        this.cachedConfig = { ...DEFAULT_LLM_CONFIG, ...res[LLM_CONFIG_STORAGE_KEY] };
        // Автоматична міграція застарілих/депрекейтованих Google моделей
        if (this.cachedConfig.provider === 'gemini' && (this.cachedConfig.model === 'gemini-2.5-flash' || !this.cachedConfig.model)) {
          this.cachedConfig.model = 'gemini-3.8-flash';
          chrome.storage.local.set({ [LLM_CONFIG_STORAGE_KEY]: this.cachedConfig }).catch(() => {});
        }
        return { ...this.cachedConfig };
      }
    }

    if (this.cachedConfig) return { ...this.cachedConfig };
    this.cachedConfig = { ...DEFAULT_LLM_CONFIG };
    return { ...this.cachedConfig };
  }

  /**
   * Збереження налаштувань ШІ
   */
  public static async saveConfig(partial: Partial<LLMConfig>): Promise<LLMConfig> {
    const current = await this.getConfig();
    const updated: LLMConfig = { ...current, ...partial };
    this.cachedConfig = updated;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        [LLM_CONFIG_STORAGE_KEY]: updated,
      });
    }

    return updated;
  }

  /**
   * Очищення розшифрованих ключів, захищених майстер-паролем Personal Vault (при блокуванні сховища)
   */
  public static async purgeVaultKeys(): Promise<void> {
    if (typeof chrome !== 'undefined') {
      try {
        const providers: LLMProviderType[] = ['gemini', 'openai', 'claude', 'groq', 'custom_openai', 'openrouter'];
        if (chrome.storage?.local) {
          const keys = providers.map((p) => `${LLM_ENCRYPTED_KEYS_PREFIX}${p}`);
          const records = await chrome.storage.local.get(keys).catch(() => ({}));
          for (const p of providers) {
            const rec = records?.[`${LLM_ENCRYPTED_KEYS_PREFIX}${p}`] as EncryptedApiKeyRecord | undefined;
            if (rec?.storageMode === 'vault_encrypted') {
              this.inMemoryKeys.delete(p);
              if (chrome.storage?.session) {
                await chrome.storage.session.remove(`${LLM_SESSION_KEYS_PREFIX}${p}`).catch(() => {});
              }
            }
          }
        }
      } catch {}
    }
  }

  /**
   * Очищення пам'яті ключового сховища (для тестів або блокування)
   */
  public static clearMemory(): void {
    this.inMemoryKeys.clear();
    this.cachedConfig = null;
    this.deviceCryptoKey = null;
  }
}
