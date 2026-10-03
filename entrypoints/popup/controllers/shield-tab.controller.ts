import { i18n } from '../../../src/core/i18n';
import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../../src/core/personal-vault';

export class ShieldTabController {
  private currentSiteDomain: HTMLElement;
  private currentSiteStatus: HTMLElement;
  private currentSiteToggle: HTMLInputElement;
  private siteIconBox: HTMLElement;
  private currentSiteCard: HTMLElement;

  private taintedBanner: HTMLElement;
  private taintedDescText: HTMLElement;
  private btnResetContextHome: HTMLButtonElement;

  private vaultProtectionDesc: HTMLElement;
  private vaultStatusPill: HTMLElement;
  private moduleVaultItem: HTMLElement;

  private homeAiPill: HTMLElement;
  private homeAiSubtext: HTMLElement;

  private cardProtectionPill: HTMLElement | null;
  private cardProtectionDesc: HTMLElement | null;
  private hiddenFormsPill: HTMLElement | null;
  private hiddenFormsDesc: HTMLElement | null;

  private chainSourceNode: HTMLElement | null;
  private chainTargetNode: HTMLElement | null;

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

    this.cardProtectionPill = document.getElementById('cardProtectionPill');
    this.cardProtectionDesc = document.getElementById('cardProtectionDesc');
    this.hiddenFormsPill = document.getElementById('hiddenFormsPill');
    this.hiddenFormsDesc = document.getElementById('hiddenFormsDesc');

    this.chainSourceNode = document.getElementById('chainSourceNode');
    this.chainTargetNode = document.getElementById('chainTargetNode');

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
                this.currentTabHost = UserWhitelistManager.normalizeDomain(url.hostname);
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
      this.currentSiteDomain.innerText = i18n.getMessage('shieldTabNoSite');
      this.currentSiteStatus.innerText = i18n.getMessage('shieldTabOpenTab');
      this.currentSiteStatus.className = 'site-status-text';
      this.currentSiteToggle.disabled = true;
      return;
    }

    this.currentSiteDomain.innerText = this.currentTabHost;
    this.currentSiteToggle.disabled = false;

    const isWhitelisted = UserWhitelistManager.isDomainAllowedSync(this.currentTabHost);

    if (this.chainTargetNode) {
      this.chainTargetNode.innerText = this.currentTabHost || i18n.getMessage('shieldTabTargetSite');
    }

    // Описи типів захисту однакові і для активного, і для вимкненого захисту
    if (this.cardProtectionDesc) {
      this.cardProtectionDesc.innerText = i18n.getMessage('shieldCardProtDesc');
    }
    if (this.hiddenFormsDesc) {
      this.hiddenFormsDesc.innerText = i18n.getMessage('shieldHiddenFormsDesc');
    }

    if (isWhitelisted) {
      // Захист форм вимкнено користувачем: "Зупинено", інші активні: "Активно"
      this.currentSiteToggle.checked = false;
      this.currentSiteCard.classList.add('whitelisted');
      this.siteIconBox.className = 'living-orb-box paused';
      this.currentSiteStatus.innerHTML = `<span class="status-pulse-dot paused"></span><span>${i18n.getMessage('shieldTabPausedSite')}</span>`;
      this.currentSiteStatus.className = 'site-status amber';

      if (this.cardProtectionPill) {
        this.cardProtectionPill.innerText = i18n.getMessage('shieldTabStatusPaused');
        this.cardProtectionPill.className = 'module-pill amber';
      }

      if (this.hiddenFormsPill) {
        this.hiddenFormsPill.innerText = i18n.getMessage('shieldTabStatusPaused');
        this.hiddenFormsPill.className = 'module-pill amber';
      }
    } else {
      // Повний захист активно діє: всі типи "Активно"
      this.currentSiteToggle.checked = true;
      this.currentSiteCard.classList.remove('whitelisted');
      this.siteIconBox.className = 'living-orb-box active';
      this.currentSiteStatus.innerHTML = `<span class="status-pulse-dot active"></span><span>${i18n.getMessage('shieldTabActiveSite')}</span>`;
      this.currentSiteStatus.className = 'site-status green';

      if (this.cardProtectionPill) {
        this.cardProtectionPill.innerText = i18n.getMessage('shieldTabStatusActive');
        this.cardProtectionPill.className = 'module-pill green';
      }

      if (this.hiddenFormsPill) {
        this.hiddenFormsPill.innerText = i18n.getMessage('shieldTabStatusActive');
        this.hiddenFormsPill.className = 'module-pill green';
      }
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
        this.taintedDescText.innerText = i18n.getMessage('shieldTabDescThreat', [source]);
        if (this.chainSourceNode) {
          this.chainSourceNode.innerText = i18n.getMessage('shieldTabSourceChat', [source]);
        }
      } else {
        this.taintedBanner.style.display = 'none';
        if (this.chainSourceNode) {
          this.chainSourceNode.innerText = i18n.getMessage('shieldTabLegitSource');
        }
      }
    } catch {
      this.taintedBanner.style.display = 'none';
    }
  }

  private async updateVaultStatus(): Promise<void> {
    const isOperational = PersonalVaultManager.hasOperationalProtection();

    this.vaultProtectionDesc.innerText = i18n.getMessage('shieldVaultProtDesc');

    if (isOperational) {
      this.vaultStatusPill.innerText = i18n.getMessage('shieldTabStatusActive');
      this.vaultStatusPill.className = 'module-pill green';
    } else {
      this.vaultStatusPill.innerText = i18n.getMessage('shieldTabStatusPaused');
      this.vaultStatusPill.className = 'module-pill amber';
    }
  }


  private checkAiStatus(): void {
    if (this.homeAiPill) {
      this.homeAiPill.innerText = i18n.getMessage('shieldTabStatusActive');
      this.homeAiPill.className = 'module-pill green';
    }
    if (this.homeAiSubtext) {
      this.homeAiSubtext.innerText = i18n.getMessage('shieldAiDesc');
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
        this.showToast(`Захист увімкнено для: ${this.currentTabHost}`);
      } else {
        await UserWhitelistManager.allowDomain(this.currentTabHost);
        this.showToast(`Сайт додано до винятків: ${this.currentTabHost}`);
      }

      this.updateSiteCard();
      await this.updateVaultStatus();
      this.checkAiStatus();
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

    // Реактивне оновлення інтерфейсу при зміні/очищенні контексту загрози через ШІ чи іншу вкладку
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'CONTEXT_CLEARED') {
          this.taintedBanner.style.display = 'none';
          if (this.chainSourceNode) {
            this.chainSourceNode.innerText = i18n.getMessage('shieldTabLegitSource');
          }
        } else if (msg?.type === 'CONTEXT_UPDATED') {
          this.checkTaintedContext();
        }
      });
    }
  }
}
