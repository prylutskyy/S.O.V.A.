export class FuzzyMatcher {
  /**
   * Таблиця гомогліфів (латинські символи, які візуально схожі на кириличні)
   */
  private static readonly HOMOGLYPHS: Record<string, string> = {
    'a': 'а', 'c': 'с', 'e': 'е', 'o': 'о',
    'p': 'р', 'x': 'х', 'y': 'у', 'i': 'і',
    's': 'с', 'k': 'к', 'm': 'м', 'h': 'н',
    'b': 'в', 't': 'т',
  };

  /**
   * Спрощена та офіційна таблиця транслітерації (Кирилиця -> Латиниця)
   */
  private static readonly CYR_TO_LAT: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g',
    'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
    'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k',
    'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
    'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ю': 'yu', 'я': 'ya', 'ь': '', 'ъ': '', 'ы': 'y', 'э': 'e',
  };

  /**
   * Зворотна таблиця транслітерації (Латиниця -> Кирилиця)
   */
  private static readonly LAT_TO_CYR: [RegExp, string][] = [
    [/shch/g, 'щ'], [/sh/g, 'ш'], [/ch/g, 'ч'], [/ts/g, 'ц'],
    [/zh/g, 'ж'], [/kh/g, 'х'], [/yu/g, 'ю'], [/ya/g, 'я'],
    [/ye/g, 'є'], [/yi/g, 'ї'],
    [/a/g, 'а'], [/b/g, 'б'], [/v/g, 'в'], [/w/g, 'в'],
    [/g/g, 'г'], [/h/g, 'г'], [/d/g, 'д'], [/e/g, 'е'],
    [/z/g, 'з'], [/y/g, 'и'], [/i/g, 'і'], [/j/g, 'й'],
    [/k/g, 'к'], [/l/g, 'л'], [/m/g, 'м'], [/n/g, 'н'],
    [/o/g, 'о'], [/p/g, 'р'], [/r/g, 'р'], [/s/g, 'с'],
    [/t/g, 'т'], [/u/g, 'у'], [/f/g, 'ф'], [/x/g, 'кс'],
  ];

  /**
   * Розрахунок дистанції Дамерау-Левенштейна (враховує заміни, вставки, видалення та перестановки)
   */
  public static levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const la = a.length;
    const lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    if (Math.abs(la - lb) > 3) return Math.max(la, lb);

    const d: number[][] = [];
    for (let i = 0; i <= la; i++) {
      d[i] = [];
      d[i][0] = i;
    }
    for (let j = 0; j <= lb; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,       // видалення
          d[i][j - 1] + 1,       // вставка
          d[i - 1][j - 1] + cost // заміна
        );

        // Транспозиція (перестановка двох сусідніх символів)
        if (
          i > 1 &&
          j > 1 &&
          a[i - 1] === b[j - 2] &&
          a[i - 2] === b[j - 1]
        ) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }

    return d[la][lb];
  }

  /**
   * Перевірка нечіткого збігу з адаптивним порогом:
   * - Довжина < 5: тільки точний збіг (maxDist = 0)
   * - Довжина 5-7: допустима 1 помилка (maxDist <= 1)
   * - Довжина 8+: допустимо до 2 помилок (maxDist <= 2)
   */
  public static isFuzzyMatch(candidate: string, secret: string): boolean {
    const c = candidate.trim().toLowerCase();
    const s = secret.trim().toLowerCase();
    if (!c || !s) return false;
    if (c === s) return true;

    const maxDist = s.length >= 8 ? 2 : (s.length >= 5 ? 1 : 0);
    if (maxDist === 0) return c === s;

    return this.levenshtein(c, s) <= maxDist;
  }

  /**
   * Канонізація тексту (Homoglyphs + Phonetic Vowel Folding + Deduplication):
   * 1. Приводить латинські літери-двійники до кирилиці
   * 2. Нормалізує варіації голосних (и, і, ї, ы -> і)
   * 3. Згортає подвійні літери (нн -> н, аа -> а)
   * Дозволяє поєднати "Смирнова", "Смірнова", "Смирноваа", "Cмирнова" в один канонічний вигляд.
   */
  public static canonicalFold(text: string): string {
    if (!text) return '';
    const lower = text.trim().toLowerCase();

    // 1. Заміна гомогліфів
    let unihomoglyph = '';
    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      unihomoglyph += this.HOMOGLYPHS[char] || char;
    }

    // 2. Фонетична нормалізація голосних (и, ї, ы -> і)
    let phonetic = unihomoglyph
      .replace(/[иїы]/g, 'і')
      .replace(/йо/g, 'ьо')
      .replace(/apostrophe|['`’ʼ"]/g, '');

    // 3. Згортання однакових сусідніх літер (наприклад, одруківка "смирноваа" -> "смирнова")
    let dedup = '';
    for (let i = 0; i < phonetic.length; i++) {
      if (i === 0 || phonetic[i] !== phonetic[i - 1]) {
        dedup += phonetic[i];
      }
    }

    return dedup;
  }

  /**
   * Генерація транслітерованих варіантів (Кирилиця -> Латиниця)
   * Наприклад: "Смирнова" -> ["smirnova", "smyrnova"]
   */
  public static transliterateCyrillic(text: string): string[] {
    const clean = text.trim().toLowerCase();
    if (!clean) return [];

    // Варіант 1: 'и' -> 'y' (офіційний КМУ)
    let variantY = '';
    // Варіант 2: 'и' -> 'i' (популярна транслітерація)
    let variantI = '';

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === 'и') {
        variantY += 'y';
        variantI += 'i';
      } else {
        const tr = this.CYR_TO_LAT[ch] !== undefined ? this.CYR_TO_LAT[ch] : ch;
        variantY += tr;
        variantI += tr;
      }
    }

    const set = new Set<string>();
    if (variantY) set.add(variantY);
    if (variantI) set.add(variantI);
    return Array.from(set);
  }

  /**
   * Транслітерація з Латиниці в Кирилицю
   * Наприклад: "Smirnova" -> "смирнова"
   */
  public static transliterateLatinToCyrillic(text: string): string {
    let res = text.trim().toLowerCase();
    for (const [regex, cyr] of this.LAT_TO_CYR) {
      res = res.replace(regex, cyr);
    }
    return res;
  }

  /**
   * Перевірка наявності транслітерованого збігу між двома рядками
   */
  public static isTranslitMatch(candidate: string, cyrillicSecret: string): boolean {
    const cand = candidate.trim().toLowerCase();
    const sec = cyrillicSecret.trim().toLowerCase();
    if (!cand || !sec) return false;

    // Якщо кандидат латиницею:
    const cyrCandidates = [this.transliterateLatinToCyrillic(cand)];
    for (const c of cyrCandidates) {
      if (c === sec || this.canonicalFold(c) === this.canonicalFold(sec)) {
        return true;
      }
      if (this.isFuzzyMatch(c, sec)) {
        return true;
      }
    }

    // Перевіряємо транслітерацію секрету у латиницю:
    const latSecrets = this.transliterateCyrillic(sec);
    for (const lat of latSecrets) {
      if (cand === lat || this.isFuzzyMatch(cand, lat)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Спеціалізована перевірка 10-значного ІПН / РНОКПП на одруківку в 1 цифру
   */
  public static isTypoTaxId(candidateDigits: string, realTaxIdDigits: string): boolean {
    if (!candidateDigits || !realTaxIdDigits) return false;
    const c = candidateDigits.trim();
    const r = realTaxIdDigits.trim();
    if (c.length === 10 && r.length === 10) {
      if (c === r) return true;
      return this.levenshtein(c, r) === 1;
    }
    return false;
  }
}
