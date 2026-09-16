import { ToastNotifier } from '../ui/toast-notifier';
import { ActiveThreatContext } from '../types';

export class GlobalInputInterceptor {
  private static isSoftLocked = false;
  private static hardLockContext: ActiveThreatContext | null = null;

  public static setSoftLock(locked: boolean) {
    this.isSoftLocked = locked;
  }

  public static setHardLock(context: ActiveThreatContext | null) {
    this.hardLockContext = context;
  }

  public static init() {
    const intercept = (e: Event) => {
      // Allow if there are no locks
      if (!this.isSoftLocked && !this.hardLockContext) return;

      const target = e.target as HTMLElement;

      // Check if the event is a submission action (Click on button/link, or Enter on input)
      let isSubmission = false;
      
      if (e.type === 'click') {
        // If clicking a link, a button, or something that looks like a send button
        if (
          target.tagName === 'A' || 
          target.tagName === 'BUTTON' || 
          target.closest('button') || 
          target.closest('a') ||
          target.getAttribute('role') === 'button'
        ) {
          isSubmission = true;
        }
      } else if (e.type === 'keydown') {
        const kbEvent = e as KeyboardEvent;
        if (kbEvent.key === 'Enter') {
          // If pressing Enter in an input or textarea
          if (
            target.tagName === 'INPUT' || 
            target.tagName === 'TEXTAREA' || 
            target.isContentEditable || 
            target.getAttribute('role') === 'textbox'
          ) {
            isSubmission = true;
          }
        }
      }

      if (isSubmission) {
        if (this.isSoftLocked) {
          e.preventDefault();
          e.stopImmediatePropagation();
          ToastNotifier.show('Зачекайте, штучний інтелект перевіряє безпеку чату...', 'warning', 2000);
          return;
        }

        if (this.hardLockContext) {
          e.preventDefault();
          e.stopImmediatePropagation();
          ToastNotifier.show('Відправку заблоковано! Виявлено загрозу безпеці.', 'error', 3000);
          return;
        }
      }
    };

    // Attach to capture phase! (runs before any React/Vue event listeners)
    window.addEventListener('click', intercept, true);
    window.addEventListener('keydown', intercept, true);
    window.addEventListener('submit', (e) => {
      if (this.isSoftLocked || this.hardLockContext) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }
}
