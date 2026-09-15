/**
 * Создаёт тестовый tRPC‑клиент с подставной сессией.
 *
 * Позволяет в unit‑ и интеграционных тестах вызывать любую процедуру
 * приложения от имени заданного пользователя (или без аутентификации),
 * не поднимая реальный HTTP‑сервер и не работая с куками.
 *
 * ## Как это работает
 * 1. Формируется объект `TRPCRequestInfo` с пустыми вызовами и сигналом
 *    отмены — минимально необходимый для создания контекста.
 * 2. Вызывается `createContext`, как это делает реальный обработчик tRPC,
 *    но с моковым `Request` и пустыми заголовками ответа.
 * 3. Если передан параметр `user`, в контекст подставляется объект сессии,
 *    совместимый с `better‑auth`:
 *    - `user.id` (строка),
 *    - `user.role` (`'admin'`, `'teacher'` или `'student'`),
 *    - `expires` — через час от текущего времени,
 *    - фиктивный `sessionToken`.
 * 4. Фабрика `createCaller` (из tRPC) создаёт вызывающий объект,
 *    через который можно напрямую обращаться к роутерам.
 *
 * ## Примеры использования
 * ```ts
 * // Анонимный вызов
 * const caller = await createTestCaller();
 * const result = await caller.someRouter.publicProcedure();
 *
 * // Вызов от имени администратора
 * const adminCaller = await createTestCaller({ id: 'admin-1', role: 'admin' });
 * const data = await adminCaller.adminRouter.someAdminMutation({ ... });
 *
 * // Вызов без прав администратора
 * const userCaller = await createTestCaller({ id: 'teacher-5', role: 'teacher' });
 * // этот вызов выбросит TRPCError, если процедура требует admin
 * ```
 *
 * @param user - объект с полями `id` (строка или число) и `role` (строка).
 *   Если `null` или `undefined`, сессия в контексте будет отсутствовать,
 *   имитируя неаутентифицированного пользователя.
 *
 * @returns tRPC‑клиент, готовый к вызову любых процедур приложения.
 *
 * @remarks
 * - Использует внутренний тип `TRPCRequestInfo` из `@trpc/server/unstable-core-do-not-import`;
 *   при обновлении tRPC возможно изменение сигнатуры, потребуется адаптация.
 * - Моковая сессия не взаимодействует с базой данных — все проверки ролей
 *   внутри процедур должны опираться на `ctx.session.user.role`.
 * - Файл предназначен для использования в тестах (Vitest) и не должен
 *   импортироваться в production‑код.
 */
import { createContext, type Context } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/router';
import { createCallerFactory } from '@/server/trpc/trpc';
import { TRPCRequestInfo } from '@trpc/server/unstable-core-do-not-import';

const createCaller = createCallerFactory(appRouter);

// Минимальная структура сессии, требуемая protectedProcedure
interface MockSession {
  user: {
    id: string;
    role: string;
    email?: string;
  };
  expires: Date;
  sessionToken: string;
}

export async function createTestCaller(user?: { id: string | number; role: string } | null) {
  const reqUrl = new URL('http://localhost:3000/api/trpc');
  const resHeaders = new Headers();

  const info: TRPCRequestInfo = {
    calls: [],
    accept: 'application/jsonl',
    type: 'query',
    isBatchCall: false,
    connectionParams: null,
    signal: new AbortController().signal,
    url: reqUrl,
  };

  const ctx = await createContext({
    req: new Request(reqUrl),
    resHeaders,
    info,
  });

  if (user) {
    const userIdStr = typeof user.id === 'number' ? String(user.id) : user.id;
    const mockSession: MockSession = {
      user: {
        id: userIdStr,
        role: user.role || 'student',
        email: 'test@test.local',
      },
      expires: new Date(Date.now() + 3600000),
      sessionToken: 'test-session-token',
    };

    ctx.session = mockSession as unknown as Context['session'];
  }

  return createCaller(ctx);
}