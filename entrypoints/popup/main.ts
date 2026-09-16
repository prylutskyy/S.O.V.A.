import { UserWhitelistManager } from '../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../src/core/personal-vault';
import { VaultItemCategory } from '../../src/types/vault';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements: Navigation Tabs
  const tabBtnStats = document.getElementById('tabBtnStats') as HTMLButtonElement;
  const tabBtnVault = document.getElementById('tabBtnVault') as HTMLButtonElement;
  const tabBtnWhitelist = document.getElementById('tabBtnWhitelist') as HTMLButtonElement;
  const tabBtnSettings = document.getElementById('tabBtnSettings') as HTMLButtonElement;

  // Elements: Content Sections
  const tabContentStats = document.getElementById('tabContentStats') as HTMLElement;
  const tabContentVault = document.getElementById('tabContentVault') as HTMLElement;
  const tabContentWhitelist = document.getElementById('tabContentWhitelist') as HTMLElement;
  const tabContentSettings = document.getElementById('tabContentSettings') as HTMLElement;

  // Elements: Statistics Tab
  const statProtectedMarkers = document.getElementById('statProtectedMarkers') as HTMLElement;

  // Elements: Whitelist tab
  const currentHostLabel = document.getElementById('currentHostLabel') as HTMLElement;
  const btnToggleCurrent = document.getElementById('btnToggleCurrent') as HTMLButtonElement;
  const whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
  const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
  const manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
  const btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
  const btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;

  // Elements: Settings tab
  const btnResetContext = document.getElementById('btnResetContext') as HTMLButtonElement;
  const toastMessage = document.getElementById('toastMessage') as HTMLElement;

  // Elements: Vault tab
  const vaultTitle = document.getElementById('vaultTitle') as HTMLElement;
  const vaultUl = document.getElementById('vaultUl') as HTMLUListElement;
  const vaultCategorySelect = document.getElementById('vaultCategorySelect') as HTMLSelectElement;
  const vaultLabelInput = document.getElementById('vaultLabelInput') as HTMLInputElement;
  const vaultRealInput = document.getElementById('vaultRealInput') as HTMLInputElement;
  const vaultDecoyInput = document.getElementById('vaultDecoyInput') as HTMLInputElement;
  const vaultKeywordsInput = document.getElementById('vaultKeywordsInput') as HTMLInputElement;
  const btnAddVaultItem = document.getElementById('btnAddVaultItem') as HTMLButtonElement;
  const btnResetVaultDefaults = document.getElementById('btnResetVaultDefaults') as HTMLButtonElement;

  let currentTabHost: string = '';

  const showToast = (msg: string) => {
    toastMessage.innerText = msg;
    toastMessage.style.display = 'block';
    setTimeout(() => {
      toastMessage.style.display = 'none';
    }, 2000);
  };

  // --- Механізм перемикання вкладок у стилі Proton Pass ---
  type TabName = 'stats' | 'vault' | 'whitelist' | 'settings';

  const setActiveTab = async (tab: TabName) => {
    // Оновлюємо стан кнопок
    tabBtnStats.classList.toggle('active', tab === 'stats');
    tabBtnVault.classList.toggle('active', tab === 'vault');
    tabBtnWhitelist.classList.toggle('active', tab === 'whitelist');
    tabBtnSettings.classList.toggle('active', tab === 'settings');

    // Оновлюємо видимість вмісту
    tabContentStats.style.display = tab === 'stats' ? 'flex' : 'none';
    tabContentVault.style.display = tab === 'vault' ? 'flex' : 'none';
    tabContentWhitelist.style.display = tab === 'whitelist' ? 'flex' : 'none';
    tabContentSettings.style.display = tab === 'settings' ? 'flex' : 'none';

    // Оновлюємо динамічні дані при переході
    if (tab === 'stats') {
      const items = await PersonalVaultManager.getItems();
      if (statProtectedMarkers) {
        statProtectedMarkers.innerText = String(items.length);
      }
    } else if (tab === 'vault') {
      await renderVault();
    } else if (tab === 'whitelist') {
      await renderWhitelist();
      await updateCurrentTabState();
    }
  };

  tabBtnStats.addEventListener('click', () => setActiveTab('stats'));
  tabBtnVault.addEventListener('click', () => setActiveTab('vault'));
  tabBtnWhitelist.addEventListener('click', () => setActiveTab('whitelist'));
  tabBtnSettings.addEventListener('click', () => setActiveTab('settings'));

  // ==========================================
  // ЛОГІКА ДОВІРЕНИХ САЙТІВ (WHITELIST)
  // ==========================================

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
      <span>Довірені ресурси (${domains.length})</span>
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
          <button type="button" class="btn-remove-entry" title="Видалити зі списку">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;

        const btnRemove = li.querySelector('.btn-remove-entry');
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
      btnToggleCurrent.innerText = '✕ Прибрати з довірених';
      btnToggleCurrent.className = 'btn-action-danger';
    } else {
      btnToggleCurrent.innerText = '✓ Довіряти цьому сайту';
      btnToggleCurrent.className = 'btn-action-primary';
    }
  };

  // Отримуємо поточну активну вкладку
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

  // ==========================================
  // СКИДАННЯ СЕСІЇ (SETTINGS & CONTEXT)
  // ==========================================

  btnResetContext.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
      }
    } catch {}
    showToast('Стан тривоги успішно скинуто');
  });

  // ==========================================
  // ЛОГІКА СХОВИЩА VAULT & CANARY DECOYS
  // ==========================================

  const renderVault = async () => {
    const items = await PersonalVaultManager.getItems();
    vaultTitle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>Захищені дані у сховищі (${items.length})</span>
    `;

    if (statProtectedMarkers) {
      statProtectedMarkers.innerText = String(items.length);
    }

    vaultUl.innerHTML = '';
    if (items.length === 0) {
      vaultUl.innerHTML = '<li class="list-entry" style="justify-content: center; color: var(--text-muted);">Сховище пусте</li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'vault-entry';
      li.innerHTML = `
        <div class="vault-entry-top">
          <div class="vault-entry-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--proton-purple)" stroke-width="2.3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>${item.label}</span>
          </div>
          <button type="button" class="btn-remove-entry" title="Видалити" data-id="${item.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="vault-entry-values">
          <span class="val-real-pill" title="Конфіденційне значення під захистом">🔐 ${item.realValue}</span>
          <span class="val-decoy-pill" title="Підставляється як пастка">
            🛡️ Декой: ${item.decoyValue}
          </span>
        </div>
      `;

      const btnRemove = li.querySelector('.btn-remove-entry');
      btnRemove?.addEventListener('click', async () => {
        await PersonalVaultManager.deleteItem(item.id);
        showToast(`Видалено: ${item.label}`);
        await renderVault();
      });

      vaultUl.appendChild(li);
    });
  };

  const applyCategoryDefaults = (category: VaultItemCategory) => {
    switch (category) {
      case 'MOTHER_MAIDEN_NAME':
        vaultLabelInput.value = 'Дівоче прізвище матері';
        vaultRealInput.placeholder = 'Людмила';
        vaultDecoyInput.value = 'Оксана';
        vaultKeywordsInput.value = 'дівоче, прізвище матері, maiden, mother, девичья фамилия';
        break;
      case 'TAX_ID':
        vaultLabelInput.value = 'РНОКПП (ІПН / Податковий код)';
        vaultRealInput.placeholder = '3124567890';
        vaultDecoyInput.value = '2987654321';
        vaultKeywordsInput.value = 'рнокпп, іпн, код платника, tax id, inn, налоговый номер';
        break;
      case 'SECRET_WORD':
        vaultLabelInput.value = 'Секретне / Кодове слово банку';
        vaultRealInput.placeholder = 'Калина';
        vaultDecoyInput.value = 'Дніпро';
        vaultKeywordsInput.value = 'кодове слово, секретне слово, codeword, secret word, контрольное слово';
        break;
      case 'PASSPORT_ID':
        vaultLabelInput.value = 'Номер паспорта / ID-картки';
        vaultRealInput.placeholder = 'АА 123456';
        vaultDecoyInput.value = 'АА 654321';
        vaultKeywordsInput.value = 'паспорт, id картка, passport, document number, паспортные данные';
        break;
      case 'DATE_OF_BIRTH':
        vaultLabelInput.value = 'Дата народження';
        vaultRealInput.placeholder = '15.08.1985';
        vaultDecoyInput.value = '01.01.1990';
        vaultKeywordsInput.value = 'дата народження, день народження, date of birth, dob, birthday, дата рождения';
        break;
      case 'FINANCIAL_PHONE':
        vaultLabelInput.value = 'Фінансовий номер телефону';
        vaultRealInput.placeholder = '+380501234567';
        vaultDecoyInput.value = '+380679876543';
        vaultKeywordsInput.value = 'фінансовий номер, прив’язаний телефон, financial phone, bank mobile, финансовый номер';
        break;
      case 'FATHER_NAME':
        vaultLabelInput.value = "Ім'я батька / По батькові";
        vaultRealInput.placeholder = 'Лео';
        vaultDecoyInput.value = 'Олександр';
        vaultKeywordsInput.value = "ім'я батька, по батькові, father's name, patronymic, имя отца, отчество";
        break;
      case 'CUSTOM':
      default:
        vaultLabelInput.value = '';
        vaultRealInput.placeholder = 'Ваше значення';
        vaultDecoyInput.value = '';
        vaultKeywordsInput.value = '';
        break;
    }
  };

  vaultCategorySelect.addEventListener('change', () => {
    applyCategoryDefaults(vaultCategorySelect.value as VaultItemCategory);
  });

  btnAddVaultItem.addEventListener('click', async () => {
    const category = vaultCategorySelect.value as VaultItemCategory;
    const label = vaultLabelInput.value.trim();
    const realValue = vaultRealInput.value.trim();
    const decoyValue = vaultDecoyInput.value.trim();
    const rawKeywords = vaultKeywordsInput.value.trim();

    if (!label) {
      alert('Будь ласка, вкажіть зрозумілу назву для поля');
      return;
    }
    if (!realValue) {
      alert('Будь ласка, введіть справжнє значення для захисту');
      return;
    }

    const keywords = rawKeywords
      ? rawKeywords.split(',').map((k) => k.trim()).filter(Boolean)
      : [label.toLowerCase()];

    await PersonalVaultManager.saveItem({
      category,
      label,
      realValue,
      decoyValue: decoyValue || PersonalVaultManager.generateDefaultDecoy(category),
      keywords,
    });

    vaultRealInput.value = '';
    showToast(`Збережено в сховище: ${label}`);
    await renderVault();
  });

  btnResetVaultDefaults.addEventListener('click', async () => {
    if (confirm('Відновити стандартні зразки даних сховища (Людмила, Лео, РНОКПП)?')) {
      await PersonalVaultManager.resetToDefaults();
      showToast('Сховище відновлено до стандартних');
      await renderVault();
    }
  });

  // Початкове автозаповнення полів форми
  applyCategoryDefaults(vaultCategorySelect.value as VaultItemCategory);

  // Ініціалізація
  await UserWhitelistManager.init();
  await PersonalVaultManager.init();

  // За замовчуванням завжди відкриваємо першу вкладку: СТАТИСТИКА
  await setActiveTab('stats');
});
