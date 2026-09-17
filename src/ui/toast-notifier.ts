export class ToastNotifier {
  private static container: HTMLElement | null = null;

  private static init() {
    if (this.container && document.body.contains(this.container)) return;

    this.container = document.createElement('div');
    this.container.id = 'threat-shield-toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    document.body.appendChild(this.container);
  }

  public static show(message: string, type: 'warning' | 'error' | 'info' = 'info', durationMs = 5000) {
    this.init();

    const toast = document.createElement('div');

    let badgeBg = '#E8F2FF';
    let badgeBorder = '#B0D5FF';
    let badgeColor = '#0060DF';
    let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    if (type === 'warning') {
      badgeBg = '#FFF4E5';
      badgeBorder = '#FFD599';
      badgeColor = '#D76E00';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else if (type === 'error') {
      badgeBg = '#FDF2F5';
      badgeBorder = '#F8B4C0';
      badgeColor = '#D70022';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    }

    toast.style.cssText = `
      background: #FFFFFF;
      color: #15141A;
      border: 1px solid #CFCFD8;
      border-left: 4px solid ${badgeColor};
      padding: 10px 14px;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.05);
      font-size: 12.5px;
      font-weight: 500;
      opacity: 0;
      transform: scale(0.2) translateY(-10px);
      transform-origin: top right;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 360px;
      line-height: 1.35;
      pointer-events: auto;
    `;

    toast.innerHTML = `
      <div style="
        width: 22px; height: 22px; border-radius: 4px;
        background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor};
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      ">
        ${iconSvg}
      </div>
      <div style="flex: 1;">${message}</div>
    `;

    this.container!.appendChild(toast);

    // Animate in (unfold from top right)
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'scale(1) translateY(0)';
    });

    // Auto remove (fold back into top right)
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'scale(0.2) translateY(-10px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 220);
    }, durationMs);
  }
}
