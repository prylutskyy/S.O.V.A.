// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsTabController } from '../../../entrypoints/popup/controllers/settings-tab.controller';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';

const mockStorage: Record<string, any> = {};
const mockTabsSendMsg = vi.fn();
const mockRuntimeSendMsg = vi.fn();
let storageOnChangedCallbacks: Array<(changes: any, areaName: string) => void> = [];

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[], cb?: (res: any) => void) => {
        let res: Record<string, any> = {};
        if (!keys) res = { ...mockStorage };
        else if (typeof keys === 'string') res = { [keys]: mockStorage[keys] };
        else if (Array.isArray(keys)) {
          keys.forEach((k) => { res[k] = mockStorage[k]; });
        }
        if (typeof cb === 'function') cb(res);
        return res;
      }),
      set: vi.fn(async (items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockStorage, items);
        if (typeof cb === 'function') cb();
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockStorage[k]);
      }),
    },
    onChanged: {
      addListener: vi.fn((cb: any) => {
        storageOnChangedCallbacks.push(cb);
      }),
    },
  },
  tabs: {
    query: vi.fn((_query: any, cb?: (tabs: any[]) => void) => {
      const tabs = [{ id: 101 }, { id: 102 }];
      if (typeof cb === 'function') cb(tabs);
      return Promise.resolve(tabs);
    }),
    sendMessage: mockTabsSendMsg,
  },
  runtime: {
    sendMessage: mockRuntimeSendMsg,
  },
});

function setupDOM() {
  document.body.innerHTML = `
    <div id="whitelistTitle"></div>
    <ul id="whitelistUl"></ul>
    <input id="manualHostInput" type="text" />
    <div id="manualHostError"></div>
    <button id="btnAddManual"></button>
    <button id="btnClearAllWhitelist"></button>
    <button id="btnToggleManualAdd"></button>
    <div id="manualAddRow"></div>

    <div id="aiStatusText"></div>
    <div id="rowToggleDebugMode" class="inset-row interactive">
      <label class="ios-switch" for="toggleDebugMode">
        <input type="checkbox" id="toggleDebugMode" />
        <span class="ios-slider"></span>
      </label>
    </div>

    <div id="cloudAiSummaryRow">
      <div id="cloudAiSummarySubtitle"></div>
      <input type="checkbox" id="toggleCloudAi" />
      <button id="btnToggleCloudAiDetails"></button>
    </div>
    <div id="cloudAiSettingsArea" class="hidden">
      <select id="cloudAiProviderSelect"></select>
      <div id="cloudAiKeySavedPill"></div>
      <div id="cloudAiKeyHint"></div>
      <button id="btnToggleChangeKey"></button>
      <button id="btnDeleteCloudAiKey"></button>
      <div id="cloudAiKeyInputWrapper"></div>
      <div id="cloudAiKeyNotSet"></div>
      <input id="cloudAiKeyInput" type="password" />
      <button id="btnSaveCloudAiKey"></button>
      <span id="btnSaveCloudAiKeyText"></span>
      <div id="cloudAiModelContainer"></div>
      <button id="btnRefreshModels"></button>
      <select id="cloudAiModelSelect"></select>
      <button id="btnApplyModel"></button>
      <div id="customModelInputWrapper"></div>
      <input id="cloudAiCustomModelInput" type="text" />
      <button id="btnApplyCustomModel"></button>
      <div id="cloudAiStatusFeedback"></div>
      <button id="btnCollapseCloudAi"></button>
    </div>

    <div id="confirmSheetBackdrop" class="hidden"></div>
    <div id="confirmSheetTitle"></div>
    <div id="confirmSheetBody"></div>
    <button id="btnConfirmAction"></button>
    <button id="btnCancelAction"></button>
  `;
}

