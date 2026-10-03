export class TextNormalizer {
  /**
   * Словник для заміни символів-двійників (homoglyphs) та цифр на відповідні кириличні літери.
   */
  private static readonly homoglyphMap: Record<string, string> = {
    // Латиниця -> Кирилиця
    'a': 'а',
    'c': 'с',
    'e': 'е',
    'o': 'о',
    'p': 'р',
    'x': 'х',
    'y': 'у',
    'i': 'і',
    // Цифри -> Кирилиця
    '0': 'о',
    '1': 'і',
    '3': 'з',
    '4': 'ч',
    '6': 'б'
  };

  /**
   * Нормалізує текст для протидії обфускації:
   * 1. Переводить у нижній регістр
   * 2. Видаляє пробіли та специфічні символи розділення всередині слів (о п л а т а -> оплата)
   * 3. Замінює символи-двійники
   * 
   * УВАГА: Ця функція оптимізована для пошуку ключових слів. 
   * Вона видаляє всі пробіли, тому результат — це суцільний рядок.
   * Використовувати тільки для перевірки через Regex/Fuzzy алгоритми!
   */
  public static normalizeForMatching(text: string, lang?: 'uk' | 'en' | 'ru'): string {
    if (!text) return '';

    // 1. Нижній регістр
    let normalized = text.toLowerCase();

    // 2. Видалення пробілів, дефісів, крапок, ком, нижніх підкреслень 
    // та невидимих/zero-width символів обфускації (U+200B-U+200D, U+FEFF, U+2060, RTLO тощо)
    normalized = normalized.replace(/[\s\-_.,!?'"~*^\u200B-\u200D\uFEFF\u2060\u202A-\u202E\u00A0]/g, '');

    // Якщо вказана суто англійська мова, не замінюємо латиницю на кириличні гомогліфи
    if (lang === 'en') {
      return normalized;
    }

    // 3. Заміна гомогліфів
    let result = '';
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      result += this.homoglyphMap[char] || char;
    }

    return result;
  }

  /**
   * Створює масив слів, де кожне слово нормалізоване (але пробіли між оригінальними словами збережені).
   * Автоматично "склеює" літери, якщо шахрай написав слово через пробіл (о п л а т а -> оплата).
   */
  public static normalizeWords(text: string, lang?: 'uk' | 'en' | 'ru'): string {
    if (!text) return '';

    // 1. Видалення zero-width/RTLO символів перед розбиттям по пробілах,
    // оскільки \uFEFF розцінюється JS RegExp \s як пробіл
    const cleaned = text.replace(/[\u200B-\u200D\uFEFF\u2060\u202A-\u202E\u00A0]/g, '');

    // 2. Попередня заміна гомогліфів та нижній регістр для всього тексту
    let preNormalized = '';
    const lower = cleaned.toLowerCase();

    if (lang === 'en') {
      preNormalized = lower;
    } else {
      for (let i = 0; i < lower.length; i++) {
        const char = lower[i];
        preNormalized += this.homoglyphMap[char] || char;
      }
    }

    // 3. Розбиваємо по пробілах, видаляємо пунктуацію
    const tokens = preNormalized
      .split(/\s+/)
      .map(word => word.replace(/[\-_.,!?'"~*^\u2018\u2019\u02BC]/g, ''))
      .filter(w => w.length > 0);

    // 3. Склеювання поодиноких літер (о п л а т а -> оплата)
    const resultTokens: string[] = [];
    let currentWord = '';

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.length === 1) {
        currentWord += token;
      } else {
        if (currentWord.length > 0) {
          resultTokens.push(currentWord);
          currentWord = '';
        }
        resultTokens.push(token);
      }
    }
    if (currentWord.length > 0) {
      resultTokens.push(currentWord);
    }

    return resultTokens.join(' ');
  }
}
