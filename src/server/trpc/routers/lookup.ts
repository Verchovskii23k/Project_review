/**
 * Роутер для получения одной строки из любой разрешённой таблицы по ID.
 *
 * Используется компонентом {@link EntityTooltip} для отображения полной информации
 * о связанной сущности (всплывающая подсказка). Процедура публичная (`publicProcedure`),
 * вызывается с клиента без авторизации, но принимает только таблицы из белого списка
 * `allowedTables`, чтобы исключить доступ к системным данным.
 *
 * ## getRow
 * @input `{ tableName: string, id: number }` – имя таблицы (snake_case, например
 *   `"employees_departments"`) и ID записи.
 *
 * @returns Объект строки с ключами в **camelCase** (например, `departmentId` вместо
 *   `department_id`) или `null`, если запись не найдена.
 *
 * @throws `Error` если `tableName` не входит в `allowedTables`.
 * @throws `Error` при ошибке выполнения SQL-запроса.
 *
 * @remarks
 * - Ключи преобразуются из snake_case в camelCase рекурсивно с помощью
 *   `mapKeysToCamel` (вспомогательная функция). Это сделано для удобства
 *   использования на клиенте, где принят camelCase.
 * - Таблица `settings` присутствует в белом списке, но доступ к настройкам
 *   через эту процедуру может быть ограничен отсутствием конфиденциальных данных.
 * - Процедура не кэшируется, каждый вызов выполняет прямой SQL-запрос.
 */
import { z } from "zod";
import { router, publicProcedure } from "../../trpc/trpc";
import type { Context } from "../../trpc/context";
import { sql } from "drizzle-orm";

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function mapKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(mapKeysToCamel);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, val]) => [toCamelCase(key), mapKeysToCamel(val)])
    );
  }
  return obj;
}

const inputSchema = z.object({ tableName: z.string(), id: z.number() }); 

export const lookupRouter = router({
  getRow: publicProcedure
    .input(inputSchema)
    .query(async ({ ctx, input } : {ctx: Context, input: z.infer<typeof inputSchema> }) => {
      const allowedTables = [
        "institutes", "buildings", "departments", "specialties", "profiles",
        "disciplines", "unit_types", "lesson_types", "classrooms", "employees",
        "students", "study_groups", "units", "lessons", "curriculum",
        "employees_departments", "lesson_classrooms", "unit_roots",
        "curriculum_profiles", "academic_load_types", "control_types",
        "hour_type_mapping", "discipline_teachers", "settings",
        "days_of_week", "pairs", "weeks", "education_levels",
        "education_forms", "education", "positions", "employment_types"
      ];
      if (!allowedTables.includes(input.tableName)) {
        throw new Error(`Таблица "${input.tableName}" не разрешена`);
      }

      try {
        const rows = await ctx.db.execute(
          sql`SELECT * FROM ${sql.identifier(input.tableName)} WHERE id = ${input.id}`
        );
        if (rows.length === 0) return null;
        return mapKeysToCamel(rows[0]);
      } catch (error) {
        console.error(error);
        throw new Error(`Ошибка загрузки данных из таблицы "${input.tableName}"`);
      }
    }),
});