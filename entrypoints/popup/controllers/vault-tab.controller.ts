import { PersonalVaultManager } from '../../../src/core/personal-vault';
import { VaultItemCategory, VaultItem } from '../../../src/types/vault';
import { i18n } from '../../../src/core/i18n';

export type ConfirmDialogHandler = (options: {
  title: string;
  body: string;
  confirmText?: string;
  onConfirm: () => Promise<void> | void;
}) => void;

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
  private confirmDialog?: ConfirmDialogHandler;

  constructor(
    showToast: (msg: string) => void,
    onStatsChanged: () => void,
    confirmDialog?: ConfirmDialogHandler
  ) {
    this.showToast = showToast;
    this.onStatsChanged = onStatsChanged;
    this.confirmDialog = confirmDialog;

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
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      case 'TAX_ID':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/></svg>';
      case 'SECRET_WORD':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      case 'PASSPORT_ID':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 17a5 5 0 0 1 10 0"/></svg>';
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

  private getCategoryTitle(cat: VaultItemCategory, defaultLabel: string): string {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME': return i18n.getMessage('vaultItemMotherMaiden');
      case 'TAX_ID': return i18n.getMessage('vaultItemTaxId');
      case 'SECRET_WORD': return i18n.getMessage('vaultItemSecretWord');
      case 'PASSPORT_ID': return i18n.getMessage('vaultItemPassportId');
      case 'DATE_OF_BIRTH': return i18n.getMessage('vaultItemDob');
      case 'FINANCIAL_PHONE': return i18n.getMessage('vaultItemFinancialPhone');
      case 'FATHER_NAME': return i18n.getMessage('vaultItemFatherName');
      default: return defaultLabel;
    }
  }

  private getCategoryExplanation(cat: VaultItemCategory): string {
    switch (cat) {
      case 'MOTHER_MAIDEN_NAME':
        return i18n.getMessage('vaultExplainMotherMaiden');
      case 'TAX_ID':
        return i18n.getMessage('vaultExplainTaxId');
      case 'SECRET_WORD':
        return i18n.getMessage('vaultExplainSecretWord');
      case 'PASSPORT_ID':
        return i18n.getMessage('vaultExplainPassportId');
      case 'DATE_OF_BIRTH':
        return i18n.getMessage('vaultExplainDob');
      case 'FINANCIAL_PHONE':
        return i18n.getMessage('vaultExplainFinancialPhone');
      case 'FATHER_NAME':
        return i18n.getMessage('vaultExplainFatherName');
      default:
        return i18n.getMessage('vaultExplainCustom');
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
          ? i18n.getMessage('vaultStatsActiveWait', [countText])
          : i18n.getMessage('vaultStatsBasicWait');
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
      this.vaultActiveCountLabel.innerText = i18n.getMessage('vaultItemsCountActive', [activeCount.toString(), items.length.toString()]);
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
      const groupEl = this.createInsetGroup(i18n.getMessage('vaultGroupBanking'), bankingItems);
      this.vaultCategoriesContainer.appendChild(groupEl);
    }

    // Рендер Групи 2 (Особисті документи)
    if (personalItems.length > 0) {
      const groupEl = this.createInsetGroup(i18n.getMessage('vaultGroupDocs'), personalItems);
      this.vaultCategoriesContainer.appendChild(groupEl);
    }
  }

  private createInsetGroup(title: string, groupItems: VaultItem[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vault-group-wrap';

    const label = document.createElement('div');
    label.className = 'vault-group-label';
    label.innerText = title;
    wrap.appendChild(label);

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

      let statusCapsuleHtml = '<span class="vault-status-capsule empty">' + i18n.getMessage('vaultStatusNotSet') + '</span>';
      if (isEnabled) {
        statusCapsuleHtml = '<span class="vault-status-capsule active"><span class="vault-dot"></span>' + i18n.getMessage('vaultStatusProtected') + '</span>';
      } else if (isFilled && !isEnabled) {
        statusCapsuleHtml = '<span class="vault-status-capsule paused">' + i18n.getMessage('shieldTabStatusPaused') + '</span>';
      }

      row.innerHTML = `
        <div class="vault-row-lead">
          <div class="vault-row-icon ${isEnabled ? 'active' : ''}">
            ${this.getCategoryIconSvg(item.category)}
          </div>
          <div class="vault-row-info">
            <div class="vault-row-title">${this.getCategoryTitle(item.category, item.label)}</div>
            <div class="vault-row-meta">${isFilled ? '••••••••' : i18n.getMessage('vaultItemNotSetDesc')}</div>
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
            <label class="vault-field-label">${i18n.getMessage('vaultItemRealLabelDevice')}</label>
            <div class="vault-input-wrap">
              <input type="password" class="sanctuary-input mono vault-real-input" value="${item.realValue || ''}" placeholder="${i18n.getMessage('vaultItemRealPlaceholderDevice')}">
              <button type="button" class="vault-eye-btn" title="Показати/приховати">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <div class="vault-field-group">
            <label class="vault-field-label">${i18n.getMessage('vaultItemDecoyLabelDevice')}</label>
            <input type="text" class="sanctuary-input mono vault-decoy-input" value="${item.decoyValue || ''}" placeholder="${PersonalVaultManager.generateDefaultDecoy(item.category)}">
            <div class="vault-field-hint">${i18n.getMessage('vaultItemDecoyHintDevice')}</div>
          </div>

          <div class="vault-help-box">
            ${this.getCategoryExplanation(item.category)}
          </div>

          <div class="vault-actions-row">
            <button type="button" class="btn-primary vault-save-btn">
              <span>${i18n.getMessage('vaultItemBtnSave')}</span>
            </button>
            <button type="button" class="btn-subtle vault-clear-btn">
              <span>${i18n.getMessage('vaultItemBtnClear')}</span>
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
        this.showToast(i18n.getMessage('toastPasswordTooShort') || '');
        return;
      }
      if (pw !== confirm) {
        this.showToast(i18n.getMessage('toastPasswordsMismatch') || '');
        return;
      }

      await PersonalVaultManager.setupMasterPassword(pw);
      this.vaultSetupPassword.value = '';
      this.vaultSetupConfirm.value = '';
      this.showToast(i18n.getMessage('toastVaultCreatedUnlocked') || '');
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
        this.showToast(i18n.getMessage('toastVaultUnlocked') || '');
        await this.renderSplitView();

        this.onStatsChanged();
      } else {
        this.showToast(i18n.getMessage('toastWrongPassword') || '');
      }
    });

    this.vaultUnlockPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnUnlockVault.click();
      }
    });

    // 3. Заблокувати сховище (Lock Personal Vault)
    const handleLockVault = async () => {
      await PersonalVaultManager.lock();
      this.isUiLocked = true;
      this.expandedItemId = null;
      this.vaultUnlockPassword.value = '';
      if (this.vaultCategoriesContainer) {
        this.vaultCategoriesContainer.innerHTML = '';
      }
      this.showToast(i18n.getMessage('toastVaultLockedBg') || '');
      await this.renderSplitView();
      this.onStatsChanged();
    };

    this.btnLockVault?.addEventListener('click', handleLockVault);

    const btnQuickLock = document.getElementById('btnQuickLock');
    btnQuickLock?.addEventListener('click', handleLockVault);

    // Слухаємо блокування сховища з інших контекстів
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'session') {
          // Якщо ключ шифрування видалено із сесії — сховище заблоковано в іншому контексті
          if ('threat_shield_vault_key_jwk' in changes) {
            const hasNewKey = Boolean(changes['threat_shield_vault_key_jwk']?.newValue);
            if (!hasNewKey) {
              this.isUiLocked = true;
              this.expandedItemId = null;
              if (this.vaultCategoriesContainer) {
                this.vaultCategoriesContainer.innerHTML = '';
              }
            } else {
              this.isUiLocked = false;
            }
            this.renderSplitView().catch(() => {});
          } else if ('threat_shield_vault_decrypted' in changes) {
            // Оновилися маркери без зміни статусу ключа (збереження маркера) — не блокуємо UI
            if (!this.isUiLocked && !PersonalVaultManager.isLocked()) {
              this.renderVaultContent().catch(() => {});
              this.onStatsChanged();
            }
          }
        }
      });
    }

    // 4. Скинути сховище до дефолту
    this.btnResetVaultDefaults?.addEventListener('click', async () => {
      const doReset = async () => {
        await PersonalVaultManager.resetToDefaults();
        this.expandedItemId = null;
        this.showToast('Сховище скинуто до початкового стану');
        await this.renderVaultContent();
        this.onStatsChanged();
      };

      if (this.confirmDialog) {
        this.confirmDialog({
          title: 'Скинути сховище?',
          body: 'Усі налаштовані маркери та персональні дані буде видалено та повернено до початкового стану.',
          confirmText: 'Скинути',
          onConfirm: doReset,
        });
      } else if (confirm('Скинути всі налаштовані маркери та очистити сховище?')) {
        await doReset();
      }
    });
  }
}
