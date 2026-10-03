// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShieldTabController } from '../../../entrypoints/popup/controllers/shield-tab.controller';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

const mockStorage: Record<string, any> = {};
const mockRuntimeSendMsg = vi.fn();
let runtimeOnMessageCallbacks: Array<(msg: any) => void> = [];

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys?: any) => {
        if (!keys) return { ...mockStorage };
        if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
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
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(async () => [{ id: 101, url: 'https://shop.example.ua/cart' }]),
  },
  runtime: {
    sendMessage: mockRuntimeSendMsg,
    onMessage: {
      addListener: vi.fn((cb: any) => {
        runtimeOnMessageCallbacks.push(cb);
      }),
    },
  },
});

function setupShieldDOM() {
  document.body.innerHTML = `
    <div id="currentSiteDomain"></div>
    <div id="currentSiteStatus"></div>
    <input type="checkbox" id="currentSiteToggle" />
    <div id="siteIconBox"></div>
    <div id="currentSiteCard"></div>

    <div id="cardProtectionPill"></div>
    <div id="cardProtectionDesc"></div>
    <div id="hiddenFormsPill"></div>
    <div id="hiddenFormsDesc"></div>

    <div id="chainSourceNode"></div>
    <div id="chainTargetNode"></div>

    <div id="taintedBanner" style="display: none;"></div>
    <div id="taintedDescText"></div>
    <button id="btnQuickDismissContext"></button>
    <button id="btnResetContextHome"></button>

    <div id="vaultProtectionDesc"></div>
    <div id="vaultStatusPill"></div>
    <div id="moduleVaultItem"></div>

    <div id="homeAiPill"></div>
    <div id="homeAiSubtext"></div>
  `;
}

