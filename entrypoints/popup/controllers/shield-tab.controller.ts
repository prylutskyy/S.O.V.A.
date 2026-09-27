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

  private btnToggleForensicLoupe: HTMLButtonElement | null;
  private forensicLoupePanel: HTMLElement | null;
  private btnCloseLoupe: HTMLButtonElement | null;
  private loupeScoreVal: HTMLElement | null;
  private loupeAiStatus: HTMLElement | null;
  private loupeDomStatus: HTMLElement | null;
  private loupeConsoleLine: HTMLElement | null;
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
    this.globalStatusPill = document.getElementById('globalStatusPill') as HTMLElement;
    this.globalStatusText = document.getElementById('globalStatusText') as HTMLElement;

    this.btnToggleForensicLoupe = document.getElementById('btnToggleForensicLoupe') as HTMLButtonElement | null;
    this.forensicLoupePanel = document.getElementById('forensicLoupePanel');
    this.btnCloseLoupe = document.getElementById('btnCloseLoupe') as HTMLButtonElement | null;
    this.loupeScoreVal = document.getElementById('loupeScoreVal');
    this.loupeAiStatus = document.getElementById('loupeAiStatus');
    this.loupeDomStatus = document.getElementById('loupeDomStatus');
    this.loupeConsoleLine = document.getElementById('loupeConsoleLine');
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

    if (this.chainTargetNode) {
      this.chainTargetNode.innerText = this.currentTabHost || 'Цільовий сайт';
    }

    if (isWhitelisted) {
      // Захист вимкнено користувачем (сайт у довірених)
      this.currentSiteToggle.checked = false;
      this.currentSiteCard.classList.add('whitelisted');
      this.siteIconBox.className = 'living-orb-box paused';
      this.currentSiteStatus.innerHTML = `<span class="status-pulse-dot paused"></span><span>Довірений сайт · Захист призупинено</span>`;
      this.currentSiteStatus.className = 'site-status amber';

      this.globalStatusPill.className = 'status-pill paused';
      this.globalStatusText.innerText = 'Призупинено';
    } else {
      // Захист активно діє
      this.currentSiteToggle.checked = true;
      this.currentSiteCard.classList.remove('whitelisted');
      this.siteIconBox.className = 'living-orb-box active';
      this.currentSiteStatus.innerHTML = `<span class="status-pulse-dot active"></span><span>Захист увімкнено для цього сайту</span>`;
      this.currentSiteStatus.className = 'site-status green';

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
        if (this.chainSourceNode) {
          this.chainSourceNode.innerText = `Чат ${source}`;
        }
        if (this.loupeScoreVal) {
          this.loupeScoreVal.innerText = `Score = ${res.context.threatLevel === 'HIGH' ? '75' : '45'}/100`;
          this.loupeScoreVal.className = 'loupe-cell-val amber';
        }
        if (this.loupeConsoleLine) {
          this.loupeConsoleLine.innerText = `[Tainted Context] Виявлено сесійне зміщення з ${source} ➔ ${this.currentTabHost}. Детекція форм у режимі High Friction.`;
        }
      } else {
        this.taintedBanner.style.display = 'none';
        if (this.chainSourceNode) {
          this.chainSourceNode.innerText = 'Легітимне джерело';
        }
        if (this.loupeScoreVal) {
          this.loupeScoreVal.innerText = 'Score = 0/100';
          this.loupeScoreVal.className = 'loupe-cell-val green';
        }
        if (this.loupeConsoleLine) {
          this.loupeConsoleLine.innerText = 'Евристичний конвеєр активний. Зшивання контексту під контролем ContextManager.';
        }
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
      if (this.loupeAiStatus) {
        this.loupeAiStatus.innerText = 'Nano (~140ms)';
        this.loupeAiStatus.className = 'loupe-cell-val green';
      }
    } else {
      this.homeAiPill.innerText = 'Евристика';
      this.homeAiPill.className = 'module-pill blue';
      this.homeAiSubtext.innerText = 'Евристичний та семантичний NLP аналіз';
      if (this.loupeAiStatus) {
        this.loupeAiStatus.innerText = 'Евристика NLP';
        this.loupeAiStatus.className = 'loupe-cell-val blue';
      }
    }
  }

  private bindEvents(): void {
    // Перемикач Швейцарської Лупи (режим телеметрії дипломного захисту)
    if (this.btnToggleForensicLoupe && this.forensicLoupePanel) {
      this.btnToggleForensicLoupe.addEventListener('click', () => {
        const isCurrentlyHidden = this.forensicLoupePanel?.style.display === 'none';
        if (this.forensicLoupePanel) {
          this.forensicLoupePanel.style.display = isCurrentlyHidden ? 'flex' : 'none';
          this.forensicLoupePanel.hidden = !isCurrentlyHidden;
        }
        this.btnToggleForensicLoupe?.classList.toggle('active', isCurrentlyHidden);
        if (isCurrentlyHidden) {
          this.showToast('Швейцарська Лупа: Телеметрія активна');
        }
      });
    }

    if (this.btnCloseLoupe && this.forensicLoupePanel) {
      this.btnCloseLoupe.addEventListener('click', () => {
        if (this.forensicLoupePanel) {
          this.forensicLoupePanel.style.display = 'none';
          this.forensicLoupePanel.hidden = true;
        }
        this.btnToggleForensicLoupe?.classList.remove('active');
      });
    }

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
