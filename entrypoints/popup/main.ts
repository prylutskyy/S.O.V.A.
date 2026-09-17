import { UserWhitelistManager } from '../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../src/core/personal-vault';
import { StatsTabController } from './controllers/stats-tab.controller';
import { VaultTabController } from './controllers/vault-tab.controller';
import { WhitelistTabController } from './controllers/whitelist-tab.controller';
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
  const statsCtrl = new StatsTabController();
  const vaultCtrl = new VaultTabController(showToast, () => statsCtrl.updateDisplay());
  const whitelistCtrl = new WhitelistTabController(showToast);
  new SettingsTabController(showToast);

  // 3. Навігація між вкладками
  const tabs = {
    stats: {
      btn: document.getElementById('tabBtnStats') as HTMLButtonElement,
      content: document.getElementById('tabContentStats') as HTMLElement,
      onOpen: () => statsCtrl.updateDisplay(),
    },
    vault: {
      btn: document.getElementById('tabBtnVault') as HTMLButtonElement,
      content: document.getElementById('tabContentVault') as HTMLElement,
      onOpen: () => vaultCtrl.renderSplitView(),
    },
    whitelist: {
      btn: document.getElementById('tabBtnWhitelist') as HTMLButtonElement,
      content: document.getElementById('tabContentWhitelist') as HTMLElement,
      onOpen: async () => {
        await whitelistCtrl.renderWhitelist();
        await whitelistCtrl.updateCurrentTabState();
      },
    },
    settings: {
      btn: document.getElementById('tabBtnSettings') as HTMLButtonElement,
      content: document.getElementById('tabContentSettings') as HTMLElement,
      onOpen: () => {},
    },
  };

  type TabName = keyof typeof tabs;

  const setActiveTab = async (name: TabName) => {
    for (const [key, tab] of Object.entries(tabs)) {
      const isActive = key === name;
      tab.btn.classList.toggle('active', isActive);
      tab.content.style.display = isActive ? 'flex' : 'none';
    }
    await tabs[name].onOpen();
  };

  tabs.stats.btn.addEventListener('click', () => setActiveTab('stats'));
  tabs.vault.btn.addEventListener('click', () => setActiveTab('vault'));
  tabs.whitelist.btn.addEventListener('click', () => setActiveTab('whitelist'));
  tabs.settings.btn.addEventListener('click', () => setActiveTab('settings'));

  // За замовчуванням відкриваємо розділ СТАТИСТИКИ
  await setActiveTab('stats');
});
