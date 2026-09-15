/**
 * Точка входа для серверной части tRPC.
 *
 * Реэкспортирует:
 * - `router`, `publicProcedure`, `protectedProcedure`, `adminProcedure` – из `trpc.ts`.
 * - Тип `Context` – из `context.ts`.
 *
 * Используется в API-роутере `app/api/trpc/[trpc]/route.ts` и в тестовом клиенте.
 */
export { router, publicProcedure, protectedProcedure, adminProcedure } from './trpc'; 
export type { Context } from './context';