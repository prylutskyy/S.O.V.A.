export interface CryptoPayload {
  iv: number[];
  ciphertext: number[];
}

function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b));
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const len = data.length;
  const totalLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLen = len * 8;
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const result = new Uint8Array(32);
  const resView = new DataView(result.buffer);
  resView.setUint32(0, h0, false);
  resView.setUint32(4, h1, false);
  resView.setUint32(8, h2, false);
  resView.setUint32(12, h3, false);
  resView.setUint32(16, h4, false);
  resView.setUint32(20, h5, false);
  resView.setUint32(24, h6, false);
  resView.setUint32(28, h7, false);

  return result;
}

function hmacSha256Bytes(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
  let key = keyBytes;
  if (key.length > 64) {
    key = sha256Bytes(key);
  }
  const paddedKey = new Uint8Array(64);
  paddedKey.set(key, 0);

  const kIpad = new Uint8Array(64 + messageBytes.length);
  const kOpad = new Uint8Array(64 + 32);

  for (let i = 0; i < 64; i++) {
    kIpad[i] = paddedKey[i] ^ 0x36;
    kOpad[i] = paddedKey[i] ^ 0x5c;
  }
  kIpad.set(messageBytes, 64);

  const innerHash = sha256Bytes(kIpad);
  kOpad.set(innerHash, 64);

  return sha256Bytes(kOpad);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export class CryptoService {
  /**
   * Генерує випадкову сіль для PBKDF2 (16 байт)
   */
  public static generateSalt(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Генерує 32-байтну випадкову сіль для blindTokens (Salted HMAC)
   */
  public static generateBlindSalt(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(32));
  }

  /**
   * Синхронне обчислення HMAC-SHA256 для негайного DLP співставлення у DOM-подіях
   */
  public static computeHmacSync(text: string, salt: Uint8Array): string {
    const enc = new TextEncoder();
    const textBytes = enc.encode(text);
    const hmacBytes = hmacSha256Bytes(salt, textBytes);
    return bytesToHex(hmacBytes);
  }

  /**
   * Асинхронне обчислення HMAC-SHA256 через Web Crypto API
   */
  public static async computeHmac(text: string, salt: Uint8Array): Promise<string> {
    if (globalThis.crypto?.subtle) {
      const enc = new TextEncoder();
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        salt as any,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(text));
      return bytesToHex(new Uint8Array(signature));
    }
    return this.computeHmacSync(text, salt);
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
        salt: salt as any,
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
    const iv = Uint8Array.from(payload.iv);
    const ciphertext = Uint8Array.from(payload.ciphertext);

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

  /**
   * Експортує AES-GCM CryptoKey у формат JWK для безпечного збереження в межах активної сесії браузера
   */
  public static async exportKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
    return globalThis.crypto.subtle.exportKey('jwk', key);
  }

  /**
   * Відновлює AES-GCM CryptoKey з формату JWK
   */
  public static async importKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
    return globalThis.crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}

