import { describe, it, expect } from 'vitest';
import { isAccreditedPaymentGateway } from '../../../src/core/payment-gateways';

describe('PaymentGateways', () => {
  it('should identify direct match gateways', () => {
    expect(isAccreditedPaymentGateway('liqpay.ua')).toBe(true);
    expect(isAccreditedPaymentGateway('wayforpay.com')).toBe(true);
    expect(isAccreditedPaymentGateway('privat24.ua')).toBe(true);
  });

  it('should identify subdomain match gateways', () => {
    // secure.privatbank.ua is in list
    expect(isAccreditedPaymentGateway('secure.privatbank.ua')).toBe(true);
    
    // anything.liqpay.ua should be true because it ends with .liqpay.ua
    expect(isAccreditedPaymentGateway('api.liqpay.ua')).toBe(true);
    expect(isAccreditedPaymentGateway('checkout.stripe.com')).toBe(true);
  });

  it('should reject malicious lookalike domains', () => {
    expect(isAccreditedPaymentGateway('liqpay-ua.com')).toBe(false);
    expect(isAccreditedPaymentGateway('privat24-secure.com')).toBe(false);
    expect(isAccreditedPaymentGateway('my-portmone.com.ua')).toBe(false);
  });

  it('should handle full URLs gracefully', () => {
    expect(isAccreditedPaymentGateway('https://www.liqpay.ua/api/checkout')).toBe(true);
    expect(isAccreditedPaymentGateway('https://secure.privatbank.ua/test/123')).toBe(true);
    expect(isAccreditedPaymentGateway('http://scam-site.com/liqpay.ua')).toBe(false);
  });

  it('should reject empty or invalid inputs', () => {
    expect(isAccreditedPaymentGateway('')).toBe(false);
    expect(isAccreditedPaymentGateway('   ')).toBe(false);
  });
});
