import { UserWhitelistManager } from '../../src/core/user-whitelist';

document.addEventListener('DOMContentLoaded', async () => {
  const currentHostLabel = document.getElementById('currentHostLabel') as HTMLElement;
  const btnToggleCurrent = document.getElementById('btnToggleCurrent') as HTMLButtonElement;
  const whitelistTitle = document.getElementById('whitelistTitle') as HTMLElement;
  const whitelistUl = document.getElementById('whitelistUl') as HTMLUListElement;
  const manualHostInput = document.getElementById('manualHostInput') as HTMLInputElement;
  const btnAddManual = document.getElementById('btnAddManual') as HTMLButtonElement;
  const btnClearAllWhitelist = document.getElementById('btnClearAllWhitelist') as HTMLButtonElement;
  const btnResetContext = document.getElementById('btnResetContext') as HTMLButtonElement;
  const toastMessage = document.getElementById('toastMessage') as HTMLElement;

  let currentTabHost: string = '';

  const showToast = (msg: string) => {
    toastMessage.innerText = msg;
    toastMessage.style.display = 'block';
    setTimeout(() => {
      toastMessage.style.display = 'none';
    }, 1800);
  };

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

  // Ініціалізація
  await UserWhitelistManager.init();
  await renderWhitelist();
  updateCurrentTabState();
});
