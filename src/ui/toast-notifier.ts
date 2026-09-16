export class ToastNotifier {
  private static container: HTMLElement | null = null;

  private static init() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(this.container);
  }

  public static show(message: string, type: 'warning' | 'error' | 'info' = 'info', durationMs = 5000) {
    this.init();

    const toast = document.createElement('div');
    
    let bgColor = '#3B82F6';
    if (type === 'warning') bgColor = '#F59E0B';
    if (type === 'error') bgColor = '#EF4444';

    toast.style.cssText = `
      background-color: ${bgColor};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      font-weight: 500;
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
    `;

    toast.innerText = message;
    
    this.container!.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    }, durationMs);
  }
}
