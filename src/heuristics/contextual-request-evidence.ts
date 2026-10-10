import { TextNormalizer } from './text-normalizer';
import type { SupportedLanguage } from './language-detector';

/** Explicit action + protected object/payout + destination. No scenario IDs. */
export class ContextualRequestEvidence {
  public static extract(raw: string, language: SupportedLanguage): Array<{ cluster: string; text: string; weight: number }> {
    const text = TextNormalizer.normalizeWords(raw, language);
    const output: Array<{ cluster: string; text: string; weight: number }> = [];
    const allowed = (action: RegExp) => {
      const match = action.exec(text);
      if (!match) return false;
      const before = text.slice(Math.max(0, match.index - 100), match.index);
      // Explanations, quotations and prohibitions do not supply a direct request.
      if (/(?:не|ніколи\s+не|never|do\s+not|dont)\s*$/iu.test(before)) return false;
      if (/(?:приклад|цитата|шаблон|example|quote|template|шахрай\s+(?:просить|написав))[^.!?\n]{0,90}$/iu.test(before)) return false;
      return true;
    };
    const reconAction = /(?:сфотографуй(?:те)?|фотографуйте|зніміть|зніми|поставте\s+позначку|поділіться\s+координат|photograph|send\s+(?:its\s+|the\s+)?location)/iu;
    const protectedObject = /(?:військов[а-яіїє]*\s+(?:технік|частин|обєкт)|блокпост|military\s+(?:checkpoint|base|vehicle))/iu;
    if (allowed(reconAction) && protectedObject.test(text) &&
        /(?:координат|геолокац|розташуван|позначку\s+на\s+мапі|location|photograph)/iu.test(text)) {
      output.push({ cluster: 'military_sabotage', text, weight: 50 });
    }
    const destructive = allowed(/(?:допоможіть\s+вивести\s+з\s+ладу|виведіть\s+з\s+ладу|залишити|покладіть|залиште)/iu);
    if (destructive && ((/вивести\s+з\s+ладу|виведіть\s+з\s+ладу/iu.test(text) && protectedObject.test(text)) ||
        (/запалювальн[а-яіїє]*\s+суміш/iu.test(text) && /(?:біля|у|в)\s+склад/iu.test(text)))) {
      output.push({ cluster: 'military_sabotage', text, weight: 50 });
    }
    const transaction = /(?:курєр|кур['’]єр|посилк|після\s+продажу|сервіс\s+угоди|платформа)/iu.test(text);
    const payoutOrFee = /(?:отримання\s+оплати|зарезервува[а-яіїє]*\s+сум|страхов[а-яіїє]*\s+збір|підтвердження\s+виплати|зарахування\s+вартості)/iu.test(text);
    const destination = /(?:зовнішн[а-яіїє]*\s+сторін|посиланн|надіслан[а-яіїє]*\s+форм|https?:|httрs?:|авторизуйтеся)/iu.test(text);
    const action = /(?:підтверд[а-яіїє]*|відкрийте|оплатіть|авторизуйтеся)/iu;
    if (transaction && payoutOrFee && destination && allowed(action) &&
        !/(?:офіційн[а-яіїє]*\s+(?:застосун|кабінет)|самостійно|не\s+переходьте)/iu.test(text)) {
      output.push({ cluster: 'transaction_redirect', text, weight: 65 });
    }
    return output;
  }
}
