import { describe, it, expect, beforeEach } from 'vitest';
import { SecureKeyStore } from '../../../src/core/secure-key-store';
import { CryptoService } from '../../../src/core/crypto-service';

describe('SecureKeyStore (TDD Suite)', () => {
  let mockLocalStorage: Record<string, any> = {};
  let mockSessionStorage: Record<string, any> = {};

  beforeEach(() => {
    mockLocalStorage = {};
    mockSessionStorage = {};
    SecureKeyStore.clearMemory();

    // @ts-ignore
    globalThis.chrome = {
      runtime: { id: 'test_extension_id' },
      storage: {
        local: {
          get: async (keys: string | string[]) => {
            if (typeof keys === 'string') {
              return { [keys]: mockLocalStorage[keys] };
            }
            const res: Record<string, any> = {};
            for (const k of keys) {
              if (mockLocalStorage[k] !== undefined) res[k] = mockLocalStorage[k];
            }
            return res;
          },
          set: async (items: Record<string, any>) => {
            Object.assign(mockLocalStorage, items);
          },
          remove: async (keys: string | string[]) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) delete mockLocalStorage[k];
          },
        },
        session: {
          get: async (keys: string | string[]) => {
            if (typeof keys === 'string') {
              return { [keys]: mockSessionStorage[keys] };
            }
            const res: Record<string, any> = {};
            for (const k of keys) {
              if (mockSessionStorage[k] !== undefined) res[k] = mockSessionStorage[k];
            }
            return res;
          },
          set: async (items: Record<string, any>) => {
            Object.assign(mockSessionStorage, items);
          },
          remove: async (keys: string | string[]) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) delete mockSessionStorage[k];
          },
        },
      },
    } as any;
  });

  describe('createKeyHint', () => {
    it('should correctly mask API key for safe UI preview', () => {
      const hint = SecureKeyStore.createKeyHint('AIzaSyAbcd1234Efgh5678');
      expect(hint).toBe('AIzaSy...5678');
      expect(hint).not.toContain('1234');
    });

    it('should return bullets for short keys', () => {
      expect(SecureKeyStore.createKeyHint('12345')).toBe('••••••••');
      expect(SecureKeyStore.createKeyHint('')).toBe('');
    });
  });

  describe('Device-Encrypted Mode (Default Automated Protection)', () => {
    it('should encrypt API key using device key and decrypt accurately', async () => {
      const realKey = 'AIzaSy_Secret_Gemini_Key_999';
      await SecureKeyStore.saveApiKey('gemini', realKey, 'device_encrypted');

      // Check that raw API key is NOT stored in plain text in local storage
      const storedEnc = mockLocalStorage['threat_shield_llm_key_enc_gemini'];
      expect(storedEnc).toBeDefined();
      expect(storedEnc.storageMode).toBe('device_encrypted');
      expect(storedEnc.payload).toBeDefined();
      expect(storedEnc.payload.ciphertext).toBeInstanceOf(Array);
      expect(JSON.stringify(storedEnc)).not.toContain(realKey);

      // Wipe in-memory and session to simulate fresh browser session
      SecureKeyStore.clearMemory();
      mockSessionStorage = {};

      // Decrypt using device key
      const decrypted = await SecureKeyStore.getApiKey('gemini');
      expect(decrypted).toBe(realKey);
    });
  });

  describe('Session-Only Mode (RAM-Only / Ephemeral)', () => {
    it('should store key only in session storage, leaving local storage completely empty', async () => {
      const ephemeralKey = 'sk-proj-ephemeral-openai-key';
      await SecureKeyStore.saveApiKey('openai', ephemeralKey, 'session_only');

      // Local storage must be completely empty of this key
      expect(mockLocalStorage['threat_shield_llm_key_enc_openai']).toBeUndefined();

      // Session storage must hold the key
      expect(mockSessionStorage['threat_shield_llm_key_session_openai']).toBe(ephemeralKey);

      // Decrypt/fetch
      const fetched = await SecureKeyStore.getApiKey('openai');
      expect(fetched).toBe(ephemeralKey);
    });
  });

  describe('Vault-Encrypted Mode (Master Password Protection)', () => {
    it('should encrypt with Personal Vault master key and fail when vault is locked', async () => {
      const salt = CryptoService.generateSalt();
      const masterKey = await CryptoService.deriveKey('super_master_password', salt);
      const claudeKey = 'sk-ant-api03-claude-key-top-secret';

      await SecureKeyStore.saveApiKey('claude', claudeKey, 'vault_encrypted', masterKey);

      const storedEnc = mockLocalStorage['threat_shield_llm_key_enc_claude'];
      expect(storedEnc.storageMode).toBe('vault_encrypted');
      expect(JSON.stringify(storedEnc)).not.toContain(claudeKey);

      // Clear RAM and session
      SecureKeyStore.clearMemory();
      mockSessionStorage = {};

      // Attempt to retrieve without master key -> must return null (locked)
      const lockedResult = await SecureKeyStore.getApiKey('claude', null);
      expect(lockedResult).toBeNull();

      // Provide master key (vault unlocked) -> returns decrypted key
      const unlockedResult = await SecureKeyStore.getApiKey('claude', masterKey);
      expect(unlockedResult).toBe(claudeKey);
    });
  });

  describe('Key Deletion & Management', () => {
    it('should delete keys from both local and session storage', async () => {
      await SecureKeyStore.saveApiKey('groq', 'gsk_groq_api_token_123', 'device_encrypted');
      expect(await SecureKeyStore.getApiKey('groq')).toBe('gsk_groq_api_token_123');

      await SecureKeyStore.deleteApiKey('groq');

      expect(mockLocalStorage['threat_shield_llm_key_enc_groq']).toBeUndefined();
      expect(mockSessionStorage['threat_shield_llm_key_session_groq']).toBeUndefined();
      expect(await SecureKeyStore.getApiKey('groq')).toBeNull();
    });

    it('should return key hint without revealing full key', async () => {
      await SecureKeyStore.saveApiKey('gemini', 'AIzaSy_1234567890_abcdef', 'device_encrypted');
      const hint = await SecureKeyStore.getKeyHint('gemini');
      expect(hint).toBe('AIzaSy...cdef');
    });
  });

  describe('Config Management', () => {
    it('should save and retrieve LLM configuration', async () => {
      const initial = await SecureKeyStore.getConfig();
      expect(initial.provider).toBe('groq');

      const updated = await SecureKeyStore.saveConfig({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        timeoutMs: 2500,
        enabled: true,
      });

      expect(updated.provider).toBe('groq');
      expect(updated.model).toBe('llama-3.3-70b-versatile');
      expect(updated.timeoutMs).toBe(2500);
      expect(updated.enabled).toBe(true);

      SecureKeyStore.clearMemory();
      const freshFetch = await SecureKeyStore.getConfig();
      expect(freshFetch.provider).toBe('groq');
    });
  });
});
