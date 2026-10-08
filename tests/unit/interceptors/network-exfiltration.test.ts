// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { NetworkExfiltrationInterceptor } from '../../../src/interceptors/network-exfiltration.interceptor';
import { VaultScanner } from '../../../src/heuristics/vault-scanner';
import { UnifiedFrictionModal } from '../../../src/ui/unified-modal';
import { DebuggerOverlay } from '../../../src/ui/debugger-overlay';

vi.mock('../../../src/heuristics/vault-scanner');
vi.mock('../../../src/ui/unified-modal');
vi.mock('../../../src/ui/debugger-overlay');
vi.mock('../../../src/core/user-whitelist', () => ({
  UserWhitelistManager: {
    isDomainAllowedSync: vi.fn().mockReturnValue(false),
    allowDomain: vi.fn(),
  }
}));

describe('NetworkExfiltrationInterceptor (Phase 2: Network-Level Interception)', () => {
  let mockGetActiveContext: any;
  let mockGetDebugMode: any;

  beforeAll(() => {
    mockGetActiveContext = vi.fn().mockReturnValue(null);
    mockGetDebugMode = vi.fn().mockReturnValue(true);

    NetworkExfiltrationInterceptor.init({
      getActiveContext: mockGetActiveContext,
      getDebugMode: mockGetDebugMode,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dispatchNetEvent = (url: string, body: string): boolean => {
    const event = new CustomEvent('SOVA_NET_REQ', {
      detail: { url, body },
      cancelable: true
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('should ignore requests without sensitive data', () => {
    vi.mocked(VaultScanner.scanTextSync).mockReturnValue({ matches: [] } as any);

    const wasPrevented = dispatchNetEvent('https://evil.com/api/steal', '{"data": "safe string"}');
    
    expect(wasPrevented).toBe(false);
    expect(UnifiedFrictionModal.show).not.toHaveBeenCalled();
  });

  it('should intercept stealth exfiltration and show modal when sensitive data is detected', () => {
    vi.mocked(VaultScanner.scanTextSync).mockReturnValue({
      matches: [{ type: 'EMAIL', value: 'secret@domain.com', label: 'Email', source: 'Vault' }]
    } as any);

    const wasPrevented = dispatchNetEvent('https://evil.com/api/steal', '{"email": "secret@domain.com"}');
    
    // The event should be prevented
    expect(wasPrevented).toBe(true);
    
    // DebuggerOverlay should log it
    expect(DebuggerOverlay.log).toHaveBeenCalledWith(
      'S.O.V.A. NetShield',
      'Прихований витік даних на evil.com',
      '#EF4444'
    );

    // Modal should be shown with CRITICAL assessment
    expect(UnifiedFrictionModal.show).toHaveBeenCalledTimes(1);
    const modalArgs = vi.mocked(UnifiedFrictionModal.show).mock.calls[0][0];
    
    expect(modalArgs.type).toBe('form');
    expect(modalArgs.title).toBe('Прихований витік даних (NetShield)');
    expect(modalArgs.badgeLevel).toBe('CRITICAL');
    expect(modalArgs.assessment?.score).toBe(95);
    expect(modalArgs.contextValue).toBe('evil.com');
    expect(modalArgs.vaultMatches?.length).toBe(1);
  });

  it('should ignore requests to the same origin', () => {
    vi.mocked(VaultScanner.scanTextSync).mockReturnValue({
      matches: [{ type: 'EMAIL', value: 'secret@domain.com', label: 'Email', source: 'Vault' }]
    } as any);

    // Assuming tests run in localhost or about:blank, let's use window.location.origin
    const localUrl = window.location.href + '/api/save';
    const wasPrevented = dispatchNetEvent(localUrl, '{"email": "secret@domain.com"}');
    
    // Since it's local, it shouldn't scan or prevent
    expect(wasPrevented).toBe(false);
    expect(VaultScanner.scanTextSync).not.toHaveBeenCalled();
    expect(UnifiedFrictionModal.show).not.toHaveBeenCalled();
  });
});
