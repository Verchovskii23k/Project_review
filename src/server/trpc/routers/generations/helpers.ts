/**
 * ## Вспомогательная функция проверки «Чистого листа»
 *
 * Используется во всех мутациях генераторов для предотвращения запуска
 * при открытой активной версии расписания.
 *
 * @param ctx - tRPC‑контекст (доступ к БД).
 * @throws {TRPCError} PRECONDITION_FAILED – если в `schedule_display`
 *         есть активные записи (`isActive = true`, `versionId IS NULL`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { scheduleDisplay } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { Context } from "../../context";

export async function assertCleanSlate(ctx: Context) {
  const [active] = await ctx.db
    .select({ id: scheduleDisplay.id })
    .from(scheduleDisplay)
    .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)))
    .limit(1);
  if (active) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Переключитесь на Чистый лист, чтобы запустить генераторы.",
    });
  }
}