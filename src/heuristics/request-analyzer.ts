import { TextNormalizer } from './text-normalizer';
import { SupportedLanguage } from './language-detector';

export type RequestObject = 'payment_secret' | 'account_password' | 'wallet_secret' | 'identity';
export interface RequestFrame {
  action: string;
  object: RequestObject;
  objectText: string;
  purpose: 'payment' | 'verification' | 'unknown';
  destination: 'interlocutor' | 'page' | 'unknown';
  /** Offsets refer to normalizeWords(rawText), like existing intent spans. */
  start: number;
  end: number;
  text: string;
}

/** Bounded relation extraction, not a language model or a keyword risk score. */
export class RequestAnalyzer {
  private static readonly ACTION = /(?<![\p{L}\p{N}])(?:надішліть|надішли|надіслати|надсилайте|відправте|відправ|відправити|завантажте|завантаж|повідомте|повідомляйте|просить|asks?|покажіть|покажите|впишіть|впишите|заповніть|заполните|додайте|добавьте|повідом|повідомивши|напишіть|напиши|вкажіть|вкажи|скиньте|скинь|скажіть|скажи|підкажіть|підкажи|надайте|надай|продиктуйте|продиктуй|введіть|введи|ввести|вводьте|вишліть|дайте|дай|назвіть|назви|назвати|передайте|передай|передати|перешліть|перешли|поділіться|потрібен|потрібна|потрібні|треба|яке|яка|напишите|напиши|укажите|укажи|скиньте|скажите|скажи|предоставьте|продиктуйте|введите|вышлите|пришлите|отправьте|отправь|загрузите|сообщите|сообщайте|сообщив|передайте|перешлите|дайте|назовите|нужен|нужна|нужны|надо|какая|какое|send|share|provide|upload|enter|tell|type|give|submit|forward|disclose|need|what\s+is)(?![\p{L}\p{N}])/giu;
  private static readonly NEGATION = /(?:^|\s)(?:не(?:\s+(?:потрібно|треба|варто|слід|можна|нужно|надо|стоит))?|ніколи\s+не|никогда\s+не|never|do\s+not|dont|don't|should\s+not|shouldnt|shouldn't)\s*$/iu;
  private static readonly EXPLANATORY = /(?:інструкці|инструкци|статт|стать|довід|список|опис|описание|приклад|пример|guide|article|example|explanation|list\s+of)/iu;
  private static readonly NOT_REQUESTED = /(?:ніколи|никогда|never)\s+(?:не\s*)?(?:просить|asks?)(?:\s+you)?(?:\s+to)?[^.!?\n]{0,80}$/iu;
  private static readonly REPORTED = /(?:приклад|пример|example|цитата|quote|фраза|phrase|шаблон|template)[^.!?\n]{0,80}[:«"“]\s*$|(?:шахрай|мошенник|scammer)\s+(?:написав|написал|пише|пишет|просить|просит|wrote|said|asks?)[^.!?\n]{0,80}[:«"“]\s*$/iu;
  private static readonly OBJECTS: Array<{ object: RequestObject; pattern: RegExp }> = [
    { object: 'wallet_secret', pattern: /(?<![\p{L}\p{N}])(?:с[іи]д\s*фраз[а-яіїєё]*|s[еe]{2}d\s*[рp]hr[аa]s[еe]|s[еe][сc]r[еe]t\s*r[еe][сc][оo]v[еe]r[уy](?:\s*[рp]hr[аa]s[еe])?|мнемон[іи]ч[а-яіїєё]*\s+фраз[а-яіїєё]*|резервн[а-яіїєё]*\s+фраз[а-яіїєё]*|приватн[а-яіїєё]*\s+ключ[а-яіїєё]*|private\s+key|[рp]r[іi]v[аa]t[еe]\s+k[еe][уy]|(?:12|і2|24|2ч)\s*(?:секретн[а-яіїєё]*\s+)?(?:слів|слова|слов|words)|секретн[а-яіїєё]*\s+ключ[а-яіїєё]*|пароль\s+(?:від\s+|от\s+)?(?:крипто)?(?:гаманц[а-яіїє]*|кошельк[а-яё]*)|wallet\s+password|password\s+(?:for|of)\s+(?:your\s+)?wallet)(?![\p{L}\p{N}])/giu },
    { object: 'payment_secret', pattern: /(?<![\p{L}\p{N}])(?:[cс]v[vвcс]|[pр][iі]n(?:\s*(?:код|code))?|код\s+(?:(?:одноразов[а-яіїєё]*|входу|підтвердження|подтверждения|безпеки|безопасности)|(?:з|із|из)\s*(?:sms|смс|банківського\s+повідомлення))|(?:sms|смс)[ -]?код|(?:одноразов[а-яіїєё]*|one\s*time)\s+(?:код|code|password)|(?:sms|confirmation|security|login)\s+code|otp|баланс(?:\s+(?:на\s+)?карт[а-яіїєё]*)?|(?:card|available)\s+balance|(?:дані|реквізити|данные|реквизиты)\s+(?:(?:вашої|вашей)\s+)?карт[а-яіїєё]*|(?:термін|строк)\s+дії\s+карт[а-яіїє]*|срок\s+действия\s+карт[а-яё]*|card\s+(?:details|credentials|expiry)|фото\s+карт[а-яіїєё]*\s+з\s+обох\s+боків|(?:три|3)\s+цифр[а-яіїєё]*\s+(?:з|із|со)\s+(?:її\s+)?зворот[а-яіїєё]*|(?:покажіть|покажите)\s+карт[а-яіїєё]*|(?:16|іб)\s+цифр[а-яіїєё]*|номер\s+карт[а-яіїєё]*|код(?=.{0,100}(?:надійш[а-яіїєё]*|прийш[а-яіїєё]*|телефон|підозріл[а-яіїєё]*\s+операц[а-яіїєё]*|зарахуван[а-яіїєё]*|переказ[а-яіїєё]*)))(?![\p{L}\p{N}])/giu },
    { object: 'account_password', pattern: /(?<![\p{L}\p{N}])(?:парол[а-яіїєё]*|[рp][аa]ssw[оo]rd|pwd|passcode)(?![\p{L}\p{N}])/giu },
  ];
  private static readonly PAYMENT = /(?:підтвердження\s+переказ[а-яіїє]*|подтверждения\s+перевод[а-яё]*|(?:отримати|отримання|зарахування|виплат[а-яіїєё]*|переказу|получить|получения|зачисления|перевода)\s+(?:оплат[а-яіїє]*|кошт[а-яіїє]*|грош[а-яіїє]*|виплат[а-яіїєё]*|средств|денег)|(?:receive|collect|claim|confirm)\s+(?:your\s+)?(?:payment|payout|money|funds|transfer))/iu;
  private static readonly VERIFICATION = /(?:перевір[а-яіїє]*|підтверд[а-яіїє]*|верифікац[а-яіїє]*|віднов[а-яіїє]*|скасуванн[а-яіїє]*|зупинити|розблокуванн[а-яіїє]*|провер[а-яё]*|подтверд[а-яё]*|верификац[а-яё]*|восстанов[а-яё]*|verify|verification|confirm|restore|recover)\s+(?:(?:ваш[а-яіїєё]*|свій|your|the)\s+)?(?:профіл[а-яіїє]*|акаунт[а-яіїє]*|особ[а-яіїє]*|операці[а-яіїє]*|переказ[а-яіїє]*|вхід|доступ[а-яіїє]*|карт[а-яіїєё]*|плат[а-яіїєё]*|аккаунт[а-яё]*|профил[а-яё]*|личност[а-яё]*|account|profile|identity|login|access|card|payment)|(?:для|for|to)\s+(?:завершення\s+)?(?:перевірки|верифікації|проверки|верификации|verification)|(?:скасування|зупинення)\s+підозрілої\s+операці[їи]/iu;

