// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultTabController } from '../../../entrypoints/popup/controllers/vault-tab.controller';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

const mockStorage: Record<string, any> = {};
const mockSessionStorage: Record<string, any> = {};

const storageChangeListeners: Array<(changes: Record<string, any>, area: string) => void> = [];

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[]) => {
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
      addListener: vi.fn((fn) => {
        storageChangeListeners.push(fn);
      }),
    },
  },
});

function setupDOM() {
  document.body.innerHTML = `
    <div id="vaultSetupState" style="display: none;">
      <input id="vaultSetupPassword" type="password" />
      <input id="vaultSetupConfirm" type="password" />
      <button id="btnSetupVault" type="button">Setup</button>
    </div>
    <div id="vaultLockedState" style="display: none;">
      <div id="vaultDaemonBanner"><span id="vaultLockedDaemonStatus"></span></div>
      <input id="vaultUnlockPassword" type="password" />
      <button id="btnUnlockVault" type="button">Unlock</button>
    </div>
    <div id="vaultUnlockedState" style="display: none;">
      <button id="btnQuickLock" type="button">Quick Lock</button>
      <div id="vaultActiveCountLabel"></div>
      <div id="vaultRingPercent"></div>
      <svg><circle id="vaultRingProgress"></circle></svg>
      <div id="vaultCategoriesContainer"></div>
      <button id="btnLockVault" type="button">Lock</button>
      <button id="btnResetVaultDefaults" type="button">Reset</button>
    </div>
  `;
}

describe('VaultTabController', () => {
  let showToastMock: ReturnType<typeof vi.fn>;
  let onStatsChangedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const key in mockStorage) delete mockStorage[key];
    for (const key in mockSessionStorage) delete mockSessionStorage[key];
    PersonalVaultManager['isInitialized'] = false;
    PersonalVaultManager['storageListenerAttached'] = false;
    PersonalVaultManager['cachedItems'] = [];
    PersonalVaultManager['masterKey'] = null;
    PersonalVaultManager['locked'] = true;
    PersonalVaultManager['blindSalt'] = null;
    PersonalVaultManager['blindSignatures'] = [];

    showToastMock = vi.fn();
    onStatsChangedMock = vi.fn();
    storageChangeListeners.length = 0;
    setupDOM();
  });

  it('renders setup state when vault has not been configured', async () => {
    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    const setupState = document.getElementById('vaultSetupState')!;
    const lockedState = document.getElementById('vaultLockedState')!;
    const unlockedState = document.getElementById('vaultUnlockedState')!;

    expect(setupState.style.display).toBe('flex');
    expect(lockedState.style.display).toBe('none');
    expect(unlockedState.style.display).toBe('none');
  });

  it('locks vault and switches to locked state when Quick Lock button is clicked', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    expect(PersonalVaultManager.isLocked()).toBe(false);

    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    const unlockedState = document.getElementById('vaultUnlockedState')!;
    expect(unlockedState.style.display).toBe('flex');

    // Click btnQuickLock
    const btnQuickLock = document.getElementById('btnQuickLock') as HTMLButtonElement;
    btnQuickLock.click();

    // Allow async handlers to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(PersonalVaultManager.isLocked()).toBe(true);
    expect(PersonalVaultManager.getMasterKey()).toBeNull();
    expect(mockSessionStorage['threat_shield_vault_decrypted']).toBeUndefined();
    expect(mockSessionStorage['threat_shield_vault_key_jwk']).toBeUndefined();

    const lockedState = document.getElementById('vaultLockedState')!;
    expect(lockedState.style.display).toBe('flex');
    expect(unlockedState.style.display).toBe('none');
    expect(showToastMock).toHaveBeenCalledWith('toastVaultLockedBg');
  });

  it('locks vault and switches to locked state when Footer Lock button is clicked', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    // Click btnLockVault
    const btnLockVault = document.getElementById('btnLockVault') as HTMLButtonElement;
    btnLockVault.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(PersonalVaultManager.isLocked()).toBe(true);
    const lockedState = document.getElementById('vaultLockedState')!;
    expect(lockedState.style.display).toBe('flex');
  });

  it('remains locked when popup is reopened after locking', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    const controller1 = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller1.renderSplitView();

    // Lock it
    const btnQuickLock = document.getElementById('btnQuickLock') as HTMLButtonElement;
    btnQuickLock.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(PersonalVaultManager.isLocked()).toBe(true);

    // Simulate popup close and reopen
    setupDOM();
    PersonalVaultManager['isInitialized'] = false;
    await PersonalVaultManager.init();

    const controller2 = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller2.renderSplitView();

    const lockedState = document.getElementById('vaultLockedState')!;
    const unlockedState = document.getElementById('vaultUnlockedState')!;
    expect(lockedState.style.display).toBe('flex');
    expect(unlockedState.style.display).toBe('none');
  });

  it('unlocks properly with master password and renders items', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    await PersonalVaultManager.lock();

    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    const unlockInput = document.getElementById('vaultUnlockPassword') as HTMLInputElement;
    const btnUnlock = document.getElementById('btnUnlockVault') as HTMLButtonElement;

    unlockInput.value = 'secure-1234';
    btnUnlock.click();

    await new Promise((r) => setTimeout(r, 450));

    expect(PersonalVaultManager.isLocked()).toBe(false);
    const unlockedState = document.getElementById('vaultUnlockedState')!;
    expect(unlockedState.style.display).toBe('flex');
    expect(showToastMock).toHaveBeenCalledWith('toastVaultUnlocked');
  });

  it('does not lock vault when a secret is saved/updated while unlocked', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    expect(PersonalVaultManager.isLocked()).toBe(false);

    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    const unlockedState = document.getElementById('vaultUnlockedState')!;
    const lockedState = document.getElementById('vaultLockedState')!;
    expect(unlockedState.style.display).toBe('flex');
    expect(lockedState.style.display).toBe('none');

    // Simulate item save which triggers chrome.storage.onChanged with only threat_shield_vault_decrypted
    for (const listener of storageChangeListeners) {
      listener(
        {
          threat_shield_vault_decrypted: {
            oldValue: [],
            newValue: [{ id: 'test-1', label: 'CVV', realValue: '123' }],
          },
        },
        'session'
      );
    }

    await new Promise((r) => setTimeout(r, 50));

    // Vault MUST stay unlocked!
    expect(PersonalVaultManager.isLocked()).toBe(false);
    expect(unlockedState.style.display).toBe('flex');
    expect(lockedState.style.display).toBe('none');
  });

  it('locks vault when threat_shield_vault_key_jwk is removed by another context', async () => {
    await PersonalVaultManager.setupMasterPassword('secure-1234');
    expect(PersonalVaultManager.isLocked()).toBe(false);

    const controller = new VaultTabController(showToastMock, onStatsChangedMock);
    await controller.renderSplitView();

    const unlockedState = document.getElementById('vaultUnlockedState')!;
    const lockedState = document.getElementById('vaultLockedState')!;
    expect(unlockedState.style.display).toBe('flex');

    // Simulate another context locking the vault (JWK removed from session)
    for (const listener of storageChangeListeners) {
      listener(
        {
          threat_shield_vault_key_jwk: {
            oldValue: { kty: 'oct', k: 'secret' },
            newValue: undefined,
          },
        },
        'session'
      );
    }

    await new Promise((r) => setTimeout(r, 50));

    // Vault UI MUST be locked
    expect(lockedState.style.display).toBe('flex');
    expect(unlockedState.style.display).toBe('none');
  });
});
