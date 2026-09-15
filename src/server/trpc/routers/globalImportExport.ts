/**
 * Роутер для глобального экспорта и импорта данных БД в формате JSON.
 *
 * Позволяет администратору выгрузить содержимое почти всех справочных
 * и генерируемых таблиц в один JSON-файл и восстановить данные на другом
 * экземпляре приложения с корректным переназначением внешних ключей.
 *
 * ## Структура экспорта
 * `exportAll` возвращает объект, где ключи – имена таблиц (из `IMPORT_ORDER`),
 * а значения – массивы строк (ключи в camelCase для удобства чтения).
 *
 * ## Логика импорта
 * Импорт выполняется строго в заданном порядке (`IMPORT_ORDER`), чтобы
 * родительские записи гарантированно существовали до вставки дочерних.
 *
 * ### Правила вставки для каждой таблицы
 * - **employees / students** – всегда вставляются как новые записи (INSERT).
 * - **Остальные таблицы** – для каждой строки ищется существующая запись по
 *   уникальным ключам из `UNIQUE_KEYS`. Если найдена и данные не изменились –
 *   пропускается; если данные изменились – обновляется; если не найдена –
 *   создаётся новая.
 *
 * ### Переназначение внешних ключей (remapping)
 * Для всех таблиц, кроме `employees` и `students`, при вставке собираются
 * карты `idMaps`: старый ID → новый ID. Для последующих таблиц значения
 * внешних ключей автоматически заменяются на актуальные ID, чтобы сохранить
 * ссылочную целостность в новой базе.
 *
 * ### Обработка полей
 * - Поля с именем `id` игнорируются (автоинкремент).
 * - Импортируются только те поля, которые перечислены в `tablesMeta[tableName].fields`.
 * - Ключи из camelCase преобразуются в snake_case для вставки в БД.
 *
 * ### Завершающий этап
 * После импорта всех таблиц для каждой обновляются автоинкрементные
 * последовательности (`setval`), чтобы новые записи получали корректные ID.
 *
 * ## Исключённые таблицы
 * `EXCLUDED_TABLES` содержит таблицы better-auth (`user`, `account`,
 * `session`, `verification_token`) и `settings` – они не экспортируются
 * и не импортируются.
 *
 * ## Процедуры
 * - `exportAll` – возвращает JSON со всеми разрешёнными таблицами.
 * - `importAll` – принимает JSON той же структуры и загружает данные в БД.
 *
 * @remarks
 * - Импорт не удаляет существующие данные – он добавляет или обновляет записи.
 * - Рекомендуется делать резервную копию перед импортом.
 * - Для корректной работы должны быть заполнены `tablesMeta` и `UNIQUE_KEYS`.
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { tablesMeta } from "@/lib/table-meta";
import { UNIQUE_KEYS } from "@/lib/uniqueKeys";
interface RowWithUserId {
  userId?: string;
  [key: string]: unknown;
}
// Таблицы, которые НЕЛЬЗЯ экспортировать/импортировать
const EXCLUDED_TABLES = new Set([
  "user",                // better-auth
  "account",             // better-auth
  "session",             // better-auth
  "verification_token",  // better-auth
  "settings",            // настройки (не переносим)
]);

// Порядок таблиц для импорта (родители → потомки)
const IMPORT_ORDER = [
  "employees",
  "students",
  "schedule_versions",
  "education_levels",
  "education_forms",
  "days_of_week",
  "pairs",
  "weeks",
  "lesson_types",
  "unit_types",
  "buildings",
  "positions",
  "employment_types",
  "academic_load_types",
  "control_types",
  "hour_type_mapping",
  "institutes",
  "departments",
  "specialties",
  "disciplines",
  "education",
  "profiles",
  "classrooms",
  "curriculum",
  "curriculum_profiles",
  "employees_departments",
  "discipline_teachers",
  "study_groups",
  "units",
  "unit_roots",
  "lessons",
  "lesson_classrooms",
  "schedule",
  "schedule_display",
];


// Отображение старых id на новые для каждой таблицы
type IdMap = Map<number, number>;
const idMaps: Record<string, IdMap> = {};

function snakeToCamel(str: string) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelToSnake(str: string) {
  return str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

// Type guard для проверки, что значение является объектом
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Type guard для проверки, что значение является массивом
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function transformKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(transformKeysToCamel);
  if (isRecord(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[snakeToCamel(key)] = transformKeysToCamel(val);
    }
    return result;
  }
  return obj;
}

// Заменяет значения внешних ключей в dbRow на актуальные id согласно картам
function remapForeignKeys(tableName: string, dbRow: Record<string, unknown>): void {
  const fkColumns = getForeignKeyColumns(tableName);
  for (const col of fkColumns) {
    const val = dbRow[col];
    if (val === null || val === undefined) continue;
    const numVal = Number(val);
    if (isNaN(numVal)) continue;
    const referencedTable = fkReferences[col];
    if (!referencedTable) continue;
    const map = idMaps[referencedTable];
    if (!map) continue;
    const newId = map.get(numVal);
    if (newId !== undefined) {
      dbRow[col] = newId;
    }
  }
}

// Простейшая карта: имя столбца -> имя родительской таблицы
const fkReferences: Record<string, string> = {
  study_group_id: "study_groups",
  profile_id: "profiles",
  discipline_id: "disciplines",
  additional_task_id: "academic_load_types",
  control_type_id: "control_types",
  curriculum_id: "curriculum",
  employee_id: "employees",
  department_id: "departments",
  employment_type_id: "employment_types",
  position_id: "positions",
  lesson_type_id: "lesson_types",
  teacher_department_id: "employees_departments",
  curator_id: "employees",
  unit_type_id: "unit_types",
  unit_code: "units",
  unit_id: "units",
  teacher_id: "employees_departments",
  lesson_id: "lessons",
  classroom_id: "classrooms",
  week_id: "weeks",
  day_of_week_id: "days_of_week",
  pair_number_id: "pairs",
  week_number: "weeks",
  version_id: "schedule_versions",
};

function getForeignKeyColumns(tableName: string): string[] {
  if (tableName === "curriculum") return ["discipline_id", "additional_task_id", "control_type_id"];
  if (tableName === "curriculum_profiles") return ["curriculum_id", "profile_id"];
  if (tableName === "employees_departments") return ["employee_id", "department_id", "employment_type_id", "position_id"];
  if (tableName === "discipline_teachers") return ["lesson_type_id", "discipline_id", "teacher_department_id"];
  if (tableName === "study_groups") return ["profile_id", "curator_id"];
  if (tableName === "units") return ["unit_type_id", "version_id"];
  if (tableName === "unit_roots") return ["unit_code", "study_group_id", "version_id"];
  if (tableName === "lessons") return ["curriculum_id", "unit_id", "lesson_type_id", "discipline_id", "teacher_id", "version_id"];
  if (tableName === "lesson_classrooms") return ["lesson_id", "classroom_id", "version_id"];
  if (tableName === "schedule") return ["lesson_id", "classroom_id", "week_id", "day_of_week_id", "pair_number_id", "version_id"];
  if (tableName === "schedule_display") return ["lesson_id", "classroom_id", "week_id", "day_of_week_id", "pair_number_id", "version_id"];
  return [];
}

export const globalImportExportRouter = router({
  exportAll: adminProcedure.query(async () => {
    const result: Record<string, unknown[]> = {};

    for (const tableName of IMPORT_ORDER) {
      if (EXCLUDED_TABLES.has(tableName)) continue;
      try {
        const rows = await db.execute(
          sql`SELECT * FROM ${sql.identifier(tableName)}`
        );
        // Безопасно преобразуем: если rows – массив, применяем transformKeysToCamel
        if (isArray(rows)) {
          result[tableName] = rows.map(row => {
          const camelRow = transformKeysToCamel(row) as RowWithUserId;
          if (tableName === 'employees' || tableName === 'students') {
            const { userId, ...rest } = camelRow;
            return rest;
          }
          return camelRow;
        });
        } else {
          console.error(`Export error: unexpected result for table ${tableName}`, rows);
          result[tableName] = [];
        }
      } catch (e) {
        console.error(`Export error for table ${tableName}:`, e);
        result[tableName] = [];
      }
    }

    return result;
  }),

  importAll: adminProcedure
    .input(z.record(z.string(), z.array(z.unknown())))
    .mutation(async ({ input }) => {
      const stats: Record<string, { inserted: number; updated: number; skipped: number; errors: string[] }> = {};

      for (const tableName of IMPORT_ORDER) {
        idMaps[tableName] = new Map();
      }

      for (const tableName of IMPORT_ORDER) {
        if (EXCLUDED_TABLES.has(tableName)) continue;
        const rows = input[tableName];
        if (!rows || rows.length === 0) continue;

        const dbTableName = tablesMeta[tableName]?.dbTableName || tableName;
        stats[tableName] = { inserted: 0, updated: 0, skipped: 0, errors: [] };

        const uniqueKeys = UNIQUE_KEYS[tableName] || [];
        const allowedFields = tablesMeta[tableName]?.fields?.map(f => f.dbName) ?? [];

        for (const _row of rows) {
          if (!isRecord(_row)) {
            stats[tableName].errors.push(`Пропущена строка: не объект`);
            continue;
          }
          const row = _row;

          try {
            // 1. Собираем только разрешённые поля
            const dbRow: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(row)) {
              if (key === "id") continue;
              if (allowedFields.includes(key)) {
                const snakeKey = camelToSnake(key);
                dbRow[snakeKey] = val === undefined ? null : val;
              }
            }

            if (Object.keys(dbRow).length === 0) {
              stats[tableName].skipped++;
              continue;
            }
            if (tableName === 'employees' || tableName === 'students') {
              delete dbRow.user_id;
            }
            remapForeignKeys(tableName, dbRow);

            // 2. Сотрудники и студенты – всегда INSERT
            if (tableName === "employees" || tableName === "students") {
              const columns = Object.keys(dbRow);
              const values = Object.values(dbRow);
              await db.execute(
                sql`INSERT INTO ${sql.identifier(dbTableName)} (${sql.join(columns.map(c => sql.identifier(c)), sql`, `)})
                    VALUES (${sql.join(values.map(v => sql`${v}`), sql`, `)})`
              );
              stats[tableName].inserted++;
              continue;
            }

            // 3. Остальные таблицы: поиск по уникальному ключу
            let existing: Record<string, unknown> | null = null;
            if (uniqueKeys.length > 0 && uniqueKeys.every(k => dbRow[k] !== undefined && dbRow[k] !== null)) {
              const conditions = uniqueKeys.map(k => sql`${sql.identifier(k)} = ${dbRow[k]}`);
              const whereClause = conditions.length > 1 ? sql.join(conditions, sql` AND `) : conditions[0];
              const existingRows = await db.execute(
                sql`SELECT * FROM ${sql.identifier(dbTableName)} WHERE ${whereClause} LIMIT 1`
              );
              // Проверяем, что вернулся массив и есть хотя бы одна запись-объект
              if (isArray(existingRows) && existingRows.length > 0 && isRecord(existingRows[0])) {
                existing = existingRows[0];
              }
            }

            if (!existing) {
              // INSERT
              const columns = Object.keys(dbRow);
              const values = Object.values(dbRow);
              const inserted = await db.execute(
                sql`INSERT INTO ${sql.identifier(dbTableName)} (${sql.join(columns.map(c => sql.identifier(c)), sql`, `)})
                    VALUES (${sql.join(values.map(v => sql`${v}`), sql`, `)})
                    RETURNING id`
              );
              // Получаем новый ID
              if (isArray(inserted) && inserted.length > 0 && isRecord(inserted[0]) && 'id' in inserted[0]) {
                const newId = Number(inserted[0].id);
                if (!isNaN(newId)) {
                  idMaps[tableName].set(Number(row.id), newId);
                }
              }
              stats[tableName].inserted++;
            } else {
              // Обновление или пропуск
              const existingId = Number(existing.id);
              if (!isNaN(existingId)) {
                idMaps[tableName].set(Number(row.id), existingId);
              }
              let changed = false;
              for (const [k, v] of Object.entries(dbRow)) {
                if (String(existing[k]) !== String(v)) {
                  changed = true;
                  break;
                }
              }
              if (!changed) {
                stats[tableName].skipped++;
              } else {
                const setEntries = Object.entries(dbRow).map(([k, v]) => sql`${sql.identifier(k)} = ${v}`);
                const keyConditions = uniqueKeys.map(k => sql`${sql.identifier(k)} = ${existing![k]}`);
                const whereClause = keyConditions.length > 1 ? sql.join(keyConditions, sql` AND `) : keyConditions[0];
                await db.execute(
                  sql`UPDATE ${sql.identifier(dbTableName)} SET ${sql.join(setEntries, sql`, `)} WHERE ${whereClause}`
                );
                stats[tableName].updated++;
              }
            }
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Неизвестная ошибка";
            stats[tableName].errors.push(`id=${row.id}: ${message}`);
          }
        }
      }

      // Обновляем последовательности
      for (const tableName of IMPORT_ORDER) {
        if (EXCLUDED_TABLES.has(tableName)) continue;
        const dbTableName = tablesMeta[tableName]?.dbTableName || tableName;
        try {
          await db.execute(
            sql`SELECT setval(pg_get_serial_sequence(${dbTableName}, 'id'), coalesce(max(id), 1)) FROM ${sql.identifier(dbTableName)}`
          );
        } catch (e) {
          console.error(`Sequence update error for table ${dbTableName}:`, e);
        }
      }

      return stats;
    }),
});