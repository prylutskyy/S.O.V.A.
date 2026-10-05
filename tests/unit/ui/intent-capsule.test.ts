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
    const pill = root.getElementById('crisp-info-pill');
    const chevron = root.getElementById('chevron-indicator');

    expect(toggleBtn).not.toBeNull();
    expect(drawer?.style.display).not.toBe('none');
    expect(pill?.classList.contains('is-expanded')).toBe(true);

    // Collapse drawer
    toggleBtn?.click();
    expect(drawer?.style.display).toBe('none');
    expect(pill?.classList.contains('is-expanded')).toBe(false);
    expect(chevron?.style.transform).toBe('rotate(0deg)');

    // Expand drawer again
    toggleBtn?.click();
    expect(drawer?.style.display).toBe('flex');
    expect(pill?.classList.contains('is-expanded')).toBe(true);
    expect(chevron?.style.transform).toBe('rotate(180deg)');
  });

  it('dismisses capsule when close button is clicked without clearing threat context', () => {
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
    // Dismissing/closing the banner must NOT reset the threat level
    expect(onClearThreat).not.toHaveBeenCalled();
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

  it('removes banner on SecurityFriction.removeContextWarningBanner() and broadcasts unfreeze', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Підзаголовок',
      'Текст',
      'ESCROW_DELIVERY_SCAM'
    );

    expect(ShadowHost.getRoot().getElementById('threat-shield-context-banner')).not.toBeNull();
    SecurityFriction.removeContextWarningBanner();
    expect(ShadowHost.getRoot().getElementById('threat-shield-context-banner')).toBeNull();
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'THREAT_SHIELD_DISABLE_CHAT_FREEZE' },
      '*'
    );
  });

  it('renders Circuit Breaker veil on critical threats and intercepts blocked keys', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Диверсія',
      'Завдання підпалу релейної шафи',
      'MILITARY_SABOTAGE_RECRUITMENT'
    );

    const root = ShadowHost.getRoot();
    const veil = root.getElementById('threat-shield-circuit-breaker-veil');
    expect(veil).not.toBeNull();
    expect(veil?.textContent).toContain('Ввід заблоковано контррозвідкою');

    // Simulate keydown event for Enter
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault');
    window.dispatchEvent(enterEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();

    // Verify unblock removes veil
    const unblockBtn = root.getElementById('ts-btn-unblock');
    unblockBtn?.click();
    expect(root.getElementById('threat-shield-circuit-breaker-veil')).toBeNull();
  });

  it('adds is-torn class upon mouseenter or interaction', () => {
    SecurityFriction.showContextWarningBanner(
      dummyContext,
      'Застереження',
      'Опис загрози',
      'ESCROW_DELIVERY_SCAM'
    );

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-context-banner');
    expect(banner?.classList.contains('is-torn')).toBe(false);

    banner?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(banner?.classList.contains('is-torn')).toBe(true);
  });

  it('infers sabotage scenario from context.scenario when intentType argument is omitted', () => {
    const sabotageContext: ActiveThreatContext = {
      ...dummyContext,
      scenario: 'MILITARY_SABOTAGE_RECRUITMENT',
    };

    SecurityFriction.showContextWarningBanner(sabotageContext);

    const root = ShadowHost.getRoot();
    const banner = root.getElementById('threat-shield-context-banner');
    expect(banner?.textContent).toContain('Державна безпека');
    expect(banner?.textContent).toContain('Контррозвідка СБУ');
    expect(banner?.textContent).toContain('Загроза вербування');
    expect(root.getElementById('ts-btn-evorog')).not.toBeNull();
    expect(root.getElementById('threat-shield-circuit-breaker-veil')).not.toBeNull();
  });

  it('positions Circuit Breaker veil over detected chat composer in DOM', () => {
    const chatInput = document.createElement('textarea');
    chatInput.getBoundingClientRect = vi.fn(() => ({
      width: 400,
      height: 60,
      top: 500,
      bottom: 560,
      left: 100,
      right: 500,
      x: 100,
      y: 500,
      toJSON: () => {},
    }));
    document.body.appendChild(chatInput);

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      undefined,
      undefined,
      'MILITARY_SABOTAGE_RECRUITMENT'
    );

    const root = ShadowHost.getRoot();
    const veil = root.getElementById('threat-shield-circuit-breaker-veil') as HTMLElement;
    expect(veil).not.toBeNull();
    expect(veil.style.position).toBe('fixed');
    expect(veil.style.top).toBe('496px');
    expect(veil.style.left).toBe('96px');
    expect(veil.style.width).toBe('408px');
    chatInput.remove();
  });

  it('applies ambient amber glow in Scenario B and clears it on dismiss', () => {
    const chatInput = document.createElement('textarea');
    chatInput.getBoundingClientRect = vi.fn(() => ({
      width: 400,
      height: 60,
      top: 500,
      bottom: 560,
      left: 100,
      right: 500,
      x: 100,
      y: 500,
      toJSON: () => {},
    }));
    document.body.appendChild(chatInput);

    SecurityFriction.showContextWarningBanner(
      dummyContext,
      undefined,
      'Оплатіть за посиланням',
      'PAYMENT_CREDENTIAL_THEFT'
    );

    expect(chatInput.getAttribute('data-ts-ambient-amber')).toBe('true');
    expect(chatInput.style.borderColor).toContain('rgba(255, 149, 0');

    SecurityFriction.removeContextWarningBanner();
    expect(chatInput.getAttribute('data-ts-ambient-amber')).toBeNull();
    expect(chatInput.style.borderColor).toBe('');
    chatInput.remove();
  });
});


