import { UserWhitelistManager } from '../../src/core/user-whitelist';
import { PersonalVaultManager } from '../../src/core/personal-vault';
import { VaultItemCategory } from '../../src/types/vault';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements: Tabs
  const tabBtnWhitelist = document.getElementById('tabBtnWhitelist') as HTMLButtonElement;
  const tabBtnVault = document.getElementById('tabBtnVault') as HTMLButtonElement;
  const tabContentWhitelist = document.getElementById('tabContentWhitelist') as HTMLElement;
  const tabContentVault = document.getElementById('tabContentVault') as HTMLElement;

  // Elements: Whitelist tab
  const currentHostLabel = document.getElementById('currentHostLabel') as HTMLElement;
  const btnToggleCurrent = document.getElementById('btnToggleCurrent') as HTMLButtonElement;
  const whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
  const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
  const manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
  const btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
  const btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;
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
    }, 1800);
  };

  // --- Вкладки (Segmented Control) ---
  tabBtnWhitelist.addEventListener('click', () => {
    tabBtnWhitelist.classList.add('active');
    tabBtnVault.classList.remove('active');
    tabContentWhitelist.style.display = 'block';
    tabContentVault.style.display = 'none';
  });

  tabBtnVault.addEventListener('click', async () => {
    tabBtnVault.classList.add('active');
    tabBtnWhitelist.classList.remove('active');
    tabContentVault.style.display = 'block';
    tabContentWhitelist.style.display = 'none';
    await renderVault();
  });

  // Очищення та валідація введеного домену
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

  // Оновлення списку доменів в інтерфейсі
  const renderWhitelist = async () => {
    const domains = await UserWhitelistManager.getDomains();
    whitelistTitle.innerText = `Довірені сайти (${domains.length})`;

    whitelistUl.innerHTML = '';
    if (domains.length === 0) {
      whitelistUl.innerHTML = '<li class="empty-note">Немає доданих сайтів</li>';
    } else {
      domains.sort().forEach((domain) => {
        const li = document.createElement('li');
        li.className = 'whitelist-entry';
        li.innerHTML = `
          <span class="domain-text">${domain}</span>
          <button type="button" class="btn-entry-remove" title="Видалити зі списку">✕</button>
        `;

        const btnRemove = li.querySelector('.btn-entry-remove');
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

  // Перевірка поточного сайту у вкладці
  const updateCurrentTabState = async () => {
    if (!currentTabHost) {
      currentHostLabel.innerText = 'Немає активної сторінки';
      btnToggleCurrent.style.display = 'none';
      return;
    }

    currentHostLabel.innerText = currentTabHost;
    const isAllowed = UserWhitelistManager.isDomainAllowedSync(currentTabHost);

    btnToggleCurrent.style.display = 'inline-block';
    if (isAllowed) {
      btnToggleCurrent.innerText = 'Не довіряти';
      btnToggleCurrent.className = 'btn-action-text btn-remove-allow';
    } else {
      btnToggleCurrent.innerText = '+ Довіряти';
      btnToggleCurrent.className = 'btn-action-text btn-allow';
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

  // Клік по кнопці додавання/видалення поточного сайту
  btnToggleCurrent.addEventListener('click', async () => {
    if (!currentTabHost || currentTabHost.startsWith('local-file')) return;

    const isAllowed = UserWhitelistManager.isDomainAllowedSync(currentTabHost);
    if (isAllowed) {
      await UserWhitelistManager.removeDomain(currentTabHost);
      showToast(`Видалено ${currentTabHost}`);
    } else {
      await UserWhitelistManager.allowDomain(currentTabHost);
      showToast(`Додано ${currentTabHost}`);
    }
    await renderWhitelist();
    updateCurrentTabState();
  });

  // Ручне додавання домену
  btnAddManual.addEventListener('click', async () => {
    const rawVal = manualHostInput.value;
    const domain = cleanDomain(rawVal);
    if (!domain || domain.length < 3) {
      alert('Будь ласка, введіть коректний домен (наприклад: myshop.ua)');
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

  // Очистити весь список
  btnClearAllWhitelist.addEventListener('click', async () => {
    if (confirm('Очистити всі домени з персонального списку довірених?')) {
      await UserWhitelistManager.clearAll();
      showToast('Список довірених сайтів очищено');
      await renderWhitelist();
      updateCurrentTabState();
    }
  });

  // Скинути Tainted Context Window
  btnResetContext.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
      }
    } catch {}
    showToast('Контекстне вікно загрози скинуто');
  });

  // ==========================================
  // ЛОГІКА СХОВИЩА VAULT & CANARY DECOYS
  // ==========================================

  const renderVault = async () => {
    const items = await PersonalVaultManager.getItems();
    vaultTitle.innerText = `Захищені маркери (${items.length})`;

    vaultUl.innerHTML = '';
    if (items.length === 0) {
      vaultUl.innerHTML = '<li class="empty-note">У сховищі немає збережених маркерів</li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'vault-item';
      li.innerHTML = `
        <div class="vault-item-header">
          <span class="vault-item-label">${item.label}</span>
          <button type="button" class="btn-entry-remove" title="Видалити маркер" data-id="${item.id}">✕</button>
        </div>
        <div class="vault-item-details">
          <span class="vault-val-real" title="Справжнє секретне значення">🔐 ${item.realValue}</span>
          <span class="vault-val-decoy" title="Підставляється при активації Canary Decoy">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Декой: ${item.decoyValue}
          </span>
        </div>
      `;

      const btnRemove = li.querySelector('.btn-entry-remove');
      btnRemove?.addEventListener('click', async () => {
        await PersonalVaultManager.deleteItem(item.id);
        showToast(`Видалено: ${item.label}`);
        await renderVault();
      });

      vaultUl.appendChild(li);
    });
  };

  // Автозаповнення форми при зміні категорії
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

  // Додавання нового маркера до сховища
  btnAddVaultItem.addEventListener('click', async () => {
    const category = vaultCategorySelect.value as VaultItemCategory;
    const label = vaultLabelInput.value.trim();
    const realValue = vaultRealInput.value.trim();
    const decoyValue = vaultDecoyInput.value.trim();
    const rawKeywords = vaultKeywordsInput.value.trim();

    if (!label) {
      alert('Будь ласка, вкажіть назву поля або маркера');
      return;
    }
    if (!realValue) {
      alert('Будь ласка, введіть справжнє значення для моніторингу');
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
    showToast(`Збережено маркер: ${label}`);
    await renderVault();
  });

  // Скидання сховища до дефолтних налаштувань
  btnResetVaultDefaults.addEventListener('click', async () => {
    if (confirm('Відновити стандартні тестові маркери (Людмила, Лео, РНОКПП)?')) {
      await PersonalVaultManager.resetToDefaults();
      showToast('Сховище відновлено до стандартних значень');
      await renderVault();
    }
  });

  // Початкове налаштування полів форми
  applyCategoryDefaults(vaultCategorySelect.value as VaultItemCategory);

  // Ініціалізація
  await UserWhitelistManager.init();
  await PersonalVaultManager.init();
  await renderWhitelist();
  updateCurrentTabState();
});
