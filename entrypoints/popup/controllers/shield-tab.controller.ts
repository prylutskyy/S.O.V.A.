import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

export class ShieldTabController {
  private currentSiteDomain: HTMLElement;
  private currentSiteStatus: HTMLElement;
  private currentSiteToggle: HTMLInputElement;
  private siteIconBox: HTMLElement;
  private currentSiteCard: HTMLElement;
  private globalStatusPill: HTMLElement;
  private globalStatusText: HTMLElement;

  private taintedBanner: HTMLElement;
  private taintedDescText: HTMLElement;
  private btnResetContextHome: HTMLButtonElement;

  private vaultProtectionDesc: HTMLElement;
  private vaultStatusPill: HTMLElement;
  private moduleVaultItem: HTMLElement;

  private homeAiPill: HTMLElement;
  private homeAiSubtext: HTMLElement;

  private currentTabHost: string = '';
  private currentTabId: number | null = null;
  private showToast: (msg: string) => void;
  private onNavigateToVault: () => void;

  constructor(showToast: (msg: string) => void, onNavigateToVault: () => void) {
    this.showToast = showToast;
    this.onNavigateToVault = onNavigateToVault;

    this.currentSiteDomain = document.getElementById('currentSiteDomain') as HTMLElement;
    this.currentSiteStatus = document.getElementById('currentSiteStatus') as HTMLElement;
    this.currentSiteToggle = document.getElementById('currentSiteToggle') as HTMLInputElement;
    this.siteIconBox = document.getElementById('siteIconBox') as HTMLElement;
    this.currentSiteCard = document.getElementById('currentSiteCard') as HTMLElement;
    this.globalStatusPill = document.getElementById('globalStatusPill') as HTMLElement;
    this.globalStatusText = document.getElementById('globalStatusText') as HTMLElement;

    this.taintedBanner = document.getElementById('taintedBanner') as HTMLElement;
    this.taintedDescText = document.getElementById('taintedDescText') as HTMLElement;
    this.btnResetContextHome = document.getElementById('btnResetContextHome') as HTMLButtonElement;

    this.vaultProtectionDesc = document.getElementById('vaultProtectionDesc') as HTMLElement;
    this.vaultStatusPill = document.getElementById('vaultStatusPill') as HTMLElement;
    this.moduleVaultItem = document.getElementById('moduleVaultItem') as HTMLElement;

    this.homeAiPill = document.getElementById('homeAiPill') as HTMLElement;
    this.homeAiSubtext = document.getElementById('homeAiSubtext') as HTMLElement;

    this.bindEvents();
    this.resolveCurrentTab();
  }

