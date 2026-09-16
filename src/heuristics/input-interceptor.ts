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
        const closestA = target.closest('a');
        const isNavigationLink = closestA && closestA.hasAttribute('href') && closestA.getAttribute('href') !== '#' && !closestA.getAttribute('href')?.startsWith('javascript:');
        
        if (isNavigationLink) {
          isSubmission = false;
        } else if (
          target.tagName === 'BUTTON' || 
          target.closest('button') || 
          target.getAttribute('role') === 'button' ||
          (closestA && closestA.getAttribute('role') === 'button')
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
          
          import('../ui/unified-modal').then(({ UnifiedFrictionModal }) => {
            UnifiedFrictionModal.show({
              type: 'chat',
              title: 'Відправку заблоковано',
              badgeText: 'Активна атака',
              badgeLevel: 'CRITICAL',
              contextLabel: 'Платформа',
              contextValue: window.location.hostname,
              triggers: [{ message: 'Діє глобальне блокування через виявлену спробу шахрайства або маніпуляції у чаті.', severity: 'CRITICAL' }],
              activeContext: this.hardLockContext,
              onProceed: () => {
                this.hardLockContext = null;
                import('../ui/friction').then(({ SecurityFriction }) => {
                  SecurityFriction.removeContextWarningBanner();
                });
                ToastNotifier.show('Блокування знято. Повторіть дію.', 'info', 4000);
              },
              onCancel: () => {}
            });
          });
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
