import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { VaultItemCategory } from '../../../src/types/vault';

export class VaultTabController {
  private vaultSetupState: HTMLElement;
  private vaultLockedState: HTMLElement;
  private vaultUnlockedState: HTMLElement;

  private vaultSetupPassword: HTMLInputElement;
  private vaultSetupConfirm: HTMLInputElement;
  private btnSetupVault: HTMLButtonElement;

  private vaultUnlockPassword: HTMLInputElement;
  private btnUnlockVault: HTMLButtonElement;
  private btnLockVault: HTMLButtonElement;

  private vaultSidebarList: HTMLElement;
  private detailItemLabel: HTMLElement;
  private detailItemTier: HTMLElement;
  private detailSwitchText: HTMLElement;
  private detailItemToggle: HTMLInputElement;
  private detailRealInput: HTMLInputElement;
  private detailDecoyInput: HTMLInputElement;
  private detailKeywordsInput: HTMLInputElement;
  private btnSaveDetailItem: HTMLButtonElement;
  private btnClearDetailItem: HTMLButtonElement;
  private btnResetVaultDefaults: HTMLButtonElement;
  private detailHelpBox: HTMLElement;

  private selectedVaultItemId: string = '';
  private showToast: (msg: string) => void;
  private onStatsChanged: () => void;

  constructor(showToast: (msg: string) => void, onStatsChanged: () => void) {
    this.showToast = showToast;
    this.onStatsChanged = onStatsChanged;

    this.vaultSetupState = document.getElementById('vaultSetupState') as HTMLElement;
    this.vaultLockedState = document.getElementById('vaultLockedState') as HTMLElement;
    this.vaultUnlockedState = document.getElementById('vaultUnlockedState') as HTMLElement;

    this.vaultSetupPassword = document.getElementById('vaultSetupPassword') as HTMLInputElement;
    this.vaultSetupConfirm = document.getElementById('vaultSetupConfirm') as HTMLInputElement;
    this.btnSetupVault = document.getElementById('btnSetupVault') as HTMLButtonElement;

    this.vaultUnlockPassword = document.getElementById('vaultUnlockPassword') as HTMLInputElement;
    this.btnUnlockVault = document.getElementById('btnUnlockVault') as HTMLButtonElement;
    this.btnLockVault = document.getElementById('btnLockVault') as HTMLButtonElement;

    this.vaultSidebarList = document.getElementById('vaultSidebarList') as HTMLElement;
    this.detailItemLabel = document.getElementById('detailItemLabel') as HTMLElement;
    this.detailItemTier = document.getElementById('detailItemTier') as HTMLElement;
    this.detailSwitchText = document.getElementById('detailSwitchText') as HTMLElement;
    this.detailItemToggle = document.getElementById('detailItemToggle') as HTMLInputElement;
    this.detailRealInput = document.getElementById('detailRealInput') as HTMLInputElement;
    this.detailDecoyInput = document.getElementById('detailDecoyInput') as HTMLInputElement;
    this.detailKeywordsInput = document.getElementById('detailKeywordsInput') as HTMLInputElement;
    this.btnSaveDetailItem = document.getElementById('btnSaveDetailItem') as HTMLButtonElement;
    this.btnClearDetailItem = document.getElementById('btnClearDetailItem') as HTMLButtonElement;
    this.btnResetVaultDefaults = document.getElementById('btnResetVaultDefaults') as HTMLButtonElement;
    this.detailHelpBox = document.getElementById('detailHelpBox') as HTMLElement;

    this.bindEvents();
  }

  private getCategoryIconSvg(cat: VaultItemCategory): string {
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
  }

