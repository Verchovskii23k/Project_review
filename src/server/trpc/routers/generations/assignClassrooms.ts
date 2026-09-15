/**
 * Автоматическое назначение аудиторий для всех активных занятий (без версии).
 *
 * Мутация доступна только администратору. Не принимает параметров.
 * **Не удаляет существующие связи** `lessonClassrooms` — только добавляет новые
 * для занятий, у которых ещё нет активной аудитории. Может безопасно вызываться
 * повторно (идемпотентна по отношению к уже назначенным аудиториям).
 *
 * ## Алгоритм для каждого активного занятия
 * 1. **Определение размера юнита (`unitSize`)**:
 *    - Если юнит имеет тип "ПОДГРУППА", размер равен `maxSize` этого типа.
 *    - Иначе вычисляется суммарное количество студентов во всех учебных группах,
 *      связанных с данным юнитом через `unitRoots`. Если связи отсутствуют,
 *      используется `maxSize` типа юнита.
 * 2. **Получение кафедры** дисциплины, к которой относится занятие.
 * 3. **Поиск приоритетной колонки** аудитории через `hourTypeMapping` по типу занятия.
 *    Колонка определяет, какой параметр аудитории (например, `priorityLecture`,
 *    `priorityWorkshop` и т.п.) использовать при сортировке.
 * 4. **Фильтрация подходящих аудиторий**:
 *    - Активные (`isActive = true`).
 *    - Вместимость (`capacity`) >= `unitSize`.
 *    - Принадлежат кафедре дисциплины **или** имеют `departmentId IS NULL` (общие).
 * 5. **Сортировка кандидатов** (по возрастанию):
 *    - Значение приоритетной метрики (чем меньше, тем лучше).
 *    - Текущая метрика использования `usageMetric` (чем меньше, тем менее загружена).
 *    - `id` аудитории (для детерминизма).
 * 6. **Назначение лучшей аудитории**:
 *    - Если для данного занятия ещё нет активной связи в `lessonClassrooms`,
 *      создаётся новая запись. Счётчик `assigned` увеличивается.
 *    - Метрика использования выбранной аудитории немедленно увеличивается на 1
 *      (влияет на последующие итерации в рамках этого же запуска).
 * 7. **Финальный пересчёт метрики**: после обработки всех занятий вызывается
 *    `recalculateUsageMetrics()` для точного согласования `usageMetric` с реальным
 *    количеством связей в `lessonClassrooms`.
 *
 * ## Обработка ошибок
 * - Занятия, для которых не удалось найти аудиторию (нет кандидатов, не найден юнит,
 *   отсутствует маппинг типа занятия и т.п.), **не прерывают выполнение**, а
 *   добавляются в массив `failed` с описанием причины.
 * - Возвращаемый объект всегда содержит полный список неудач (или `null`, если их нет).
 *
 * @returns Объект с результатами назначения:
 *   - `assignedClassrooms` — количество занятий, которым **впервые** назначена аудитория
 *     в рамках данного вызова.
 *   - `failed` — массив объектов `{ lessonId: number; reason: string }` для занятий,
 *     которые не удалось обработать, или `null`, если все занятия успешно получили
 *     аудиторию (или уже имели её ранее).
 *
 * @remarks
 * - Мутация **не требует предварительной очистки** данных, в отличие от генераторов
 *   уроков и расписания. Её можно запускать как сразу после создания занятий, так и
 *   повторно после изменения состава аудиторий.
 * - Если у занятия уже есть активная аудитория, оно **пропускается** (не заменяется).
 * - Приоритет аудиторий полностью определяется настройками в `classrooms` и `hourTypeMapping`.
 * - Метрика `usageMetric` обновляется даже для существующих аудиторий, что гарантирует
 *   равномерную загрузку при последовательных запусках.
 */
import { router, adminProcedure } from "../../trpc";
import {
  lessons,
  lessonClassrooms,
  classrooms,
  disciplines,
  units,
  unitRoots,
  studyGroups,
  unitTypes,
  hourTypeMapping,
} from "@/db/schema";
import { recalculateUsageMetrics } from "@/lib/usageMetrics";
import { eq, and, gte, isNull, or, sql, SQL } from "drizzle-orm";
import { assertCleanSlate } from "./helpers";

