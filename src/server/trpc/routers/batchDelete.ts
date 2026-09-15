/**
 * Роутер для массового удаления записей из любой CRUD-таблицы.
 *
 * Доступен только администратору. Проверяет, что таблица входит в список
 * разрешённых (`ALLOWED_DELETE_TABLES`), затем для каждой из дочерних таблиц
 * (определённых в `tablesMeta[tableName].childTables`) проверяет, есть ли
 * ссылки на удаляемые `ids`. Если есть – выбрасывает ошибку с русскими названиями
 * таблиц-потомков.
 *
 * Для таблиц `employees` и `students` реализована защита от удаления самого себя
 * (проверка `user_id` относительно `ctx.user.id`).
 *
 * ## Мутация `deleteMany`
 * @input { tableName: string, ids: number[] } – имя таблицы (ключ из `tablesMeta`)
 *   и массив ID для удаления (не менее 1 элемента).
 *
 * @returns Объект `{ deleted: number, errors: { id: number, message: string }[] }`.
 *   - `deleted` – количество успешно удалённых записей.
 *   - `errors` – список ошибок, возникших при попытке удалить конкретные ID
 *     (например, самозапрет).
 *
 * ## Ошибки
 * @throws {TRPCError} с кодом `BAD_REQUEST`, если `tableName` не входит в
 *   `ALLOWED_DELETE_TABLES`.
 * @throws {TRPCError} с кодом `CONFLICT`, если в дочерних таблицах найдены записи,
 *   ссылающиеся на любой из переданных ID. Сообщение содержит русские названия
 *   таблиц-потомков через запятую.
 * @throws {TRPCError} с кодом `INTERNAL_SERVER_ERROR` при неожиданных ошибках БД
 *   на этапе удаления конкретной записи (после прохождения проверки зависимостей).
 *
 * ## Важные детали
 * - Проверка дочерних таблиц осуществляется **до** удаления, чтобы избежать
 *   откатов транзакции и дать пользователю осмысленное сообщение.
 * - Для построения списка `IN (...)` используется безопасное перечисление целых
 *   чисел (`ids.join(", ")`), так как `ids` гарантированно являются числами
 *   благодаря Zod-валидации.
 * - Русские названия таблиц берутся из `tablesMeta[nameRu]`; для сопоставления
 *   `dbTableName` → `nameRu` строится вспомогательный объект.
 * - Защита от удаления самого себя (`employees`, `students`) работает только
 *   при совпадении `user_id` удаляемой записи с `ctx.user.id`. Если у записи
 *   нет `user_id`, удаление разрешено.
 *
 * @remarks
 * - Роутер использует прямой SQL (`db.execute`) для совместимости с проверками
 *   зависимостей и массовыми операциями.
 * - При пустом массиве `childTables` проверка не выполняется – удаление происходит
 *   без предварительного анализа (полагаемся на ограничения БД).
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { tablesMeta } from "@/lib/table-meta";
import { TRPCError } from "@trpc/server";

const ALLOWED_DELETE_TABLES = Object.keys(tablesMeta).filter(
  (key) => !["user", "account", "session", "verification_token", "settings"].includes(key)
);

export const batchDeleteRouter = router({
  deleteMany: adminProcedure
    .input(
      z.object({
        tableName: z.string(),
        ids: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tableName, ids } = input;

      if (!ALLOWED_DELETE_TABLES.includes(tableName)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Таблица "${tableName}" не поддерживает удаление`,
        });
      }

      const meta = tablesMeta[tableName];
      const dbTableName = meta?.dbTableName || tableName;
      const childTables = meta?.childTables || [];

      // 1. Проверяем зависимости
      if (childTables.length > 0) {
        // Строим карту: dbTableName -> nameRu для быстрого поиска
        const nameByDbTable: Record<string, string> = {};
        for (const key of Object.keys(tablesMeta)) {
          const m = tablesMeta[key];
          if (m?.dbTableName) {
            nameByDbTable[m.dbTableName] = m.nameRu;
          }
        }

        const blockingTables: string[] = [];
        const idsList = ids.join(", ");

        for (const child of childTables) {
          const query = sql`
            SELECT 1
            FROM ${sql.identifier(child.dbTableName)}
            WHERE ${sql.identifier(child.foreignKeyColumn)} IN (${sql.raw(idsList)})
            LIMIT 1
          `;
          const result = await db.execute(query);

          // Проверяем, что результат — массив и он не пуст
          if (Array.isArray(result) && result.length > 0) {
            const ruName = nameByDbTable[child.dbTableName] || child.dbTableName;
            blockingTables.push(ruName);
          }
        }

        if (blockingTables.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Невозможно удалить выбранные записи: они используются в таблицах ${blockingTables.join(", ")}`,
          });
        }
      }

      // 2. Выполняем удаление
      const errors: { id: number; message: string }[] = [];
      let deleted = 0;

      for (const id of ids) {
        try {
          // Самозапрет для сотрудников и студентов
          if (tableName === "employees" || tableName === "students") {
            const rows = await db.execute(
              sql`SELECT user_id FROM ${sql.identifier(dbTableName)} WHERE id = ${id}`
            );

            // Безопасно извлекаем user_id, если запись найдена
            if (Array.isArray(rows) && rows.length > 0) {
              const row = rows[0];
              if (typeof row === 'object' && row !== null && 'user_id' in row) {
                const userId = (row as Record<string, unknown>).user_id;
                if (typeof userId === 'string' && ctx.user?.id === userId) {
                  errors.push({ id, message: "Нельзя удалить самого себя" });
                  continue;
                }
              }
            }
          }

          const deleteResult = await db.execute<{ id: number }>(
            sql`DELETE FROM ${sql.identifier(dbTableName)} WHERE id = ${id} RETURNING id`
          );
          if (Array.isArray(deleteResult) && deleteResult.length > 0) {
            deleted++;
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Неизвестная ошибка";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Ошибка при удалении id=${id}: ${message}`,
          });
        }
      }

      return { deleted, errors };
    }),
});