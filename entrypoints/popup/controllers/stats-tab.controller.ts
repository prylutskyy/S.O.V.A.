import { PersonalVaultManager } from '../../../src/core/personal-vault';

export class StatsTabController {
  private statProtectedMarkers: HTMLElement | null;
  private statVaultBadge: HTMLElement | null;

  constructor() {
    this.statProtectedMarkers = document.getElementById('statProtectedMarkers');
    this.statVaultBadge = document.getElementById('statVaultBadge');
  }

  public async updateDisplay(): Promise<void> {
    const isLocked = PersonalVaultManager.isLocked();
    const items = await PersonalVaultManager.getItems();
    const activeCount = items.filter((i) => i.enabled !== false && Boolean(i.realValue)).length;

    if (this.statProtectedMarkers) {
      this.statProtectedMarkers.innerText = isLocked ? 'Забл.' : String(activeCount);
    }
    if (this.statVaultBadge) {
      if (isLocked) {
        this.statVaultBadge.innerText = 'Введіть пароль';
        this.statVaultBadge.className = 'stat-badge amber';
      } else {
        this.statVaultBadge.innerText = `${activeCount} активних`;
        this.statVaultBadge.className = 'stat-badge green';
      }
    }
  }
}
