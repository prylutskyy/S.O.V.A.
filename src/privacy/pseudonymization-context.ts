/** Memory-only identity map. Never serialize it or send it to a provider. */
export class PseudonymizationContext {
  private identities = new Map<string, string>();
  private counts = new Map<string, number>();
  private aliases = new Map<string, string>();
  public clear(): void { this.identities.clear(); this.counts.clear(); this.aliases.clear(); }
  public token(kind: string, value: string): string {
    const normalized = value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
      .replace(/\s+/g, ' ').toLocaleLowerCase();
    const key = `${kind}:${normalized}`;
    let token = this.identities.get(key);
    if (!token) {
      // Bound retained private state; never silently stop redacting on overflow.
      if (this.identities.size >= 2048) throw new Error('Privacy context capacity exceeded');
      const n = (this.counts.get(kind) || 0) + 1;
      this.counts.set(kind, n); token = `[${kind}_${n}]`; this.identities.set(key, token);
    }
    if (!this.aliases.has(value) && this.aliases.size >= 2048) throw new Error('Privacy alias capacity exceeded');
    this.aliases.set(value, token);
    return token;
  }
  public replaceKnown(text: string): string {
    for (const [value, token] of [...this.aliases].sort((a, b) => b[0].length - a[0].length)) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'), token);
    }
    return text;
  }
}

/** Context-aware patterns, not a claim of universal named-entity recognition. */
export function redactPersonalData(text: string, context: PseudonymizationContext,
  record: (token: string, kind: string) => void): string {
  const hide = (kind: string, value: string) => {
    const token = context.token(kind, value); record(token, kind); return token;
  };
  text = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = context.replaceKnown(text);
  text = text.replace(/((?:password|пароль|pwd|pass|код\s*доступу|код\s*доступа)\s*[:=_-]\s*)([^\s;,<>"\[\]]{1,128})/giu,
    (_, prefix: string, value: string) => prefix + hide('VERIFIED_PASSWORD', value));
  text = text.replace(/((?:термін\s*дії|діє\s*до|expiry|expiration|valid\s*until)\s*[:=-]?\s*)(\d{2}[/.\-]\d{2,4})/giu,
    (_, prefix: string, value: string) => prefix + hide('VERIFIED_EXPIRY_DATE', value));
  text = text.replace(/\b(?:gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, value => hide('API_KEY', value));
  // URLs are processed before contact patterns: never redact fragments of a URL independently.
  text = text.replace(/https?:\/\/[^\s<>"\[\]]+/giu, raw => {
    const suffix = raw.match(/[.,;!?)]+$/)?.[0] || '';
    const source = suffix ? raw.slice(0, -suffix.length) : raw;
    try {
      const url = new URL(source);
      const domain = url.hostname;
      // Keep destination domain and transport; opaque path/query/fragment can contain private data.
      const publicSegments = new Set(['verify', 'verification', 'profile', 'account', 'login', 'signin', 'payment', 'pay', 'checkout', 'order', 'delivery', 'support', 'reset', 'form', 'api']);
      const segments = url.pathname.split('/').filter(Boolean);
      const safePath = segments.every(segment => publicSegments.has(segment.toLowerCase()));
      if (url.username || url.password || url.search || url.hash || !safePath) {
        const prefix = segments.filter((segment, i) => segments.slice(0, i + 1).every(s => publicSegments.has(s.toLowerCase()))).join('/');
        return `${url.protocol}//${domain}/${prefix ? prefix + '/' : ''}${hide('URL_DATA', source)}${suffix}`;
      }
      return `${url.protocol}//${domain}${url.pathname}${suffix}`;
    } catch { return hide('URL', source) + suffix; }
  });
  text = text.replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/giu,
    value => hide('EMAIL', value));
  text = text.replace(/(?<!\w)@[\p{L}\p{N}_]{3,32}/gu, value => hide('HANDLE', value));
  text = text.replace(/((?:телефон|phone|mobile)\s*[:=-]\s*)(\+?\d[\d ()-]{7,19}\d)/giu,
    (_, prefix: string, value: string) => prefix + hide('PHONE', value.replace(/\D/g, '')));
  text = text.replace(/(?<!\d)(?:\+?38[\s()-]*)?0\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}(?!\d)|\+\d(?:[\d ()-]{7,19})\d/gu,
    value => hide('PHONE', value.replace(/\D/g, '')));
  text = text.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi, value => hide('IBAN', value.replace(/\s/g, '')));
  // Privacy redaction deliberately does not require Luhn validity.
  text = text.replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, value => hide('CARD_CANDIDATE', value.replace(/\D/g, '')));
  text = text.replace(/(?<!\d)-?\d{1,2}\.\d{4,8}\s*[,;]\s*-?\d{1,3}\.\d{4,8}(?!\d)/g,
    value => hide('COORDINATES', value));
  text = text.replace(/((?:паспорт(?:\s*(?:номер|№))?|ІПН|РНОКПП|tax\s*id|passport|дата\s*народження|date\s*of\s*birth)\s*[:№=]?\s*)([A-ZА-ЯІЇЄ]{0,2}\d[\d ./-]{4,18}\d)/giu,
    (_, prefix: string, value: string) => prefix + hide('IDENTITY_DATA', value));
  const name = "[\\p{Lu}][\\p{L}'’ʼ-]{1,30}";
  const full = `${name}(?:[ \\t]+${name}){1,2}`;
  text = text.replace(new RegExp(`((?:[Мм]ене звати|[Мм]еня зовут|[Mm]y name is|ПІБ|ФИО|[Ff]ull name|[Іі]м['’]я та прізвище|[Яя]|[Пп]ан(?:і)?|[Дд]ля|[Вв]ід|[Пп]ередайте)\\s*[:=-]?\\s*)(${full})(?![\\p{L}])`, 'gu'),
    (_, prefix: string, value: string) => prefix + hide('PERSON', value));
  text = text.replace(new RegExp(`((?:[Мм]ене звати|[Мм]еня зовут|[Mm]y name is)\\s+)(${name})(?![\\p{L}])`, 'gu'),
    (_, prefix: string, value: string) => prefix + hide('PERSON', value));
  // Do not guess that every pair of capitalized words is a person (e.g. Нова Пошта).
  text = text.replace(/((?:адреса(?:\s*проживання)?|адрес(?:\s*проживания)?|home address|проживаю|мешкаю)\s*[:=-]\s*)([^\n;!?]{4,180})/giu,
    (_, prefix: string, value: string) => prefix + hide('ADDRESS', value.trim()));
  text = text.replace(/(?:вул(?:иця|иці)?\.?|улица|ул\.|просп(?:ект)?\.?|провулок|street)\s+[\p{L}'’ʼ .-]{2,60}\s*,?\s*\d+[\p{L}\d/-]*(?:\s*,\s*(?:кв\.?|квартира|apt)\s*\d+)?/giu,
    value => hide('ADDRESS', value));
  return text;
}
