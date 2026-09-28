// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { VaultScanner } from '../../../src/heuristics/vault-scanner';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

const mockStorage: Record<string, any> = {};
const mockSessionStorage: Record<string, any> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, any>) => {
        if (!keys) return { ...mockStorage };
        if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          keys.forEach((k) => { res[k] = mockStorage[k]; });
          return res;
        }
        return { ...mockStorage };
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockStorage[k]);
      }),
    },
    session: {
      get: vi.fn(async (keys?: string | string[]) => {
        if (!keys) return { ...mockSessionStorage };
        if (typeof keys === 'string') return { [keys]: mockSessionStorage[keys] };
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          keys.forEach((k) => { res[k] = mockSessionStorage[k]; });
          return res;
        }
        return { ...mockSessionStorage };
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockSessionStorage, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockSessionStorage[k]);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
});

describe('VaultScanner with Zero-Knowledge Blind Tokens', () => {
  beforeEach(async () => {
    for (const key in mockStorage) delete mockStorage[key];
    for (const key in mockSessionStorage) delete mockSessionStorage[key];
    PersonalVaultManager['isInitialized'] = false;
    PersonalVaultManager['storageListenerAttached'] = false;
    PersonalVaultManager['cachedItems'] = [];
    PersonalVaultManager['masterKey'] = null;
    PersonalVaultManager['locked'] = true;
    PersonalVaultManager['blindSalt'] = null;
    PersonalVaultManager['blindSignatures'] = [];

    // Setup vault with items
    await PersonalVaultManager.setupMasterPassword('admin123');

    const motherItem = PersonalVaultManager.getItemsSync().find((i) => i.category === 'MOTHER_MAIDEN_NAME')!;
    await PersonalVaultManager.saveItem({
      id: motherItem.id,
      category: motherItem.category,
      label: motherItem.label,
      realValue: 'Шевченко',
      decoyValue: 'Коваленко',
      keywords: motherItem.keywords,
      enabled: true,
    });

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

    // Lock vault so it operates exclusively on Zero-Knowledge blind signatures
    await PersonalVaultManager.lock();
  });

  it('scans form fields and detects phishing attempts for maiden name while vault is locked', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'mother_maiden_name';
    input.placeholder = 'Дівоче прізвище матері';
    form.appendChild(input);

    const result = VaultScanner.scanFormSync(form, 'suspicious-delivery.com');

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].matchType).toBe('FIELD_LABEL_MATCH');
    expect(result.matches[0].matchedItem.category).toBe('MOTHER_MAIDEN_NAME');
    expect(result.matches[0].isDecoyAvailable).toBe(true);
    expect(result.matches[0].matchedItem.decoyValue).toBe('Коваленко');

    expect(result.triggers.length).toBe(1);
    expect(result.triggers[0].name).toBe('vault_sensitive_data_exposure');
    expect(result.triggers[0].severity).toBe('CRITICAL');
  });

  it('detects direct value leakage in form inputs via blind HMAC tokens while vault is locked', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'tax_number';
    input.value = '3124567890'; // User typed their real tax ID!
    form.appendChild(input);

    const result = VaultScanner.scanFormSync(form, 'untrusted-site.xyz');

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].matchType).toBe('VALUE_MATCH');
    expect(result.matches[0].matchedItem.category).toBe('TAX_ID');

    expect(result.triggers.length).toBe(1);
    expect(result.triggers[0].severity).toBe('CRITICAL');
    expect(result.triggers[0].message).toContain('прямий витік');
  });

  it('detects secret leakage in chat messages using blind token matching while vault is locked', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const chatText = 'Доброго дня! Моє дівоче прізвище Шевченко, очікую на повернення коштів.';
    const result = VaultScanner.scanTextSync(chatText);

    expect(result.matchedItems.length).toBe(1);
    expect(result.matchedItems[0].category).toBe('MOTHER_MAIDEN_NAME');
    expect(result.triggers.length).toBe(1);
    expect(result.triggers[0].name).toBe('vault_chat_leakage');
    expect(result.triggers[0].severity).toBe('CRITICAL');
  });

  it('does not trigger false alarms for benign chat text when vault is locked', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const safeText = 'Добрий вечір, підкажіть, будь ласка, актуальну ціну товару?';
    const result = VaultScanner.scanTextSync(safeText);

    expect(result.matchedItems.length).toBe(0);
    expect(result.triggers.length).toBe(0);
  });

  it('applies decoy values to form inputs successfully even in locked state', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'mother_maiden';
    input.value = 'Шевченко';
    form.appendChild(input);

    const scan = VaultScanner.scanFormSync(form, 'fake-portal.org');
    expect(scan.matches.length).toBe(1);

    let inputFired = false;
    let changeFired = false;
    input.addEventListener('input', () => { inputFired = true; });
    input.addEventListener('change', () => { changeFired = true; });

    const replacedCount = VaultScanner.applyDecoys(scan.matches);

    expect(replacedCount).toBe(1);
    expect(input.value).toBe('Коваленко'); // Decoy substituted!
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  it('selectively substitutes decoys ONLY into fields with real value leaks when onlyRealValueLeaks is true', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const form = document.createElement('form');

    // Field 1: label matches TAX_ID, but user left it empty or typed random text (NOT real value)
    const inputTax = document.createElement('input');
    inputTax.name = 'tax_number';
    inputTax.placeholder = 'Податковий номер (РНОКПП)';
    inputTax.value = 'random_benign_text';
    form.appendChild(inputTax);

    // Field 2: user typed their actual real secret maiden name ('Шевченко')
    const inputMother = document.createElement('input');
    inputMother.name = 'mother_maiden';
    inputMother.value = 'Шевченко';
    form.appendChild(inputMother);

    const scan = VaultScanner.scanFormSync(form, 'fake-portal.org');
    expect(scan.matches.length).toBe(2);

    const taxMatch = scan.matches.find((m) => m.matchedItem.category === 'TAX_ID')!;
    const motherMatch = scan.matches.find((m) => m.matchedItem.category === 'MOTHER_MAIDEN_NAME')!;

    expect(taxMatch.matchType).toBe('FIELD_LABEL_MATCH');
    expect(motherMatch.matchType).toBe('VALUE_MATCH');

    // Apply decoys with onlyRealValueLeaks = true (default)
    const replacedCount = VaultScanner.applyDecoys(scan.matches, true);

    expect(replacedCount).toBe(1);
    // Real secret is safely substituted by its decoy
    expect(inputMother.value).toBe('Коваленко');
    // Benign / arbitrary field is completely preserved!
    expect(inputTax.value).toBe('random_benign_text');
  });

  it('respects immune domains (.gov.ua, accredited payment gateways, whitelisted)', () => {
    expect(PersonalVaultManager.isLocked()).toBe(true);

    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'tax_number';
    input.value = '3124567890';
    form.appendChild(input);

    // .gov.ua immunity
    const govResult = VaultScanner.scanFormSync(form, 'cabinet.tax.gov.ua');
    expect(govResult.matches.length).toBe(0);
    expect(govResult.triggers.length).toBe(0);

    // Accredited payment gateway immunity
    const gatewayResult = VaultScanner.scanFormSync(form, 'secure.wayforpay.com');
    expect(gatewayResult.matches.length).toBe(0);
    expect(gatewayResult.triggers.length).toBe(0);
  });
});
