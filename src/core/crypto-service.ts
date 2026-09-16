export interface CryptoPayload {
  iv: number[];
  ciphertext: number[];
}

export class CryptoService {
  /**
   * Генерує випадкову сіль для PBKDF2 (16 байт)
   */
  public static generateSalt(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Створює AES-GCM 256 ключ на основі пароля та солі через алгоритм PBKDF2
   */
  public static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passwordKey = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 600000, // OWASP recommendation for PBKDF2-HMAC-SHA256
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true, // Витягуваний, щоб можна було зберігати в пам'яті (за потреби), хоча зазвичай false. Ми залишаємо true для тестів
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Шифрує текст і повертає payload з вектором ініціалізації та шифротекстом
   */
  public static async encryptText(text: string, key: CryptoKey): Promise<CryptoPayload> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12)); // Рекомендована довжина IV для AES-GCM
    const enc = new TextEncoder();
    
    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      enc.encode(text)
    );

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertextBuffer))
    };
  }

  /**
   * Розшифровує payload назад у текст
   */
  public static async decryptText(payload: CryptoPayload, key: CryptoKey): Promise<string> {
    const iv = new Uint8Array(payload.iv);
    const ciphertext = new Uint8Array(payload.ciphertext);

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  }
}
