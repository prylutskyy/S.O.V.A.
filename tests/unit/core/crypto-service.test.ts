import { describe, it, expect } from 'vitest';
import { CryptoService } from '../../../src/core/crypto-service';

describe('CryptoService', () => {
  it('should generate a random salt of correct length', () => {
    const salt = CryptoService.generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16); // 128-bit salt
  });

  it('should derive the same key from the same password and salt', async () => {
    const password = 'my-super-secret-master-password';
    const salt = CryptoService.generateSalt();
    
    const key1 = await CryptoService.deriveKey(password, salt);
    const key2 = await CryptoService.deriveKey(password, salt);
    
    // We can't directly compare CryptoKey objects, so we export them to compare
    const exported1 = await crypto.subtle.exportKey('raw', key1);
    const exported2 = await crypto.subtle.exportKey('raw', key2);
    
    expect(new Uint8Array(exported1)).toEqual(new Uint8Array(exported2));
  });

  it('should encrypt and decrypt text successfully', async () => {
    const password = 'password123';
    const salt = CryptoService.generateSalt();
    const key = await CryptoService.deriveKey(password, salt);
    
    const originalText = JSON.stringify({ secret: 'data', number: 42 });
    
    const payload = await CryptoService.encryptText(originalText, key);
    
    expect(payload.iv).toBeDefined();
    expect(payload.ciphertext).toBeDefined();
    expect(payload.ciphertext.length).toBeGreaterThan(0);
    
    const decryptedText = await CryptoService.decryptText(payload, key);
    expect(decryptedText).toBe(originalText);
  });

  it('should fail to decrypt with wrong key', async () => {
    const password = 'correct-password';
    const salt = CryptoService.generateSalt();
    const key = await CryptoService.deriveKey(password, salt);
    
    const originalText = 'Secret data';
    const payload = await CryptoService.encryptText(originalText, key);
    
    const wrongKey = await CryptoService.deriveKey('wrong-password', salt);
    
    await expect(CryptoService.decryptText(payload, wrongKey)).rejects.toThrow();
  });

  it('should export key to JWK and import it back with full decryptability', async () => {
    const password = 'jwk-test-password';
    const salt = CryptoService.generateSalt();
    const originalKey = await CryptoService.deriveKey(password, salt);

    const jwk = await CryptoService.exportKeyToJwk(originalKey);
    expect(jwk).toBeDefined();
    expect(jwk.kty).toBe('oct');
    expect(jwk.k).toBeDefined();

    const restoredKey = await CryptoService.importKeyFromJwk(jwk);
    expect(restoredKey).toBeDefined();

    const originalText = 'Sensitive data round-trip test';
    const payload = await CryptoService.encryptText(originalText, originalKey);
    const decryptedText = await CryptoService.decryptText(payload, restoredKey);
    expect(decryptedText).toBe(originalText);
  });

  it('should generate 32-byte blind salt', () => {
    const salt = CryptoService.generateBlindSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(32); // 256-bit salt
  });

  it('should compute HMAC-SHA256 matching RFC 4231 test vectors', async () => {
    // RFC 4231 Test Case 2
    // Key = "Jefe", Data = "what do ya want for nothing?"
    const key = new TextEncoder().encode('Jefe');
    const data = 'what do ya want for nothing?';
    const expected = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843';

    const syncResult = CryptoService.computeHmacSync(data, key);
    expect(syncResult).toBe(expected);

    const asyncResult = await CryptoService.computeHmac(data, key);
    expect(asyncResult).toBe(expected);
  });

  it('should produce identical results between sync and async HMAC with UTF-8 Ukrainian characters', async () => {
    const salt = CryptoService.generateBlindSalt();
    const texts = [
      'Шевченко',
      'Людмила',
      '3124567890',
      '+380671234567',
      'Дніпро-1990',
    ];

    for (const text of texts) {
      const syncResult = CryptoService.computeHmacSync(text, salt);
      const asyncResult = await CryptoService.computeHmac(text, salt);
      expect(syncResult).toBe(asyncResult);
      expect(syncResult.length).toBe(64); // 256 bits in hex = 64 hex chars
    }
  });
});


