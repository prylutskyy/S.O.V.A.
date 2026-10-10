/** Shared class definitions, never a hypothesis about a particular dialogue. */
export const THREAT_TAXONOMY = `Classify by the requested act and stated purpose, not isolated vocabulary. For overlapping attacks prefer the most specific supported class:
MILITARY_SABOTAGE_RECRUITMENT: covert collection of nonpublic military locations/plans or recruitment for sabotage; military discussion alone is safe.
CRYPTO_WALLET_COMPROMISE: requests for seed/private keys or dangerous wallet access/signatures; public wallet addresses alone are not secrets.
ESCROW_DELIVERY_SCAM: fake completed purchase/delivery/escrow route to receive payment via a deceptive external flow.
VERIFICATION_PHISHING: requests for secrets, login or external account/card checks under a verification, support, recovery or unblocking pretext. This purpose takes precedence over PAYMENT_CREDENTIAL_THEFT even when CVV or OTP is requested.
PAYMENT_CREDENTIAL_THEFT: requests for card authorization secrets or banking codes to pay, receive money or compensate a transaction, without a verification/account-recovery purpose.
IDENTITY_PROBING: requests for private identifying documents/data or intrusive profiling; ordinary delivery details and freely provided public information are not sufficient.
OFF_PLATFORM_REDIRECT: concrete request to move the conversation/exchange contacts outside platform oversight; a messenger name or ordinary authorized coordination alone is not sufficient. Prefer a more specific secret-theft class if supported.
URGENCY_PRESSURE: manipulative urgency/threats without a more specific supported attack. SUSPICIOUS_LURE: supported attack outside these classes. UNKNOWN: no established attack.`;
