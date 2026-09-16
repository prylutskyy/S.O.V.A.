import { describe, it, expect } from 'vitest';
import { CryptoService } from './crypto-service';

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
});
