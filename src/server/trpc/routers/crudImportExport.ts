/**
 * @module crudImportExportRouter
 * @description Роутер для импорта и экспорта данных справочных таблиц.
 *
 * Предоставляет администратору возможность выгрузить таблицу в формате JSON
 * и загрузить данные обратно. Экспорт и импорт опираются исключительно на
 * поля, описанные в tablesMeta (те, что видны в CRUD-интерфейсе). Скрытые
 * поля (versionId, usageMetric и т.п.) не экспортируются и не импортируются,
 * чтобы не перегружать администратора и не нарушать целостность служебных
 * данных. Поле userId исключено из обеих операций.
 *
 * Процедуры:
 * - exportAll – возвращает массив записей таблицы в camelCase.
 * - importData – загружает массив записей с валидацией и детальным отчётом.
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { sql } from "drizzle-orm";
import { tablesMeta } from "@/lib/table-meta";
import { UNIQUE_KEYS } from "@/lib/uniqueKeys";

const ALLOWED_TABLES = Object.keys(tablesMeta);
// Преобразование camelCase -> snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

// Преобразование snake_case -> camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export const crudImportExportRouter = router({
  // ──────────────────────────────────────────────
  // Экспорт
  // ──────────────────────────────────────────────
  exportAll: adminProcedure
    .input(
      z.object({
        tableName: z.string().refine((t) => ALLOWED_TABLES.includes(t)),
      })
    )
    .query(async ({ ctx, input }) => {
      const meta = tablesMeta[input.tableName];
      const dbTableName = meta.dbTableName || input.tableName;

      // 1. Получаем имена колонок для SELECT в snake_case
      const columnNamesSnake = meta.fields.map((f) => camelToSnake(f.dbName));
      if (!columnNamesSnake.includes("id")) {
        columnNamesSnake.unshift("id");
      }

      // 2. Выполняем запрос
      const columns = columnNamesSnake.map((c) => sql.identifier(c));
      const rows = await ctx.db.execute(
        sql`SELECT ${sql.join(columns, sql`, `)} FROM ${sql.identifier(dbTableName)}`
      );

      // 3. Преобразуем ключи в camelCase, удаляем user_id
      const sanitizedRows = (rows as Record<string, unknown>[]).map((row) => {
        const camelRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (key === "user_id") continue;
          camelRow[snakeToCamel(key)] = value;
        }
        return camelRow;
      });

      return sanitizedRows;
    }),

  // ──────────────────────────────────────────────
  // Импорт
  // ──────────────────────────────────────────────
  importData: adminProcedure
    .input(
      z.object({
        tableName: z.string().refine((t) => ALLOWED_TABLES.includes(t)),
        data: z.array(z.any()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tableName, data } = input;
      const meta = tablesMeta[tableName];
      const dbTableName = meta.dbTableName || tableName;
      const fields = meta.fields;
      const isPeopleTable = tableName === "employees" || tableName === "students";

      const results = {
        total: data.length,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[],
      };

      for (const row of data) {
        try {
          const originalId = row.id;
          if (originalId === undefined || originalId === null) {
            results.errors.push(`Строка без id: ${JSON.stringify(row)}`);
            continue;
          }

          // 1. Собираем поля, преобразуя dbName в snake_case
          const values: Record<string, unknown> = {};
          for (const field of fields) {
            if (field.dbName === "id") continue;
            if (field.dbName === "user_id") continue;

            const snakeKey = camelToSnake(field.dbName);
            // Ищем значение: сначала snake_case, потом camelCase
            let val = row[snakeKey] ?? row[field.dbName];
            if (val === undefined) val = null;
            values[snakeKey] = val;
          }

          // 2. Умолчания для toggle-полей
          for (const field of fields) {
            if (field.inputType === "toggle") {
              const snakeKey = camelToSnake(field.dbName);
              if (!(snakeKey in values) || values[snakeKey] === undefined || values[snakeKey] === null) {
                values[snakeKey] = true;
              }
            }
          }

          // 3. Валидация обязательных полей
          const validationErrors: string[] = [];
          for (const field of fields) {
            if (field.dbName === "id") continue;
            if (!field.required) continue;
            const snakeKey = camelToSnake(field.dbName);
            const val = values[snakeKey];
            if (val === undefined || val === null || val === "") {
              validationErrors.push(`Поле «${field.displayName}» обязательно`);
            }
          }
          if (validationErrors.length) {
            results.errors.push(`id=${originalId}: ${validationErrors.join(", ")}`);
            continue;
          }

          // 4. Вставка / обновление
          if (isPeopleTable) {
            // Сотрудники и студенты – всегда INSERT
            const columns = Object.keys(values);
            if (columns.length === 0) {
              results.errors.push(`id=${originalId}: нет данных для вставки`);
              continue;
            }
            const valueLiterals = Object.values(values).map((v) => sql`${v}`);
            await ctx.db.execute(
              sql`INSERT INTO ${sql.identifier(dbTableName)} (${sql.join(
                columns.map((c) => sql.identifier(c)),
                sql`, `
              )}) VALUES (${sql.join(valueLiterals, sql`, `)})`
            );
            results.inserted++;
            continue;
          }

          // Для остальных таблиц
          if (Object.keys(values).length === 0) {
            results.errors.push(`id=${originalId}: нет данных для импорта`);
            continue;
          }

          const uniqueKeys = UNIQUE_KEYS[tableName] || [];
          let whereClause;
          if (uniqueKeys.length > 0 && uniqueKeys.every(k => values[k] !== undefined && values[k] !== null)) {
            // Поиск по уникальному бизнес-ключу
            whereClause = sql.join(
              uniqueKeys.map(k => {
                const val = values[k];
                if (val === null) return sql`${sql.identifier(k)} IS NULL`;
                return sql`${sql.identifier(k)} = ${val}`;
              }),
              sql` AND `
            );
          } else {
            // Поиск по всем полям (как раньше)
            whereClause = sql.join(
              Object.entries(values).map(([k, v]) => {
                if (v === null) return sql`${sql.identifier(k)} IS NULL`;
                return sql`${sql.identifier(k)} = ${v}`;
              }),
              sql` AND `
            );
          }

          const existingRows = await ctx.db.execute(
            sql`SELECT * FROM ${sql.identifier(dbTableName)} WHERE ${whereClause} LIMIT 1`
          );

          let existing: Record<string, unknown> | null = null;
          if (
            Array.isArray(existingRows) &&
            existingRows.length > 0 &&
            typeof existingRows[0] === "object" &&
            existingRows[0] !== null
          ) {
            existing = existingRows[0] as Record<string, unknown>;
          }

          if (!existing) {
            // INSERT
            const columns = Object.keys(values);
            const valueLiterals = Object.values(values).map((v) => sql`${v}`);
            await ctx.db.execute(
              sql`INSERT INTO ${sql.identifier(dbTableName)} (${sql.join(
                columns.map((c) => sql.identifier(c)),
                sql`, `
              )}) VALUES (${sql.join(valueLiterals, sql`, `)})`
            );
            results.inserted++;
          } else {
            // Сравниваем все поля
            let changed = false;
            for (const [key, val] of Object.entries(values)) {
              if (String(existing[key]) !== String(val)) {
                changed = true;
                break;
              }
            }
            if (!changed) {
              results.skipped++;
            } else {
              // UPDATE по id существующей записи
              const setEntries = Object.entries(values).map(
                ([k, v]) => sql`${sql.identifier(k)} = ${v}`
              );
              await ctx.db.execute(
                sql`UPDATE ${sql.identifier(dbTableName)} SET ${sql.join(
                  setEntries,
                  sql`, `
                )} WHERE id = ${existing.id}`
              );
              results.updated++;
            }
          }
        } catch (e: unknown) {
          console.error(`Import error for id=${(row as Record<string, unknown>).id}:`, e);
          const message = e instanceof Error ? e.message : "Неизвестная ошибка";
          results.errors.push(`id=${(row as Record<string, unknown>).id}: ${message}`);
        }
      }

      return results;
    }),
});