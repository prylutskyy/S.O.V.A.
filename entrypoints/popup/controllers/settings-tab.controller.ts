export class SettingsTabController {
  private toggleDebugMode: HTMLInputElement;
  private aiStatusText: HTMLElement;
  private btnResetContext: HTMLButtonElement;
  private btnAbortAI: HTMLButtonElement;
  private showToast: (msg: string) => void;

  constructor(showToast: (msg: string) => void) {
    this.showToast = showToast;
    this.toggleDebugMode = document.getElementById('toggleDebugMode') as HTMLInputElement;
    this.aiStatusText = document.getElementById('aiStatusText') as HTMLElement;
    this.btnResetContext = document.getElementById('btnResetContext') as HTMLButtonElement;
    this.btnAbortAI = document.getElementById('btnAbortAI') as HTMLButtonElement;

    this.initDebugMode();
    this.checkAI();
    this.bindEvents();
  }

  private initDebugMode(): void {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['debugModeEnabled'], (res) => {
        this.toggleDebugMode.checked = !!res.debugModeEnabled;
      });
      this.toggleDebugMode.addEventListener('change', (e) => {
        chrome.storage.local.set({ debugModeEnabled: (e.target as HTMLInputElement).checked });
      });
    }
  }

  private async checkAI(): Promise<void> {
    let provider: any = null;
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;
    if (typeof (globalObj as any).LanguageModel !== 'undefined') provider = (globalObj as any).LanguageModel;
    else if (typeof (globalObj as any).ai !== 'undefined' && (globalObj as any).ai.languageModel) {
      provider = (globalObj as any).ai.languageModel;
    }

    if (provider) {
      try {
        if (typeof provider.capabilities === 'function') {
          const caps = await provider.capabilities();
          this.aiStatusText.textContent =
            caps?.available === 'no'
              ? 'Gemini Nano: Підтримується, але не завантажено'
              : 'Gemini Nano: Активно та готово';
          this.aiStatusText.style.color = caps?.available === 'no' ? 'var(--fx-amber)' : 'var(--fx-green)';
        } else if (typeof provider.create === 'function') {
          this.aiStatusText.textContent = 'Gemini Nano: Активно та готово';
          this.aiStatusText.style.color = 'var(--fx-green)';
        } else {
          throw new Error('No create method');
        }
      } catch (e) {
        console.warn(e);
        if (typeof provider.create === 'function') {
          this.aiStatusText.textContent = 'Gemini Nano: Активно та готово (без capabilities)';
          this.aiStatusText.style.color = 'var(--fx-green)';
        } else {
          this.aiStatusText.textContent = 'Gemini Nano: Помилка перевірки';
          this.aiStatusText.style.color = 'var(--fx-amber)';
        }
      }
    } else {
      this.aiStatusText.textContent = 'Gemini Nano: Не підтримується цим браузером';
      this.aiStatusText.style.color = 'var(--fx-red)';
    }
  }

  private bindEvents(): void {
    this.btnResetContext.addEventListener('click', async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          await chrome.runtime.sendMessage({ type: 'CLEAR_CONTEXT' });
        }
      } catch {}
      this.showToast('Контекст тривоги скинуто.');
    });

    this.btnAbortAI.addEventListener('click', async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          await chrome.runtime.sendMessage({ type: 'ABORT_AI' });
        }
      } catch {}
      this.showToast('Сигнал зупинки ШІ надіслано.');
    });
  }
}
