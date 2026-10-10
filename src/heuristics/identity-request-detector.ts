import { TextNormalizer } from './text-normalizer';
import { SupportedLanguage } from './language-detector';

/** Detect an actual request, rather than a mere mention of personal data. */
export class IdentityRequestDetector {
  private static readonly OBJECT = /(?<![\p{L}\p{N}])(?:паспорт[а-яіїєё]*|посвідчення\s+особи|удостоверени[ея]\s+личности|(?:номер|серію|серию)\s+(?:вашого\s+|вашего\s+)?документ[а-яіїєё]*|ід\s*картк[а-яіїє]*|айді|айди|idкартк[а-яіїєё]*|іdкартк[а-яіїєё]*|passport(?:\s+(?:number|details))?|id\s*card|identity\s+document|national\s+id|іпн|рнокпп|инн|ідентифікаційн[а-яіїє]*\s+код|идентификационн[а-яё]*\s+код|податков[а-яіїє]*\s+номер|налогов[а-яё]*\s+номер|tax\s+id|ssn|social\s+security\s+number|дівоч[а-яіїє]*\s+прізвищ[а-яіїє]*(?:\s+матері)?|девич[а-яё]*\s+фамили[яию](?:\s+матери)?|(?:mother'?s?|mothers|mom'?s?|moms)\s+maiden\s+name|(?:кодове|секретне|контрольне|кодовое|секретное|контрольное)\s+слово|(?:security|secret|control)\s+word|відповід[а-яіїє]*\s+на\s+(?:контрольн[а-яіїє]*|секретн[а-яіїє]*)\s+(?:питання|запитання)|ответ\s+на\s+(?:контрольный|секретный)\s+вопрос|(?:answer\s+to\s+(?:your\s+)?)?security\s+question|(?:дат[а-яіїє]*|день|рік)\s+народження|(?:дат[а-яё]*|день|год)\s+рождения|date\s+of\s+birth|birth\s+date|dob)(?![\p{L}\p{N}])/giu;
  private static readonly ACTION = /(?:^|\s)(?:надішліть|надішли|надсилайте|відправте|відправ|завантажте|завантаж|повідомте|повідомляйте|повідом|повідомивши|напишіть|напиши|вкажіть|вкажи|скиньте|скинь|скажіть|скажи|підкажіть|підкажи|надайте|надай|продиктуйте|введіть|вишліть|дайте|назвіть|назви|назвати|надіслати|потрібен|потрібна|потрібні|треба|яке|яка|напишите|напиши|укажите|укажи|скиньте|скажите|скажи|предоставьте|продиктуйте|введите|вышлите|пришлите|отправьте|отправь|загрузите|сообщите|сообщайте|сообщив|дайте|назовите|нужен|нужна|нужны|надо|какая|какое|send|share|provide|upload|enter|tell|type|give|submit|need|what\s+is)\s+/giu;
  private static readonly NEGATION = /(?:^|\s)(?:не(?:\s+(?:потрібно|треба|варто|слід|можна|нужно|надо|стоит))?|ніколи\s+не|никогда\s+не|never|do\s+not|dont|don't|should\s+not|shouldnt|shouldn't)\s*$/iu;
  private static readonly EXPLANATORY_GAP = /(?:інструкці|инструкци|статт|стать|довід|список|опис|описание|приклад|пример|guide|article|example|explanation|list\s+of)/iu;

  /** Used for both built-in objects and user-defined vault keywords. */
  public static isRequestedObject(text: string, objectIndex: number): number | null {
    const prefix = text.slice(Math.max(0, objectIndex - 100), objectIndex);
    const actions = Array.from(prefix.matchAll(this.ACTION));
    const action = actions.at(-1);
    if (!action || action.index === undefined) return null;
    const actionStart = Math.max(0, objectIndex - 100) + action.index;
    const gap = prefix.slice(action.index + action[0].length);
    // Question words must address this object directly, not another request
    // earlier in the sentence (e.g. "на яке ім'я ... не просив документа").
    if (/^(?:яке|яка|какая|какое|what\s+is)\s*$/iu.test(action[0].trim()) &&
        !/^(?:(?:ваш[а-яіїєё]*|your)\s*)?$/iu.test(gap.trim())) return null;
    if (gap.trim().split(/\s+/).filter(Boolean).length > 8 || this.EXPLANATORY_GAP.test(gap)) return null;
    const beforeAction = text.slice(Math.max(0, actionStart - 60), actionStart).trimEnd();
    if (this.NEGATION.test(beforeAction)) return null;
    // A quoted script introduced as an example is not an active request.
    if (/(?:приклад|пример|example|цитата|quote|фраза|phrase|шаблон|template)(?:\s+\S+){0,4}\s*[:«"“]?\s*$/iu.test(beforeAction)) return null;
    if (/(?:шахрай|мошенник|scammer)\s+(?:написав|написал|пише|пишет|просить|просит|wrote|said|asks?)(?:\s+\S+){0,3}\s*[:«"“]?\s*$/iu.test(beforeAction)) return null;
    return actionStart + (action[0].startsWith(' ') ? 1 : 0);
  }

  public static detect(rawText: string, language: SupportedLanguage, vaultKeyword?: string) {
    const normalizedText = TextNormalizer.normalizeWords(rawText, language);
    const spans: Array<{ start: number; end: number; text: string }> = [];
    const keyword = vaultKeyword === undefined ? undefined : TextNormalizer.normalizeWords(vaultKeyword, language);
    if (keyword !== undefined && keyword.length < 3) return spans;
    const objectPattern = keyword === undefined ? this.OBJECT : new RegExp(
      `(?<![\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu'
    );
    let searchFrom = 0;
    // Keep sentence boundaries before normalization removes punctuation.
    for (const clause of rawText.matchAll(/[^.!?;\n]+/gu)) {
      const text = TextNormalizer.normalizeWords(clause[0], language);
      const offset = normalizedText.indexOf(text, searchFrom);
      if (offset < 0) continue;
      searchFrom = offset + text.length;
      for (const object of text.matchAll(objectPattern)) {
        const start = this.isRequestedObject(text, object.index!);
        if (start === null) continue;
        const end = object.index! + object[0].length;
        spans.push({ start: offset + start, end: offset + end, text: text.slice(start, end) });
      }
    }
    return spans;
  }
}
