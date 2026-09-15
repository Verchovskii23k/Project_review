/**
 * Глобальная настройка тестового окружения Vitest.
 *
 * Выполняется один раз перед запуском всех тестов. Загружает переменные окружения
 * из `.env.test` и мокает модуль `next/headers`, чтобы тесты, работающие с tRPC
 * и аутентификацией, не падали при вызове `cookies()` вне реального HTTP-сервера.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest';
config({ path: resolve(__dirname, '../../.env.test') });

vi.mock('next/headers', () => {
  const cookieStore = {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return {
    cookies: vi.fn().mockResolvedValue(cookieStore),
  };
});