export const assignClassroomsRouter = router({
  assignClassroomsAuto: adminProcedure.mutation(async ({ ctx }) => {
    await assertCleanSlate(ctx);

    const allLessons = await ctx.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));

    const failed: { lessonId: number; reason: string }[] = [];
    let assigned = 0;

    for (const lesson of allLessons) {
      // --- определение unitSize (без изменений) ---
      let unitSize = 0;
      const [unit] = await ctx.db
        .select({ id: units.id, code: units.code, unitTypeId: units.unitTypeId })
        .from(units)
        .where(
          and(
            eq(units.id, lesson.unitId),
            eq(units.isActive, true),
            isNull(units.versionId)
          )
        )
        .limit(1);
      if (!unit) {
        failed.push({ lessonId: lesson.id, reason: "Юнит не найден" });
        continue;
      }

      const [unitType] = await ctx.db
        .select({ name: unitTypes.name, maxSize: unitTypes.maxSize })
        .from(unitTypes)
        .where(eq(unitTypes.id, unit.unitTypeId))
        .limit(1);
      if (!unitType) {
        failed.push({ lessonId: lesson.id, reason: "Тип юнита не найден" });
        continue;
      }

      if (unitType.name === "ПОДГРУППА") {
        unitSize = unitType.maxSize ?? 0;
      } else {
        const roots = await ctx.db
          .select({ studyGroupId: unitRoots.studyGroupId })
          .from(unitRoots)
          .where(
            and(
              eq(unitRoots.unitCode, unit.code),
              eq(unitRoots.isActive, true),
              isNull(unitRoots.versionId)
            )
          );
        if (roots.length > 0) {
          const groupIds = roots.map((r) => r.studyGroupId);
          const groupsData = await ctx.db
            .select({ studentCount: studyGroups.studentCount })
            .from(studyGroups)
            .where(
              and(
                sql`${studyGroups.id} IN ${groupIds}`,
                eq(studyGroups.isActive, true)
              )
            );
          unitSize = groupsData.reduce(
            (sum, g) => sum + (g.studentCount ?? 0),
            0
          );
        } else {
          unitSize = unitType.maxSize ?? 0;
        }
      }

      // --- кафедра дисциплины (без изменений) ---
      const [disc] = await ctx.db
        .select({ departmentId: disciplines.departmentId })
        .from(disciplines)
        .where(eq(disciplines.id, lesson.disciplineId!))
        .limit(1);
      const deptId = disc?.departmentId ?? null;

      // --- приоритетная колонка (без изменений) ---
      const [mapping] = await ctx.db
        .select({ priorityColumn: hourTypeMapping.priorityColumn })
        .from(hourTypeMapping)
        .where(
          and(
            eq(hourTypeMapping.lessonTypeId, lesson.lessonTypeId!),
            eq(hourTypeMapping.isActive, true)
          )
        )
        .limit(1);
      if (!mapping) {
        failed.push({
          lessonId: lesson.id,
          reason: "Нет маппинга типа занятия",
        });
        continue;
      }

      type ClassroomPriorityKey = keyof Pick<
        typeof classrooms,
        "priorityLecture" | "priorityWorkshop" | "priorityGuidedStudy" | "priorityLab"
      >;
      const priorityColumn = mapping.priorityColumn as ClassroomPriorityKey;

      // --- фильтрация кандидатов (без изменений) ---
      const conditions: SQL<unknown>[] = [
        eq(classrooms.isActive, true),
        gte(classrooms.capacity, unitSize),
      ];
      if (deptId !== null) {
        conditions.push(
          or(
            eq(classrooms.departmentId, deptId),
            isNull(classrooms.departmentId)
          ) as SQL<unknown>
        );
      }

      const candidates = await ctx.db
        .select()
        .from(classrooms)
        .where(and(...conditions));

      if (candidates.length === 0) {
        failed.push({
          lessonId: lesson.id,
          reason: `Нет аудитории вместимостью ≥ ${unitSize} (кафедра ${deptId ?? "нет"})`,
        });
        continue;
      }

      // --- сортировка (без изменений) ---
      candidates.sort((a, b) => {
        const prioA = (a[priorityColumn] as number) ?? 99;
        const prioB = (b[priorityColumn] as number) ?? 99;
        if (prioA !== prioB) return prioA - prioB;

        const metricA = a.usageMetric ?? 0;
        const metricB = b.usageMetric ?? 0;
        if (metricA !== metricB) return metricA - metricB;

        return a.id - b.id;
      });

      const best = candidates[0];

      // Проверка и вставка связи (без изменений)
      const [existingLink] = await ctx.db
        .select({ id: lessonClassrooms.id })
        .from(lessonClassrooms)
        .where(
          and(
            eq(lessonClassrooms.lessonId, lesson.id),
            eq(lessonClassrooms.isActive, true),
            isNull(lessonClassrooms.versionId)
          )
        )
        .limit(1);

      if (!existingLink) {
        await ctx.db.insert(lessonClassrooms).values({
          lessonId: lesson.id,
          classroomId: best.id,
          isActive: true,
        });
        assigned++
      }

      // Увеличиваем метрику только для текущего назначения (чтобы сортировка в цикле работала)
      await ctx.db
        .update(classrooms)
        .set({ usageMetric: (best.usageMetric ?? 0) + 1 })
        .where(eq(classrooms.id, best.id));

    }

    // Финальный пересчёт метрики по фактическому состоянию lessonClassrooms
    await recalculateUsageMetrics();

    return {
      assignedClassrooms: assigned,
      failed: failed.length > 0 ? failed : null,
    };
  }),
});