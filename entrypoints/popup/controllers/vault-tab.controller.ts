import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { VaultItemCategory, VaultItem } from '../../../src/types/vault';

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

  private vaultActiveCountLabel: HTMLElement;
  private vaultRingProgress: SVGCircleElement | null;
  private vaultRingPercent: HTMLElement | null;
  private vaultCategoriesContainer: HTMLElement;
  private btnResetVaultDefaults: HTMLButtonElement | null;

  private expandedItemId: string | null = null;
  private isUiLocked: boolean = false;
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

    this.vaultActiveCountLabel = document.getElementById('vaultActiveCountLabel') as HTMLElement;
    this.vaultRingProgress = document.getElementById('vaultRingProgress') as unknown as SVGCircleElement | null;
    this.vaultRingPercent = document.getElementById('vaultRingPercent');
    this.vaultCategoriesContainer = document.getElementById('vaultCategoriesContainer') as HTMLElement;
    this.btnResetVaultDefaults = document.getElementById('btnResetVaultDefaults') as HTMLButtonElement | null;

    this.bindGlobalEvents();
  }

  private getCategoryIconSvg(cat: VaultItemCategory): string {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      case 'TAX_ID':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
      case 'SECRET_WORD':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>';
      case 'PASSPORT_ID':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>';
      case 'DATE_OF_BIRTH':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      case 'FINANCIAL_PHONE':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
      case 'FATHER_NAME':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      default:
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
  }

  private getCategoryExplanation(cat: VaultItemCategory): string {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return '<strong>Чому це критично:</strong> Контрольний маркер у банківських системах. Жодна служба доставки чи покупець не має права запитувати дівоче прізвище матері для переказу коштів.';
      case 'TAX_ID':
        return '<strong>Чому це критично:</strong> Номер РНОКПП (ІПН) шахраї виманюють для оформлення онлайн-мікропозик та підробки кредитних договорів.';
      case 'SECRET_WORD':
        return '<strong>Чому це критично:</strong> Кодове слово банку дає повний доступ до телефонного банкінгу та дозволяє шахраям скинути пароль до вашого кабінету.';
      case 'PASSPORT_ID':
        return '<strong>Чому це критично:</strong> Серія та номер паспорта чи ID-картки запитуються зловмисниками для проходження фіктивної верифікації особи.';
      case 'DATE_OF_BIRTH':
        return '<strong>Чому це критично:</strong> Дата народження використовується як допоміжний верифікатор для зміни фінансових лімітів та карток.';
      case 'FINANCIAL_PHONE':
        return '<strong>Чому це критично:</strong> На фінансовий номер надходять SMS-коди підтвердження платежів. Захист блокує спроби його викрадення.';
      case 'FATHER_NAME':
        return "<strong>Чому це критично:</strong> Ім'я батька / по батькові використовується банками для додаткової перевірки особи при відновленні доступу.";
      default:
        return '<strong>Власний маркер:</strong> Конфіденційна комбінація символів, яку ви захищаєте від витоку.';
    }
  }

  public async renderSplitView(): Promise<void> {
    const hasSetup = await PersonalVaultManager.hasVaultSetup();

    if (!hasSetup) {
      this.vaultSetupState.style.display = 'flex';
      this.vaultLockedState.style.display = 'none';
      this.vaultUnlockedState.style.display = 'none';
      return;
    }

    const hasSession = await PersonalVaultManager.hasActiveSession();

    // Якщо екран замкнено користувачем або сеанс ще не розблоковано в сховищі
    if (this.isUiLocked || PersonalVaultManager.isLocked()) {
      this.vaultSetupState.style.display = 'none';
      this.vaultLockedState.style.display = 'flex';
      this.vaultUnlockedState.style.display = 'none';

      const daemonStatusEl = document.getElementById('vaultLockedDaemonStatus');
      const daemonBannerEl = document.getElementById('vaultDaemonBanner');
      const activeCount = PersonalVaultManager.getActiveSignaturesCount();
      const countText = activeCount > 0 ? `${activeCount} рубежів` : '7 рубежів';
      if (daemonStatusEl) {
        daemonStatusEl.innerText = hasSession
          ? `Фоновий захист активний: ${countText} на варті`
          : 'Базовий моніторинг форм активний';
      }
      if (daemonBannerEl) {
        if (hasSession) {
          daemonBannerEl.classList.remove('paused');
        } else {
          daemonBannerEl.classList.add('paused');
        }
      }

      return;
    }

    this.vaultSetupState.style.display = 'none';
    this.vaultLockedState.style.display = 'none';
    this.vaultUnlockedState.style.display = 'flex';

    await this.renderVaultContent();
  }

  private async renderVaultContent(): Promise<void> {
    const items = await PersonalVaultManager.getItems();
    const activeCount = items.filter(
      (i) => i.enabled !== false && Boolean(i.realValue && i.realValue.trim().length > 0)
    ).length;

    // 1. Оновлення Hero Health Ring
    const percent = items.length > 0 ? Math.round((activeCount / items.length) * 100) : 0;
    if (this.vaultActiveCountLabel) {
      this.vaultActiveCountLabel.innerText = `${activeCount} з ${items.length} рубежів активовано`;
    }
    if (this.vaultRingPercent) {
      this.vaultRingPercent.innerText = `${percent}%`;
    }

    if (this.vaultRingProgress) {
      const circ = 201; // 2 * pi * 32
      const offset = circ - (circ * percent) / 100;
      this.vaultRingProgress.style.strokeDasharray = `${circ}`;
      this.vaultRingProgress.style.strokeDashoffset = `${offset}`;

      const ringColor =
        percent === 100 ? '#34C759' : percent >= 50 ? '#0071E3' : percent > 0 ? '#FF9500' : 'rgba(0, 0, 0, 0.12)';
      this.vaultRingProgress.style.stroke = ringColor;
    }

    // 2. Розбиття на Apple Inset Groups (без інженерного жаргону)
    const bankingItems = items.filter(
      (i) => PersonalVaultManager.getCategoryTier(i.category) === 'TIER_A_ABSOLUTE'
    );
    const personalItems = items.filter(
      (i) => PersonalVaultManager.getCategoryTier(i.category) === 'TIER_B_CONDITIONAL'
    );

    this.vaultCategoriesContainer.innerHTML = '';

    // Рендер Групи 1 (Банківські дані)
    if (bankingItems.length > 0) {
      const groupEl = this.createInsetGroup(
        'Банківські та фінансові дані',
        'Абсолютний захист: заборона неавторизованої передачі на сторонніх вебсайтах',
        bankingItems
      );
      this.vaultCategoriesContainer.appendChild(groupEl);
    }

    // Рендер Групи 2 (Особисті документи)
    if (personalItems.length > 0) {
      const groupEl = this.createInsetGroup(
        'Особисті документи та маркери',
        'Контекстний захист: аналіз форм на фішинг та автопідміна фантомом',
        personalItems
      );
      this.vaultCategoriesContainer.appendChild(groupEl);
    }
  }

  private createInsetGroup(title: string, subtitle: string, groupItems: VaultItem[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vault-group-wrap';

    const label = document.createElement('div');
    label.className = 'vault-group-label';
    label.innerText = title;
    wrap.appendChild(label);

    const desc = document.createElement('div');
    desc.className = 'vault-group-desc';
    desc.innerText = subtitle;
    wrap.appendChild(desc);

    const inset = document.createElement('div');
    inset.className = 'vault-inset-group';

    groupItems.forEach((item) => {
      const isExpanded = this.expandedItemId === item.id;
      const isFilled = Boolean(item.realValue && item.realValue.trim().length > 0);
      const isEnabled = item.enabled === true && isFilled;

      const itemCard = document.createElement('div');
      itemCard.className = `vault-accordion-item ${isExpanded ? 'expanded' : ''}`;

      // Рядок-заголовок
      const row = document.createElement('div');
      row.className = 'vault-item-row';

      let statusCapsuleHtml = '<span class="vault-status-capsule empty">Не налаштовано</span>';
      if (isEnabled) {
        statusCapsuleHtml = '<span class="vault-status-capsule active"><span class="vault-dot"></span>Захищено</span>';
      } else if (isFilled && !isEnabled) {
        statusCapsuleHtml = '<span class="vault-status-capsule paused">Призупинено</span>';
      }

      row.innerHTML = `
        <div class="vault-row-lead">
          <div class="vault-row-icon ${isEnabled ? 'active' : ''}">
            ${this.getCategoryIconSvg(item.category)}
          </div>
          <div class="vault-row-info">
            <div class="vault-row-title">${item.label}</div>
            <div class="vault-row-meta">${isFilled ? '••••••••' : 'Маркер не налаштовано'}</div>
          </div>
        </div>
        <div class="vault-row-end">
          ${statusCapsuleHtml}
          <svg class="vault-chevron ${isExpanded ? 'rotated' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      `;

      row.addEventListener('click', () => {
        this.expandedItemId = isExpanded ? null : item.id;
        this.renderVaultContent();
      });

      itemCard.appendChild(row);

      // Внутрішній розгорнутий Accordion Panel
      if (isExpanded) {
        const panel = document.createElement('div');
        panel.className = 'vault-accordion-panel';

        panel.innerHTML = `
          <div class="vault-field-group">
            <label class="vault-field-label">Справжнє значення (зашифровано на пристрої)</label>
            <div class="vault-input-wrap">
              <input type="password" class="sanctuary-input mono vault-real-input" value="${item.realValue || ''}" placeholder="Введіть ваше справжнє значення">
              <button type="button" class="vault-eye-btn" title="Показати/приховати">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <div class="vault-field-group">
            <label class="vault-field-label">Цифровий двійник (Фантом для підміни)</label>
            <input type="text" class="sanctuary-input mono vault-decoy-input" value="${item.decoyValue || ''}" placeholder="${PersonalVaultManager.generateDefaultDecoy(item.category)}">
            <div class="vault-field-hint">Система підставить цю безпечну приманку фішинговим формам замість ваших даних.</div>
          </div>

          <div class="vault-help-box">
            ${this.getCategoryExplanation(item.category)}
          </div>

          <div class="vault-actions-row">
            <button type="button" class="btn-primary vault-save-btn">
              <span>Зберегти</span>
            </button>
            <button type="button" class="btn-subtle vault-clear-btn">
              <span>Очистити</span>
            </button>
          </div>
        `;

        const realInput = panel.querySelector('.vault-real-input') as HTMLInputElement;
        const decoyInput = panel.querySelector('.vault-decoy-input') as HTMLInputElement;
        const eyeBtn = panel.querySelector('.vault-eye-btn') as HTMLButtonElement;
        const saveBtn = panel.querySelector('.vault-save-btn') as HTMLButtonElement;
        const clearBtn = panel.querySelector('.vault-clear-btn') as HTMLButtonElement;

        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          realInput.type = realInput.type === 'password' ? 'text' : 'password';
        });

        const performSave = async () => {
          const realVal = realInput.value.trim();
          const decoyVal = decoyInput.value.trim();
          const hasValue = realVal.length > 0;

          await PersonalVaultManager.saveItem({
            id: item.id,
            category: item.category,
            label: item.label,
            realValue: realVal,
            decoyValue: decoyVal || (hasValue ? PersonalVaultManager.generateDefaultDecoy(item.category) : ''),
            keywords: item.keywords,
            enabled: hasValue,
          });

          this.showToast(hasValue ? `Захищено: ${item.label}` : `Очищено: ${item.label}`);
          this.expandedItemId = null; // Згортаємо після збереження
          await this.renderVaultContent();
          this.onStatsChanged();
        };

        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          performSave();
        });

        clearBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          realInput.value = '';
          decoyInput.value = '';
          await performSave();
        });

        realInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            performSave();
          }
        });
        decoyInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            performSave();
          }
        });

        itemCard.appendChild(panel);
      }

      inset.appendChild(itemCard);
    });

    wrap.appendChild(inset);
    return wrap;
  }

  private bindGlobalEvents(): void {
    // 1. Налаштування майстер-пароля
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
      this.showToast('Сховище створено та розблоковано');
      await this.renderSplitView();
      this.onStatsChanged();
    });

    // 2. Розблокування сховища
    this.btnUnlockVault.addEventListener('click', async () => {
      const pw = this.vaultUnlockPassword.value;
      if (!pw) return;

      const success = await PersonalVaultManager.unlock(pw);
      if (success) {
        this.isUiLocked = false;
        this.vaultUnlockPassword.value = '';
        this.showToast('Консоль сховища розблоковано');
        await this.renderSplitView();
        this.onStatsChanged();
      } else {
        alert('Невірний пароль!');
      }
    });

    this.vaultUnlockPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnUnlockVault.click();
      }
    });

    // 3. Заблокувати екран сховища (Privacy Screen Lock)
    this.btnLockVault?.addEventListener('click', async () => {
      this.isUiLocked = true;
      this.expandedItemId = null;
      this.showToast('Екран сховища заблоковано. Захист активний.');
      await this.renderSplitView();
      this.onStatsChanged();
    });

    // 4. Скинути сховище до дефолту
    this.btnResetVaultDefaults?.addEventListener('click', async () => {
      if (confirm('Скинути всі налаштовані маркери та очистити сховище?')) {
        await PersonalVaultManager.resetToDefaults();
        this.expandedItemId = null;
        this.showToast('Сховище скинуто до початкового стану');
        await this.renderVaultContent();
        this.onStatsChanged();
      }
    });
  }
}
