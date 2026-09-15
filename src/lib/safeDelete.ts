/**
 * Безопасное удаление одной записи с предварительной проверкой зависимостей.
 *
 * Перед выполнением `DELETE` может проверить дочерние таблицы, указанные в
 * `tablesMeta[tableNameKey].childTables`. Если в любой из них есть записи,
 * ссылающиеся на удаляемый `id`, выбрасывается `TRPCError` с кодом `CONFLICT`
 * и сообщением, перечисляющим русские названия таблиц-потомков.
 *
 * Это позволяет администратору сразу понять, где используются удаляемые данные,
 * и избежать невнятной ошибки внешнего ключа от БД.
 *
 * ## Параметры
 * @param table - Drizzle-таблица (например, `institutes`).
 * @param id - ID удаляемой записи.
 * @param tableNameKey - (опционально) ключ из `tablesMeta`, например `"institutes"`.
 *   Если передан, запускается проверка дочерних таблиц перед удалением.
 *   Если не передан, проверка не выполняется, и в случае нарушения внешнего ключа
 *   будет выброшена общая ошибка.
 *
 * ## Возврат
 * При успешном удалении – `{ success: true }`.
 *
 * ## Ошибки
 * @throws {TRPCError} с кодом `CONFLICT`, если найдены зависимые записи.
 *   Сообщение содержит русские названия таблиц через запятую.
 * @throws {TRPCError} с кодом `CONFLICT` (или перехваченная ошибка БД),
 *   если после удаления произошло нарушение внешнего ключа (например, для неучтённых
 *   зависимостей, когда `tableNameKey` не передан, или для связей, не прописанных
 *   в `childTables`).
 * @throws {Error} "Table must have an 'id' column" – если у переданной таблицы
 *   нет столбца `id` (защита от некорректного использования).
 *
 * ## Пример использования
 * ```ts
 * await safeDelete(institutes, 5, "institutes");
 * ```
 *
 * @remarks
 * - Для получения русских названий используется `tablesMeta`, поэтому важно
 *   поддерживать его в актуальном состоянии.
 * - Если передан `tableNameKey`, но в `childTables` для этой сущности ничего
 *   не указано, проверка не выполняется – удаление происходит как обычно.
 * - Функция не оборачивает операции в транзакцию: проверка и удаление выполняются
 *   последовательно. В высококонкурентной среде возможен race condition, но для
 *   административных операций это допустимо.
 */
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { eq, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { tablesMeta } from "@/lib/table-meta";

export async function safeDelete(
  table: PgTable,
  id: number,
  tableNameKey?: string
) {
  const tableConfig = getTableConfig(table);
  const idColumn = tableConfig.columns.find((c) => c.name === "id");
  if (!idColumn) throw new Error("Table must have an 'id' column");

  // 1. Если передан tableNameKey, проверяем дочерние таблицы перед удалением
  if (tableNameKey) {
    const meta = tablesMeta[tableNameKey];
    if (meta?.childTables && meta.childTables.length > 0) {
      const nameByDbTable: Record<string, string> = {};
      for (const key of Object.keys(tablesMeta)) {
        const m = tablesMeta[key];
        if (m?.dbTableName) {
          nameByDbTable[m.dbTableName] = m.nameRu;
        }
      }

      const checks = await Promise.all(
        meta.childTables.map(async (child) => {
          const result = await db.execute(
            sql`SELECT 1 FROM ${sql.identifier(child.dbTableName)}
                WHERE ${sql.identifier(child.foreignKeyColumn)} = ${id} LIMIT 1`
          );
          const hasRows = Array.isArray(result) && result.length > 0;
          const ruName = nameByDbTable[child.dbTableName] || child.dbTableName;
          return { name: ruName, hasRows };
        })
      );

      const blockingTables = checks
        .filter((c) => c.hasRows)
        .map((c) => c.name);

      if (blockingTables.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Невозможно удалить – запись используется в таблицах: ${blockingTables.join(", ")}`,
        });
      }
    }
  }

  // 2. Если зависимости чисты (или не проверяли), удаляем
  try {
    await db.delete(table).where(eq(idColumn, id));
    return { success: true };
  } catch (e: unknown) {
    const err = e as { code?: string; cause?: { code?: string }; message?: string };
    const code = err.code || err.cause?.code;
    if (code === "23503" || err.message?.includes("foreign key constraint")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: tableNameKey
          ? "Невозможно удалить – запись используется (проверьте незарегистрированные зависимости)"
          : "Невозможно удалить – запись используется в других таблицах",
      });
    }
    throw e;
  }
}