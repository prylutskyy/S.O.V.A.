import { UserWhitelistManager } from '../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../src/core/personal-vault';
import { VaultItem, VaultItemCategory } from '../../src/types/vault';

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const tabBtnStats = document.getElementById('tabBtnStats') as HTMLButtonElement;
  const tabBtnVault = document.getElementById('tabBtnVault') as HTMLButtonElement;
  const tabBtnWhitelist = document.getElementById('tabBtnWhitelist') as HTMLButtonElement;
  const tabBtnSettings = document.getElementById('tabBtnSettings') as HTMLButtonElement;

  // Content Sections
  const tabContentStats = document.getElementById('tabContentStats') as HTMLElement;
  const tabContentVault = document.getElementById('tabContentVault') as HTMLElement;
  const tabContentWhitelist = document.getElementById('tabContentWhitelist') as HTMLElement;
  const tabContentSettings = document.getElementById('tabContentSettings') as HTMLElement;

  const toggleDebugMode = document.getElementById('toggleDebugMode') as HTMLInputElement;
  const aiStatusText = document.getElementById('aiStatusText') as HTMLElement;

  // Init Debug Mode
  chrome.storage.local.get(['debugModeEnabled'], (res) => {
    toggleDebugMode.checked = !!res.debugModeEnabled;
  });
  toggleDebugMode.addEventListener('change', (e) => {
    chrome.storage.local.set({ debugModeEnabled: (e.target as HTMLInputElement).checked });
  });

  // Init AI Status
  const checkAI = async () => {
    let provider: any = null;
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof (globalObj as any).LanguageModel !== 'undefined') provider = (globalObj as any).LanguageModel;
    else if (typeof (globalObj as any).ai !== 'undefined' && (globalObj as any).ai.languageModel) provider = (globalObj as any).ai.languageModel;

    if (provider) {
      try {
        if (typeof provider.capabilities === 'function') {
          const caps = await provider.capabilities();
          aiStatusText.textContent = caps?.available === 'no' ? 'Gemini Nano: Підтримується, але не завантажено' : 'Gemini Nano: Активно та готово';
          aiStatusText.style.color = caps?.available === 'no' ? 'var(--amber)' : 'var(--green)';
        } else if (typeof provider.create === 'function') {
          aiStatusText.textContent = 'Gemini Nano: Активно та готово';
          aiStatusText.style.color = 'var(--green)';
        } else {
          throw new Error('No create method');
        }
      } catch (e) {
        console.warn(e);
        if (typeof provider.create === 'function') {
          aiStatusText.textContent = 'Gemini Nano: Активно та готово (без capabilities)';
          aiStatusText.style.color = 'var(--green)';
        } else {
          aiStatusText.textContent = 'Gemini Nano: Помилка перевірки';
          aiStatusText.style.color = 'var(--amber)';
        }
      }
    } else {
      aiStatusText.textContent = 'Gemini Nano: Не підтримується цим браузером';
      aiStatusText.style.color = 'var(--red)';
    }
  };
  checkAI();

  // Stats elements
  const statProtectedMarkers = document.getElementById('statProtectedMarkers') as HTMLElement;
  const statVaultBadge = document.getElementById('statVaultBadge') as HTMLElement;

  // Whitelist elements
  const currentHostLabel = document.getElementById('currentHostLabel') as HTMLElement;
  const btnToggleCurrent = document.getElementById('btnToggleCurrent') as HTMLButtonElement;
  const whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
  const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
  const manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
  const btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
  const btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

  // Settings elements
  const btnResetContext = document.getElementById('btnResetContext') as HTMLButtonElement;
  const toastMessage = document.getElementById('toastMessage') as HTMLElement;

  // Vault Master-Detail Elements
  const vaultSetupState = document.getElementById('vaultSetupState') as HTMLElement;
  const vaultLockedState = document.getElementById('vaultLockedState') as HTMLElement;
  const vaultUnlockedState = document.getElementById('vaultUnlockedState') as HTMLElement;
  
  const vaultSetupPassword = document.getElementById('vaultSetupPassword') as HTMLInputElement;
  const vaultSetupConfirm = document.getElementById('vaultSetupConfirm') as HTMLInputElement;
  const btnSetupVault = document.getElementById('btnSetupVault') as HTMLButtonElement;
  
  const vaultUnlockPassword = document.getElementById('vaultUnlockPassword') as HTMLInputElement;
  const btnUnlockVault = document.getElementById('btnUnlockVault') as HTMLButtonElement;
  const btnLockVault = document.getElementById('btnLockVault') as HTMLButtonElement;

  const vaultSidebarList = document.getElementById('vaultSidebarList') as HTMLElement;
  const detailItemLabel = document.getElementById('detailItemLabel') as HTMLElement;
  const detailItemTier = document.getElementById('detailItemTier') as HTMLElement;
  const detailSwitchText = document.getElementById('detailSwitchText') as HTMLElement;
  const detailItemToggle = document.getElementById('detailItemToggle') as HTMLInputElement;
  const detailRealInput = document.getElementById('detailRealInput') as HTMLInputElement;
  const detailDecoyInput = document.getElementById('detailDecoyInput') as HTMLInputElement;
  const detailKeywordsInput = document.getElementById('detailKeywordsInput') as HTMLInputElement;
  const btnSaveDetailItem = document.getElementById('btnSaveDetailItem') as HTMLButtonElement;
  const btnClearDetailItem = document.getElementById('btnClearDetailItem') as HTMLButtonElement;
  const btnResetVaultDefaults = document.getElementById('btnResetVaultDefaults') as HTMLButtonElement;
  const detailHelpBox = document.getElementById('detailHelpBox') as HTMLElement;

  let currentTabHost: string = '';
  let selectedVaultItemId: string = '';

  const showToast = (msg: string) => {
    toastMessage.innerText = msg;
    toastMessage.style.display = 'block';
    setTimeout(() => {
      toastMessage.style.display = 'none';
    }, 2000);
  };

  // --- Навігація по вкладках ---
  type TabName = 'stats' | 'vault' | 'whitelist' | 'settings';

  const setActiveTab = async (tab: TabName) => {
    tabBtnStats.classList.toggle('active', tab === 'stats');
    tabBtnVault.classList.toggle('active', tab === 'vault');
    tabBtnWhitelist.classList.toggle('active', tab === 'whitelist');
    tabBtnSettings.classList.toggle('active', tab === 'settings');

    tabContentStats.style.display = tab === 'stats' ? 'flex' : 'none';
    tabContentVault.style.display = tab === 'vault' ? 'flex' : 'none';
    tabContentWhitelist.style.display = tab === 'whitelist' ? 'flex' : 'none';
    tabContentSettings.style.display = tab === 'settings' ? 'flex' : 'none';

    if (tab === 'stats') {
      await updateStatsDisplay();
    } else if (tab === 'vault') {
      await renderVaultSplitView();
    } else if (tab === 'whitelist') {
      await renderWhitelist();
      await updateCurrentTabState();
    }
  };

  tabBtnStats.addEventListener('click', () => setActiveTab('stats'));
  tabBtnVault.addEventListener('click', () => setActiveTab('vault'));
  tabBtnWhitelist.addEventListener('click', () => setActiveTab('whitelist'));
  tabBtnSettings.addEventListener('click', () => setActiveTab('settings'));

  // =========================================================================
  // 1. СТАТИСТИКА (ТОЧНІ ОБ'ЄКТИВНІ ПОКАЗНИКИ ЗАХИСТУ)
  // =========================================================================
  const updateStatsDisplay = async () => {
    const isLocked = PersonalVaultManager.isLocked();
    const items = await PersonalVaultManager.getItems();
    const activeCount = items.filter((i) => i.enabled !== false && Boolean(i.realValue)).length;

    if (statProtectedMarkers) {
      statProtectedMarkers.innerText = isLocked ? 'Забл.' : String(activeCount);
    }
    if (statVaultBadge) {
      if (isLocked) {
        statVaultBadge.innerText = 'Введіть пароль';
        statVaultBadge.className = 'stat-badge amber';
      } else {
        statVaultBadge.innerText = `${activeCount} активних`;
        statVaultBadge.className = 'stat-badge green';
      }
    }
  };

  // =========================================================================
  // 2. ДВОКОЛОНКОВЕ СХОВИЩЕ VAULT (MASTER-DETAIL SPLIT VIEW)
  // =========================================================================

  btnSetupVault.addEventListener('click', async () => {
    const pw = vaultSetupPassword.value;
    const confirm = vaultSetupConfirm.value;
    if (!pw || pw.length < 4) {
      alert('Пароль занадто короткий. Мінімум 4 символи.');
      return;
    }
    if (pw !== confirm) {
      alert('Паролі не співпадають!');
      return;
    }
    
    await PersonalVaultManager.setupMasterPassword(pw);
    vaultSetupPassword.value = '';
    vaultSetupConfirm.value = '';
    showToast('Сховище успішно створено та розблоковано!');
    await renderVaultSplitView();
    await updateStatsDisplay();
  });
  
  btnUnlockVault.addEventListener('click', async () => {
    const pw = vaultUnlockPassword.value;
    if (!pw) return;
    
    const success = await PersonalVaultManager.unlock(pw);
    if (success) {
      vaultUnlockPassword.value = '';
      showToast('Сховище розблоковано');
      await renderVaultSplitView();
      await updateStatsDisplay();
    } else {
      alert('Невірний пароль!');
    }
  });
  
  btnLockVault.addEventListener('click', async () => {
    await PersonalVaultManager.lock();
    showToast('Сховище заблоковано');
    await renderVaultSplitView();
    await updateStatsDisplay();
  });

  // Іконки для кожної категорії
  const getCategoryIconSvg = (cat: VaultItemCategory): string => {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      case 'TAX_ID':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
      case 'SECRET_WORD':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      case 'PASSPORT_ID':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>';
      case 'DATE_OF_BIRTH':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      case 'FINANCIAL_PHONE':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
      case 'FATHER_NAME':
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      default:
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
  };

  // Пояснення простою мовою для малодосвідчених користувачів
  const getCategoryExplanation = (cat: VaultItemCategory): string => {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return '<strong>Чому це важливо?</strong> Дівоче прізвище матері — це абсолютний секретний маркер банку. Жоден справжній інтернет-магазин чи служба доставки ніколи не мають права запитувати його для оплати чи зарахування коштів.';
      case 'TAX_ID':
        return '<strong>Чому це важливо?</strong> Номер РНОКПП (ІПН) шахраї виманюють для підробки фінансових договорів та швидких онлайн-кредитів. Розширення блокує форми, які вимагають його без вагомої причини.';
      case 'SECRET_WORD':
        return '<strong>Чому це важливо?</strong> Секретне кодове слово банку дає повний доступ до телефонного банкінгу та зміни фінансового номера картки. Його введення на сторонніх сайтах категорично неприпустиме.';
      case 'PASSPORT_ID':
        return '<strong>Чому це важливо?</strong> Серія та номер паспорта чи ID-картки запитуються зловмисниками для проходження фіктивного KYC або викрадення особистих акаунтів.';
      case 'DATE_OF_BIRTH':
        return '<strong>Чому це важливо?</strong> Разом з вашим іменем дата народження використовується для верифікації в службах клієнтської підтримки.';
      case 'FINANCIAL_PHONE':
        return '<strong>Чому це важливо?</strong> Фінансовий номер отримує одноразові коди підтвердження платежів. Захист виявляє спроби підміни або виманювання вашого прив’язаного номера.';
      case 'FATHER_NAME':
        return "<strong>Чому це важливо?</strong> Ім'я батька / по батькові використовується банківськими системами як додатковий верифікатор особи клієнта.";
      default:
        return '<strong>Власний маркер:</strong> Будь-яка інша конфіденційна фраза чи комбінація символів, яку ви хочете захистити від витоку через фішингові форми.';
    }
  };

  // Рендеринг двоколонкового сховища
  const renderVaultSplitView = async () => {
    const hasSetup = await PersonalVaultManager.hasVaultSetup();
    
    if (!hasSetup) {
      vaultSetupState.style.display = 'flex';
      vaultSetupState.style.flexDirection = 'column';
      vaultLockedState.style.display = 'none';
      vaultUnlockedState.style.display = 'none';
      return;
    }
    
    if (PersonalVaultManager.isLocked()) {
      vaultSetupState.style.display = 'none';
      vaultLockedState.style.display = 'flex';
      vaultLockedState.style.flexDirection = 'column';
      vaultUnlockedState.style.display = 'none';
      return;
    }
    
    vaultSetupState.style.display = 'none';
    vaultLockedState.style.display = 'none';
    vaultUnlockedState.style.display = 'block';

    const items = await PersonalVaultManager.getItems();

    if (!selectedVaultItemId || !items.some((i) => i.id === selectedVaultItemId)) {
      selectedVaultItemId = items[0]?.id || '';
    }

    // 1. Рендеринг лівої колонки (Master Sidebar)
    vaultSidebarList.innerHTML = '<div class="vault-section-label">Об\'єкти захисту (' + items.length + ')</div>';

    items.forEach((item) => {
      const isFilled = Boolean(item.realValue && item.realValue.trim().length > 0);
      const isEnabled = item.enabled !== false;
      const isActive = isFilled && isEnabled;
      const isSelected = item.id === selectedVaultItemId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vault-item ${isSelected ? 'active' : ''} ${!isActive ? 'inactive' : ''}`;
      btn.dataset.id = item.id;

      let statusText = 'Активний';
      let statusClass = 'on';

      if (!isFilled) {
        statusText = 'Не заповнено';
        statusClass = '';
      } else if (!isEnabled) {
        statusText = 'Вимкнено';
        statusClass = '';
      }

      btn.innerHTML = `
        <div class="vault-item-icon">
          ${getCategoryIconSvg(item.category)}
        </div>
        <div class="vault-item-info">
          <span class="vault-item-label" title="${item.label}">${item.label}</span>
          <span class="vault-item-status ${statusClass}">${statusText}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        selectedVaultItemId = item.id;
        renderVaultSplitView();
      });

      vaultSidebarList.appendChild(btn);
    });

    // 2. Рендеринг правої колонки (Detail Panel) для обраного елемента

    const selectedItem = items.find((i) => i.id === selectedVaultItemId);
    if (!selectedItem) return;

    detailItemLabel.innerText = selectedItem.label;
    const tier = PersonalVaultManager.getCategoryTier(selectedItem.category);
    if (tier === 'TIER_A_ABSOLUTE') {
      detailItemTier.innerText = 'Tier A: Абсолютний захист';
      detailItemTier.className = 'tier-tag a';
    } else {
      detailItemTier.innerText = 'Tier B: Контекстний захист';
      detailItemTier.className = 'tier-tag b';
    }


    const isItemEnabled = selectedItem.enabled !== false;
    detailItemToggle.checked = isItemEnabled;
    detailSwitchText.innerText = isItemEnabled ? 'Активний' : 'Вимкнено';

    detailRealInput.value = selectedItem.realValue || '';
    detailDecoyInput.value = selectedItem.decoyValue || '';
    detailKeywordsInput.value = (selectedItem.keywords || []).join(', ');

    detailHelpBox.innerHTML = getCategoryExplanation(selectedItem.category);
  };

  // Обробник перемикання тумблера
  detailItemToggle.addEventListener('change', () => {
    detailSwitchText.innerText = detailItemToggle.checked ? 'Активний' : 'Вимкнено';
  });

  // Збереження змін у правій колонці
  btnSaveDetailItem.addEventListener('click', async () => {
    const items = await PersonalVaultManager.getItems();
    const item = items.find((i) => i.id === selectedVaultItemId);
    if (!item) return;

    const realVal = detailRealInput.value.trim();
    const decoyVal = detailDecoyInput.value.trim();
    const rawKw = detailKeywordsInput.value.trim();
    const isEnabled = detailItemToggle.checked;

    const keywords = rawKw
      ? rawKw.split(',').map((k) => k.trim()).filter(Boolean)
      : item.keywords;

    await PersonalVaultManager.saveItem({
      id: item.id,
      category: item.category,
      label: item.label,
      realValue: realVal,
      decoyValue: decoyVal || PersonalVaultManager.generateDefaultDecoy(item.category),
      keywords,
      enabled: isEnabled,
    });

    showToast(`Налаштування збережено: ${item.label}`);
    await renderVaultSplitView();
    await updateStatsDisplay();
  });

  // Очищення значення
  btnClearDetailItem.addEventListener('click', async () => {
    detailRealInput.value = '';
    detailItemToggle.checked = false;
    detailSwitchText.innerText = 'Вимкнено';
  });

  // Відновлення стандартних маркерів
  btnResetVaultDefaults.addEventListener('click', async () => {
    if (confirm('Відновити стандартні зразки даних сховища?')) {
      await PersonalVaultManager.resetToDefaults();
      showToast('Сховище відновлено до стандартних');
      await renderVaultSplitView();
      await updateStatsDisplay();
    }
  });

  // =========================================================================
  // 3. ДОВІРЕНІ САЙТИ (WHITELIST)
  // =========================================================================

  const cleanDomain = (raw: string): string => {
    let d = raw.trim().toLowerCase();
    try {
      if (d.includes('://')) {
        d = new URL(d).hostname;
      } else if (d.includes('/')) {
        d = d.split('/')[0];
      }
    } catch {}
    return d.replace(/^www\./, '');
  };

  const renderWhitelist = async () => {
    const domains = await UserWhitelistManager.getDomains();
    whitelistTitle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <span>Довірені сайти (${domains.length})</span>
    `;

    whitelistUl.innerHTML = '';
    if (domains.length === 0) {
      whitelistUl.innerHTML = '<li class="list-entry" style="justify-content: center; color: var(--text-muted);">Немає доданих сайтів</li>';
    } else {
      domains.sort().forEach((domain) => {
        const li = document.createElement('li');
        li.className = 'list-entry';
        li.innerHTML = `
          <span style="font-weight: 500; color: var(--text-primary);">${domain}</span>
          <button type="button" class="btn-remove" title="Видалити зі списку">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;

        const btnRemove = li.querySelector('.btn-remove');
        btnRemove?.addEventListener('click', async () => {
          await UserWhitelistManager.removeDomain(domain);
          showToast(`Видалено: ${domain}`);
          await renderWhitelist();
          updateCurrentTabState();
        });


        whitelistUl.appendChild(li);
      });
    }
  };

  const updateCurrentTabState = async () => {
    if (!currentTabHost) {
      currentHostLabel.innerText = 'Немає активної сторінки';
      btnToggleCurrent.style.display = 'none';
      return;
    }

    currentHostLabel.innerText = currentTabHost;
    const isAllowed = UserWhitelistManager.isDomainAllowedSync(currentTabHost);

    btnToggleCurrent.style.display = 'inline-flex';
    if (isAllowed) {
      btnToggleCurrent.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Прибрати з довірених';
      btnToggleCurrent.className = 'btn-danger';
    } else {
      btnToggleCurrent.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><polyline points="20 6 9 17 4 12"/></svg> Довіряти';
      btnToggleCurrent.className = 'btn-primary';
    }

  };

  try {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol.startsWith('http')) {
            currentTabHost = url.hostname.toLowerCase().replace(/^www\./, '');
          } else if (url.protocol === 'file:') {
            currentTabHost = 'local-file (demo.html)';
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error('Tabs query error:', e);
  }

  btnToggleCurrent.addEventListener('click', async () => {
    if (!currentTabHost || currentTabHost.startsWith('local-file')) return;

    const isAllowed = UserWhitelistManager.isDomainAllowedSync(currentTabHost);
    if (isAllowed) {
      await UserWhitelistManager.removeDomain(currentTabHost);
      showToast(`Видалено: ${currentTabHost}`);
    } else {
      await UserWhitelistManager.allowDomain(currentTabHost);
      showToast(`Додано до довірених: ${currentTabHost}`);
    }
    await renderWhitelist();
    updateCurrentTabState();
  });

  btnAddManual.addEventListener('click', async () => {
    const rawVal = manualHostInput.value;
    const domain = cleanDomain(rawVal);
    if (!domain || domain.length < 3) {
      alert('Будь ласка, введіть коректну адресу сайту (наприклад: myshop.ua)');
      return;
    }

    await UserWhitelistManager.allowDomain(domain);
    manualHostInput.value = '';
    showToast(`Додано домен: ${domain}`);
    await renderWhitelist();
    updateCurrentTabState();
  });

  manualHostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddManual.click();
    }
  });

  btnClearAllWhitelist.addEventListener('click', async () => {
    if (confirm('Очистити всі додані домени зі списку довірених?')) {
      await UserWhitelistManager.clearAll();
      showToast('Список довірених сайтів очищено');
      await renderWhitelist();
      updateCurrentTabState();
    }
  });

  // =========================================================================
  // 4. НАЛАШТУВАННЯ (SETTINGS & CONTEXT)
  // =========================================================================
  btnResetContext.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
      }
    } catch {}
    toastMessage.textContent = 'Контекст тривоги скинуто.';
    toastMessage.className = 'toast show';
    setTimeout(() => { toastMessage.className = 'toast'; }, 3000);
  });

  const btnAbortAI = document.getElementById('btnAbortAI') as HTMLButtonElement;
  btnAbortAI.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({ type: 'ABORT_AI' });
      }
    } catch {}
    toastMessage.textContent = 'Сигнал зупинки ШІ надіслано.';
    toastMessage.className = 'toast show';
    setTimeout(() => { toastMessage.className = 'toast'; }, 3000);
  });

  // =========================================================================
  // ІНІЦІАЛІЗАЦІЯ
  // =========================================================================
  await UserWhitelistManager.init();
  await PersonalVaultManager.init();

  // За замовчуванням першим відкриваємо розділ СТАТИСТИКИ
  await setActiveTab('stats');
});
