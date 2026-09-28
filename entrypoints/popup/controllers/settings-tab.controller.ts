import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { SecureKeyStore, LLMProviderType } from '../../../src/core/secure-key-store';

export class SettingsTabController {
  // Whitelist Controls
  private whitelistTitle: HTMLElement;
  private whitelistUl: HTMLUListElement;
  private manualHostInput: HTMLInputElement;
  private btnAddManual: HTMLButtonElement;
  private btnClearAllWhitelist: HTMLButtonElement;
  private btnToggleManualAdd: HTMLButtonElement | null;
  private manualAddRow: HTMLElement | null;

  private aiStatusText: HTMLElement;
  private toggleDebugMode: HTMLInputElement;
  private showToast: (msg: string) => void;
  private onWhitelistChanged: () => void;

  // Cloud AI Controls
  private toggleCloudAi: HTMLInputElement | null;
  private cloudAiProviderSelect: HTMLSelectElement | null;
  private providerSegmentBtns: NodeListOf<HTMLButtonElement>;
  private cloudAiModelSelect: HTMLSelectElement | null;
  private cloudAiKeyInput: HTMLInputElement | null;
  private btnSaveCloudAiKey: HTMLButtonElement | null;
  private btnSaveCloudAiKeyText: HTMLElement | null;
  private btnTestCloudAiKey: HTMLButtonElement | null;
  private btnDeleteCloudAiKey: HTMLButtonElement | null;
  private btnRefreshModels: HTMLButtonElement | null;
  private customModelInputWrapper: HTMLElement | null;
  private cloudAiCustomModelInput: HTMLInputElement | null;
  private cloudAiKeyHint: HTMLElement | null;
  private cloudAiKeySavedPill: HTMLElement | null;
  private cloudAiKeyNotSet: HTMLElement | null;
  private cloudAiStatusFeedback: HTMLElement | null;
  private cachedDynamicModels: Record<string, Array<{ id: string; label: string }>> = {};

  constructor(showToast: (msg: string) => void, onWhitelistChanged: () => void) {
    this.showToast = showToast;
    this.onWhitelistChanged = onWhitelistChanged;

    this.whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
    this.whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    this.manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
    this.btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
    this.btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;
    this.btnToggleManualAdd = document.getElementById('btnToggleManualAdd') as HTMLButtonElement | null;
    this.manualAddRow = document.getElementById('manualAddRow') as HTMLElement | null;

    this.aiStatusText = document.getElementById('aiStatusText') as HTMLElement;
    this.toggleDebugMode = document.getElementById('toggleDebugMode') as HTMLInputElement;

    this.toggleCloudAi = document.getElementById('toggleCloudAi') as HTMLInputElement | null;
    this.cloudAiProviderSelect = document.getElementById('cloudAiProviderSelect') as HTMLSelectElement | null;
    this.providerSegmentBtns = document.querySelectorAll<HTMLButtonElement>('.provider-segment-btn');
    this.cloudAiModelSelect = document.getElementById('cloudAiModelSelect') as HTMLSelectElement | null;
    this.btnRefreshModels = document.getElementById('btnRefreshModels') as HTMLButtonElement | null;
    this.customModelInputWrapper = document.getElementById('customModelInputWrapper') as HTMLElement | null;
    this.cloudAiCustomModelInput = document.getElementById('cloudAiCustomModelInput') as HTMLInputElement | null;
    this.cloudAiKeyInput = document.getElementById('cloudAiKeyInput') as HTMLInputElement | null;
    this.btnSaveCloudAiKey = document.getElementById('btnSaveCloudAiKey') as HTMLButtonElement | null;
    this.btnSaveCloudAiKeyText = document.getElementById('btnSaveCloudAiKeyText');
    this.btnTestCloudAiKey = document.getElementById('btnTestCloudAiKey') as HTMLButtonElement | null;
    this.btnDeleteCloudAiKey = document.getElementById('btnDeleteCloudAiKey') as HTMLButtonElement | null;
    this.cloudAiKeyHint = document.getElementById('cloudAiKeyHint') as HTMLElement | null;
    this.cloudAiKeySavedPill = document.getElementById('cloudAiKeySavedPill') as HTMLElement | null;
    this.cloudAiKeyNotSet = document.getElementById('cloudAiKeyNotSet') as HTMLElement | null;
    this.cloudAiStatusFeedback = document.getElementById('cloudAiStatusFeedback') as HTMLElement | null;

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
    this.setActiveSegment(config.provider);

    this.populateModelsForProvider(config.provider, config.model);
    await this.updateKeyHint();
  }

