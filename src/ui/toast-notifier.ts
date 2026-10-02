/**
 * ToastNotifier (повністю деактивовано)
 * Плаваючі popup-сповіщення (тоасти) повністю усунено із системи розширення
 * відповідно до принципів оптичного спокою. Контекстна безпека забезпечується
 * локальними мікро-пігулками (FieldLivePill, ChatLivePill) безпосередньо біля
 * інпутів та модальними вікнами безпеки (UnifiedFrictionModal).
 */
export class ToastNotifier {
  /**
   * Очищення історії сповіщень
   */
  public static clearHistory(): void {}

  /**
   * Граматично бездоганне відмінювання числівників в українській мові
   */
  public static formatPluralUkrainian(
    count: number,
    one: string,
    few: string,
    many: string
  ): string {
    const abs = Math.abs(count) % 100;
    const rem = abs % 10;
    if (abs > 10 && abs < 20) return `${count} ${many}`;
    if (rem > 1 && rem < 5) return `${count} ${few}`;
    if (rem === 1) return `${count} ${one}`;
    return `${count} ${many}`;
  }

  /**
   * Повністю деактивовано: виклики цієї функції повертають null і ніколи не створюють
   * DOM-елементів та не показують спливаючих капсул на вебсторінці.
   */
  public static show(
    _message: string,
    _type: 'warning' | 'error' | 'info' = 'info',
    _durationMs?: number
  ): HTMLElement | null {
    return null;
  }
}
