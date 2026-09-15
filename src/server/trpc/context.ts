/**
 * Создаёт контекст для каждой tRPC-процедуры.
 *
 * ## Что делает
 * 1. Извлекает сессию пользователя с помощью better-auth на основе заголовков
 *    входящего запроса.
 * 2. Возвращает объект с:
 *    - `db` – экземпляр Drizzle ORM для запросов к БД.
 *    - `session` – текущая сессия (или `null` для неаутентифицированных запросов).
 *    - `req` – оригинальный объект запроса Fetch API (может использоваться
 *      в продвинутых сценариях).
 *
 * ## Использование в роутерах
 * Процедуры получают `ctx` с полями `db`, `session` и `req`.
 * - `adminProcedure` проверяет `ctx.session?.user?.role === 'admin'`.
 * - Все мутации используют `ctx.db` для обращения к базе.
 *
 * @param opts - стандартные аргументы адаптера fetch для tRPC.
 * @returns Объект контекста, готовый к использованию в процедурах.
 */
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "@/db";
import { auth } from "@/lib/auth/config";

export async function createContext(opts: FetchCreateContextFnOptions) {
  const session = await auth.api.getSession({
    headers: opts.req.headers,
  });

  return {
    db,
    session,
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;