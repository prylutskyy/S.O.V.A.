import { UserWhitelistManager } from '../../../src/core/user-whitelist';
import { SecureKeyStore, LLMProviderType } from '../../../src/core/secure-key-store';

export class SettingsTabController {
  // Whitelist Controls
  private whitelistTitle: HTMLElement;
  private whitelistUl: HTMLUListElement;
  private manualHostInput: HTMLInputElement;
  private manualHostError: HTMLElement | null;
  private btnAddManual: HTMLButtonElement;
  private btnClearAllWhitelist: HTMLButtonElement;
  private btnToggleManualAdd: HTMLButtonElement | null;
  private manualAddRow: HTMLElement | null;

  // Status & Debug
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
  private btnRefreshModels: HTMLButtonElement | null;
  private cloudAiModelSelect: HTMLSelectElement | null;
  private btnApplyModel: HTMLButtonElement | null;
  private customModelInputWrapper: HTMLElement | null;
  private cloudAiCustomModelInput: HTMLInputElement | null;
  private btnApplyCustomModel: HTMLButtonElement | null;
  private cloudAiStatusFeedback: HTMLElement | null;
  private cachedDynamicModels: Record<string, Array<{ id: string; label: string }>> = {};

  // Apple-Inspired Confirmation Sheet
  private confirmSheetBackdrop: HTMLElement | null;
  private confirmSheetTitle: HTMLElement | null;
  private confirmSheetBody: HTMLElement | null;
  private btnConfirmAction: HTMLButtonElement | null;
  private btnCancelAction: HTMLButtonElement | null;
  private activeConfirmCallback: (() => Promise<void> | void) | null = null;

  constructor(showToast: (msg: string) => void, onWhitelistChanged: () => void) {
    this.showToast = showToast;
    this.onWhitelistChanged = onWhitelistChanged;

    this.whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
    this.whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
    this.manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
    this.manualHostError = document.getElementById('manualHostError') as HTMLElement | null;
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
    this.btnRefreshModels = document.getElementById('btnRefreshModels') as HTMLButtonElement | null;
    this.cloudAiModelSelect = document.getElementById('cloudAiModelSelect') as HTMLSelectElement | null;
    this.btnApplyModel = document.getElementById('btnApplyModel') as HTMLButtonElement | null;
    this.customModelInputWrapper = document.getElementById('customModelInputWrapper') as HTMLElement | null;
    this.cloudAiCustomModelInput = document.getElementById('cloudAiCustomModelInput') as HTMLInputElement | null;
    this.btnApplyCustomModel = document.getElementById('btnApplyCustomModel') as HTMLButtonElement | null;
    this.cloudAiStatusFeedback = document.getElementById('cloudAiStatusFeedback') as HTMLElement | null;

    // Confirmation Sheet Elements
    this.confirmSheetBackdrop = document.getElementById('confirmSheetBackdrop') as HTMLElement | null;
    this.confirmSheetTitle = document.getElementById('confirmSheetTitle') as HTMLElement | null;
    this.confirmSheetBody = document.getElementById('confirmSheetBody') as HTMLElement | null;
    this.btnConfirmAction = document.getElementById('btnConfirmAction') as HTMLButtonElement | null;
    this.btnCancelAction = document.getElementById('btnCancelAction') as HTMLButtonElement | null;

    this.initDebugMode();
    this.checkAI();
    this.initCloudAI();
    this.initConfirmSheet();
    this.bindEvents();
  }

  private cleanDomain(raw: string): string {
    return UserWhitelistManager.normalizeDomain(raw);
  }

