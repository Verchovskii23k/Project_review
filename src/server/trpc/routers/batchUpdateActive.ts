/**
 * Роутер для массового включения/отключения активности записей в любой CRUD-таблице,
 * имеющей ручное управление флагом `isActive` (поле с `inputType: "toggle"` в метаданных).
 *
 * Доступен только администратору. Проверяет, что таблица зарегистрирована в `tablesMeta`
 * и действительно содержит `isActive` с типом `toggle`. При деактивации (`isActive = false`)
 * для каждой изменённой записи вызывается {@link cascadeDeactivate}, чтобы каскадно
 * отключить все дочерние сущности с ручным управлением активностью.
 * При активации (`isActive = true`) каскад не применяется – флаг просто поднимается.
 *
 * ## Защита от само-деактивации
 * Для таблиц `employees` и `students` перед деактивацией проверяется, не пытается ли
 * текущий администратор деактивировать свою собственную учётную запись. Если `user_id`
 * записи совпадает с `ctx.user.id`, такая запись исключается из списка обрабатываемых
 * и не изменяется. Это предотвращает случайную потерю доступа к панели администратора.
 *
 * ## Мутация `updateMany`
 * @input { tableName: string, ids: number[], isActive: boolean }
 *   - `tableName` – ключ таблицы из `tablesMeta`.
 *   - `ids` – массив ID записей, для которых требуется изменить активность (минимум 1 элемент).
 *   - `isActive` – целевое состояние: `true` для активации, `false` для деактивации.
 *
 * @returns Объект `{ updated: number }`, где `updated` – количество записей, чьё состояние
 *   действительно изменилось (т.е. записи, уже имевшие нужный флаг, не учитываются,
 *   а также записи, пропущенные из-за само-деактивации).
 *
 * ## Ошибки
 * @throws {TRPCError} с кодом `BAD_REQUEST`:
 *   - если таблица не найдена в `tablesMeta`;
 *   - если таблица не поддерживает ручное управление активностью (нет поля `isActive` с `toggle`).
 * @throws {TRPCError} с кодом `INTERNAL_SERVER_ERROR`, если не удалось определить
 *   ключ родительской таблицы для вызова `cascadeDeactivate`.
 *
 * ## Важные детали
 * - Запросы для активации и деактивации написаны так, чтобы обновлять только те записи,
 *   у которых текущее значение флага отличается от целевого (`IS DISTINCT FROM`).
 *   Это даёт точный подсчёт изменённых строк и исключает холостые UPDATE.
 * - Деактивация обёрнута в одну большую транзакцию: сначала вычисляются действительно
 *   изменённые ID, затем для каждого из них вызывается каскад, после чего возвращается
 *   количество изменённых записей. Такой подход гарантирует атомарность и точное число.
 * - Каскад затрагивает только сущности с ручным `toggle` (проверяется внутри
 *   {@link cascadeDeactivate} на основе `tablesMeta`).
 * - Для таблиц `employees` и `students` перед деактивацией исключается сам администратор
 *   (проверка `user_id` относительно `ctx.user.id`). Это не считается ошибкой, а просто
 *   не влияет на счётчик `updated`.
 *
 * ## Пример использования (фронтенд)
 * ```ts
 * const result = await trpc.batchUpdateActive.updateMany.mutateAsync({
 *   tableName: "institutes",
 *   ids: [1, 2, 3],
 *   isActive: false,
 * });
 * // result.updated – число институтов, действительно деактивированных
 * ```
 *
 * @remarks
 * - Русские названия таблиц для проверок берутся из `tablesMeta`.
 * - При добавлении нового справочника с ручным toggle достаточно заполнить его
 *   метаданные – роутер подхватит его автоматически.
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { tablesMeta } from "@/lib/table-meta";
import { cascadeDeactivate } from "@/lib/cascadeDeactivate";
import { TRPCError } from "@trpc/server";

export const batchUpdateActiveRouter = router({
  updateMany: adminProcedure
    .input(
      z.object({
        tableName: z.string(),
        ids: z.array(z.number()).min(1),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tableName, ids, isActive } = input;
      const meta = tablesMeta[tableName];
      if (!meta) throw new TRPCError({ code: "BAD_REQUEST", message: "Таблица не найдена" });
      
      const hasToggleActive = meta.fields.some(
        (f) => f.dbName === "isActive" && f.inputType === "toggle"
      );
      if (!hasToggleActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Таблица не поддерживает ручное управление активностью",
        });
      }

      const dbTableName = meta.dbTableName || tableName;

      let parentKey: string | undefined;
      for (const [key, m] of Object.entries(tablesMeta)) {
        if (m.dbTableName === dbTableName) {
          parentKey = key;
          break;
        }
      }
      if (!parentKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Не удалось определить ключ таблицы" });
      }

      const idsList = ids.join(", ");

      if (isActive) {
        // Активация – без каскада
        const result = await db.execute<{ id: number }>(
          sql`UPDATE ${sql.identifier(dbTableName)} SET is_active = true WHERE id IN (${sql.raw(idsList)}) AND is_active IS DISTINCT FROM true RETURNING id`
        );
        const updatedCount = Array.isArray(result) ? result.length : 0;
        return { updated: updatedCount };
      } else {
        // Деактивация – сначала исключаем самого себя
        let finalIds = ids;
        if (tableName === "employees" || tableName === "students") {
          // Получаем user_id для каждого id из списка
          const rows = await db.execute<{ id: number; user_id: string | null }>(
            sql`SELECT id, user_id FROM ${sql.identifier(dbTableName)} WHERE id IN (${sql.raw(idsList)})`
          );
          const currentUserId = ctx.user?.id;
          if (currentUserId) {
            finalIds = (Array.isArray(rows) ? rows : [])
              .filter(row => row.user_id !== currentUserId)
              .map(row => row.id);
          }
        }

        if (finalIds.length === 0) {
          return { updated: 0 };
        }

        const finalIdsList = finalIds.join(", ");
        return await db.transaction(async (tx) => {
          const changedIdsResult = await tx.execute<{ id: number }>(
            sql`UPDATE ${sql.identifier(dbTableName)} SET is_active = false WHERE id IN (${sql.raw(finalIdsList)}) AND is_active IS DISTINCT FROM false RETURNING id`
          );
          const changedIds: number[] = Array.isArray(changedIdsResult) ? changedIdsResult.map(r => r.id) : [];
          for (const id of changedIds) {
            await cascadeDeactivate(tx, parentKey!, id);
          }
          return { updated: changedIds.length };
        });
      }
    })
});