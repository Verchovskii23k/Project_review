/**
 * Универсальная рекурсивная утилита каскадной деактивации.
 *
 * При вызове для родительской записи с `isActive = false` находит всех потомков,
 * имеющих ручное управление активностью (поле `isActive` с типом `toggle` в метаданных),
 * и устанавливает им `is_active = false`. Затем рекурсивно обходит потомков этих потомков,
 * следуя связям из `tablesMeta[childKey].childTables`.
 *
 * Все операции выполняются в рамках переданной транзакции.
 *
 * @param tx - Drizzle-транзакция
 * @param parentKey - ключ родительской таблицы в `tablesMeta`
 * @param parentId - ID записи, которую деактивируют
 */
import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tablesMeta } from "@/lib/table-meta";
import {
  institutes,
  departments,
  specialties,
  profiles,
  students,
  curriculum,
  curriculumProfiles,
  disciplines,
  disciplineTeachers,
  employeesDepartments,
  buildings,
  classrooms,
  lessonTypes,
  hourTypeMapping,
  positions,
  employmentTypes,
  employees,
  academicLoadTypes,
  controlTypes,
  educationLevels,
  educationForms,
  education,
} from "@/db/schema";
import type { Transaction } from "@/db";

// Словарь: dbTableName → Drizzle-таблица
const drizzleTableByDbName: Record<string, PgTable> = {
  institutes,
  departments,
  specialties,
  profiles,
  students,
  curriculum,
  curriculum_profiles: curriculumProfiles,
  disciplines,
  discipline_teachers: disciplineTeachers,
  employees_departments: employeesDepartments,
  buildings,
  classrooms,
  lesson_types: lessonTypes,
  hour_type_mapping: hourTypeMapping,
  positions,
  employment_types: employmentTypes,
  employees,
  academic_load_types: academicLoadTypes,
  control_types: controlTypes,
  education_levels: educationLevels,
  education_forms: educationForms,
  education,
};

// Обратный индекс: dbTableName → ключ в tablesMeta
const metaKeyByDbName: Record<string, string> = {};
for (const [key, meta] of Object.entries(tablesMeta)) {
  if (meta.dbTableName) {
    metaKeyByDbName[meta.dbTableName] = key;
  }
}

// Проверка: есть ли у таблицы ручной toggle для isActive
function hasToggleActive(dbTableName: string): boolean {
  const key = metaKeyByDbName[dbTableName];
  if (!key) return false;
  const meta = tablesMeta[key];
  if (!meta) return false;
  return meta.fields.some(
    (f) => f.dbName === "isActive" && f.inputType === "toggle"
  );
}

/**
 * Рекурсивная каскадная деактивация.
 * @param tx - транзакция Drizzle (типизированная)
 * @param parentKey - ключ родительской таблицы в tablesMeta
 * @param parentId - ID родительской записи
 */
export async function cascadeDeactivate(
  tx: Transaction,
  parentKey: string,
  parentId: number
): Promise<void> {
  const meta = tablesMeta[parentKey];
  if (!meta?.childTables?.length) return;

  for (const childRef of meta.childTables) {
    const { dbTableName: childDbName, foreignKeyColumn: fkColumn } = childRef;

    // Пропускаем таблицы без ручного toggle для isActive
    if (!hasToggleActive(childDbName)) continue;

    const childTable = drizzleTableByDbName[childDbName];
    if (!childTable) {
      console.warn(
        `cascadeDeactivate: таблица ${childDbName} не найдена в словаре`
      );
      continue;
    }

    // Получаем конфигурацию таблицы для типизированного доступа к столбцам
    const tableConfig = getTableConfig(childTable);

    // Находим столбец id
    const idColumn = tableConfig.columns.find((c) => c.name === "id");
    if (!idColumn) {
      console.warn(
        `cascadeDeactivate: у таблицы ${childDbName} нет столбца id`
      );
      continue;
    }

    // Выполняем UPDATE через сырой SQL для полной типобезопасности
    const updatedRows = await tx.execute<{ id: number }>(
      sql`
        UPDATE ${sql.identifier(childDbName)}
        SET is_active = false
        WHERE ${sql.identifier(fkColumn)} = ${parentId}
        RETURNING id
      `
    );
    // Приводим результат: tx.execute с RETURNING возвращает массив строк
    // (можно использовать .rows, если потребуется)
    const ids: number[] = Array.isArray(updatedRows)
      ? updatedRows.map((r) => r.id)
      : [];

    // Рекурсивно обрабатываем дочерние записи
    const childMetaKey = metaKeyByDbName[childDbName];
    const childMeta = tablesMeta[childMetaKey];
    if (childMeta?.childTables?.length) {
      for (const childId of ids) {
        await cascadeDeactivate(tx, childMetaKey, childId);
      }
    }
  }
}