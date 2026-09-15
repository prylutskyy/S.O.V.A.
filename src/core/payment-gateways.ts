/**
 * База акредитованих та сертифікованих платіжних шлюзів (PCI DSS compliant).
 * Якщо форма відправляє реквізити на один із цих шлюзів, це вважається
 * легітимною транзакцією інтернет-еквайрингу.
 */
export const ACCREDITED_PAYMENT_GATEWAYS = new Set<string>([
  // Українські платіжні шлюзи та фінтех
  'liqpay.ua',
  'www.liqpay.ua',
  'portmone.com.ua',
  'www.portmone.com.ua',
  'portmone.com',
  'www.portmone.com',
  'wayforpay.com',
  'www.wayforpay.com',
  'novapay.ua',
  'www.novapay.ua',
  'ipay.ua',
  'www.ipay.ua',
  'easypay.ua',
  'www.easypay.ua',
  'fondy.ua',
  'fondy.eu',
  'plata.me',
  // Банківські платіжні шлюзи України
  'privat24.ua',
  'next.privat24.ua',
  'secure.privatbank.ua',
  'monobank.ua',
  'checkout.monobank.ua',
  'api.monobank.ua',
  'pay.alfabank.com.ua',
  'sensebank.com.ua',
  'oschadbank.ua',
  'pumb.ua',
  // Міжнародні платіжні системи
  'stripe.com',
  'checkout.stripe.com',
  'js.stripe.com',
  'paypal.com',
  'www.paypal.com',
  'checkout.paypal.com',
  'braintreepayments.com',
  'adyen.com',
  'pay.google.com',
  'apple.com',
]);

/**
 * Перевірка, чи належить URL або хост до акредитованих платіжних провайдерів
 */
export function isAccreditedPaymentGateway(targetUrlOrHost: string): boolean {
  if (!targetUrlOrHost) return false;

  let hostname = targetUrlOrHost.toLowerCase().trim();
  try {
    if (targetUrlOrHost.startsWith('http://') || targetUrlOrHost.startsWith('https://')) {
      hostname = new URL(targetUrlOrHost).hostname.toLowerCase();
    }
  } catch {
    // Якщо не вдалося розпарсити як URL, перевіряємо як рядок
  }

  if (ACCREDITED_PAYMENT_GATEWAYS.has(hostname)) {
    return true;
  }

  for (const gateway of ACCREDITED_PAYMENT_GATEWAYS) {
    if (hostname.endsWith(`.${gateway}`)) {
      return true;
    }
  }

  return false;
}
