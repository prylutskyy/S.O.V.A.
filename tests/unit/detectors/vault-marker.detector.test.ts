// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultMarkerDetector } from '../../../src/detectors/vault-marker.detector';
import { FormDetectorContext } from '../../../src/detectors/contracts/form-detector.interface';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

const mockStorage: Record<string, any> = {};
const mockSessionStorage: Record<string, any> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: any) => {
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
      remove: vi.fn(async (keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockStorage[k]);
      }),
    },
    session: {
      get: vi.fn(async (keys?: any) => {
        if (!keys) return { ...mockSessionStorage };
        if (typeof keys === 'string') return { [keys]: mockSessionStorage[keys] };
        return { ...mockSessionStorage };
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockSessionStorage, items);
      }),
      remove: vi.fn(async (keys: any) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockSessionStorage[k]);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
});

describe('VaultMarkerDetector - Dedicated Unit Tests', () => {
  let detector: VaultMarkerDetector;
  let form: HTMLFormElement;
  const context: FormDetectorContext = { currentHost: 'untrusted-site.com', targetHost: 'untrusted-site.com' };

  beforeEach(async () => {
    detector = new VaultMarkerDetector();
    document.body.innerHTML = '';
    form = document.createElement('form');
    document.body.appendChild(form);

    for (const key in mockStorage) delete mockStorage[key];
    for (const key in mockSessionStorage) delete mockSessionStorage[key];

    PersonalVaultManager['isInitialized'] = false;
    await PersonalVaultManager.init();
    await PersonalVaultManager.setupMasterPassword('SecureMaster123!');
  });

  it('identifies itself with correct ID and name', () => {
    expect(detector.id).toBe('vault_markers');
    expect(detector.name).toBe('Personal Vault Sensitive Marker Detector (DLP)');
  });

  it('returns empty triggers when form contains only generic inputs', () => {
    form.innerHTML = `
      <label for="city">Місто:</label>
      <input id="city" name="city" value="Київ" />
    `;

    const results = detector.scan(form, context);
    expect(results).toEqual([]);
  });

  it('detects a field probing for Mother Maiden Name (Tier A) and returns CRITICAL severity with +40 score', async () => {
    await PersonalVaultManager.saveItem({
      category: 'MOTHER_MAIDEN_NAME',
      label: 'Дівоче прізвище матері',
      realValue: 'Смирнова',
      decoyValue: 'Оксана',
      keywords: ['дівоче прізвище', 'прізвище матері', 'maiden name'],
      enabled: true,
    });

    form.innerHTML = `
      <label for="mother">Вкажіть дівоче прізвище матері:</label>
      <input id="mother" name="mother_maiden" type="text" />
    `;

    const results = detector.scan(form, context);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const trigger = results.find((r) => r.name === 'vault_sensitive_data_exposure');
    expect(trigger).toBeDefined();
    expect(trigger?.severity).toBe('CRITICAL');
    expect(trigger?.scoreContribution).toBe(45);
    expect(trigger?.details?.hasTierA).toBe(true);
  });

  it('detects direct value leakage when user inputs real secret from vault', async () => {
    await PersonalVaultManager.saveItem({
      category: 'SECRET_WORD',
      label: 'Секретне слово банку',
      realValue: 'Дніпро2026',
      decoyValue: 'Паляниця',
      keywords: ['кодове слово', 'секретне слово'],
      enabled: true,
    });

    form.innerHTML = `
      <input name="feedback" type="text" value="Мій секретний код Дніпро2026 для перевірки" />
    `;

    const results = detector.scan(form, context);
    const leakTrigger = results.find((r) => r.name === 'vault_sensitive_data_exposure');

    expect(leakTrigger).toBeDefined();
    expect(leakTrigger?.severity).toBe('CRITICAL');
    expect(leakTrigger?.scoreContribution).toBe(45);
    expect(leakTrigger?.details?.hasValueLeak).toBe(true);
  });
});
