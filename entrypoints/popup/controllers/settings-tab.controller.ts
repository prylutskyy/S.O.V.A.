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

  // Cloud AI Controls (Groq Dedicated)
  private toggleCloudAi: HTMLInputElement | null;
  private cloudAiProviderSelect: HTMLSelectElement | null;
  private cloudAiKeySavedPill: HTMLElement | null;
  private cloudAiKeyHint: HTMLElement | null;
  private btnToggleChangeKey: HTMLButtonElement | null;
  private btnDeleteCloudAiKey: HTMLButtonElement | null;
  private cloudAiKeyInputWrapper: HTMLElement | null;
  private cloudAiKeyNotSet: HTMLElement | null;
  private cloudAiKeyInput: HTMLInputElement | null;
  private btnSaveCloudAiKey: HTMLButtonElement | null;
  private btnSaveCloudAiKeyText: HTMLElement | null;
  private cloudAiModelContainer: HTMLElement | null;
  private modelsEmptyState: HTMLElement | null;
  private btnFetchModelsPrimary: HTMLButtonElement | null;
  private modelsLoadedState: HTMLElement | null;
  private btnRefreshModels: HTMLButtonElement | null;
  private cloudAiModelSelect: HTMLSelectElement | null;
  private customModelInputWrapper: HTMLElement | null;
  private cloudAiCustomModelInput: HTMLInputElement | null;
  private cloudAiTestRow: HTMLElement | null;
  private btnTestCloudAiKey: HTMLButtonElement | null;
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
    this.cloudAiKeySavedPill = document.getElementById('cloudAiKeySavedPill') as HTMLElement | null;
    this.cloudAiKeyHint = document.getElementById('cloudAiKeyHint') as HTMLElement | null;
    this.btnToggleChangeKey = document.getElementById('btnToggleChangeKey') as HTMLButtonElement | null;
    this.btnDeleteCloudAiKey = document.getElementById('btnDeleteCloudAiKey') as HTMLButtonElement | null;
    this.cloudAiKeyInputWrapper = document.getElementById('cloudAiKeyInputWrapper') as HTMLElement | null;
    this.cloudAiKeyNotSet = document.getElementById('cloudAiKeyNotSet') as HTMLElement | null;
    this.cloudAiKeyInput = document.getElementById('cloudAiKeyInput') as HTMLInputElement | null;
    this.btnSaveCloudAiKey = document.getElementById('btnSaveCloudAiKey') as HTMLButtonElement | null;
    this.btnSaveCloudAiKeyText = document.getElementById('btnSaveCloudAiKeyText');
    this.cloudAiModelContainer = document.getElementById('cloudAiModelContainer') as HTMLElement | null;
    this.modelsEmptyState = document.getElementById('modelsEmptyState') as HTMLElement | null;
    this.btnFetchModelsPrimary = document.getElementById('btnFetchModelsPrimary') as HTMLButtonElement | null;
    this.modelsLoadedState = document.getElementById('modelsLoadedState') as HTMLElement | null;
    this.btnRefreshModels = document.getElementById('btnRefreshModels') as HTMLButtonElement | null;
    this.cloudAiModelSelect = document.getElementById('cloudAiModelSelect') as HTMLSelectElement | null;
    this.customModelInputWrapper = document.getElementById('customModelInputWrapper') as HTMLElement | null;
    this.cloudAiCustomModelInput = document.getElementById('cloudAiCustomModelInput') as HTMLInputElement | null;
    this.cloudAiTestRow = document.getElementById('cloudAiTestRow') as HTMLElement | null;
    this.btnTestCloudAiKey = document.getElementById('btnTestCloudAiKey') as HTMLButtonElement | null;
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
      this.cloudAiProviderSelect.value = 'groq';
    }

    // Завантажуємо кешовані моделі для Groq з локального сховища
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['groq_cached_models'], async (res) => {
        if (Array.isArray(res.groq_cached_models) && res.groq_cached_models.length > 0) {
          this.cachedDynamicModels['groq'] = res.groq_cached_models;
        }
        await this.renderCloudAiState();
      });
    } else {
      await this.renderCloudAiState();
    }
  }

  private async renderCloudAiState(): Promise<void> {
    const key = await SecureKeyStore.getApiKey('groq');
    const hint = await SecureKeyStore.getKeyHint('groq');
    const config = await SecureKeyStore.getConfig();

    if (key) {
      // 1. Стан: Ключ налаштовано
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.style.display = 'flex';
      if (this.cloudAiKeyHint) this.cloudAiKeyHint.textContent = hint || 'gsk_••••••••';
      if (this.cloudAiKeyInputWrapper) this.cloudAiKeyInputWrapper.style.display = 'none';
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.style.display = 'none';

      // Показуємо блок моделей
      if (this.cloudAiModelContainer) this.cloudAiModelContainer.style.display = 'block';

      const dynamicModels = this.cachedDynamicModels['groq'];
      if (dynamicModels && dynamicModels.length > 0) {
        // Моделі завантажено з API: показуємо випадаючий список
        if (this.modelsEmptyState) this.modelsEmptyState.style.display = 'none';
        if (this.modelsLoadedState) this.modelsLoadedState.style.display = 'flex';
        this.populateModelsSelect(dynamicModels, config.model);
        if (this.cloudAiTestRow) this.cloudAiTestRow.style.display = 'flex';
      } else {
        // Моделі ще не завантажено: показуємо головну кнопку завантаження з API
        if (this.modelsEmptyState) this.modelsEmptyState.style.display = 'block';
        if (this.modelsLoadedState) this.modelsLoadedState.style.display = 'none';
        if (this.cloudAiTestRow) this.cloudAiTestRow.style.display = 'none';
      }
    } else {
      // 2. Стан: Ключ ще не введено (початковий мінімалістичний стан)
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.style.display = 'none';
      if (this.cloudAiKeyInputWrapper) this.cloudAiKeyInputWrapper.style.display = 'flex';
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.style.display = 'inline-flex';
      if (this.cloudAiModelContainer) this.cloudAiModelContainer.style.display = 'none';
      if (this.cloudAiTestRow) this.cloudAiTestRow.style.display = 'none';
      if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
    }
  }

  private populateModelsSelect(models: Array<{ id: string; label: string }>, selectedModel?: string): void {
    if (!this.cloudAiModelSelect) return;
    this.cloudAiModelSelect.innerHTML = '';

    let matchFound = false;
    const targetModel = selectedModel || 'llama-3.3-70b-versatile';

    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === targetModel) {
        opt.selected = true;
        matchFound = true;
      }
      this.cloudAiModelSelect!.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Вказати іншу модель вручну...';
    this.cloudAiModelSelect.appendChild(customOpt);

    if (selectedModel && !matchFound) {
      customOpt.selected = true;
      if (this.customModelInputWrapper) {
        this.customModelInputWrapper.style.display = 'block';
      }
      if (this.cloudAiCustomModelInput) this.cloudAiCustomModelInput.value = selectedModel;
    } else {
      if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'none';
    }
  }

  private setSaveButtonState(state: 'idle' | 'loading' | 'success'): void {
    if (!this.btnSaveCloudAiKey) return;
    if (state === 'loading') {
      this.btnSaveCloudAiKey.disabled = true;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Підключення до Groq API...';
      }
    } else if (state === 'success') {
      this.btnSaveCloudAiKey.disabled = false;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Groq успішно підключено';
      }
      setTimeout(() => {
        if (this.btnSaveCloudAiKeyText) {
          this.btnSaveCloudAiKeyText.textContent = 'Підключити Groq та отримати моделі';
        }
      }, 3000);
    } else {
      this.btnSaveCloudAiKey.disabled = false;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Підключити Groq та отримати моделі';
      }
    }
  }

  private async refreshModelsFromApi(keyOverride?: string): Promise<boolean> {
    const apiKey = keyOverride || this.cloudAiKeyInput?.value?.trim() || (await SecureKeyStore.getApiKey('groq'));

    if (!apiKey) {
      this.showFeedback('Введіть або збережіть Groq API ключ для завантаження каталогу', false);
      return false;
    }

    if (this.btnRefreshModels) {
      this.btnRefreshModels.disabled = true;
      this.btnRefreshModels.classList.add('is-loading');
    }
    if (this.btnFetchModelsPrimary) {
      this.btnFetchModelsPrimary.disabled = true;
      const span = this.btnFetchModelsPrimary.querySelector('span');
      if (span) span.textContent = 'Завантаження з Groq API...';
    }
    this.showFeedback('Запит доступних моделей через Groq API...', true);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'FETCH_CLOUD_MODELS',
        payload: { provider: 'groq', apiKey },
      });

      if (resp && resp.success && Array.isArray(resp.models) && resp.models.length > 0) {
        this.cachedDynamicModels['groq'] = resp.models;

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ groq_cached_models: resp.models });
        }

        const config = await SecureKeyStore.getConfig();
        let chosenModel = config.model;
        const hasCurrentModel = resp.models.some((m: any) => m.id === chosenModel);
        if (!hasCurrentModel) {
          const defaultLlama = resp.models.find((m: any) => m.id.includes('llama-3.3-70b')) || resp.models[0];
          chosenModel = defaultLlama.id;
          await SecureKeyStore.saveConfig({ provider: 'groq', model: chosenModel });
        }

        await this.renderCloudAiState();
        this.showFeedback(`Отримано ${resp.models.length} актуальних моделей Groq`, true);
        this.showToast(`Каталог Groq оновлено: ${resp.models.length} моделей`);
        return true;
      } else {
        this.showFeedback(`Помилка Groq API: ${resp?.error || 'Не вдалося отримати список моделей'}`, false);
        return false;
      }
    } catch (err: any) {
      this.showFeedback(`Помилка запиту моделей: ${err?.message || err}`, false);
      return false;
    } finally {
      if (this.btnRefreshModels) {
        this.btnRefreshModels.disabled = false;
        this.btnRefreshModels.classList.remove('is-loading');
      }
      if (this.btnFetchModelsPrimary) {
        this.btnFetchModelsPrimary.disabled = false;
        const span = this.btnFetchModelsPrimary.querySelector('span');
        if (span) span.textContent = 'Отримати список моделей з API';
      }
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
    const config = await SecureKeyStore.getConfig();
    const model = config.model || 'llama-3.3-70b-versatile';
    const apiKey = keyOverride || (this.cloudAiKeyInput?.value?.trim()) || (await SecureKeyStore.getApiKey('groq'));

    if (!apiKey) {
      this.showFeedback('Спочатку збережіть або введіть Groq API ключ', false);
      return false;
    }

    this.showFeedback('Перевірка зв\'язку з Groq API...', true);
    if (this.btnTestCloudAiKey) this.btnTestCloudAiKey.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'TEST_CLOUD_AI',
        payload: { provider: 'groq', apiKey, model },
      });

      if (resp && resp.success) {
        this.showFeedback(`Зв'язок з Groq встановлено успішно · ${resp.modelUsed || model} (${resp.latencyMs || 0} мс)`, true);
        return true;
      } else {
        this.showFeedback(`Помилка Groq: ${resp?.error || 'Не вдалося встановити зв\'язок'}`, false);
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

    // Cloud AI Switch
    this.toggleCloudAi?.addEventListener('change', async (e) => {
      const isEnabled = (e.target as HTMLInputElement).checked;
      await SecureKeyStore.saveConfig({ enabled: isEnabled, provider: 'groq' });
      this.showToast(isEnabled ? 'Хмарний арбітраж Groq активовано' : 'Хмарний арбітраж вимкнено');
    });

    // Refresh Models from Provider API (subtle header button)
    this.btnRefreshModels?.addEventListener('click', async () => {
      await this.refreshModelsFromApi();
    });

    // Primary Fetch Models button (when models not yet loaded)
    this.btnFetchModelsPrimary?.addEventListener('click', async () => {
      await this.refreshModelsFromApi();
    });

    // Toggle Change Key Form
    this.btnToggleChangeKey?.addEventListener('click', () => {
      if (!this.cloudAiKeyInputWrapper) return;
      const isHidden = this.cloudAiKeyInputWrapper.style.display === 'none' || !this.cloudAiKeyInputWrapper.style.display;
      this.cloudAiKeyInputWrapper.style.display = isHidden ? 'flex' : 'none';
      if (this.btnToggleChangeKey) {
        this.btnToggleChangeKey.textContent = isHidden ? 'Скасувати' : 'Змінити';
      }
      if (isHidden) {
        this.cloudAiKeyInput?.focus();
      }
    });

    // Cloud AI Model Change
    this.cloudAiModelSelect?.addEventListener('change', async (e) => {
      const val = (e.target as HTMLSelectElement).value;

      if (val === '__custom__') {
        if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'block';
        this.cloudAiCustomModelInput?.focus();
        const customModel = this.cloudAiCustomModelInput?.value?.trim() || '';
        if (customModel) {
          await SecureKeyStore.saveConfig({ provider: 'groq', model: customModel });
        }
      } else {
        if (this.customModelInputWrapper) this.customModelInputWrapper.style.display = 'none';
        await SecureKeyStore.saveConfig({ provider: 'groq', model: val });
        this.showToast(`Модель: ${val}`);
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
        await SecureKeyStore.saveConfig({ provider: 'groq', model: customModel });
      }
    };

    this.cloudAiCustomModelInput?.addEventListener('input', saveCustomModelIfActive);
    this.cloudAiCustomModelInput?.addEventListener('change', saveCustomModelIfActive);

    // Save Groq API Key & Auto-fetch Models (Unified primary action)
    const saveKeyAction = async () => {
      const val = this.cloudAiKeyInput?.value?.trim() || '';

      if (!val) {
        this.showFeedback('Введіть Groq API ключ для підключення', false);
        return;
      }

      this.setSaveButtonState('loading');
      try {
        await SecureKeyStore.saveApiKey('groq', val, 'device_encrypted');
        await SecureKeyStore.saveConfig({ provider: 'groq', enabled: true });
        if (this.toggleCloudAi) this.toggleCloudAi.checked = true;

        if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
        this.showToast('Ключ Groq збережено! Завантаження моделей...');

        const success = await this.refreshModelsFromApi(val);
        this.setSaveButtonState(success ? 'success' : 'idle');
        await this.renderCloudAiState();
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

    // Test Groq Connection
    this.btnTestCloudAiKey?.addEventListener('click', () => this.testConnection());

    // Delete Groq Key
    this.btnDeleteCloudAiKey?.addEventListener('click', async () => {
      if (confirm('Видалити збережений ключ Groq?')) {
        await SecureKeyStore.deleteApiKey('groq');
        await SecureKeyStore.saveConfig({ enabled: false });
        if (this.toggleCloudAi) this.toggleCloudAi.checked = false;
        await this.renderCloudAiState();
        if (this.cloudAiStatusFeedback) this.cloudAiStatusFeedback.style.display = 'none';
        this.showToast('Ключ Groq видалено');
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
