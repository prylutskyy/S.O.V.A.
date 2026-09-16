export class UrlExtractor {
  /**
   * Регулярний вираз для знаходження потенційних посилань, навіть якщо вони обфусковані.
   * Виявляє:
   * 1. Стандартні URL (http://...)
   * 2. Домени з пробілами (olx-pay . com)
   * 3. Масковані крапки (olx-pay [.] com, olx (крапка) ua)
   * 4. Злиті домени (olxpay.com)
   */
  public static extract(rawText: string): string[] {
    if (!rawText) return [];

    const extracted: string[] = [];
    const lowerText = rawText.toLowerCase();

    // 1. Попередня обробка: нормалізація "крапок"
    // Шахраї пишуть: (крапка), [dot], [.]
    let text = lowerText
      .replace(/\s*\[\s*\.\s*\]\s*/g, '.')
      .replace(/\s*\(\s*\.\s*\)\s*/g, '.')
      .replace(/\s*\[\s*dot\s*\]\s*/g, '.')
      .replace(/\s*\(\s*dot\s*\)\s*/g, '.')
      .replace(/\s*\(крапка\)\s*/g, '.')
      .replace(/\s*\[крапка\]\s*/g, '.')
      .replace(/\s+точка\s+/g, '.');

    // 2. Специфічний патерн для доменів з розширеннями (навіть якщо розділені пробілом)
    // Шахраї можуть писати "olx - pay . com / payment / 123"
    // Ми використовуємо потужний regex, що дозволяє пробіли навколо крапок і слешів.
    const urlPattern = /(?:(?:https?|ftp):\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\s*\.\s*)+[a-z]{2,10}(?:\s*\/\s*[a-z0-9\-_?=&#%]*)*(?=\s|$)/gi;

    let match;
    while ((match = urlPattern.exec(text)) !== null) {
      // Очищуємо пробіли навколо крапок і слешів, щоб відновити реальний URL
      let cleanUrl = match[0].replace(/\s*\.\s*/g, '.').replace(/\s*\/\s*/g, '/');
      
      // Додаємо http:// якщо його немає, щоб це було валідне посилання для парсингу
      if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'https://' + cleanUrl;
      }
      extracted.push(cleanUrl);
    }

    return extracted;
  }
}
