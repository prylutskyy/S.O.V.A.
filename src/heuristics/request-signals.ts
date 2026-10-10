/** Bounded relation signals for the experimental learned model; no protection actions. */
export type SignalObject = 'secret' | 'wallet_secret' | 'identity' | 'military_sensitive' | 'contact' | 'account' | 'bank_details' | 'location' | 'generic_data' | 'external_process' | 'public_reference';
export interface RequestSignal {
  action: 'share' | 'capture' | 'redirect' | 'confirm' | 'question';
  object: SignalObject;
  stance: 'request' | 'negated' | 'reported';
  destination: 'interlocutor' | 'external' | 'unspecified';
  purpose: 'payment' | 'verification' | 'publication' | 'unspecified';
  concealed: boolean;
  complete: boolean;
}
const ACTION = /(?<![\p{L}\p{N}])(?:надішл[а-яіїє]*|надсил[а-яіїє]*|скин[а-яіїє]*|скид[а-яіїє]*|переда[а-яіїє]*|повідом[а-яіїє]*|продикту[а-яіїє]*|вкаж[а-яіїє]*|напиш[а-яіїє]*|залиш[а-яіїє]*|дайте|дай|надай[а-яіїє]*|надайте|сфотограф[а-яіїє]*|фотограф[а-яіїє]*|підтверд[а-яіїє]*|перевір[а-яіїє]*|перейді[а-яіїє]*|перейд[а-яіїє]*|перенес[а-яіїє]*|перенесі[а-яіїє]*|введ[а-яіїє]*|скаж[а-яіїє]*|уточн[а-яіїє]*|відкрий[а-яіїє]*|оформ[а-яіїє]*|потріб[а-яіїє]*|прос[а-яіїє]*|попрос[а-яіїє]*|пита[а-яіїє]*|запита[а-яіїє]*|пропону[а-яіїє]*|обмін[а-яіїє]*|зв[’']?яза[а-яіїє]*|send|share|provide|disclose|upload|enter|tell|give|confirm|verify|move|switch|open|visit|photograph|ask|need|передайте|пришлите|сообщите|укажите|подтвердите|перейдите|де|куди|where|what)(?![\p{L}\p{N}])/giu;
const OBJECTS: Array<[SignalObject, RegExp]> = [
  ['wallet_secret', /seed|секретн[а-яіїє]*\s+фраз|фраз[а-яіїє]*\s+відновлення|приватн[а-яіїє]*\s+ключ|private\s+key|recovery\s+phrase/iu],
  ['secret', /парол|password|passcode|\bcvv\b|\bcvc\b|\bpin\b|\botp\b|код[^.!?]{0,35}(?:sms|смс|банків|повідомлен)|(?:sms|банків)[^.!?]{0,35}код/iu],
  ['identity', /паспорт|passport|селфі|selfie|домашн[а-яіїє]*\s+адрес|дат[а-яіїє]*\s+народження|адрес[а-яіїє]*[^.!?]{0,25}(?:близьких|родич)|телефон[а-яіїє]*[^.!?]{0,25}(?:близьких|родич)/iu],
  ['military_sensitive', /військов|підрозділ|дислокаці|розташування\s+охорони|службов[а-яіїє]*\s+план|military|troop/iu],
  ['public_reference', /номер\s+(?:звернення|замовлення)|публічн[а-яіїє]*\s+(?:звіт|статт|матеріал|адрес)|відкрит[а-яіїє]*\s+(?:репортаж|матеріал)|public\s+(?:report|article|address)|ticket\s+number/iu],
  ['bank_details', /реквізит|дан[а-яіїє]*\s+картк|картк|bank\s+details|card\s+details/iu],
  ['contact', /контакт|номер\s+телефон|телефон|contact|phone/iu],
  ['account', /акаунт|обліков[а-яіїє]*\s+запис|сторінк[а-яіїє]*\s+автора|профіл|кабінет|гаманець|account|wallet/iu],
  ['location', /район|адрес|де\s+(?:ви|ти)|населен[а-яіїє]*\s+пункт|локаці|location|address/iu],
  ['generic_data', /інформаці|дан[іих]|відомост|підтвердження|сім[’']?[яю]|details|information|family/iu],
];

export function extractRequestSignals(rawText: string): RequestSignal[] {
  const text = rawText.slice(0, 2048).normalize('NFKC').toLowerCase();
  const signals: RequestSignal[] = [];
  for (const clauseMatch of text.matchAll(/[^.!?;\n]+[?]?/gu)) {
    const clause = clauseMatch[0];
    // Nominalizations are objects/purposes, not a second requested action.
    const actions = [...clause.matchAll(ACTION)].filter(match => !/(?:ення|ання|ація|ації)$/u.test(match[0]));
    for (const [index, match] of actions.slice(0, 16).entries()) {
      const before = clause.slice(Math.max(0, match.index! - 90), match.index!);
      const actionEnd = match.index! + match[0].length;
      const comma = clause.indexOf(',', actionEnd);
      const tail = clause.slice(actionEnd, Math.min(actions[index + 1]?.index ?? clause.length, comma < 0 ? clause.length : comma, actionEnd + 180));
      const scope = clause.slice(clause.lastIndexOf(',', match.index!) + 1, actionEnd) + tail;
      const found = OBJECTS.find(([, pattern]) => pattern.test(tail)) ??
        (/військов|military/iu.test(clause) && /координат|охорон|coordinates|guard/iu.test(tail) ? ['military_sensitive' as const, /./u] : undefined);
      const external = /telegram|viber|whatsapp|месенджер|поза\s+(?:платформ|маркетплейс)|https?:\/\/|сторонн[а-яіїє]*\s+(?:сторін|сайт)/iu.test(scope);
      const question = /^(?:де|куди|where)$/iu.test(match[0]);
      if (!found && !external && !question) continue;
      const object = found?.[0] ?? (question ? 'location' : 'external_process');
      const quotePrefix = text.slice(0, clauseMatch.index! + match.index!);
      const reported = /(?:цитат[а-яіїє]*|приклад|фраза|шаблон|quote|example)[^.!?«»"“”]{0,60}:\s*$/iu.test(before) ||
        /(?:шахрай\s+(?:писав|просив)|scammer\s+(?:said|asked))(?:\s+to)?\s*$/iu.test(before) ||
        (quotePrefix.lastIndexOf('«') > quotePrefix.lastIndexOf('»')) || (quotePrefix.lastIndexOf('“') > quotePrefix.lastIndexOf('”')) || ((quotePrefix.match(/"/g)?.length ?? 0) % 2 === 1);
      const negated = /(?:^|\s)(?:не(?:\s+(?:потрібно|треба|варто|слід|можна))?|ніколи\s+не|never|do\s+not|dont|don't)\s*$/iu.test(before) || /не\s+потріб[а-яіїє]*/iu.test(tail) ||
        (/(?:ати|увати)$/u.test(match[0]) && /не\s*$/u.test(tail) && /^потріб/u.test(actions[index + 1]?.[0] ?? ''));
      const stance = reported ? 'reported' : negated ? 'negated' : 'request';
      const action = /сфотограф|photograph|фотограф/iu.test(match[0]) ? 'capture'
        : /перейд|перейді|перенес|перенесі|move|switch/iu.test(match[0]) ? 'redirect'
        : /підтверд|перевір|confirm|verify/iu.test(match[0]) ? 'confirm'
        : /^(?:де|куди|where|what)$/iu.test(match[0]) ? 'question' : 'share';
      const payment = /виплат|оплат|кошті|гонорар|премі|payment|payout|refund/iu.test(scope);
      const verification = /верифікац|перевір|підтверд|діагност|відновлен|verification|verify|recover/iu.test(scope);
      const purpose = payment && verification ? 'unspecified' : payment ? 'payment' : verification ? 'verification'
        : /інтерв|матеріал|редакці|сюжет|публікац|interview|publication/iu.test(scope) ? 'publication' : 'unspecified';
      const concealed = /потай|таємн|непоміт|непублічн|не\s+(?:узгодж|погодж|повідомляй)|нікому\s+не\s+каж|винагород|заплачу|secretly|covert|unpublished/iu.test(clause);
      const destination = external ? 'external' : /мені|нам|сюди|у\s+(?:цей|мій|особистий|приватний)\s+чат|to\s+me|to\s+us|here/iu.test(scope) ? 'interlocutor' : 'unspecified';
      const sensitiveMilitary = object === 'military_sensitive' && /координат|поточн[а-яіїє]*\s+(?:розташування|дислокац)|непублічн|службов[а-яіїє]*\s+план|охорон|coordinates|unpublished/iu.test(tail);
      const complete = ['secret', 'wallet_secret', 'identity', 'public_reference'].includes(object) ||
        sensitiveMilitary || (external && (action === 'redirect' || object === 'external_process'));
      signals.push({ action, object, stance, destination, purpose, concealed, complete });
      if (signals.length >= 32) return signals;
    }
  }
  return signals;
}

export function requestContextGate(messages: string[], candidate: string): 'incomplete_request' | 'unsupported_context' | 'unrecognized_sensitive_request' | undefined {
  const text = messages.at(-1) ?? '';
  const latest = extractRequestSignals(text);
  const selfService = /самостійно|у\s+(?:своєму|знайомому|штатному)\s+(?:кабінеті|застосунку|додатку)/iu.test(text) && !/https?:\/\/|telegram|viber/iu.test(text);
  const requests = latest.filter(signal => signal.stance === 'request' && !(selfService && signal.action === 'confirm' && ['account', 'location', 'bank_details', 'public_reference'].includes(signal.object)));
  if (candidate !== 'SAFE' && latest.length && !requests.length) return 'unsupported_context';
  if (requests.some(signal => !signal.complete) && !requests.some(signal => signal.complete)) return 'incomplete_request';
  if (candidate === 'SAFE' && requests.some(signal => signal.complete && ['secret', 'wallet_secret', 'identity', 'military_sensitive'].includes(signal.object))) return 'unrecognized_sensitive_request';
  if (candidate !== 'SAFE' && requests.length && requests.every(signal => signal.object === 'public_reference')) return 'unsupported_context';
  // No regex hit is not evidence of absence: retain the learned threat candidate.
}