describe('SettingsTabController - Debugger Toggle & Synchronization', () => {
  beforeEach(async () => {
    setupDOM();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockTabsSendMsg.mockReset().mockResolvedValue({});
    mockRuntimeSendMsg.mockReset().mockResolvedValue({});
    storageOnChangedCallbacks = [];
    await UserWhitelistManager.init();
  });

  it('initializes toggleDebugMode from storage as checked if debugModeEnabled is true', async () => {
    mockStorage.debugModeEnabled = true;
    const toastFn = vi.fn();
    new SettingsTabController(toastFn, vi.fn());

    // Allow async storage callback to execute
    await new Promise((r) => setTimeout(r, 10));
    const checkbox = document.getElementById('toggleDebugMode') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('broadcasts SET_DEBUG_MODE to all tabs and runtime when slider is clicked', async () => {
    mockStorage.debugModeEnabled = false;
    const toastFn = vi.fn();
    new SettingsTabController(toastFn, vi.fn());

    const checkbox = document.getElementById('toggleDebugMode') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(mockStorage.debugModeEnabled).toBe(true);
    expect(toastFn).toHaveBeenCalledWith('Дебагер активовано на сторінках');

    expect(mockTabsSendMsg).toHaveBeenCalledWith(101, {
      type: 'SET_DEBUG_MODE',
      enabled: true,
    });
    expect(mockTabsSendMsg).toHaveBeenCalledWith(102, {
      type: 'SET_DEBUG_MODE',
      enabled: true,
    });
    expect(mockRuntimeSendMsg).toHaveBeenCalledWith({
      type: 'SET_DEBUG_MODE',
      enabled: true,
    });
  });

  it('toggles debugger when clicking anywhere on rowToggleDebugMode', async () => {
    mockStorage.debugModeEnabled = false;
    const toastFn = vi.fn();
    new SettingsTabController(toastFn, vi.fn());

    const checkbox = document.getElementById('toggleDebugMode') as HTMLInputElement;
    const row = document.getElementById('rowToggleDebugMode') as HTMLElement;

    expect(checkbox.checked).toBe(false);

    // Click on row
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(checkbox.checked).toBe(true);
    expect(mockStorage.debugModeEnabled).toBe(true);
    expect(toastFn).toHaveBeenCalledWith('Дебагер активовано на сторінках');
  });

  it('updates toggleDebugMode in real-time when storage changes externally (e.g. keyboard shortcut on page)', async () => {
    mockStorage.debugModeEnabled = false;
    new SettingsTabController(vi.fn(), vi.fn());

    const checkbox = document.getElementById('toggleDebugMode') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Simulate external storage change from content script or shortcut
    for (const cb of storageOnChangedCallbacks) {
      cb({ debugModeEnabled: { newValue: true, oldValue: false } }, 'local');
    }

    expect(checkbox.checked).toBe(true);
  });

  it('resyncs toggle state on refresh()', async () => {
    mockStorage.debugModeEnabled = false;
    const ctrl = new SettingsTabController(vi.fn(), vi.fn());

    const checkbox = document.getElementById('toggleDebugMode') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Storage updated while popup was on another tab
    mockStorage.debugModeEnabled = true;

    await ctrl.refresh();
    await new Promise((r) => setTimeout(r, 10));

    expect(checkbox.checked).toBe(true);
  });
});

describe('SettingsTabController - Whitelist UX & Empty State', () => {
  beforeEach(async () => {
    setupDOM();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    await UserWhitelistManager.init();
    await UserWhitelistManager.clearAll();
  });

  it('renders clean empty state without redundant add button and hides clear-all button', async () => {
    const ctrl = new SettingsTabController(vi.fn(), vi.fn());
    await ctrl.renderWhitelist();

    const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    const btnClearAll = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

    expect(whitelistUl.querySelector('.empty-state')).toBeTruthy();
    expect(whitelistUl.querySelector('#btnEmptyAdd')).toBeNull();
    expect(whitelistUl.textContent).toContain('settingsEmptyWhitelistTitle');
    expect(btnClearAll.style.display).toBe('none');
  });

  it('shows clear-all button and lists domains when whitelist is not empty', async () => {
    await UserWhitelistManager.allowDomain('safe-bank.ua');
    const ctrl = new SettingsTabController(vi.fn(), vi.fn());
    await ctrl.renderWhitelist();

    const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    const btnClearAll = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

    expect(whitelistUl.querySelector('.empty-state')).toBeNull();
    expect(whitelistUl.querySelector('.domain-name')?.textContent).toBe('safe-bank.ua');
    expect(btnClearAll.style.display).not.toBe('none');
  });
});

describe('SettingsTabController - Cloud AI Progressive Disclosure Drawer', () => {
  beforeEach(async () => {
    setupDOM();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    await UserWhitelistManager.init();
  });

  it('toggles cloud AI drawer via disclosure button', () => {
    new SettingsTabController(vi.fn(), vi.fn());
    const drawer = document.getElementById('cloudAiSettingsArea') as HTMLElement;
    const btnToggle = document.getElementById('btnToggleCloudAiDetails') as HTMLButtonElement;

    expect(drawer.classList.contains('hidden')).toBe(true);

    btnToggle.click();
    expect(drawer.classList.contains('hidden')).toBe(false);
    expect(btnToggle.classList.contains('rotated')).toBe(true);

    btnToggle.click();
    expect(drawer.classList.contains('hidden')).toBe(true);
    expect(btnToggle.classList.contains('rotated')).toBe(false);
  });

  it('toggles cloud AI drawer via summary row click', () => {
    new SettingsTabController(vi.fn(), vi.fn());
    const drawer = document.getElementById('cloudAiSettingsArea') as HTMLElement;
    const row = document.getElementById('cloudAiSummaryRow') as HTMLElement;

    expect(drawer.classList.contains('hidden')).toBe(true);

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drawer.classList.contains('hidden')).toBe(false);

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drawer.classList.contains('hidden')).toBe(true);
  });

  it('collapses drawer via btnCollapseCloudAi button', () => {
    const ctrl = new SettingsTabController(vi.fn(), vi.fn());
    const drawer = document.getElementById('cloudAiSettingsArea') as HTMLElement;
    const btnCollapse = document.getElementById('btnCollapseCloudAi') as HTMLButtonElement;

    ctrl.setCloudAiDrawer(true);
    expect(drawer.classList.contains('hidden')).toBe(false);

    btnCollapse.click();
    expect(drawer.classList.contains('hidden')).toBe(true);
  });

  it('auto-expands drawer when user toggles switch ON but no API key is saved', async () => {
    const toastFn = vi.fn();
    new SettingsTabController(toastFn, vi.fn());

    const drawer = document.getElementById('cloudAiSettingsArea') as HTMLElement;
    const checkbox = document.getElementById('toggleCloudAi') as HTMLInputElement;

    expect(drawer.classList.contains('hidden')).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    await new Promise((r) => setTimeout(r, 10));

    expect(drawer.classList.contains('hidden')).toBe(false);
    expect(toastFn).toHaveBeenCalledWith('Введіть Groq API ключ для підключення');
  });
});
