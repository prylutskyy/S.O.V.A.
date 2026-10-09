import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  if (typeof window === 'undefined') return;

  // UI actions that open an external site should stay observable without
  // allowing Happy DOM to perform real network navigation.
  Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: vi.fn(() => null),
  });

  const happyDomWindow = window as Window & {
    happyDOM?: {
      settings: { navigation: { disableChildPageNavigation: boolean } };
    };
  };
  if (happyDomWindow.happyDOM) {
    happyDomWindow.happyDOM.settings.navigation.disableChildPageNavigation = true;
  }

  const testWindow = window as Window & { __sovaExternalNavigationBlocked?: true };
  if (testWindow.__sovaExternalNavigationBlocked) return;
  testWindow.__sovaExternalNavigationBlocked = true;

  window.addEventListener(
    'click',
    (event) => {
      const link = event.composedPath().find(
        (target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement
      );
      if (!link) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) event.preventDefault();
    },
    true
  );
});
