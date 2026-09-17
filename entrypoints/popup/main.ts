import { UserWhitelistManager } from '../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../src/core/personal-vault';
import { ShieldTabController } from './controllers/shield-tab.controller';
import { VaultTabController } from './controllers/vault-tab.controller';
import { SettingsTabController } from './controllers/settings-tab.controller';

document.addEventListener('DOMContentLoaded', async () => {
  const toastMessage = document.getElementById('toastMessage') as HTMLElement;

  const showToast = (msg: string) => {
    toastMessage.innerText = msg;
    toastMessage.style.display = 'block';
    setTimeout(() => {
      toastMessage.style.display = 'none';
    }, 2200);
  };

  // 1. Ініціалізація менеджерів стану
  await UserWhitelistManager.init();
  await PersonalVaultManager.init();

  // 2. Ініціалізація модульних контролерів вкладок
  let shieldCtrl: ShieldTabController;
  let vaultCtrl: VaultTabController;
  let settingsCtrl: SettingsTabController;

  const setActiveTab = async (name: 'shield' | 'vault' | 'settings') => {
    for (const [key, tab] of Object.entries(tabs)) {
      const isActive = key === name;
      tab.btn.classList.toggle('active', isActive);
      tab.content.style.display = isActive ? 'flex' : 'none';
    }
    await tabs[name].onOpen();
  };

  // 3. Навігація між вкладками
  const tabs = {
    shield: {
      btn: document.getElementById('tabBtnShield') as HTMLButtonElement,
      content: document.getElementById('tabContentShield') as HTMLElement,
      onOpen: async () => {
        await shieldCtrl.updateDisplay();
      },
    },
    vault: {
      btn: document.getElementById('tabBtnVault') as HTMLButtonElement,
      content: document.getElementById('tabContentVault') as HTMLElement,
      onOpen: async () => {
        await vaultCtrl.renderSplitView();
      },
    },
    settings: {
      btn: document.getElementById('tabBtnSettings') as HTMLButtonElement,
      content: document.getElementById('tabContentSettings') as HTMLElement,
      onOpen: async () => {
        await settingsCtrl.renderWhitelist();
      },
    },
  };

  shieldCtrl = new ShieldTabController(showToast, () => setActiveTab('vault'));
  vaultCtrl = new VaultTabController(showToast, () => shieldCtrl.updateDisplay());
  settingsCtrl = new SettingsTabController(showToast, () => shieldCtrl.updateDisplay());

  tabs.shield.btn.addEventListener('click', () => setActiveTab('shield'));
  tabs.vault.btn.addEventListener('click', () => setActiveTab('vault'));
  tabs.settings.btn.addEventListener('click', () => setActiveTab('settings'));

  // За замовчуванням відкриваємо розділ ЗАХИСТУ САЙТУ
  await setActiveTab('shield');
});
