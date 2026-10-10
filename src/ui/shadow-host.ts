/**
 * Ізольований Shadow DOM Host (ShadowRoot)
 * Захищає інтерфейс розширення від CSS-атак цільового сайту, забороняє перекриття чи приховування
 * попереджувальних віджетів правилами на зразок "div { display: none !important; }".
 */
import { DESIGN_TOKENS_CSS } from './design-tokens';

export class ShadowHost {
  private static hostElement: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;

  /**
   * Отримання або ініціалізація синглтона ShadowRoot
   */
  public static getRoot(): ShadowRoot {
    if (this.shadowRoot && this.hostElement && this.hostElement.isConnected) {
      return this.shadowRoot;
    }

    // Якщо хост існує, але від'єднаний
    let host = document.getElementById('sova-shadow-host') || document.getElementById('threat-shield-shadow-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sova-shadow-host';
      // Спеціальні стилі для хост-елемента: не впливає на макет сайту
      host.style.cssText = `
        all: initial !important;
        position: static !important;
        z-index: 2147483647 !important;
      `;
      (document.body || document.documentElement).appendChild(host);
    }

    this.hostElement = host;

    // Створення ізольованого закритого ShadowRoot (mode: 'closed')
    // Сторонній JS веб-сайту отримує null при спробі прочитати host.shadowRoot
    if (!this.shadowRoot) {
      try {
        this.shadowRoot = host.attachShadow({ mode: 'closed' });
        this.injectBaseStyles(this.shadowRoot);
      } catch {
        this.shadowRoot = host.shadowRoot || this.shadowRoot;
      }
    }

    if (!this.shadowRoot) {
      throw new Error('Unable to initialize the S.O.V.A. Shadow DOM host.');
    }

    return this.shadowRoot;
  }

  /**
   * Базові ізольовані стилі всередині ShadowRoot
   */
  private static injectBaseStyles(root: ShadowRoot): void {
    const style = document.createElement('style');
    style.id = 'threat-shield-base-styles';
    style.textContent = `
      ${DESIGN_TOKENS_CSS}
      :host {
        all: initial;
        display: block;
        font-family: var(--font-sanctuary);
        color: var(--sanctuary-ink-primary);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* Плавні анімації */
      @keyframes threatBackdropFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes threatModalScale {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      @keyframes threatPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.08); opacity: 0.85; }
      }

      @keyframes threatFlowDash {
        to {
          stroke-dashoffset: -24;
        }
      }

      /* Скролбар всередині модального вікна */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
        border-radius: var(--radius-pill);
      }
      ::-webkit-scrollbar-thumb {
        background: var(--sanctuary-scroll-thumb);
        border-radius: var(--radius-pill);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: var(--sanctuary-ink-tertiary);
      }
    `;
    root.appendChild(style);
  }

  /**
   * Додати компонент у ShadowRoot
   */
  public static append(element: HTMLElement | SVGElement): void {
    const root = this.getRoot();
    root.appendChild(element);
  }

  /**
   * Видалити компонент із ShadowRoot
   */
  public static remove(element: HTMLElement | SVGElement): void {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  /**
   * Очистити всі динамічні компоненти у ShadowRoot (крім базових стилів)
   */
  public static clear(): void {
    if (this.shadowRoot) {
      const nodes = Array.from(this.shadowRoot.childNodes);
      nodes.forEach((node) => {
        if ((node as HTMLElement).id !== 'threat-shield-base-styles') {
          node.remove();
        }
      });
    }
  }
}
