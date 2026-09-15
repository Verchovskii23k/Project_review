import { describe, it, expect } from 'vitest';
import {
  transliterate,
  makeEmail,
  generateLegacyPassword,
  generateRandomPassword,
  hashPassword,
} from '@/lib/password';
import bcrypt from 'bcryptjs';

describe('password utilities', () => {
  describe('transliterate', () => {
    it('транслитерирует кириллицу', () => {
      expect(transliterate('Иванов')).toBe('ivanov');
      expect(transliterate('Петров')).toBe('petrov');
      expect(transliterate('Щербаков')).toBe('scherbakov');
    });

    it('обрезает до 10 символов', () => {
      const long = 'Александрович'; // длина после транслитерации >10
      const result = transliterate(long);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('убирает завершающее подчёркивание', () => {
      expect(transliterate('Иван-')).toBe('ivan'); // дефис превращается в '_', затем обрезается в конце
      expect(transliterate('Иван ')).toBe('ivan');
    });

    it('оставляет цифры и латиницу без изменений', () => {
      expect(transliterate('User123')).toBe('user123');
    });
  });

  describe('makeEmail', () => {
    it('формирует email в домене @internal.uni', () => {
      const email = makeEmail('Иванов', 'Иван');
      expect(email).toMatch(/^[a-z]+\.[a-z]\d{2}@internal\.uni$/);
      // проверяем, что фамилия транслитерирована и стоит до точки
      const base = transliterate('Иванов').toLowerCase();
      expect(email.startsWith(base + '.')).toBe(true);
    });

    it('генерирует разные email при нескольких вызовах', () => {
      const email1 = makeEmail('Иванов', 'Иван');
      const email2 = makeEmail('Иванов', 'Иван');
      // вероятность совпадения крайне мала, но всё же проверим, что они не равны
      expect(email1).not.toBe(email2);
    });
  });

  describe('generateLegacyPassword', () => {
    it('возвращает строку длиной 8', () => {
      const pwd = generateLegacyPassword();
      expect(pwd).toHaveLength(8);
    });

    it('содержит минимум 2 заглавные, 2 строчные, 2 цифры', () => {
      for (let i = 0; i < 50; i++) {
        const pwd = generateLegacyPassword();
        const upper = (pwd.match(/[A-Z]/g) || []).length;
        const lower = (pwd.match(/[a-z]/g) || []).length;
        const digits = (pwd.match(/[0-9]/g) || []).length;
        expect(upper).toBeGreaterThanOrEqual(2);
        expect(lower).toBeGreaterThanOrEqual(2);
        expect(digits).toBeGreaterThanOrEqual(2);
      }
    });

    it('не содержит запрещённых последовательностей', () => {
      const forbidden = ['123','234','345','456','567','678','789','890',
                         'abc','bcd','cde','def','efg','fgh','ghi','hij',
                         'ijk','jkl','klm','lmn','mno','nop','opq','pqr',
                         'qrs','rst','stu','tuv','uvw','vwx','wxy','xyz'];
      for (let i = 0; i < 100; i++) {
        const pwd = generateLegacyPassword();
        const hasForbidden = forbidden.some(seq => pwd.toLowerCase().includes(seq));
        expect(hasForbidden).toBe(false);
      }
    });
  });

  describe('generateRandomPassword', () => {
    it('без аргументов возвращает legacy пароль', () => {
      const pwd = generateRandomPassword();
      expect(pwd).toHaveLength(8);
    });

    it('low – 10 символов, минимум 2 заглавные, 2 строчные, 2 цифры', () => {
      for (let i = 0; i < 30; i++) {
        const pwd = generateRandomPassword('low');
        expect(pwd).toHaveLength(10);
        const upper = (pwd.match(/[A-Z]/g) || []).length;
        const lower = (pwd.match(/[a-z]/g) || []).length;
        const digits = (pwd.match(/[0-9]/g) || []).length;
        expect(upper).toBeGreaterThanOrEqual(2);
        expect(lower).toBeGreaterThanOrEqual(2);
        expect(digits).toBeGreaterThanOrEqual(2);
      }
    });

    it('medium – 12 символов, минимум 2 заглавные, 2 строчные, 2 цифры', () => {
      for (let i = 0; i < 30; i++) {
        const pwd = generateRandomPassword('medium');
        expect(pwd).toHaveLength(12);
        const upper = (pwd.match(/[A-Z]/g) || []).length;
        const lower = (pwd.match(/[a-z]/g) || []).length;
        const digits = (pwd.match(/[0-9]/g) || []).length;
        expect(upper).toBeGreaterThanOrEqual(2);
        expect(lower).toBeGreaterThanOrEqual(2);
        expect(digits).toBeGreaterThanOrEqual(2);
      }
    });

    it('high – заданная длина, минимум 2 заглавные, 2 строчные, 2 цифры, 1 спецсимвол', () => {
      const length = 16;
      for (let i = 0; i < 30; i++) {
        const pwd = generateRandomPassword('high', length);
        expect(pwd).toHaveLength(length);
        const upper = (pwd.match(/[A-Z]/g) || []).length;
        const lower = (pwd.match(/[a-z]/g) || []).length;
        const digits = (pwd.match(/[0-9]/g) || []).length;
        const specials = (pwd.match(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/g) || []).length;
        expect(upper).toBeGreaterThanOrEqual(2);
        expect(lower).toBeGreaterThanOrEqual(2);
        expect(digits).toBeGreaterThanOrEqual(2);
        expect(specials).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('hashPassword', () => {
    it('возвращает хеш, отличный от исходного пароля', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash).toHaveLength(60); // bcrypt hash length
    });

    it('корректно проверяется через bcrypt.compare', async () => {
      const password = 'anotherPassword';
      const hash = await hashPassword(password);
      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);
    });
  });
});