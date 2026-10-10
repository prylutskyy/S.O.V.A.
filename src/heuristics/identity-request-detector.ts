import { TextNormalizer } from './text-normalizer';
import { SupportedLanguage } from './language-detector';
import { RequestAnalyzer } from './request-analyzer';

/** Detect an actual request, rather than a mere mention of personal data. */
export class IdentityRequestDetector {
  private static readonly OBJECT = /(?<![\p{L}\p{N}])(?:паспорт[а-яіїєё]*|посвідчення\s+особи|удостоверени[ея]\s+личности|(?:номер|серію|серию)\s+(?:вашого\s+|вашего\s+)?документ[а-яіїєё]*|ід\s*картк[а-яіїє]*|айді|айди|idкартк[а-яіїєё]*|іdкартк[а-яіїєё]*|passport(?:\s+(?:number|details))?|id\s*card|identity\s+document|national\s+id|іпн|рнокпп|инн|ідентифікаційн[а-яіїє]*\s+код|идентификационн[а-яё]*\s+код|податков[а-яіїє]*\s+номер|налогов[а-яё]*\s+номер|tax\s+id|ssn|social\s+security\s+number|дівоч[а-яіїє]*\s+прізвищ[а-яіїє]*(?:\s+матері)?|девич[а-яё]*\s+фамили[яию](?:\s+матери)?|(?:mother'?s?|mothers|mom'?s?|moms)\s+maiden\s+name|(?:кодове|секретне|контрольне|кодовое|секретное|контрольное)\s+слово|(?:security|secret|control)\s+word|відповід[а-яіїє]*\s+на\s+(?:контрольн[а-яіїє]*|секретн[а-яіїє]*)\s+(?:питання|запитання)|ответ\s+на\s+(?:контрольный|секретный)\s+вопрос|(?:answer\s+to\s+(?:your\s+)?)?security\s+question|(?:дат[а-яіїє]*|день|рік)\s+народження|(?:дат[а-яё]*|день|год)\s+рождения|date\s+of\s+birth|birth\s+date|dob)(?![\p{L}\p{N}])/giu;

  /** Used for both built-in objects and user-defined vault keywords. */
  public static isRequestedObject(text: string, objectIndex: number): number | null {
    return RequestAnalyzer.findRequestedAction(text, objectIndex)?.start ?? null;
  }

  public static getObjectPattern(): RegExp { return new RegExp(this.OBJECT); }

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