  private async resolveCurrentTab(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          this.currentTabId = tab.id || null;
          if (tab.url) {
            try {
              const url = new URL(tab.url);
              if (url.protocol.startsWith('http')) {
                this.currentTabHost = url.hostname.toLowerCase().replace(/^www\./, '');
              } else if (url.protocol === 'file:') {
                this.currentTabHost = 'local-file (демо-сторінка)';
              } else {
                this.currentTabHost = url.protocol;
              }
            } catch {
              this.currentTabHost = 'Внутрішня вкладка';
            }
          }
        }
      }
    } catch (e) {
      console.error('Error resolving current tab:', e);
    }
  }

  public async updateDisplay(): Promise<void> {
    await this.resolveCurrentTab();
    this.updateSiteCard();
    await this.checkTaintedContext();
    await this.updateVaultStatus();
    this.checkAiStatus();
  }

  private updateSiteCard(): void {
    if (!this.currentTabHost) {
      this.currentSiteDomain.innerText = 'Немає активного сайту';
      this.currentSiteStatus.innerText = 'Відкрийте вкладку для моніторингу';
      this.currentSiteStatus.className = 'site-status-text';
      this.currentSiteToggle.disabled = true;
      return;
    }

    this.currentSiteDomain.innerText = this.currentTabHost;
    this.currentSiteToggle.disabled = false;

    const isWhitelisted = UserWhitelistManager.isDomainAllowedSync(this.currentTabHost);

    if (isWhitelisted) {
      // Захист вимкнено користувачем (сайт у довірених)
      this.currentSiteToggle.checked = false;
      this.currentSiteCard.classList.add('whitelisted');
      this.siteIconBox.className = 'site-icon-box paused';
      this.currentSiteStatus.innerHTML = `<span>Довірений сайт · Захист призупинено</span>`;
      this.currentSiteStatus.className = 'site-status-text amber';

      this.globalStatusPill.className = 'status-pill paused';
      this.globalStatusText.innerText = 'Призупинено';
    } else {
      // Захист активно діє
      this.currentSiteToggle.checked = true;
      this.currentSiteCard.classList.remove('whitelisted');
      this.siteIconBox.className = 'site-icon-box active';
      this.currentSiteStatus.innerHTML = `<span>Захист увімкнено для цього сайту</span>`;
      this.currentSiteStatus.className = 'site-status-text green';

      this.globalStatusPill.className = 'status-pill active';
      this.globalStatusText.innerText = 'Захищено';
    }
  }

  private async checkTaintedContext(): Promise<void> {
    if (!this.currentTabId || typeof chrome === 'undefined' || !chrome.runtime) {
      this.taintedBanner.style.display = 'none';
      return;
    }

    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_ACTIVE_CONTEXT', tabId: this.currentTabId },
          (response) => resolve(response)
        );
      });

      if (res && res.context) {
        this.taintedBanner.style.display = 'flex';
        const source = res.context.sourcePlatform || 'маркетплейсу';
        this.taintedDescText.innerText = `Зафіксовано спробу виведення на сторонній ресурс із чату ${source}. Скринінг форм максимально посилено.`;
      } else {
        this.taintedBanner.style.display = 'none';
      }
    } catch {
      this.taintedBanner.style.display = 'none';
    }
  }

  private async updateVaultStatus(): Promise<void> {
    const isLocked = PersonalVaultManager.isLocked();
    const items = await PersonalVaultManager.getItems();
    const activeCount = items.filter((i) => i.enabled !== false && Boolean(i.realValue)).length;

    if (isLocked) {
      this.vaultProtectionDesc.innerText = 'Сховище заблоковано (введіть пароль)';
      this.vaultStatusPill.innerText = 'Заблоковано';
      this.vaultStatusPill.className = 'module-pill amber';
    } else {
      this.vaultProtectionDesc.innerText = `${activeCount} активних маркерів налаштовано`;
      this.vaultStatusPill.innerText = activeCount > 0 ? 'Захищено' : '0 маркерів';
      this.vaultStatusPill.className = activeCount > 0 ? 'module-pill green' : 'module-pill blue';
    }
  }

  private checkAiStatus(): void {
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
    const hasAI =
      typeof (globalObj as any).LanguageModel !== 'undefined' ||
      (typeof (globalObj as any).ai !== 'undefined' && (globalObj as any).ai.languageModel);

    if (hasAI) {
      this.homeAiPill.innerText = 'Готово';
      this.homeAiPill.className = 'module-pill green';
      this.homeAiSubtext.innerText = 'Вбудована модель готова до роботи';
    } else {
      this.homeAiPill.innerText = 'Евристика';
      this.homeAiPill.className = 'module-pill blue';
      this.homeAiSubtext.innerText = 'Евристичний та семантичний NLP аналіз';
    }
  }

  private bindEvents(): void {
    // Перемикач захисту поточного домену (Firefox Protections Style)
    this.currentSiteToggle.addEventListener('change', async () => {
      if (!this.currentTabHost || this.currentTabHost.startsWith('local-file') || this.currentTabHost.includes(' ')) {
        return;
      }

      const shouldProtect = this.currentSiteToggle.checked;
      if (shouldProtect) {
        await UserWhitelistManager.removeDomain(this.currentTabHost);
        this.showToast(`Захист активовано для: ${this.currentTabHost}`);
      } else {
        await UserWhitelistManager.allowDomain(this.currentTabHost);
        this.showToast(`Сайт додано до довірених: ${this.currentTabHost}`);
      }

      this.updateSiteCard();
    });

    // Скидання стану тривоги прямо на головній
    this.btnResetContextHome.addEventListener('click', async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          await chrome.runtime.sendMessage({
            type: 'CLEAR_CONTEXT',
            tabId: this.currentTabId,
          });
        }
      } catch {}
      this.taintedBanner.style.display = 'none';
      this.showToast('Стан підвищеної тривоги скинуто');
    });

    // Клік по рядку Vault DLP веде на вкладку Сховища
    this.moduleVaultItem.addEventListener('click', () => {
      this.onNavigateToVault();
    });
  }
}