  /** Restore technical Latin tokens in mixed-language normalized text.
   * Replacements preserve length, so evidence offsets remain valid. */
  private static restoreLatin(text: string): string {
    const letters: Record<string, string> = { 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'і': 'i' };
    return text.replace(/[\p{L}\p{N}]+/gu, token => /[a-z]/iu.test(token)
      ? token.replace(/[асеорхуі]/gu, char => letters[char] ?? char) : token);
  }

  /** Shared request binding, also used for user-defined personal-vault objects. */
  public static findRequestedAction(text: string, objectIndex: number): { start: number; action: string } | null {
    text = this.restoreLatin(text);
    const from = Math.max(0, objectIndex - 120);
    const prefix = text.slice(from, objectIndex);
    const match = Array.from(prefix.matchAll(this.ACTION)).at(-1);
    if (!match || match.index === undefined) return null;
    const start = from + match.index;
    const gap = text.slice(start + match[0].length, objectIndex);
    if (/[.!?;\n]/u.test(gap) || /(?:^|\s)(?:щоб|чтобы|аби|для|to\s+(?:sync|synchroni[sz]e|verify|receive|restore|recover|cancel)|so\s+that)(?:\s|$)/iu.test(gap) ||
        gap.trim().split(/\s+/).filter(Boolean).length > 10 || this.EXPLANATORY.test(gap) ||
        /(?:^|\s)(?:не|not|never)\s+(?:просив|просить|просил|просит|потріб[а-яіїє]*|нуж[а-яё]*|request|ask|need)/iu.test(gap)) return null;
    if (/^(?:яке|яка|какая|какое|what\s+is)$/iu.test(match[0]) &&
        !/^(?:(?:ваш[а-яіїєё]*|your)\s*)?$/iu.test(gap.trim())) return null;
    const before = text.slice(Math.max(0, start - 100), start).trimEnd();
    if (this.NEGATION.test(before) || this.REPORTED.test(before) || this.NOT_REQUESTED.test(before)) return null;
    return { start, action: match[0] };
  }