  private setActiveSegment(provider: LLMProviderType): void {
    this.providerSegmentBtns.forEach((btn) => {
      const isMatch = btn.dataset.provider === provider;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });
  }

  private getDefaultModelPlaceholder(provider: LLMProviderType): string {
    switch (provider) {
      case 'gemini':
        return 'gemini-2.5-flash';
      case 'groq':
        return 'llama-3.3-70b-versatile';
      case 'openai':
        return 'gpt-4o-mini';
      case 'openrouter':
        return 'google/gemini-2.0-flash-exp:free';
      default:
        return 'default';
    }
  }

  private async handleProviderChange(provider: LLMProviderType): Promise<void> {
    const config = await SecureKeyStore.getConfig();
    const currentModel = config.provider === provider && config.model ? config.model : this.getDefaultModelPlaceholder(provider);
    this.populateModelsForProvider(provider, currentModel);

    await SecureKeyStore.saveConfig({ provider, model: currentModel });
    await this.updateKeyHint();
    if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
    if (this.cloudAiStatusFeedback) this.cloudAiStatusFeedback.style.display = 'none';
    this.showToast(`Провайдер: ${provider.toUpperCase()}`);
  }

  private setSaveButtonState(state: 'idle' | 'loading' | 'success'): void {
    if (!this.btnSaveCloudAiKey) return;
    if (state === 'loading') {
      this.btnSaveCloudAiKey.disabled = true;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Підключення...';
      }
    } else if (state === 'success') {
      this.btnSaveCloudAiKey.disabled = false;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Збережено та підключено';
      }
      setTimeout(() => {
        if (this.btnSaveCloudAiKeyText) {
          this.btnSaveCloudAiKeyText.textContent = 'Зберегти та підключити';
        }
      }, 3000);
    } else {
      this.btnSaveCloudAiKey.disabled = false;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Зберегти та підключити';
      }
    }
  }

  private getSelectedModel(): string {
    const selectVal = this.cloudAiModelSelect?.value;
    if (this.cloudAiModelSelect && this.cloudAiModelSelect.style.display !== 'none' && selectVal && selectVal !== '__custom__') {
      return selectVal;
    }

    const customVal = this.cloudAiCustomModelInput?.value?.trim();
    if (customVal) return customVal;

    const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
    return this.getDefaultModelPlaceholder(provider);
  }

  private populateModelsForProvider(provider: LLMProviderType, selectedModel?: string): void {
    if (!this.cloudAiModelSelect) return;
    this.cloudAiModelSelect.innerHTML = '';

    const dynamicModels = this.cachedDynamicModels[provider];

    if (!dynamicModels || dynamicModels.length === 0) {
      // Жодних заготовлених моделей: показуємо текстове поле для ручного введення власної моделі
      this.cloudAiModelSelect.style.display = 'none';
      if (this.customModelInputWrapper) {
        this.customModelInputWrapper.style.display = 'block';
        this.customModelInputWrapper.style.marginTop = '0';
      }
      if (this.cloudAiCustomModelInput) {
        this.cloudAiCustomModelInput.placeholder = `Введіть назву моделі (напр., ${this.getDefaultModelPlaceholder(provider)})...`;
        this.cloudAiCustomModelInput.value = selectedModel || '';
      }
      return;
    }

    // Якщо моделі отримано через API — відображаємо випадаючий список актуальних моделей
    this.cloudAiModelSelect.style.display = 'block';
    let matchFound = false;

    dynamicModels.forEach((opt) => {
      const optEl = document.createElement('option');
      optEl.value = opt.id;
      optEl.textContent = opt.label;
      if (selectedModel && opt.id === selectedModel) {
        optEl.selected = true;
        matchFound = true;
      }
      this.cloudAiModelSelect!.appendChild(optEl);
    });

    // Можливість вказати іншу модель вручну
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Вказати іншу модель вручну...';
    this.cloudAiModelSelect.appendChild(customOpt);

    if (selectedModel && !matchFound) {
      customOpt.selected = true;
      if (this.customModelInputWrapper) {
        this.customModelInputWrapper.style.display = 'block';
        this.customModelInputWrapper.style.marginTop = '6px';
      }
      if (this.cloudAiCustomModelInput) this.cloudAiCustomModelInput.value = selectedModel;
    } else {
      if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'none';
      if (this.cloudAiCustomModelInput && !matchFound) this.cloudAiCustomModelInput.value = '';
    }
  }

  private async refreshModelsFromApi(): Promise<void> {
    const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
    const apiKey = (this.cloudAiKeyInput?.value?.trim()) || (await SecureKeyStore.getApiKey(provider));

    if (!apiKey) {
      this.showFeedback('Введіть або збережіть API ключ перед оновленням каталогу моделей', false);
      return;
    }

    if (this.btnRefreshModels) {
      this.btnRefreshModels.disabled = true;
      this.btnRefreshModels.classList.add('is-loading');
    }
    this.showFeedback(`Запит актуальних моделей через ${provider.toUpperCase()} API...`, true);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'FETCH_CLOUD_MODELS',
        payload: { provider, apiKey },
      });

      if (resp && resp.success && Array.isArray(resp.models) && resp.models.length > 0) {
        this.cachedDynamicModels[provider] = resp.models;
        const currentModel = this.getSelectedModel();
        this.populateModelsForProvider(provider, currentModel);
        this.showFeedback(`Отримано ${resp.models.length} актуальних моделей від ${provider.toUpperCase()}`, true);
        this.showToast(`Оновлено каталог: ${resp.models.length} моделей`);
      } else {
        this.showFeedback(`Помилка оновлення каталогу: ${resp?.error || 'Не вдалося отримати список'}`, false);
      }
    } catch (err: any) {
      this.showFeedback(`Помилка запиту моделей: ${err?.message || err}`, false);
    } finally {
      if (this.btnRefreshModels) {
        this.btnRefreshModels.disabled = false;
        this.btnRefreshModels.classList.remove('is-loading');
      }
    }
  }

  private async updateKeyHint(): Promise<void> {
    if (!this.cloudAiProviderSelect) return;
    const provider = this.cloudAiProviderSelect.value as LLMProviderType;
    const hint = await SecureKeyStore.getKeyHint(provider);
    if (hint) {
      if (this.cloudAiKeyHint) this.cloudAiKeyHint.textContent = hint;
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.style.display = 'inline-flex';
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.style.display = 'none';
      if (this.cloudAiKeyInput) this.cloudAiKeyInput.placeholder = 'Введіть новий ключ для заміни...';
    } else {
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.style.display = 'none';
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.style.display = 'inline-flex';
      if (this.cloudAiKeyInput) this.cloudAiKeyInput.placeholder = 'Вставте API ключ...';
    }
  }

  private showFeedback(text: string, isSuccess: boolean): void {
    if (!this.cloudAiStatusFeedback) return;
    this.cloudAiStatusFeedback.style.display = 'block';
    this.cloudAiStatusFeedback.style.background = isSuccess ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)';
    this.cloudAiStatusFeedback.style.color = isSuccess ? 'var(--sanctuary-green-ink)' : 'var(--sanctuary-red-ink)';
    this.cloudAiStatusFeedback.style.border = isSuccess ? '1px solid var(--sanctuary-green-bd)' : '1px solid var(--sanctuary-red-bd)';
    this.cloudAiStatusFeedback.textContent = text;
  }

  private async testConnection(keyOverride?: string): Promise<boolean> {
    const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
    const model = this.getSelectedModel();
    const apiKey = keyOverride || (this.cloudAiKeyInput?.value?.trim()) || (await SecureKeyStore.getApiKey(provider));

    if (!apiKey) {
      this.showFeedback('Введіть або збережіть API ключ перед перевіркою', false);
      return false;
    }

    this.showFeedback(`Перевірка захищеного каналу ${provider.toUpperCase()}...`, true);
    if (this.btnTestCloudAiKey) this.btnTestCloudAiKey.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'TEST_CLOUD_AI',
        payload: { provider, apiKey, model },
      });

      if (resp && resp.success) {
        this.showFeedback(`Зв'язок встановлено успішно · ${resp.modelUsed || model} (${resp.latencyMs || 0} мс)`, true);
        return true;
      } else {
        this.showFeedback(`Помилка API: ${resp?.error || 'Невідома помилка підключення'}`, false);
        return false;
      }
    } catch (err: any) {
      this.showFeedback(`Помилка виклику: ${err?.message || err}`, false);
      return false;
    } finally {
      if (this.btnTestCloudAiKey) this.btnTestCloudAiKey.disabled = false;
    }
  }

  private bindEvents(): void {
    // Whitelist Manual Add Toggle
    this.btnToggleManualAdd?.addEventListener('click', () => {
      if (!this.manualAddRow) return;
      const isHidden = this.manualAddRow.style.display === 'none' || !this.manualAddRow.style.display;
      this.manualAddRow.style.display = isHidden ? 'flex' : 'none';
      if (this.btnToggleManualAdd) {
        this.btnToggleManualAdd.textContent = isHidden ? 'Закрити' : '+ Додати';
      }
      if (isHidden) {
        this.manualHostInput?.focus();
      }
    });

    // Refresh Models from Provider API
    this.btnRefreshModels?.addEventListener('click', async () => {
      await this.refreshModelsFromApi();
    });

    // Cloud AI Switch
    this.toggleCloudAi?.addEventListener('change', async (e) => {
      const isEnabled = (e.target as HTMLInputElement).checked;
      const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
      const model = this.getSelectedModel();

      await SecureKeyStore.saveConfig({ enabled: isEnabled, provider, model });
      this.showToast(isEnabled ? 'Хмарний арбітраж активовано' : 'Хмарний арбітраж вимкнено');
    });

    // Provider Segmented Buttons
    this.providerSegmentBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const provider = (btn.dataset.provider as LLMProviderType) || 'gemini';
        this.setActiveSegment(provider);
        if (this.cloudAiProviderSelect) {
          this.cloudAiProviderSelect.value = provider;
        }
        await this.handleProviderChange(provider);
      });
    });

    // Cloud AI Provider Change (native fallback)
    this.cloudAiProviderSelect?.addEventListener('change', async (e) => {
      const provider = (e.target as HTMLSelectElement).value as LLMProviderType;
      this.setActiveSegment(provider);
      await this.handleProviderChange(provider);
    });

    // Cloud AI Model Change
    this.cloudAiModelSelect?.addEventListener('change', async (e) => {
      const val = (e.target as HTMLSelectElement).value;
      const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';

      if (val === '__custom__') {
        if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'block';
        this.cloudAiCustomModelInput?.focus();
        const customModel = this.cloudAiCustomModelInput?.value?.trim() || '';
        if (customModel) {
          await SecureKeyStore.saveConfig({ provider, model: customModel });
        }
      } else {
        if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'none';
        await SecureKeyStore.saveConfig({ provider, model: val });
        this.showToast(`Обрано модель: ${val}`);
      }
    });

    // Custom Model Input Change
    const saveCustomModelIfActive = async () => {
      const customModel = this.cloudAiCustomModelInput?.value?.trim();
      const isCustomActive =
        !this.cloudAiModelSelect ||
        this.cloudAiModelSelect.style.display === 'none' ||
        this.cloudAiModelSelect.value === '__custom__';

      if (customModel && isCustomActive) {
        const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
        await SecureKeyStore.saveConfig({ provider, model: customModel });
      }
    };

    this.cloudAiCustomModelInput?.addEventListener('input', saveCustomModelIfActive);
    this.cloudAiCustomModelInput?.addEventListener('change', saveCustomModelIfActive);

    // Save Cloud AI Key & Verify (Unified action)
    const saveKeyAction = async () => {
      const val = this.cloudAiKeyInput?.value?.trim() || '';
      const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
      const model = this.getSelectedModel();

      if (!val) {
        const existingKey = await SecureKeyStore.getApiKey(provider);
        if (existingKey) {
          this.setSaveButtonState('loading');
          this.showToast(`Перевірка зв’язку з ${provider.toUpperCase()}...`);
          const success = await this.testConnection(existingKey);
          this.setSaveButtonState(success ? 'success' : 'idle');
          return;
        }
        this.showFeedback('Введіть API ключ для збереження та підключення', false);
        return;
      }

      this.setSaveButtonState('loading');
      try {
        await SecureKeyStore.saveApiKey(provider, val, 'device_encrypted');
        await SecureKeyStore.saveConfig({ provider, model, enabled: true });
        if (this.toggleCloudAi) this.toggleCloudAi.checked = true;
        await this.updateKeyHint();
        if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
        this.showToast(`Ключ ${provider.toUpperCase()} збережено! Перевірка зв’язку...`);

        // Автоматична верифікація з'єднання
        const success = await this.testConnection(val);
        this.setSaveButtonState(success ? 'success' : 'idle');
      } catch (err: any) {
        this.showFeedback(`Помилка збереження ключа: ${err?.message || err}`, false);
        this.setSaveButtonState('idle');
      }
    };

    this.btnSaveCloudAiKey?.addEventListener('click', saveKeyAction);

    this.cloudAiKeyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveKeyAction();
      }
    });

    // Test Cloud AI Key (fallback)
    this.btnTestCloudAiKey?.addEventListener('click', () => this.testConnection());

    // Delete Cloud AI Key
    this.btnDeleteCloudAiKey?.addEventListener('click', async () => {
      const provider = (this.cloudAiProviderSelect?.value as LLMProviderType) || 'gemini';
      if (confirm(`Видалити збережений ключ для ${provider.toUpperCase()}?`)) {
        await SecureKeyStore.deleteApiKey(provider);
        await this.updateKeyHint();
        if (this.cloudAiStatusFeedback) this.cloudAiStatusFeedback.style.display = 'none';
        this.showToast(`Ключ ${provider.toUpperCase()} видалено`);
      }
    });

    // Add domain to whitelist
    this.btnAddManual?.addEventListener('click', async () => {
      const rawVal = this.manualHostInput.value;
      const domain = this.cleanDomain(rawVal);
      if (!domain || domain.length < 3) {
        alert('Будь ласка, введіть коректну адресу сайту (наприклад: myshop.ua)');
        return;
      }

      await UserWhitelistManager.allowDomain(domain);
      this.manualHostInput.value = '';
      if (this.manualAddRow) this.manualAddRow.style.display = 'none';
      if (this.btnToggleManualAdd) this.btnToggleManualAdd.textContent = '+ Додати';
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
        this.onWhitelistChanged();
      }
    });
  }

  public async refresh(): Promise<void> {
    await this.renderWhitelist();
    await this.initCloudAI();
    await this.checkAI();
  }
}
