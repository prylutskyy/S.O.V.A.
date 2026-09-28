import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { SecureKeyStore, LLMProviderType } from '../../../src/core/secure-key-store';

export class SettingsTabController {
  private whitelistTitle: HTMLElement;
  private whitelistUl: HTMLUListElement;
  private manualHostInput: HTMLInputElement;
  private btnAddManual: HTMLButtonElement;
  private btnClearAllWhitelist: HTMLButtonElement;

  private aiStatusText: HTMLElement;
  private toggleDebugMode: HTMLInputElement;
  private showToast: (msg: string) => void;
  private onWhitelistChanged: () => void;

  // Cloud AI Controls
  private toggleCloudAi: HTMLInputElement | null;
  private cloudAiProviderSelect: HTMLSelectElement | null;
  private cloudAiKeyInput: HTMLInputElement | null;
  private btnSaveCloudAiKey: HTMLButtonElement | null;
  private cloudAiKeyHint: HTMLElement | null;

  constructor(showToast: (msg: string) => void, onWhitelistChanged: () => void) {
    this.showToast = showToast;
    this.onWhitelistChanged = onWhitelistChanged;

    this.whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
    this.whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    this.manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
    this.btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
    this.btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

    this.aiStatusText = document.getElementById('aiStatusText') as HTMLElement;
    this.toggleDebugMode = document.getElementById('toggleDebugMode') as HTMLInputElement;

    this.toggleCloudAi = document.getElementById('toggleCloudAi') as HTMLInputElement | null;
    this.cloudAiProviderSelect = document.getElementById('cloudAiProviderSelect') as HTMLSelectElement | null;
    this.cloudAiKeyInput = document.getElementById('cloudAiKeyInput') as HTMLInputElement | null;
    this.btnSaveCloudAiKey = document.getElementById('btnSaveCloudAiKey') as HTMLButtonElement | null;
    this.cloudAiKeyHint = document.getElementById('cloudAiKeyHint') as HTMLElement | null;

    this.initDebugMode();
    this.checkAI();
    this.initCloudAI();
    this.bindEvents();
  }

  private cleanDomain(raw: string): string {
    return UserWhitelistManager.normalizeDomain(raw);
  }