  public static analyze(rawText: string, language: SupportedLanguage, identityPattern?: RegExp): RequestFrame[] {
    const raw = rawText;
    const normalized = TextNormalizer.normalizeWords(raw, language);
    const rules = identityPattern ? [...this.OBJECTS, { object: 'identity' as const, pattern: identityPattern }] : this.OBJECTS;
    const frames: RequestFrame[] = [];
    let searchFrom = 0;
    for (const clause of raw.matchAll(/[^.!?;\n]+/gu)) {
      const normalizedClause = TextNormalizer.normalizeWords(clause[0], language);
      const text = this.restoreLatin(normalizedClause);
      const offset = normalized.indexOf(normalizedClause, searchFrom);
      if (offset < 0 || !text) continue;
      searchFrom = offset + text.length;
      for (const rule of rules) {
        for (const object of text.matchAll(rule.pattern)) {
          const action = this.findRequestedAction(text, object.index!);
          if (!action) continue;
          // A generic password inside a wallet-secret object must not compete
          // with the more specific interpretation of that same request.
          if (rule.object === 'account_password' && frames.some(frame =>
            frame.object === 'wallet_secret' && frame.start <= offset + object.index! && frame.end > offset + object.index!)) continue;
          const purpose = this.PAYMENT.test(text) ? 'payment' : this.VERIFICATION.test(text) ? 'verification' : 'unknown';
          const destination = /https?:\/\/|(?:на\s+(?:сторінці|сайті)|у\s+форму|на\s+странице|on\s+(?:this\s+|the\s+)?(?:page|website))/iu.test(clause[0])
            ? 'page' : /(?<![\p{L}\p{N}])(?:мені|нам|сюди|мне|сюда|to\s+me|to\s+us|here)(?![\p{L}\p{N}])/iu.test(text) ? 'interlocutor' : 'unknown';
          const end = object.index! + object[0].length;
          frames.push({ action: action.action, object: rule.object, objectText: object[0], purpose, destination,
            start: offset + action.start, end: offset + end, text: normalizedClause.slice(action.start, end) });
        }
      }
    }
    return frames;
  }
}
