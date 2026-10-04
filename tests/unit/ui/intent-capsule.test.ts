// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityFriction } from '../../../src/ui/friction';
import { ShadowHost } from '../../../src/ui/shadow-host';
import { ActiveThreatContext } from '../../../src/types';

describe('Sanctuary Dynamic Intent Capsule (SecurityFriction.showContextWarningBanner)', () => {
  const dummyContext: ActiveThreatContext = {
    sourcePlatform: 'olx.ua',
    scenario: 'ESCROW_DELIVERY_SCAM',
    threatLevel: 'HIGH',
    detectedKeywords: ['олх доставка', 'отримати кошти'],
    offPlatformLure: false,
    timestamp: Date.now(),
    ttlMs: 900000,
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    ShadowHost.clear();
    SecurityFriction.removeContextWarningBanner();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    SecurityFriction.removeContextWarningBanner();
    ShadowHost.clear();
  });

  it('renders capsule banner inside ShadowHost with appropriate ID', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Тестовий підзаголовок',
      'Доброго дня, оформіть доставку за посиланням',
      'ESCROW_DELIVERY_SCAM'
    );

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-context-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('С.О.В.А. · Застереження: фішинг доставки');
    expect(banner?.textContent).toContain('«Доброго дня, оформіть доставку за посиланням»');
  });

  it('handles advisory threats (ESCROW_DELIVERY_SCAM) without freezing chat', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const onClose = vi.fn();
    const onClearThreat = vi.fn();

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      undefined,
      'Перейдіть за лінком для отримання коштів',
      'ESCROW_DELIVERY_SCAM',
      onClose,
      80,
      onClearThreat
    );

    // Advisory threats must NOT freeze the chat
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'THREAT_SHIELD_ENABLE_CHAT_FREEZE' }),
      '*'
    );

    const root = ShadowHost.getRoot();
    const ackBtn = root.getElementById('ts-btn-ack');
    const unblockBtn = root.getElementById('ts-btn-unblock');
    const evorogBtn = root.getElementById('ts-btn-evorog');

    expect(ackBtn).not.toBeNull();
    expect(ackBtn?.textContent?.trim()).toBe('Зрозуміло');
    expect(unblockBtn).toBeNull();
    expect(evorogBtn).toBeNull();

    // Clicking "Зрозуміло" dismisses capsule and clears threat context
    ackBtn?.click();
    expect(onClose).toHaveBeenCalled();
    expect(onClearThreat).toHaveBeenCalled();
    expect(root.getElementById('threat-shield-context-banner')).toBeNull();
  });

  it('handles critical military sabotage threat with chat freeze and SBU єВорог button', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onClearThreat = vi.fn();

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'ст. 111-2, 113 ККУ (Вербування / Диверсія)',
      'Сфотографуй підстанцію біля вокзалу за 1000 usdt',
      'MILITARY_SABOTAGE_RECRUITMENT',
      undefined,
      95,
      onClearThreat
    );

    // Must trigger hard freeze for chat input
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'THREAT_SHIELD_ENABLE_CHAT_FREEZE' },
      '*'
    );

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-context-banner');
    expect(banner?.textContent).toContain('Ознаки ворожого вербування');

    const evorogBtn = root.getElementById('ts-btn-evorog');
    const unblockBtn = root.getElementById('ts-btn-unblock');
    const ackBtn = root.getElementById('ts-btn-ack');

    expect(evorogBtn).not.toBeNull();
    expect(unblockBtn).not.toBeNull();
    expect(ackBtn).toBeNull();

    // Click єВорог bot link
    evorogBtn?.click();
    expect(windowOpenSpy).toHaveBeenCalledWith('https://t.me/evorog_bot', '_blank');

    // Click unblock button
    unblockBtn?.click();
    expect(onClearThreat).toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'THREAT_SHIELD_DISABLE_CHAT_FREEZE' },
      '*'
    );
    expect(root.getElementById('threat-shield-context-banner')).toBeNull();
  });

  it('handles seed phrase theft as critical threat with chat freeze', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Спроба крадіжки криптоактивів',
      'Введіть 12 слів вашої seed-фрази',
      'SEED_PHRASE_THEFT'
    );

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'THREAT_SHIELD_ENABLE_CHAT_FREEZE' },
      '*'
    );

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-context-banner');
    expect(banner?.textContent).toContain('Спроба викрадення криптогаманця');
    expect(root.getElementById('ts-btn-unblock')).not.toBeNull();
    expect(root.getElementById('ts-btn-evorog')).toBeNull();
  });

  it('toggles drawer details on click', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Деталі загрози',
      'Тестовий текст',
      'IDENTITY_PROBING'
    );

    const root = ShadowHost.getRoot();
    const toggleBtn = root.getElementById('ts-capsule-toggle');
    const drawer = root.getElementById('ts-capsule-drawer');

    expect(toggleBtn?.textContent?.trim()).toBe('Згорнути ▴');
    expect(drawer?.style.display).not.toBe('none');

    // Collapse drawer
    toggleBtn?.click();
    expect(drawer?.style.display).toBe('none');
    expect(toggleBtn?.textContent?.trim()).toBe('Деталі ▾');

    // Expand drawer again
    toggleBtn?.click();
    expect(drawer?.style.display).toBe('flex');
    expect(toggleBtn?.textContent?.trim()).toBe('Згорнути ▴');
  });

  it('dismisses capsule when close button is clicked', () => {
    const onClose = vi.fn();
    const onClearThreat = vi.fn();

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      undefined,
      'Тестовий текст',
      'PAYMENT_CREDENTIAL_THEFT',
      onClose,
      70,
      onClearThreat
    );

    const root = ShadowHost.getRoot();
    const closeBtn = root.getElementById('ts-capsule-close');
    expect(closeBtn).not.toBeNull();

    closeBtn?.click();
    expect(onClose).toHaveBeenCalled();
    expect(onClearThreat).toHaveBeenCalled();
    expect(root.getElementById('threat-shield-context-banner')).toBeNull();
  });

  it('removes existing banner before opening a new one', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Перший банер',
      'Текст 1',
      'IDENTITY_PROBING'
    );

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Другий банер',
      'Текст 2',
      'ESCROW_DELIVERY_SCAM'
    );

    const root = ShadowHost.getRoot();
    const banners = root.querySelectorAll('#threat-shield-context-banner');
    expect(banners.length).toBe(1);
    expect(banners[0].textContent).toContain('С.О.В.А. · Застереження: фішинг доставки');
  });

  it('removes banner on SecurityFriction.removeContextWarningBanner()', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Підзаголовок',
      'Текст',
      'ESCROW_DELIVERY_SCAM'
    );

    expect(ShadowHost.getRoot().getElementById('threat-shield-context-banner')).not.toBeNull();
    SecurityFriction.removeContextWarningBanner();
    expect(ShadowHost.getRoot().getElementById('threat-shield-context-banner')).toBeNull();
  });
});