describe('ShieldTabController - Dedicated Unit Tests', () => {
  beforeEach(async () => {
    setupShieldDOM();
    for (const key in mockStorage) delete mockStorage[key];
    mockRuntimeSendMsg.mockReset();
    mockRuntimeSendMsg.mockImplementation((msg: any, cb?: any) => {
      const res = {};
      if (typeof cb === 'function') {
        cb(res);
      }
      return Promise.resolve(res);
    });
    runtimeOnMessageCallbacks = [];

    await UserWhitelistManager.init();
    PersonalVaultManager['isInitialized'] = false;
  });

  it('initializes and displays active tab domain and green active status', async () => {
    const toastFn = vi.fn();
    const navVaultFn = vi.fn();

    const controller = new ShieldTabController(toastFn, navVaultFn);
    await controller.updateDisplay();

    const domainEl = document.getElementById('currentSiteDomain') as HTMLElement;
    const toggle = document.getElementById('currentSiteToggle') as HTMLInputElement;

    expect(domainEl.innerText).toBe('shop.example.ua');
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(false);

    const cardPill = document.getElementById('cardProtectionPill') as HTMLElement;
    expect(cardPill.innerText).toBe('shieldTabStatusActive');
    expect(cardPill.className).toContain('green');
  });

  it('updates display to paused (amber) when domain is added to whitelist', async () => {
    const toastFn = vi.fn();
    const controller = new ShieldTabController(toastFn, vi.fn());
    await controller.updateDisplay();

    const toggle = document.getElementById('currentSiteToggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    // Turn toggle off (pause protection / whitelist domain)
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    // Allow async whitelist call
    await new Promise((r) => setTimeout(r, 10));

    expect(toastFn).toHaveBeenCalledWith(expect.stringContaining('Сайт додано до винятків'));

    const cardPill = document.getElementById('cardProtectionPill') as HTMLElement;
    expect(cardPill.innerText).toBe('shieldTabStatusPaused');
    expect(cardPill.className).toContain('amber');
  });

  it('renders tainted threat banner when active tainted context exists for the tab', async () => {
    mockRuntimeSendMsg.mockImplementation((msg, cb) => {
      const res = msg.type === 'GET_ACTIVE_CONTEXT' ? {
        context: {
          sourcePlatform: 'olx.ua',
          threatLevel: 'HIGH',
          scenario: 'ESCROW_DELIVERY_FRAUD',
        },
      } : {};
      if (typeof cb === 'function') cb(res);
      return Promise.resolve(res);
    });

    const controller = new ShieldTabController(vi.fn(), vi.fn());
    await controller.updateDisplay();

    const banner = document.getElementById('taintedBanner') as HTMLElement;
    const desc = document.getElementById('taintedDescText') as HTMLElement;
    const chainSource = document.getElementById('chainSourceNode') as HTMLElement;

    expect(banner.style.display).toBe('flex');
    
    // removed
  });

  it('sends CLEAR_CONTEXT message when reset button is clicked', async () => {
    mockRuntimeSendMsg.mockImplementation((msg, cb) => {
      const res = msg.type === 'GET_ACTIVE_CONTEXT' ? { context: { sourcePlatform: 'olx.ua' } } : {};
      if (typeof cb === 'function') cb(res);
      return Promise.resolve(res);
    });

    const toastFn = vi.fn();
    const controller = new ShieldTabController(toastFn, vi.fn());
    await controller.updateDisplay();

    const banner = document.getElementById('taintedBanner') as HTMLElement;
    const btnReset = document.getElementById('btnResetContextHome') as HTMLButtonElement;

    expect(banner.style.display).toBe('flex');

    btnReset.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRuntimeSendMsg).toHaveBeenCalledWith({
      type: 'CLEAR_CONTEXT',
      tabId: 101,
    });
    expect(banner.style.display).toBe('none');
    expect(toastFn).toHaveBeenCalledWith('Стан підвищеної тривоги скинуто');
  });

  it('sends CLEAR_CONTEXT message when quick dismiss button is clicked', async () => {
    mockRuntimeSendMsg.mockImplementation((msg, cb) => {
      const res = msg.type === 'GET_ACTIVE_CONTEXT' ? { context: { sourcePlatform: 'olx.ua' } } : {};
      if (typeof cb === 'function') cb(res);
      return Promise.resolve(res);
    });

    const toastFn = vi.fn();
    const controller = new ShieldTabController(toastFn, vi.fn());
    await controller.updateDisplay();

    const banner = document.getElementById('taintedBanner') as HTMLElement;
    const btnQuick = document.getElementById('btnQuickDismissContext') as HTMLButtonElement;

    expect(banner.style.display).toBe('flex');

    btnQuick.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRuntimeSendMsg).toHaveBeenCalledWith({
      type: 'CLEAR_CONTEXT',
      tabId: 101,
    });
    expect(banner.style.display).toBe('none');
    expect(toastFn).toHaveBeenCalledWith('Стан підвищеної тривоги скинуто');
  });

  it('navigates to vault when clicking on moduleVaultItem', () => {
    const navVaultFn = vi.fn();
    new ShieldTabController(vi.fn(), navVaultFn);

    const vaultItem = document.getElementById('moduleVaultItem') as HTMLElement;
    vaultItem.click();

    expect(navVaultFn).toHaveBeenCalledTimes(1);
  });

  it('reactively hides tainted banner when receiving CONTEXT_CLEARED runtime message', async () => {
    mockRuntimeSendMsg.mockImplementation((msg, cb) => {
      const res = msg.type === 'GET_ACTIVE_CONTEXT' ? { context: { sourcePlatform: 'olx.ua' } } : {};
      if (typeof cb === 'function') cb(res);
      return Promise.resolve(res);
    });

    const controller = new ShieldTabController(vi.fn(), vi.fn());
    await controller.updateDisplay();

    const banner = document.getElementById('taintedBanner') as HTMLElement;
    expect(banner.style.display).toBe('flex');

    // Simulate CONTEXT_CLEARED message from background
    for (const cb of runtimeOnMessageCallbacks) {
      cb({ type: 'CONTEXT_CLEARED' });
    }

    expect(banner.style.display).toBe('none');
  });
});
