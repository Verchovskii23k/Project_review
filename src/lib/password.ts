/**
 * Генерирует пароль в зависимости от уровня сложности.
 * - low: 10 символов (без спецсимволов)
 * - medium: 12 символов (без спецсимволов)
 * - high: длина по умолчанию 12, включает спецсимволы
 * Если вызвана без аргументов, возвращает legacy-пароль (8 символов).
 *
 * @param securityLevel - уровень сложности (low | medium | high)
 * @param length - длина пароля для high (по умолчанию 12)
 * @returns Строка пароля
 */
export function generateLegacyPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = upper + lower + digits;

  const getRandom = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join('');

  let password = getRandom(upper, 2) + getRandom(lower, 2) + getRandom(digits, 2) + getRandom(all, 2);
  password = password.split('').sort(() => Math.random() - 0.5).join('');

  const forbidden = ['123','234','345','456','567','678','789','890',
                     'abc','bcd','cde','def','efg','fgh','ghi','hij',
                     'ijk','jkl','klm','lmn','mno','nop','opq','pqr',
                     'qrs','rst','stu','tuv','uvw','vwx','wxy','xyz'];
  if (forbidden.some(seq => password.toLowerCase().includes(seq))) {
    return generateLegacyPassword();
  }
  return password;
}
import bcrypt from 'bcryptjs';

/** Транслитерация русских символов для генерации email */
/**
 * Транслитерирует русскую строку в латиницу для использования в email.
 *
 * Заменяет кириллические символы по словарю, цифры и латинские буквы
 * оставляет как есть, пробелы/дефисы/подчёркивания заменяет на `_`.
 * Длина результата ограничена 10 символами (без финального подчёркивания).
 *
 * @param name - исходная строка (фамилия или имя).
 * @returns Транслитерированная строка длиной до 10 символов.
 */
export function transliterate(name: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh',
    'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c',
    'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  const lower = name.toLowerCase();
  let result = '';
  for (const ch of lower) {
    if (map[ch]) result += map[ch];
    else if (/[a-zA-Z0-9]/.test(ch)) result += ch;
    else if (' -_'.includes(ch)) result += '_';
  }
  result = result.replace(/__+/g, '_');
  if (result.length > 10) result = result.slice(0, 10);
  return result.replace(/_$/, '');
}

/** Генерация email из фамилии и имени */
/**
 * Формирует внутренний email на основе фамилии и имени.
 *
 * Шаблон: `{транслит фамилии}.{первая буква имени}{двузначное число}@internal.uni`
 * Например: `ivanov.i42@internal.uni`.
 *
 * @param surname - фамилия (русская).
 * @param name - имя (русское).
 * @returns Строка email.
 */
export function makeEmail(surname: string, name: string): string {
  const base = transliterate(surname).toLowerCase();
  const initialRaw = name.charAt(0);
  const initial = transliterate(initialRaw).toLowerCase() || 'x';
  const randomSuffix = Math.floor(10 + Math.random() * 90);
  return `${base}.${initial}${randomSuffix}@internal.uni`;
}
/**
 * Генерирует пароль в зависимости от уровня сложности.
 * - low: 6 символов (2 заглавные, 2 строчные, 2 цифры)
 * - medium: 8 символов (как раньше)
 * - high: длина по умолчанию 12, включает спецсимволы
 *
 * @param securityLevel - уровень сложности (low | medium | high)
 * @param length - длина пароля для high (по умолчанию 12)
 * @returns Строка пароля
 */
export function generateRandomPassword(
  securityLevel?: "low" | "medium" | "high",
  length?: number
): string {
  if (!securityLevel) {
    return generateLegacyPassword();
  }
  switch (securityLevel) {
    case "low":
      return generateLowPassword();
    case "medium":
      return generateMediumPassword();
    case "high":
      return generateHighPassword(length ?? 12);
  }
}

/** 10 символов без спецсимволов */
function generateLowPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = upper + lower + digits;
  const getRandom = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join('');

  let password = getRandom(upper, 2) + getRandom(lower, 2) + getRandom(digits, 2) + getRandom(all, 4);
  password = password.split('').sort(() => Math.random() - 0.5).join('');

  const forbidden = ['123','234','345','456','567','678','789','890',
                     'abc','bcd','cde','def','efg','fgh','ghi','hij',
                     'ijk','jkl','klm','lmn','mno','nop','opq','pqr',
                     'qrs','rst','stu','tuv','uvw','vwx','wxy','xyz'];
  if (forbidden.some(seq => password.toLowerCase().includes(seq))) {
    return generateLowPassword();
  }
  return password;
}
/** 12 символов без спецсимволов (medium) */
function generateMediumPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = upper + lower + digits;
  const getRandom = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join('');

  let password = getRandom(upper, 2) + getRandom(lower, 2) + getRandom(digits, 2) + getRandom(all, 6);
  password = password.split('').sort(() => Math.random() - 0.5).join('');

  const forbidden = ['123','234','345','456','567','678','789','890',
                     'abc','bcd','cde','def','efg','fgh','ghi','hij',
                     'ijk','jkl','klm','lmn','mno','nop','opq','pqr',
                     'qrs','rst','stu','tuv','uvw','vwx','wxy','xyz'];
  if (forbidden.some(seq => password.toLowerCase().includes(seq))) {
    return generateMediumPassword();
  }
  return password;
}
/**
 * Генерирует пароль заданной длины со спецсимволами.
 * Минимум 2 заглавные, 2 строчные, 2 цифры, 1 спецсимвол.
 */
function generateHighPassword(length: number): string {
  if (length < 8) length = 8;
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specials = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + digits + specials;
  const getRandom = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join('');

  // обязательные компоненты: 2 заглавные, 2 строчные, 2 цифры, 1 спецсимвол
  let password = getRandom(upper, 2) + getRandom(lower, 2) + getRandom(digits, 2) + getRandom(specials, 1);
  const remaining = length - 7;
  if (remaining > 0) password += getRandom(all, remaining);
  password = password.split('').sort(() => Math.random() - 0.5).join('');

  const forbidden = ['123','234','345','456','567','678','789','890',
                     'abc','bcd','cde','def','efg','fgh','ghi','hij',
                     'ijk','jkl','klm','lmn','mno','nop','opq','pqr',
                     'qrs','rst','stu','tuv','uvw','vwx','wxy','xyz'];
  if (forbidden.some(seq => password.toLowerCase().includes(seq))) {
    return generateHighPassword(length);
  }
  return password;
}
/** Хеширование пароля */
/**
 * Хеширует пароль с помощью bcrypt (соль 10 раундов).
 *
 * Используется при создании учётных записей администраторов и пользователей.
 *
 * @param password - открытый пароль.
 * @returns Хеш пароля.
 */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}