  public async renderWhitelist(): Promise<void> {
    const domains = await UserWhitelistManager.getDomains();
    if (this.whitelistTitle) {
      this.whitelistTitle.innerText = `Довірені сайти (${domains.length})`;
    }

    if (!this.whitelistUl) return;
    this.whitelistUl.innerHTML = '';

    if (domains.length === 0) {
      this.whitelistUl.innerHTML =
        '<li class="list-entry" style="justify-content:center; color:var(--sanctuary-ink-tertiary);">Немає доданих сайтів</li>';
      return;
    }

    domains.sort().forEach((domain) => {
      const li = document.createElement('li');
      li.className = 'list-entry';
      li.innerHTML = `
        <span style="font-weight:500; color:var(--sanctuary-ink-primary);">${domain}</span>
        <button type="button" class="btn-remove" title="Видалити зі списку">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      const btnRemove = li.querySelector('.btn-remove');
      btnRemove?.addEventListener('click', async () => {
        await UserWhitelistManager.removeDomain(domain);
        this.showToast(`Видалено: ${domain}`);
        await this.renderWhitelist();
        this.onWhitelistChanged();
      });

      this.whitelistUl.appendChild(li);
    });
  }

  private initDebugMode(): void {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['debugModeEnabled'], (res) => {
        if (this.toggleDebugMode) {
          this.toggleDebugMode.checked = !!res.debugModeEnabled;
        }
      });
      this.toggleDebugMode?.addEventListener('change', (e) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        chrome.storage.local.set({ debugModeEnabled: isChecked });
        this.showToast(isChecked ? 'Дебагер активовано на сторінках' : 'Дебагер вимкнено');
      });
    }
  }

  private async checkAI(): Promise<void> {
    if (!this.aiStatusText) return;

    let provider: any = null;
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof (globalObj as any).LanguageModel !== 'undefined') provider = (globalObj as any).LanguageModel;
    else if (typeof (globalObj as any).ai !== 'undefined' && (globalObj as any).ai.languageModel) {
      provider = (globalObj as any).ai.languageModel;
    }

    if (provider) {
      try {
        if (typeof provider.capabilities === 'function') {
          const caps = await provider.capabilities();
          this.aiStatusText.textContent =
            caps?.available === 'no'
              ? 'Підтримується, але модель ще завантажується'
              : 'Активно (Локальна модель готова)';
          this.aiStatusText.style.color = caps?.available === 'no' ? 'var(--sanctuary-amber-ink)' : 'var(--sanctuary-green-ink)';
        } else if (typeof provider.create === 'function') {
          this.aiStatusText.textContent = 'Активно (Локальна модель готова)';
          this.aiStatusText.style.color = 'var(--sanctuary-green-ink)';
        } else {
          throw new Error('No create method');
        }
      } catch {
        this.aiStatusText.textContent = 'Доступно для Prompt API';
        this.aiStatusText.style.color = 'var(--sanctuary-green-ink)';
      }
    } else {
      this.aiStatusText.textContent = 'Евристичний режим (Вбудований ШІ не знайдено)';
      this.aiStatusText.style.color = 'var(--sanctuary-amber-ink)';
    }
  }

  private async initCloudAI(): Promise<void> {
    const config = await SecureKeyStore.getConfig();

    if (this.toggleCloudAi) {
      this.toggleCloudAi.checked = config.enabled;
    }

    if (this.cloudAiProviderSelect) {
      this.cloudAiProviderSelect.value = config.provider;
    }

    await this.updateKeyHint();
  }

  private async updateKeyHint(): Promise<void> {
    if (!this.cloudAiKeyHint || !this.cloudAiProviderSelect) return;
    const provider = this.cloudAiProviderSelect.value as LLMProviderType;
    const hint = await SecureKeyStore.getKeyHint(provider);
    if (hint) {
      this.cloudAiKeyHint.textContent = `Збережено: ${hint}`;
      this.cloudAiKeyHint.style.display = 'inline';
    } else {
      this.cloudAiKeyHint.textContent = 'Ключ не встановлено';
      this.cloudAiKeyHint.style.display = 'inline';
    }
  }

  private bindEvents(): void {
    // Cloud AI Switch
    this.toggleCloudAi?.addEventListener('change', async (e) => {
      const isEnabled = (e.target as HTMLInputElement).checked;
      await SecureKeyStore.saveConfig({ enabled: isEnabled });
      this.showToast(isEnabled ? 'Хмарний ШІ арбітр активовано' : 'Хмарний ШІ вимкнено');
    });

    // Cloud AI Provider Change
    this.cloudAiProviderSelect?.addEventListener('change', async (e) => {
      const provider = (e.target as HTMLSelectElement).value as LLMProviderType;
      let model = 'gemini-2.5-flash';
      if (provider === 'groq') model = 'llama-3.3-70b-versatile';
      if (provider === 'openai') model = 'gpt-4o-mini';

      await SecureKeyStore.saveConfig({ provider, model });
      await this.updateKeyHint();
      if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
      this.showToast(`Обрано провайдер: ${provider.toUpperCase()}`);
    });

    // Save Cloud AI Key
    this.btnSaveCloudAiKey?.addEventListener('click', async () => {
      const val = this.cloudAiKeyInput?.value?.trim() || '';
      if (!val) {
        alert('Будь ласка, введіть API ключ');
        return;
      }

      const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
      try {
        await SecureKeyStore.saveApiKey(provider, val, 'device_encrypted');
        if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
        await this.updateKeyHint();
        this.showToast(`Ключ ${provider.toUpperCase()} зашифровано та збережено`);
      } catch (err: any) {
        alert(`Помилка збереження ключа: ${err?.message || err}`);
      }
    });

    this.btnAddManual?.addEventListener('click', async () => {
      const rawVal = this.manualHostInput.value;
      const domain = this.cleanDomain(rawVal);
      if (!domain || domain.length < 3) {
        alert('Будь ласка, введіть коректну адресу сайту (наприклад: myshop.ua)');
        return;
      }

      await UserWhitelistManager.allowDomain(domain);
      this.manualHostInput.value = '';
      this.showToast(`Додано до довірених: ${domain}`);
      await this.renderWhitelist();
      this.onWhitelistChanged();
    });

    this.manualHostInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnAddManual.click();
      }
    });

    this.btnClearAllWhitelist?.addEventListener('click', async () => {
      if (confirm('Видалити всі сайти зі списку довірених?')) {
        await UserWhitelistManager.clearAll();
        this.showToast('Список довірених сайтів очищено');
        await this.renderWhitelist();
        this.onWhitelistChanged();
      }
    });
  }
}
