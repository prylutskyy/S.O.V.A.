// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { ApprovalRegistry } from '../../../src/core/approval-registry';
import { NetworkExfiltrationInterceptor } from '../../../src/interceptors/network-exfiltration.interceptor';
import { TextNormalizer } from '../../../src/heuristics/text-normalizer';
import { SessionOutboundMemory } from '../../../src/heuristics/session-outbound-memory';
import { VaultScanner } from '../../../src/heuristics/vault-scanner';
import { UnifiedFrictionModal } from '../../../src/ui/unified-modal';

vi.mock('../../../src/ui/unified-modal');
vi.mock('../../../src/ui/debugger-overlay');

describe('Phase 5: Red Teaming & Adversarial Penetration Stress Testing', () => {
  beforeAll(() => {
    NetworkExfiltrationInterceptor.init({
      getActiveContext: () => null,
      getDebugMode: () => false,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    SessionOutboundMemory.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const host = document.getElementById('sova-shadow-host') || document.getElementById('threat-shield-shadow-host');
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  });

  describe('Vector 1: Hostile DOM Isolation & Closed ShadowRoot Penetration', () => {
    it('denies malicious page scripts access to shadowRoot (mode: closed enforcement)', () => {
      // Extension initializes ShadowHost
      const internalRoot = ShadowHost.getRoot();
      expect(internalRoot).not.toBeNull();

      // Simulated hostile script running in page context
      const hostileQueriedHost = document.getElementById('sova-shadow-host') as HTMLElement;
      expect(hostileQueriedHost).not.toBeNull();

      // Page script tries to inspect host.shadowRoot -> MUST BE NULL in closed mode!
      expect(hostileQueriedHost.shadowRoot).toBeNull();
    });

    it('prevents page scripts from discovering or synthetically clicking internal security buttons', () => {
      const internalRoot = ShadowHost.getRoot();
      const mockModal = document.createElement('div');
      mockModal.id = 'threat-shield-unified-modal';
      mockModal.innerHTML = `
        <button id="ts-proceed-btn">Proceed</button>
        <button id="ts-primary-btn">Cancel</button>
      `;
      internalRoot.appendChild(mockModal);

      // Malicious page tries standard querySelector
      expect(document.querySelector('#ts-proceed-btn')).toBeNull();
      expect(document.querySelector('#threat-shield-unified-modal')).toBeNull();
      expect(document.getElementById('ts-proceed-btn')).toBeNull();
    });
  });

  describe('Vector 2: WeakSet Memory Armor & Prototype Tampering Resistance', () => {
    it('resists dataset attribute spoofing (form.dataset.threatShieldApproved = true)', () => {
      const form = document.createElement('form');
      document.body.appendChild(form);

      // Malicious website attempts to bypass S.O.V.A. by setting the legacy dataset attribute
      form.dataset.threatShieldApproved = 'true';
      form.setAttribute('data-threat-shield-approved', 'true');

      // WeakSet check MUST evaluate to false
      expect(ApprovalRegistry.isApproved(form)).toBe(false);

      form.remove();
    });

    it('resists form cloning attack (cloneNode does not inherit approval identity)', () => {
      const originalForm = document.createElement('form');
      document.body.appendChild(originalForm);

      // User consciously approves originalForm
      ApprovalRegistry.approve(originalForm);
      expect(ApprovalRegistry.isApproved(originalForm)).toBe(true);

      // Malicious website attempts to clone the approved form to sneak in phishing inputs
      const hostileClone = originalForm.cloneNode(true) as HTMLFormElement;
      document.body.appendChild(hostileClone);

      // The clone has a different object memory reference -> MUST NOT BE APPROVED
      expect(ApprovalRegistry.isApproved(hostileClone)).toBe(false);

      originalForm.remove();
      hostileClone.remove();
    });

    it('resists prototype pollution tampering on Object or HTMLFormElement', () => {
      const form = document.createElement('form');
      document.body.appendChild(form);

      // Attackers attempt prototype pollution
      (Object.prototype as any).isApproved = true;
      (HTMLFormElement.prototype as any).isThreatShieldApproved = true;

      expect(ApprovalRegistry.isApproved(form)).toBe(false);

      delete (Object.prototype as any).isApproved;
      delete (HTMLFormElement.prototype as any).isThreatShieldApproved;
      form.remove();
    });

    it('enforces immediate revocation upon submission to prevent replay attacks', () => {
      const form = document.createElement('form');
      document.body.appendChild(form);

      ApprovalRegistry.approve(form);
      expect(ApprovalRegistry.isApproved(form)).toBe(true);

      // Form is submitted once -> immediately revoked
      ApprovalRegistry.revoke(form);
      expect(ApprovalRegistry.isApproved(form)).toBe(false);

      form.remove();
    });
  });

  describe('Vector 3: Stealth Network Exfiltration & Obfuscated Payloads (NetShield)', () => {
    const dispatchNetEvent = (url: string, body: string): boolean => {
      const event = new CustomEvent('SOVA_NET_REQ', {
        detail: { url, body },
        cancelable: true,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it('intercepts URL-encoded form body exfiltration of valid credit card data', () => {
      const urlEncodedBody = 'user_id=1024&card_num=4149439012345678&exp=1228&cvv=456';
      vi.spyOn(VaultScanner, 'scanTextSync').mockReturnValue({
        matchedItems: [{
          id: 'card-1', category: 'CUSTOM', label: 'Bank Card', realValue: '4149439012345678',
          decoyValue: '', keywords: [], createdAt: Date.now(),
        }],
        triggers: [],
      });

      // Destination is hostile exfiltration server
      const wasBlocked = dispatchNetEvent(
        'https://attacker-data-drop.com/collector',
        urlEncodedBody
      );

      expect(wasBlocked).toBe(true);
      expect(UnifiedFrictionModal.show).toHaveBeenCalled();
    });

    it('intercepts JSON exfiltration with hyphenated or spaced PAN formatting', () => {
      const formattedJson = JSON.stringify({
        account: 'primary',
        card: '4149-4390-1234-5678',
      });
      vi.spyOn(VaultScanner, 'scanTextSync').mockReturnValue({
        matchedItems: [{
          id: 'card-1', category: 'CUSTOM', label: 'Bank Card', realValue: '4149439012345678',
          decoyValue: '', keywords: [], createdAt: Date.now(),
        }],
        triggers: [],
      });

      const wasBlocked = dispatchNetEvent(
        'https://phishing-endpoint.xyz/sink',
        formattedJson
      );

      expect(wasBlocked).toBe(true);
      expect(UnifiedFrictionModal.show).toHaveBeenCalled();
    });

    it('never interferes with accredited payment processors (Stripe, LiqPay, Portmone)', () => {
      const validPayload = JSON.stringify({ pan: '4149439012345678' });
      vi.spyOn(VaultScanner, 'scanTextSync').mockReturnValue({
        matchedItems: [{
          id: 'card-1', category: 'CUSTOM', label: 'Bank Card', realValue: '4149439012345678',
          decoyValue: '', keywords: [], createdAt: Date.now(),
        }],
        triggers: [],
      });

      // Whitelisted payment processors are never intercepted
      expect(dispatchNetEvent('https://api.stripe.com/v1/tokens', validPayload)).toBe(false);
      expect(dispatchNetEvent('https://www.liqpay.ua/api/checkout', validPayload)).toBe(false);
      expect(dispatchNetEvent('https://api.portmone.com.ua/gateway', validPayload)).toBe(false);
    });
  });

  describe('Vector 4: Linguistic Obfuscation & Zero-Width Space Evasion', () => {
    it('neutralizes zero-width space injection across scam trigger words', () => {
      // Attacker attempts zero-width space injection: "д\u200Bо\u200Bс\u200Bт\u200Bа\u200Bв\u200Bк\u200Bа"
      const obfuscatedText = 'д\u200Bо\u200Bс\u200Bт\u200Bа\u200Bв\u200Bк\u200Bа олх';
      const normalizedWords = TextNormalizer.normalizeWords(obfuscatedText);
      const normalizedMatch = TextNormalizer.normalizeForMatching(obfuscatedText);

      expect(normalizedWords).not.toContain('\u200B');
      expect(normalizedWords).toContain('доставка');
      expect(normalizedMatch).toBe('доставкаолх');
    });

    it('normalizes mixed-script Cyrillic-Latin homoglyphs and spaced characters', () => {
      // Spaced word "о п л а т а" and Latin 'o' homoglyph
      const mixedText = 'о п л а т а';
      const normalized = TextNormalizer.normalizeWords(mixedText);

      // Automatically glues spaced characters
      expect(normalized).toBe('оплата');

      const matchingToken = TextNormalizer.normalizeForMatching('д\u006Fст\u0061вк\u0061');
      expect(matchingToken).toBe('доставка');
    });
  });

  describe('Vector 5: Buffer Bombing & Concurrency Flood Resistance', () => {
    it('maintains bounded memory when flooded with 200 consecutive messages without leaking', () => {
      // Simulate extreme chat flooding attack
      for (let i = 0; i < 200; i++) {
        SessionOutboundMemory.recordSentMessage(`Flooded benign message index ${i}`);
      }

      // Memory must self-prune to maximum capacity (bounded queue of 40)
      const count = SessionOutboundMemory.getSentMessagesCount();
      expect(count).toBeLessThanOrEqual(40);
    });

    it('correctly detects cross-message split attack during rapid interleaving', () => {
      // Message 1: Attacker coaxes card number
      SessionOutboundMemory.recordSentMessage('Моя карта 4149 4390 1234 5678');
      expect(SessionOutboundMemory.hasSentCard()).toBe(true);

      // Message 2: Interleaved conversation
      SessionOutboundMemory.recordSentMessage('Чекаю на підтвердження');

      // Message 3: Victim supplies CVV
      const evalResult = SessionOutboundMemory.evaluateWithHistory('321');
      expect(evalResult.shouldBlock).toBe(true);
      expect(evalResult.leakage.isCrossMessage).toBe(true);
      expect(evalResult.leakage.hasCvv).toBe(true);
    });
  });
});