  private initConfirmSheet(): void {
    this.btnConfirmAction?.addEventListener('click', async () => {
      if (this.activeConfirmCallback) {
        const callback = this.activeConfirmCallback;
        this.closeConfirmDialog();
        await callback();
      } else {
        this.closeConfirmDialog();
      }
    });

    this.btnCancelAction?.addEventListener('click', () => {
      this.closeConfirmDialog();
    });

    this.confirmSheetBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.confirmSheetBackdrop) {
        this.closeConfirmDialog();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.confirmSheetBackdrop && !this.confirmSheetBackdrop.classList.contains('hidden')) {
        this.closeConfirmDialog();
      }
    });
  }

  private showConfirmDialog(options: {
    title: string;
    body: string;
    confirmText?: string;
    onConfirm: () => Promise<void> | void;
  }): void {
    if (!this.confirmSheetBackdrop) {
      if (confirm(`${options.title}\n\n${options.body}`)) {
        options.onConfirm();
      }
      return;
    }

    if (this.confirmSheetTitle) this.confirmSheetTitle.textContent = options.title;
    if (this.confirmSheetBody) this.confirmSheetBody.textContent = options.body;
    if (this.btnConfirmAction) {
      this.btnConfirmAction.textContent = options.confirmText || 'Підтвердити';
    }

    this.activeConfirmCallback = options.onConfirm;
    this.confirmSheetBackdrop.classList.remove('hidden');
    this.confirmSheetBackdrop.setAttribute('aria-hidden', 'false');
  }

  private closeConfirmDialog(): void {
    if (!this.confirmSheetBackdrop) return;
    this.confirmSheetBackdrop.classList.add('hidden');
    this.confirmSheetBackdrop.setAttribute('aria-hidden', 'true');
    this.activeConfirmCallback = null;
  }

  private clearManualError(): void {
    if (this.manualHostInput) this.manualHostInput.classList.remove('is-invalid');
    if (this.manualHostError) this.manualHostError.classList.add('hidden');
  }

  private showManualError(msg?: string): void {
    if (this.manualHostInput) {
      this.manualHostInput.classList.remove('is-invalid');
      void this.manualHostInput.offsetWidth; // Trigger reflow for shake animation
      this.manualHostInput.classList.add('is-invalid');
      this.manualHostInput.focus();
    }
    if (this.manualHostError) {
      if (msg) this.manualHostError.textContent = msg;
      this.manualHostError.classList.remove('hidden');
    }
  }

  public async renderWhitelist(): Promise<void> {
    const domains = await UserWhitelistManager.getDomains();
    if (this.whitelistTitle) {
      this.whitelistTitle.innerText = `Довірені сайти (${domains.length})`;
    }

    if (!this.whitelistUl) return;
    this.whitelistUl.innerHTML = '';

    if (domains.length === 0) {
      this.whitelistUl.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="empty-state-title">Немає довірених сайтів</div>
          <div class="empty-state-desc">Сайти зі списку винятків не скануються на загрози.</div>
          <button type="button" class="btn-secondary" id="btnEmptyAdd" style="font-size: 11.5px; height: 30px;">+ Додати перший сайт</button>
        </li>
      `;

      const btnEmptyAdd = this.whitelistUl.querySelector('#btnEmptyAdd') as HTMLButtonElement | null;
      btnEmptyAdd?.addEventListener('click', () => {
        if (this.manualAddRow) {
          this.manualAddRow.classList.remove('hidden');
          if (this.btnToggleManualAdd) this.btnToggleManualAdd.textContent = 'Закрити';
          this.manualHostInput?.focus();
        }
      });
      return;
    }

    domains.sort().forEach((domain) => {
      const li = document.createElement('li');
      li.className = 'list-entry';
      li.innerHTML = `
        <span class="domain-name">${domain}</span>
        <button type="button" class="btn-remove" title="Видалити зі списку" aria-label="Видалити ${domain}">
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

  private syncDebugModeToggle(): void {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['debugModeEnabled'], (res) => {
        if (this.toggleDebugMode) {
          this.toggleDebugMode.checked = !!res.debugModeEnabled;
        }
      });
    }
  }

  private initDebugMode(): void {
    this.syncDebugModeToggle();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if ((!areaName || areaName === 'local') && changes.debugModeEnabled && this.toggleDebugMode) {
          this.toggleDebugMode.checked = !!changes.debugModeEnabled.newValue;
        }
      });
    }

    this.toggleDebugMode?.addEventListener('change', (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      chrome.storage.local.set({ debugModeEnabled: isChecked });

      // Миттєво надсилаємо команду всім відкритим вкладкам браузера
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SET_DEBUG_MODE',
                enabled: isChecked,
              }).catch(() => {});
            }
          });
        });
      }

      // Також сповіщаємо background service worker для централізованої синхронізації
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SET_DEBUG_MODE',
          enabled: isChecked,
        }).catch(() => {});
      }

      this.showToast(isChecked ? 'Дебагер активовано на сторінках' : 'Дебагер вимкнено');
    });

    // Дозволяємо перемикати дебагер кліком по всьому інтерактивному рядку
    const row = document.getElementById('rowToggleDebugMode');
    row?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.ios-switch')) return;
      if (this.toggleDebugMode) {
        this.toggleDebugMode.checked = !this.toggleDebugMode.checked;
        this.toggleDebugMode.dispatchEvent(new Event('change'));
      }
    });
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
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.classList.remove('hidden');
      if (this.cloudAiKeyHint) this.cloudAiKeyHint.textContent = hint || 'gsk_••••••••';
      if (this.cloudAiKeyInputWrapper) this.cloudAiKeyInputWrapper.classList.add('hidden');
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.classList.add('hidden');

      // Показуємо блок моделей
      if (this.cloudAiModelContainer) this.cloudAiModelContainer.classList.remove('hidden');

      const dynamicModels = this.cachedDynamicModels['groq'] || [];
      this.populateModelsSelect(dynamicModels, config.model || 'qwen3.8-27b');
    } else {
      // 2. Стан: Ключ ще не введено (початковий мінімалістичний стан)
      if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.classList.add('hidden');
      if (this.cloudAiKeyInputWrapper) this.cloudAiKeyInputWrapper.classList.remove('hidden');
      if (this.cloudAiKeyNotSet) this.cloudAiKeyNotSet.classList.remove('hidden');
      if (this.cloudAiModelContainer) this.cloudAiModelContainer.classList.add('hidden');
      if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
    }
  }

  private populateModelsSelect(models: Array<{ id: string; label: string }>, selectedModel?: string): void {
    if (!this.cloudAiModelSelect) return;
    this.cloudAiModelSelect.innerHTML = '';

    const standardModelId = 'qwen3.8-27b';
    const targetModel = selectedModel || standardModelId;

    // Створюємо робочий масив моделей з обов'язковою наявністю qwen3.8-27b на початку
    const list = [...models];
    const qwenIndex = list.findIndex((m) => m.id === standardModelId || m.id.toLowerCase().includes('qwen3.8'));

    if (qwenIndex === -1) {
      list.unshift({
        id: standardModelId,
        label: `${standardModelId} (Стандарт)`,
      });
    } else {
      const [qwenModel] = list.splice(qwenIndex, 1);
      list.unshift({
        id: qwenModel.id,
        label: qwenModel.label.includes('(Стандарт)') ? qwenModel.label : `${qwenModel.id} (Стандарт)`,
      });
    }

    let matchFound = false;
    list.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === targetModel || (!matchFound && m.id === standardModelId)) {
        opt.selected = true;
        matchFound = true;
      }
      this.cloudAiModelSelect!.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Вказати іншу модель...';
    this.cloudAiModelSelect.appendChild(customOpt);

    if (selectedModel && !matchFound) {
      customOpt.selected = true;
      if (this.customModelInputWrapper) {
        this.customModelInputWrapper.classList.remove('hidden');
      }
      if (this.cloudAiCustomModelInput) this.cloudAiCustomModelInput.value = selectedModel;
    } else {
      if (this.customModelInputWrapper) this.customModelInputWrapper.classList.add('hidden');
    }
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
        this.btnSaveCloudAiKeyText.textContent = 'Підключено';
      }
      setTimeout(() => {
        if (this.btnSaveCloudAiKeyText) {
          this.btnSaveCloudAiKeyText.textContent = 'Підключити';
        }
      }, 2500);
    } else {
      this.btnSaveCloudAiKey.disabled = false;
      if (this.btnSaveCloudAiKeyText) {
        this.btnSaveCloudAiKeyText.textContent = 'Підключити';
      }
    }
  }

  private async refreshModelsFromApi(keyOverride?: string): Promise<boolean> {
    const apiKey = keyOverride || this.cloudAiKeyInput?.value?.trim() || (await SecureKeyStore.getApiKey('groq'));

    if (!apiKey) {
      this.showFeedback('Введіть Groq API ключ для підключення', false);
      return false;
    }

    if (this.btnRefreshModels) {
      this.btnRefreshModels.disabled = true;
      this.btnRefreshModels.classList.add('is-loading');
    }
    this.showFeedback('Підключення до Groq API...', true);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'FETCH_CLOUD_MODELS',
        payload: { provider: 'groq', apiKey },
      });

      if (resp && resp.success && Array.isArray(resp.models)) {
        this.cachedDynamicModels['groq'] = resp.models;

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ groq_cached_models: resp.models });
        }

        const config = await SecureKeyStore.getConfig();
        let chosenModel = config.model;
        if (!chosenModel || chosenModel === 'llama-3.3-70b-versatile') {
          chosenModel = 'qwen3.8-27b';
          await SecureKeyStore.saveConfig({ provider: 'groq', model: chosenModel });
        }

        await this.renderCloudAiState();
        this.showFeedback(`Каталог Groq синхронізовано (${resp.models.length} моделей)`, true);
        return true;
      } else {
        this.showFeedback(`Помилка Groq API: ${resp?.error || 'Не вдалося отримати моделі'}`, false);
        return false;
      }
    } catch (err: any) {
      this.showFeedback(`Помилка зв'язку: ${err?.message || err}`, false);
      return false;
    } finally {
      if (this.btnRefreshModels) {
        this.btnRefreshModels.disabled = false;
        this.btnRefreshModels.classList.remove('is-loading');
      }
    }
  }

  private showFeedback(text: string, isSuccess: boolean): void {
    if (!this.cloudAiStatusFeedback) return;
    this.cloudAiStatusFeedback.classList.remove('hidden', 'success', 'error');
    this.cloudAiStatusFeedback.classList.add(isSuccess ? 'success' : 'error');
    this.cloudAiStatusFeedback.textContent = text;
  }

  private bindEvents(): void {
    // Whitelist Manual Add Toggle
    this.btnToggleManualAdd?.addEventListener('click', () => {
      if (!this.manualAddRow) return;
      const isHidden = this.manualAddRow.classList.contains('hidden');
      if (isHidden) {
        this.manualAddRow.classList.remove('hidden');
        if (this.btnToggleManualAdd) this.btnToggleManualAdd.textContent = 'Закрити';
        this.manualHostInput?.focus();
      } else {
        this.manualAddRow.classList.add('hidden');
        if (this.btnToggleManualAdd) this.btnToggleManualAdd.textContent = '+ Додати';
        this.clearManualError();
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

    // Toggle Change Key Form
    this.btnToggleChangeKey?.addEventListener('click', () => {
      if (!this.cloudAiKeyInputWrapper) return;
      const isHidden = this.cloudAiKeyInputWrapper.classList.contains('hidden');
      if (isHidden) {
        this.cloudAiKeyInputWrapper.classList.remove('hidden');
        if (this.btnToggleChangeKey) this.btnToggleChangeKey.textContent = 'Скасувати';
        this.cloudAiKeyInput?.focus();
      } else {
        this.cloudAiKeyInputWrapper.classList.add('hidden');
        if (this.btnToggleChangeKey) this.btnToggleChangeKey.textContent = 'Змінити';
      }
    });

    // Cloud AI Model Dropdown Change
    this.cloudAiModelSelect?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (val === '__custom__') {
        if (this.customModelInputWrapper) this.customModelInputWrapper.classList.remove('hidden');
        this.cloudAiCustomModelInput?.focus();
      } else {
        if (this.customModelInputWrapper) this.customModelInputWrapper.classList.add('hidden');
      }
    });

    // Apply Model from Dropdown (Explicit "Вибрати" Action)
    this.btnApplyModel?.addEventListener('click', async () => {
      if (!this.cloudAiModelSelect) return;
      const val = this.cloudAiModelSelect.value;
      if (val === '__custom__') {
        if (this.customModelInputWrapper) this.customModelInputWrapper.classList.remove('hidden');
        this.cloudAiCustomModelInput?.focus();
      } else {
        if (this.customModelInputWrapper) this.customModelInputWrapper.classList.add('hidden');
        await SecureKeyStore.saveConfig({ provider: 'groq', model: val });
        this.showToast(`Вибрано модель: ${val}`);
        this.showFeedback(`Активна модель: ${val}`, true);
      }
    });

    // Apply Custom Model
    this.btnApplyCustomModel?.addEventListener('click', async () => {
      const customModel = this.cloudAiCustomModelInput?.value?.trim();
      if (!customModel) {
        this.showFeedback('Введіть назву моделі', false);
        return;
      }
      await SecureKeyStore.saveConfig({ provider: 'groq', model: customModel });
      this.showToast(`Вибрано модель: ${customModel}`);
      this.showFeedback(`Активна модель: ${customModel}`, true);
    });

    // Save Groq API Key & Auto-connect (Unified "Підключити" action)
    const saveKeyAction = async () => {
      const val = this.cloudAiKeyInput?.value?.trim() || '';

      if (!val) {
        this.showFeedback('Вставте Groq API ключ для підключення', false);
        return;
      }

      this.setSaveButtonState('loading');
      try {
        await SecureKeyStore.saveApiKey('groq', val, 'device_encrypted');
        await SecureKeyStore.saveConfig({ provider: 'groq', model: 'qwen3.8-27b', enabled: true });
        if (this.toggleCloudAi) this.toggleCloudAi.checked = true;

        if (this.cloudAiKeyInput) this.cloudAiKeyInput.value = '';
        this.showToast('Groq підключено · Модель qwen3.8-27b');

        const success = await this.refreshModelsFromApi(val);
        this.setSaveButtonState(success ? 'success' : 'idle');
        await this.renderCloudAiState();

        if (this.cloudAiKeySavedPill) {
          this.cloudAiKeySavedPill.classList.add('just-connected');
          setTimeout(() => {
            this.cloudAiKeySavedPill?.classList.remove('just-connected');
          }, 700);
        }
      } catch (err: any) {
        this.showFeedback(`Помилка підключення: ${err?.message || err}`, false);
        this.setSaveButtonState('idle');
      }
    };

    this.btnSaveCloudAiKey?.addEventListener('click', saveKeyAction);

    this.cloudAiKeyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveKeyAction();
      }
    });

    // Delete Groq Key (Disconnect) with Apple Confirmation Sheet
    this.btnDeleteCloudAiKey?.addEventListener('click', () => {
      this.showConfirmDialog({
        title: 'Відключити Groq Cloud?',
        body: 'Збережений API-ключ буде стерто з безпечного сховища пристрою. Хмарний арбітраж буде вимкнено.',
        confirmText: 'Відключити',
        onConfirm: async () => {
          if (this.cloudAiKeySavedPill) {
            this.cloudAiKeySavedPill.classList.add('disconnecting');
            setTimeout(async () => {
              await SecureKeyStore.deleteApiKey('groq');
              await SecureKeyStore.saveConfig({ enabled: false });
              if (this.toggleCloudAi) this.toggleCloudAi.checked = false;
              if (this.cloudAiKeySavedPill) this.cloudAiKeySavedPill.classList.remove('disconnecting');
              await this.renderCloudAiState();
              if (this.cloudAiStatusFeedback) this.cloudAiStatusFeedback.classList.add('hidden');
              this.showToast('Groq відключено');
            }, 300);
          } else {
            await SecureKeyStore.deleteApiKey('groq');
            await SecureKeyStore.saveConfig({ enabled: false });
            if (this.toggleCloudAi) this.toggleCloudAi.checked = false;
            await this.renderCloudAiState();
            if (this.cloudAiStatusFeedback) this.cloudAiStatusFeedback.classList.add('hidden');
            this.showToast('Groq відключено');
          }
        },
      });
    });

    // Add domain to whitelist with inline validation (no alert())
    this.btnAddManual?.addEventListener('click', async () => {
      const rawVal = this.manualHostInput.value;
      const domain = this.cleanDomain(rawVal);
      if (!domain || domain.length < 3 || !domain.includes('.')) {
        this.showManualError('Введіть коректну адресу сайту (наприклад: domain.ua)');
        return;
      }

      await UserWhitelistManager.allowDomain(domain);
      this.manualHostInput.value = '';
      this.clearManualError();
      if (this.manualAddRow) this.manualAddRow.classList.add('hidden');
      if (this.btnToggleManualAdd) this.btnToggleManualAdd.textContent = '+ Додати';
      this.showToast(`Додано до довірених: ${domain}`);
      await this.renderWhitelist();
      this.onWhitelistChanged();
    });

    this.manualHostInput?.addEventListener('input', () => {
      this.clearManualError();
    });

    this.manualHostInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnAddManual.click();
      }
    });

    // Clear all whitelist with Apple Confirmation Sheet (no confirm())
    this.btnClearAllWhitelist?.addEventListener('click', async () => {
      const domains = await UserWhitelistManager.getDomains();
      if (domains.length === 0) {
        this.showToast('Список довірених сайтів уже порожній');
        return;
      }

      this.showConfirmDialog({
        title: 'Очистити довірені сайти?',
        body: `Цю дію неможливо скасувати. Всі ${domains.length} сайтів буде видалено зі списку винятків.`,
        confirmText: 'Очистити список',
        onConfirm: async () => {
          await UserWhitelistManager.clearAll();
          this.showToast('Список довірених сайтів очищено');
          await this.renderWhitelist();
          this.onWhitelistChanged();
        },
      });
    });
  }

  public async refresh(): Promise<void> {
    this.syncDebugModeToggle();
    await this.renderWhitelist();
    await this.initCloudAI();
    await this.checkAI();
  }
}
