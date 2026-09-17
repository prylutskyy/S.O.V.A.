import { UserWhitelistManager } from '../../../src/core/user-whitelist';

export class WhitelistTabController {
  private currentHostLabel: HTMLElement;
  private btnToggleCurrent: HTMLButtonElement;
  private whitelistTitle: HTMLElement;
  private whitelistUl: HTMLUListElement;
  private manualHostInput: HTMLInputElement;
  private btnAddManual: HTMLButtonElement;
  private btnClearAllWhitelist: HTMLButtonElement;
  private currentTabHost: string = '';
  private showToast: (msg: string) => void;

  constructor(showToast: (msg: string) => void) {
    this.showToast = showToast;
    this.currentHostLabel = document.getElementById('currentHostLabel') as HTMLElement;
    this.btnToggleCurrent = document.getElementById('btnToggleCurrent') as HTMLButtonElement;
    this.whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
    this.whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    this.manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
    this.btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
    this.btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

    this.bindEvents();
    this.resolveCurrentTabHost();
  }

  private cleanDomain(raw: string): string {
    let d = raw.trim().toLowerCase();
    try {
      if (d.includes('://')) {
        d = new URL(d).hostname;
      } else if (d.includes('/')) {
        d = d.split('/')[0];
      }
    } catch {}
    return d.replace(/^www\./, '');
  }

  private async resolveCurrentTabHost(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          try {
            const url = new URL(tab.url);
            if (url.protocol.startsWith('http')) {
              this.currentTabHost = url.hostname.toLowerCase().replace(/^www\./, '');
            } else if (url.protocol === 'file:') {
              this.currentTabHost = 'local-file (demo.html)';
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error('Tabs query error:', e);
    }
  }

  public async renderWhitelist(): Promise<void> {
    const domains = await UserWhitelistManager.getDomains();
    this.whitelistTitle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <span>Довірені сайти (${domains.length})</span>
    `;

    this.whitelistUl.innerHTML = '';
    if (domains.length === 0) {
      this.whitelistUl.innerHTML =
        '<li class="list-entry" style="justify-content: center; color: var(--fx-text-muted);">Немає доданих сайтів</li>';
    } else {
      domains.sort().forEach((domain) => {
        const li = document.createElement('li');
        li.className = 'list-entry';
        li.innerHTML = `
          <span style="font-weight: 500; color: var(--fx-text);">${domain}</span>
          <button type="button" class="btn-remove" title="Видалити зі списку">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;

        const btnRemove = li.querySelector('.btn-remove');
        btnRemove?.addEventListener('click', async () => {
          await UserWhitelistManager.removeDomain(domain);
          this.showToast(`Видалено: ${domain}`);
          await this.renderWhitelist();
          this.updateCurrentTabState();
        });

        this.whitelistUl.appendChild(li);
      });
    }
  }

  public async updateCurrentTabState(): Promise<void> {
    if (!this.currentTabHost) {
      this.currentHostLabel.innerText = 'Немає активної сторінки';
      this.btnToggleCurrent.style.display = 'none';
      return;
    }

    this.currentHostLabel.innerText = this.currentTabHost;
    const isAllowed = UserWhitelistManager.isDomainAllowedSync(this.currentTabHost);

    this.btnToggleCurrent.style.display = 'inline-flex';
    if (isAllowed) {
      this.btnToggleCurrent.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Прибрати з довірених';
      this.btnToggleCurrent.className = 'btn-danger';
    } else {
      this.btnToggleCurrent.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px"><polyline points="20 6 9 17 4 12"/></svg> Довіряти';
      this.btnToggleCurrent.className = 'btn-primary';
    }
  }

  private bindEvents(): void {
    this.btnToggleCurrent.addEventListener('click', async () => {
      if (!this.currentTabHost || this.currentTabHost.startsWith('local-file')) return;

      const isAllowed = UserWhitelistManager.isDomainAllowedSync(this.currentTabHost);
      if (isAllowed) {
        await UserWhitelistManager.removeDomain(this.currentTabHost);
        this.showToast(`Видалено: ${this.currentTabHost}`);
      } else {
        await UserWhitelistManager.allowDomain(this.currentTabHost);
        this.showToast(`Додано до довірених: ${this.currentTabHost}`);
      }
      await this.renderWhitelist();
      this.updateCurrentTabState();
    });

    this.btnAddManual.addEventListener('click', async () => {
      const rawVal = this.manualHostInput.value;
      const domain = this.cleanDomain(rawVal);
      if (!domain || domain.length < 3) {
        alert('Будь ласка, введіть коректну адресу сайту (наприклад: myshop.ua)');
        return;
      }

      await UserWhitelistManager.allowDomain(domain);
      this.manualHostInput.value = '';
      this.showToast(`Додано домен: ${domain}`);
      await this.renderWhitelist();
      this.updateCurrentTabState();
    });

    this.manualHostInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnAddManual.click();
      }
    });

    this.btnClearAllWhitelist.addEventListener('click', async () => {
      if (confirm('Очистити всі додані домени зі списку довірених?')) {
        await UserWhitelistManager.clearAll();
        this.showToast('Список довірених сайтів очищено');
        await this.renderWhitelist();
        this.updateCurrentTabState();
      }
    });
  }
}
