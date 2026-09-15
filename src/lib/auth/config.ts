/**
 * Конфигурация аутентификации better-auth.
 *
 * ## Основные компоненты
 * - **Drizzle-адаптер** – связывает better-auth с нашей схемой БД (`users`, `sessions`,
 *   `accounts`, `verificationTokens`).
 * - **Плагин `nextCookies`** – обеспечивает работу с куками в Next.js App Router.
 * - **Email/Password** – включена аутентификация по почте и паролю с хешированием
 *   через bcrypt (соль 10 раундов).
 * - **Сессии** – живут 7 дней, обновляются при активности не реже чем раз в сутки.
 * - **Колбэк сессии** – дополняет объект сессии полем `role`, которое извлекается
 *   из таблицы `users` по `user.id`. По умолчанию роль `'student'`.
 *
 * ## Пример использования в API-роуте
 * ```ts
 * import { auth } from '@/lib/auth/config';
 * export { auth as GET, auth as POST } from '@/lib/auth/config';
 * ```
 *
 * @remarks
 * - Переменные окружения (например, `BETTER_AUTH_SECRET`) должны быть заданы в `.env`.
 * - Роль пользователя (`admin`, `teacher`, `student`) используется для авторизации
 *   в tRPC (`adminProcedure`).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verificationToken: schema.verificationTokens,
    },
  }),
  plugins: [nextCookies()],
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  callbacks: {
    async session({ session, user }: { session: Record<string, unknown>; user: Record<string, unknown> }) {
      const [dbUser] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, user.id as string))
        .limit(1);

      return {
        ...session,
        user: {
          ...session.user as Record<string, unknown>,
          role: (dbUser?.role || 'student') as string,
        },
      };
    },
  },
});