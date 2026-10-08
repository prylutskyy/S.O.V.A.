import { VaultScanner } from '../heuristics/vault-scanner';
import { isWhitelisted } from '../core/whitelist';
import { UserWhitelistManager } from '../core/user-whitelist';
import { ActiveThreatContext, ThreatAssessment } from '../types';
import { UnifiedFrictionModal } from '../ui/unified-modal';
import { DebuggerOverlay } from '../ui/debugger-overlay';

export interface NetworkExfiltrationInterceptorOptions {
  getActiveContext: () => ActiveThreatContext | null;
  getDebugMode: () => boolean;
}

export class NetworkExfiltrationInterceptor {
  private static options: NetworkExfiltrationInterceptorOptions | null = null;
  private static isInitialized = false;

  public static init(options: NetworkExfiltrationInterceptorOptions): void {
    if (this.isInitialized) return;
    this.options = options;
    this.injectInterceptor();
    this.listenForExfiltration();
    this.isInitialized = true;
  }

  private static injectInterceptor(): void {
    if (typeof document === 'undefined') return;
    
    const script = document.createElement('script');
    script.dataset.sova = 'net-shield';
    script.textContent = `
      (function() {
        if (window.__sovaNetShieldActive) return;
        window.__sovaNetShieldActive = true;
        
        const dispatchSovaEvent = (url, body) => {
          try {
            if (!body) return true;
            let payload = '';
            if (typeof body === 'string') {
              payload = body;
            } else if (body instanceof FormData) {
              const entries = [];
              for (const [key, value] of body.entries()) {
                if (typeof value === 'string') entries.push(key + '=' + value);
              }
              payload = entries.join('&');
            } else if (body instanceof URLSearchParams) {
              payload = body.toString();
            } else if (typeof body === 'object') {
              try { payload = JSON.stringify(body); } catch(e){}
            }
            
            if (!payload || payload.length < 5) return true;
            
            const event = new CustomEvent('SOVA_NET_REQ', {
              detail: { url, body: payload },
              cancelable: true
            });
            window.dispatchEvent(event);
            return !event.defaultPrevented;
          } catch (e) {
            return true;
          }
        };

        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
          const options = args[1] || {};
          const body = options.body || (args[0] && args[0].body);

          if (body && typeof url === 'string' && !url.startsWith('chrome-extension://')) {
            const allowed = dispatchSovaEvent(url, body);
            if (!allowed) {
              return Promise.reject(new Error('S.O.V.A.: Network request blocked due to stealth data exfiltration.'));
            }
          }
          return originalFetch.apply(this, args);
        };

        const originalXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
          if (body && this._sovaUrl && !this._sovaUrl.startsWith('chrome-extension://')) {
            const allowed = dispatchSovaEvent(this._sovaUrl, body);
            if (!allowed) {
              this.abort();
              throw new Error('S.O.V.A.: XHR blocked due to stealth data exfiltration.');
            }
          }
          return originalXhrSend.apply(this, arguments);
        };

        const originalXhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          this._sovaUrl = typeof url === 'string' ? url : (url && url.href ? url.href : 'unknown');
          return originalXhrOpen.apply(this, arguments);
        };

        const originalWsSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(data) {
          if (data && this.url && !this.url.startsWith('chrome-extension://')) {
            const allowed = dispatchSovaEvent(this.url, data);
            if (!allowed) {
              throw new Error('S.O.V.A.: WebSocket message blocked due to stealth data exfiltration.'));
            }
          }
          return originalWsSend.apply(this, arguments);
        };
      })();
    `;
    
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  private static listenForExfiltration(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('SOVA_NET_REQ', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { url, body } = customEvent.detail;

      let targetHost = '';
      try {
        targetHost = new URL(url, window.location.href).hostname;
      } catch {
        targetHost = url;
      }

      if (!targetHost || targetHost === window.location.hostname || isWhitelisted(targetHost) || UserWhitelistManager.isDomainAllowedSync(targetHost)) {
        return;
      }

      const scanResult = VaultScanner.scanTextSync(body, targetHost);
      if (scanResult.matches && scanResult.matches.length > 0) {
        e.preventDefault(); 
        
        if (this.options?.getDebugMode()) {
          DebuggerOverlay.log(
            'S.O.V.A. NetShield',
            `Прихований витік даних на ${targetHost}`,
            '#EF4444'
          );
        }

        const assessment: ThreatAssessment = {
          score: 95,
          level: 'CRITICAL',
          triggers: [
            {
              name: 'stealth_data_exfiltration',
              message: 'Виявлено фонову передачу чутливих даних через API/WebSockets без відома користувача',
              severity: 'CRITICAL',
              scoreContribution: 95
            }
          ],
          timestamp: Date.now()
        };

        UnifiedFrictionModal.show({
          type: 'form', 
          title: 'Прихований витік даних (NetShield)',
          badgeText: 'NETWORK INTERCEPT',
          badgeLevel: 'CRITICAL',
          contextLabel: 'Невідомий сервер',
          contextValue: targetHost,
          triggers: assessment.triggers,
          assessment,
          activeContext: this.options?.getActiveContext(),
          vaultMatches: scanResult.matches,
          rawTextToScan: body,
          onProceed: async (rememberDomain) => {
             if (rememberDomain) {
                await UserWhitelistManager.allowDomain(targetHost);
             }
             alert('З\'єднання розблоковано. Будь ласка, повторіть вашу дію (натисніть кнопку ще раӼ).');
          },
          onCancel: () => {
             DebuggerOverlay.recordMitigation('Фонова передача заблокована', 95, 'CRITICAL');
          }
        });
      }
    });
  }
}
