/**
 * Инициализация tRPC-сервера и определение всех стандартных процедур.
 *
 * ## Что здесь делается
 * 1. Создаётся экземпляр tRPC с контекстом `Context` и кастомным форматированием ошибок.
 * 2. Определяются три вида процедур:
 *    - `publicProcedure` – доступна без аутентификации.
 *    - `protectedProcedure` – требует валидную сессию и добавляет в `ctx.user` id и роль.
 *    - `adminProcedure` – наследует `protectedProcedure` и дополнительно проверяет,
 *      что роль пользователя – `admin`.
 * 3. Настраивается `errorFormatter`, который пытается извлечь «бизнесовую» ошибку
 *    (TRPCError, ZodError) из цепочки `cause`. Если находит – отдаёт её как есть.
 *    Иначе возвращает обобщённое сообщение «Возникла непредвиденная ошибка…».
 *
 * ## Как работает защита
 * - `protectedProcedure` берёт `ctx.session.user` (результат better-auth).
 *   Если пользователь не авторизован, выбрасывает `UNAUTHORIZED`.
 *   Если роль не сохранена в сессии, подгружает её из БД.
 * - `adminProcedure` после `protectedProcedure` проверяет `ctx.user.role === 'admin'`,
 *   иначе выбрасывает `FORBIDDEN`.
 *
 * ## Экспорты
 * - `router` – фабрика для создания роутеров.
 * - `publicProcedure`, `protectedProcedure`, `adminProcedure` – базовые строительные блоки.
 * - `createCallerFactory` – используется в тестах для создания клиента без HTTP.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';

interface TrpcErrorLike {
  code: string;
  message: string;
}

function extractBusinessError(error: unknown): { message: string; code: string } | null {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    if (firstIssue) {
      return { message: firstIssue.message, code: 'BAD_REQUEST' };
    }
  }

  // TRPCError с JSON-строкой (на случай, если Zod пришёл вложенным)
  if (error instanceof TRPCError && error.message.startsWith('[')) {
    try {
      const parsed = JSON.parse(error.message);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { message: parsed[parsed.length - 1].message, code: 'BAD_REQUEST' };
      }
    } catch {}
  }

  // Проверяем цепочку причин
  let current: unknown = error;
  while (current) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      'message' in current
    ) {
      const { code, message } = current as TrpcErrorLike;
      if (
        code !== 'INTERNAL_SERVER_ERROR' &&
        message !== 'Возникла непредвиденная ошибка. Попробуйте позже или обратитесь в службу поддержки'
      ) {
        return { message, code };
      }
    }
    if (current instanceof Error && current.cause) {
      current = current.cause;
    } else {
      break;
    }
  }
  return null;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const business = extractBusinessError(error);
    if (business) {
      return {
        ...shape,
        message: business.message,
        data: {
          ...shape.data,
          code: business.code,
        },
      };
    }
    return {
      ...shape,
      message: 'Возникла непредвиденная ошибка. Попробуйте позже или обратитесь в службу поддержки',
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  let role = (ctx.session.user as unknown as { role?: string }).role;
  if (!role) {
    const [dbUser] = await ctx.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, ctx.session.user.id))
      .limit(1);
    role = dbUser?.role;
  }

  return next({
    ctx: {
      ...ctx,
      user: { id: ctx.session.user.id, role: role || 'student' },
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});