  private getCategoryExplanation(cat: VaultItemCategory): string {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return '<strong>Чому це важливо?</strong> Дівоче прізвище матері — це секретний маркер банку. Жодна служба доставки не має права запитувати його для оплати.';
      case 'TAX_ID':
        return '<strong>Чому це важливо?</strong> Номер РНОКПП (ІПН) шахраї виманюють для підробки фінансових договорів та онлайн-кредитів.';
      case 'SECRET_WORD':
        return '<strong>Чому це важливо?</strong> Секретне кодове слово банку дає повний доступ до телефонного банкінгу та зміни фінансового номера картки.';
      case 'PASSPORT_ID':
        return '<strong>Чому це важливо?</strong> Серія та номер паспорта чи ID-картки запитуються зловмисниками для проходження фіктивного KYC.';
      case 'DATE_OF_BIRTH':
        return '<strong>Чому це важливо?</strong> Разом з вашим іменем дата народження використовується для верифікації в службах клієнтської підтримки.';
      case 'FINANCIAL_PHONE':
        return '<strong>Чому це важливо?</strong> Фінансовий номер отримує одноразові SMS-коди підтвердження платежів. Захист блокує спроби виманювання номера.';
      case 'FATHER_NAME':
        return "<strong>Чому це важливо?</strong> Ім'я батька / по батькові використовується банківськими системами як додатковий верифікатор особи клієнта.";
      default:
        return '<strong>Власний маркер:</strong> Будь-яка інша конфіденційна комбінація символів, яку ви хочете захистити від витоку.';
    }
  }

  public async renderSplitView(): Promise<void> {
    const hasSetup = await PersonalVaultManager.hasVaultSetup();

    if (!hasSetup) {
      this.vaultSetupState.style.display = 'flex';
      this.vaultSetupState.style.flexDirection = 'column';
      this.vaultLockedState.style.display = 'none';
      this.vaultUnlockedState.style.display = 'none';
      return;
    }

    if (PersonalVaultManager.isLocked()) {
      this.vaultSetupState.style.display = 'none';
      this.vaultLockedState.style.display = 'flex';
      this.vaultLockedState.style.flexDirection = 'column';
      this.vaultUnlockedState.style.display = 'none';
      return;
    }

    this.vaultSetupState.style.display = 'none';
    this.vaultLockedState.style.display = 'none';
    this.vaultUnlockedState.style.display = 'block';

    const items = await PersonalVaultManager.getItems();

    if (!this.selectedVaultItemId || !items.some((i) => i.id === this.selectedVaultItemId)) {
      this.selectedVaultItemId = items[0]?.id || '';
    }

    // Рендеринг списку зліва
    this.vaultSidebarList.innerHTML = `<div class="vault-section-label">Об'єкти захисту (${items.length})</div>`;

    items.forEach((item) => {
      const isFilled = Boolean(item.realValue && item.realValue.trim().length > 0);
      const isEnabled = item.enabled !== false;
      const isActive = isFilled && isEnabled;
      const isSelected = item.id === this.selectedVaultItemId;

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
          ${this.getCategoryIconSvg(item.category)}
        </div>
        <div class="vault-item-info">
          <span class="vault-item-label" title="${item.label}">${item.label}</span>
          <span class="vault-item-status ${statusClass}">${statusText}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        this.selectedVaultItemId = item.id;
        this.renderSplitView();
      });

      this.vaultSidebarList.appendChild(btn);
    });

    // Рендеринг деталей справа
    const selectedItem = items.find((i) => i.id === this.selectedVaultItemId);
    if (!selectedItem) return;

    this.detailItemLabel.innerText = selectedItem.label;
    const tier = PersonalVaultManager.getCategoryTier(selectedItem.category);
    if (tier === 'TIER_A_ABSOLUTE') {
      this.detailItemTier.innerText = 'Tier A: Абсолютний захист';
      this.detailItemTier.className = 'tier-tag a';
    } else {
      this.detailItemTier.innerText = 'Tier B: Контекстний захист';
      this.detailItemTier.className = 'tier-tag b';
    }

    const isItemEnabled = selectedItem.enabled !== false;
    this.detailItemToggle.checked = isItemEnabled;
    this.detailSwitchText.innerText = isItemEnabled ? 'Активний' : 'Вимкнено';

    this.detailRealInput.value = selectedItem.realValue || '';
    this.detailDecoyInput.value = selectedItem.decoyValue || '';
    this.detailKeywordsInput.value = (selectedItem.keywords || []).join(', ');

    this.detailHelpBox.innerHTML = this.getCategoryExplanation(selectedItem.category);
  }

  private bindEvents(): void {
    this.btnSetupVault.addEventListener('click', async () => {
      const pw = this.vaultSetupPassword.value;
      const confirm = this.vaultSetupConfirm.value;
      if (!pw || pw.length < 4) {
        alert('Пароль занадто короткий. Мінімум 4 символи.');
        return;
      }
      if (pw !== confirm) {
        alert('Паролі не співпадають!');
        return;
      }

      await PersonalVaultManager.setupMasterPassword(pw);
      this.vaultSetupPassword.value = '';
      this.vaultSetupConfirm.value = '';
      this.showToast('Сховище успішно створено та розблоковано!');
      await this.renderSplitView();
      this.onStatsChanged();
    });

    this.btnUnlockVault.addEventListener('click', async () => {
      const pw = this.vaultUnlockPassword.value;
      if (!pw) return;

      const success = await PersonalVaultManager.unlock(pw);
      if (success) {
        this.vaultUnlockPassword.value = '';
        this.showToast('Сховище розблоковано');
        await this.renderSplitView();
        this.onStatsChanged();
      } else {
        alert('Невірний пароль!');
      }
    });

    this.btnLockVault.addEventListener('click', async () => {
      await PersonalVaultManager.lock();
      this.showToast('Сховище заблоковано');
      await this.renderSplitView();
      this.onStatsChanged();
    });

    this.detailItemToggle.addEventListener('change', () => {
      this.detailSwitchText.innerText = this.detailItemToggle.checked ? 'Активний' : 'Вимкнено';
    });

    this.btnSaveDetailItem.addEventListener('click', async () => {
      const items = await PersonalVaultManager.getItems();
      const item = items.find((i) => i.id === this.selectedVaultItemId);
      if (!item) return;

      const realVal = this.detailRealInput.value.trim();
      const decoyVal = this.detailDecoyInput.value.trim();
      const rawKw = this.detailKeywordsInput.value.trim();
      const isEnabled = this.detailItemToggle.checked;

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

      this.showToast(`Налаштування збережено: ${item.label}`);
      await this.renderSplitView();
      this.onStatsChanged();
    });

    this.btnClearDetailItem.addEventListener('click', async () => {
      this.detailRealInput.value = '';
      this.detailItemToggle.checked = false;
      this.detailSwitchText.innerText = 'Вимкнено';
    });

    this.btnResetVaultDefaults.addEventListener('click', async () => {
      if (confirm('Відновити стандартні зразки даних сховища?')) {
        await PersonalVaultManager.resetToDefaults();
        this.showToast('Сховище відновлено до стандартних');
        await this.renderSplitView();
        this.onStatsChanged();
      }
    });
  }
}
