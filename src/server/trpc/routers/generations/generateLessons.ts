/**
 * Генерация занятий на основе учебных планов, типов часов и существующих юнитов.
 *
 * Мутация доступна только администратору. Принимает опциональный `currentSemester`
 * (по умолчанию берётся из настроек `settings` с ключом `current_semester`, иначе 1).
 *
 * ## Алгоритм (кратко)
 * 1. **Очистка предыдущих активных данных**: в одной транзакции удаляются записи из
 *    `schedule_display`, `schedule`, `lesson_classrooms` и `lessons` (с фильтром
 *    `isActive = true AND versionId IS NULL`), чтобы избежать конфликтов.
 * 2. **Загрузка маппинга типов часов** (`hourTypeMapping`) – определяет, какой
 *    `lessonTypeId` соответствует каждой колонке учебного плана (`hours_lecture`,
 *    `hours_guided_study`, `hours_workshop`, `hours_lab`) и какой столбец приоритета
 *    (`priority_*`) использовать для выбора подходящих юнитов.
 * 3. **Получение учебных планов** для заданного семестра, у которых есть хотя бы один
 *    ненулевой час (лекции/КСР/практики/лабы). Планы обязательно привязаны к активным
 *    дисциплинам.
 * 4. **Обработка каждого плана**:
 *    - Для каждого типа часов (`hours_*`) вычисляется `countPerSemester = ceil(field / 2)`
 *      (деление пополам, т.к. занятия идут раз в две недели).
 *    - Ищутся активные профили, связанные с планом через `curriculumProfiles`.
 *    - Находятся активные учебные группы (`studyGroups`) нужного курса, привязанные
 *      к этим профилям.
 *    - Определяются подходящие юниты (`units`), которые через `unitRoots` связаны с
 *      найденными группами и имеют активный тип (`unitTypes`). Юниты фильтруются по
 *      приоритету: сначала `priority = 1`, если нет – `priority = 2`, в крайнем случае берется `priority = 3`.
 *    - Для каждого подходящего юнита создаётся запись в таблице `lessons` с указанием
 *      `curriculumId`, `disciplineId`, `lessonTypeId`, `unitId` и `countPerSemester`.
 *      Поле `teacherId` пока остаётся пустым.
 * 5. **Назначение преподавателей**:
 *    - Для всех только что созданных активных занятий без учителя ищутся подходящие
 *      преподаватели через `disciplineTeachers` (по дисциплине и типу занятия).
 *    - Преподаватель выбирается с минимальной текущей нагрузкой (жадное распределение).
 *    - Нагрузка учитывается в рамках одной мутации (временный `Map`).
 * 6. **Удаление занятий без преподавателя** – все активные занятия, которым не удалось
 *    назначить преподавателя, удаляются.
 * 7. **Удаление дубликатов** – среди активных занятий оставляется только одна запись
 *    с минимальным `id` для каждой уникальной комбинации
 *    (`curriculum_id, discipline_id, lesson_type_id, unit_id, teacher_id`).
 * 8. **Проверка результата**: если занятий не создано совсем, выбрасывается
 *    `TRPCError` с перечнем возможных причин (отсутствие планов, групп, юнитов,
 *    ненастроенные маппинги и т.д.).
 * 9. **Сбор статистики** и возврат подробной информации о созданных занятиях.
 *
 * @param input - опциональный объект с полем `currentSemester` (целое число).
 *               Если не указан, используется настройка `settings.current_semester` или 1.
 *
 * @returns Объект с детальной статистикой:
 *   - `lessonsCreated` – количество созданных занятий.
 *   - `uniquePlans` – количество уникальных учебных планов, для которых созданы занятия.
 *   - `totalPlans` – общее количество учебных планов (для справки).
 *   - `uniqueTeachers` – количество уникальных преподавателей, назначенных на занятия.
 *   - `totalTeachers` – общее количество записей в `disciplineTeachers`.
 *   - `unitStats` – распределение занятий по типам юнитов (всего, потоки, группы, подгруппы).
 *   - `typeDistribution` – распределение занятий по типам (`lecture`, `lab`, `workshop`, ...).
 *   - `problems` – объект с количеством пропущенных шагов (нет групп, юнитов, маппингов и т.д.).
 *   - `deletedNoTeacherCount` – сколько занятий было удалено из-за отсутствия преподавателя.
 *
 * @throws {TRPCError} с кодом `BAD_REQUEST`, если по итогам генерации не создано ни одного
 *         занятия. Сообщение содержит перечень вероятных причин.
 *
 * @remarks
 * - Функция полностью очищает предыдущие активные занятия и связанные таблицы перед генерацией.
 * - Приоритеты для выбора юнита: сначала priority=1, затем priority=2.
 * - Назначение преподавателей – жадное, без учёта общей нагрузки между разными дисциплинами.
 * - Дубликаты удаляются только среди активных записей без версии.
 * - Требуется корректно заполненный `hourTypeMapping`, связывающий колонки учебного плана
 *   с `lessonTypeId` и названием столбца приоритета в `unitTypes`.
 */
import { z } from "zod";
import { router, adminProcedure } from "../../trpc";
import {
  curriculum,
  curriculumProfiles,
  studyGroups,
  units,
  unitTypes,
  unitRoots,
  hourTypeMapping,
  disciplineTeachers,
  lessons,
  lessonTypes,
  lessonClassrooms,
  schedule,
  profiles,
  disciplines,
  settings,
  scheduleDisplay,
} from "@/db/schema";
import { eq, and, inArray, sql, or, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assertCleanSlate } from "./helpers";

export const generateLessonsRouter = router({
  generateLessons: adminProcedure
    .input(
      z
        .object({
          currentSemester: z.coerce.number().int().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx }) => {
      await assertCleanSlate(ctx);
      // 1. Очистка зависимых таблиц (только активные записи)
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(scheduleDisplay)
          .where(
            and(
              eq(scheduleDisplay.isActive, true),
              isNull(scheduleDisplay.versionId)
            )
          );
        await tx
          .delete(schedule)
          .where(
            and(eq(schedule.isActive, true), isNull(schedule.versionId))
          );
        await tx
          .delete(lessonClassrooms)
          .where(
            and(
              eq(lessonClassrooms.isActive, true),
              isNull(lessonClassrooms.versionId)
            )
          );
        await tx
          .delete(lessons)
          .where(
            and(eq(lessons.isActive, true), isNull(lessons.versionId))
          );
      });

      // 2. Соответствие "план_час_колонка" → (lesson_type_id, поле приоритета в unitTypes)
      const mappings = await ctx.db
        .select()
        .from(hourTypeMapping)
        .where(eq(hourTypeMapping.isActive, true));
      const hourTypeMap = new Map<
        string,
        { lessonTypeId: number; priorityCol: string }
      >();
      for (const m of mappings) {
        hourTypeMap.set(m.planHourColumn, {
          lessonTypeId: m.lessonTypeId,
          priorityCol: m.priorityColumn,
        });
      }

      // Карта для перевода CamelCase приоритета в snake_case столбца
      const priorityColumnSnake: Record<string, string> = {
        priorityLecture: "priority_lecture",
        priorityWorkshop: "priority_workshop",
        priorityGuidedStudy: "priority_guided_study",
        priorityLab: "priority_lab",
      };
      const [semesterSetting] = await ctx.db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, "current_semester"))
        .limit(1);
      const currentSemester = semesterSetting
        ? Number(semesterSetting.value)
        : 1;

      // 3. Все учебные планы с фильтром по семестру
      const plans = await ctx.db
        .select({
          id: curriculum.id,
          course: curriculum.course,
          semester: curriculum.semester,
          disciplineId: curriculum.disciplineId,
          hoursLecture: curriculum.hoursLecture,
          hoursGuidedStudy: curriculum.hoursGuidedStudy,
          hoursWorkshop: curriculum.hoursWorkshop,
          hoursLab: curriculum.hoursLab,
          additionalTaskId: curriculum.additionalTaskId,
          controlTypeId: curriculum.controlTypeId,
        })
        .from(curriculum)
        .innerJoin(disciplines, eq(curriculum.disciplineId, disciplines.id))
        .where(
          and(
            eq(curriculum.isActive, true),
            eq(disciplines.isActive, true),
            eq(curriculum.semester, currentSemester),
            or(
              gt(curriculum.hoursGuidedStudy, 0),
              gt(curriculum.hoursLecture, 0),
              gt(curriculum.hoursLab, 0),
              gt(curriculum.hoursWorkshop, 0)
            )
          )
        );

      // 4. Обработка планов
      const problems: Record<string, number> = {};
      const lessonsToInsert: {
        curriculumId: number;
        disciplineId: number;
        lessonTypeId: number;
        unitId: number;
        countPerSemester: number;
        teacherId?: number | null;
      }[] = [];

      for (const plan of plans) {
        const { id: planId, disciplineId, course } = plan;

        const hourFields = [
          { field: plan.hoursLecture, mapKey: "hours_lecture" },
          { field: plan.hoursGuidedStudy, mapKey: "hours_guided_study" },
          { field: plan.hoursWorkshop, mapKey: "hours_workshop" },
          { field: plan.hoursLab, mapKey: "hours_lab" },
        ];

        for (const { field, mapKey } of hourFields) {
          if (!field || field <= 0) continue;

          const mapping = hourTypeMap.get(mapKey);
          if (!mapping) {
            problems.no_hour_type_mapping =
              (problems.no_hour_type_mapping || 0) + 1;
            continue;
          }
          const { lessonTypeId, priorityCol } = mapping;

          const countPerSemester = Math.ceil(field / 2);

          // Профили, связанные с этим планом
          const profileRows = await ctx.db
            .select({ profileId: curriculumProfiles.profileId })
            .from(curriculumProfiles)
            .innerJoin(
              profiles,
              eq(curriculumProfiles.profileId, profiles.id)
            )
            .where(
              and(
                eq(curriculumProfiles.curriculumId, planId),
                eq(curriculumProfiles.isActive, true),
                eq(profiles.isActive, true)
              )
            );
          const profileIds = profileRows.map((r) => r.profileId);
          if (profileIds.length === 0) {
            problems.no_profiles = (problems.no_profiles || 0) + 1;
            continue;
          }

          // Группы нужного курса для этих профилей (только активные)
          const groups = await ctx.db
            .select({ id: studyGroups.id })
            .from(studyGroups)
            .where(
              and(
                inArray(studyGroups.profileId, profileIds),
                eq(studyGroups.course, course),
                eq(studyGroups.isActive, true)
              )
            );
          const groupIds = groups.map((g) => g.id);
          if (groupIds.length === 0) {
            problems.no_groups = (problems.no_groups || 0) + 1;
            continue;
          }

          // Получаем приоритет для этого типа занятия
          const snakeCol = priorityColumnSnake[priorityCol];
          if (!snakeCol) {
            problems.unknown_priority_column =
              (problems.unknown_priority_column || 0) + 1;
            continue;
          }
          const prioritySql = sql<number>`COALESCE(${sql.identifier(
            snakeCol
          )}, 0)`;

          // Все юниты, связанные с найденными группами (только активные)
          const unitRows = await ctx.db
            .select({
              id: units.id,
              priority: prioritySql,
            })
            .from(units)
            .innerJoin(unitRoots, eq(units.code, unitRoots.unitCode))
            .innerJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
            .where(
              and(
                inArray(unitRoots.studyGroupId, groupIds),
                eq(unitTypes.isActive, true),
                eq(units.isActive, true),
                isNull(units.versionId),
                eq(unitRoots.isActive, true),
                isNull(unitRoots.versionId)
              )
            );

          if (unitRows.length === 0) {
            problems.no_units = (problems.no_units || 0) + 1;
            continue;
          }

          // Фильтр по приоритетам
          const priority1 = unitRows.filter((u) => u.priority === 1);
          const priority2 = unitRows.filter((u) => u.priority === 2);
          const priority3 = unitRows.filter((u) => u.priority === 3);
          let unitsToUse: typeof unitRows;
          if (priority1.length > 0) {
            unitsToUse = priority1;
          } else if (priority2.length > 0) {
            unitsToUse = priority2;
          } else if (priority3.length > 0) {
            unitsToUse = priority3;
          } else {
            problems.no_valid_priority = (problems.no_valid_priority || 0) + 1;
            continue;
          }

          for (const unit of unitsToUse) {
            lessonsToInsert.push({
              curriculumId: planId,
              disciplineId,
              lessonTypeId,
              unitId: unit.id,
              countPerSemester,
            });
          }
        }
      }

      // 5. Вставка занятий
      if (lessonsToInsert.length > 0) {
        await ctx.db.insert(lessons).values(lessonsToInsert);
      }

      // 6. Назначение преподавателей (только активным занятиям)
      const lessonsWithoutTeacher = await ctx.db
        .select({
          id: lessons.id,
          disciplineId: lessons.disciplineId,
          lessonTypeId: lessons.lessonTypeId,
        })
        .from(lessons)
        .where(
          and(
            sql`${lessons.teacherId} IS NULL`,
            eq(lessons.isActive, true),
            isNull(lessons.versionId)
          )
        );

      const teacherLoad = new Map<number, number>();

      for (const l of lessonsWithoutTeacher) {
        const teachers = await ctx.db
          .select({ teacherDeptId: disciplineTeachers.teacherDepartmentId })
          .from(disciplineTeachers)
          .where(
            and(
              eq(disciplineTeachers.disciplineId, l.disciplineId),
              eq(disciplineTeachers.lessonTypeId, l.lessonTypeId),
              eq(disciplineTeachers.isActive, true)
            )
          );

        if (teachers.length === 0) {
          problems.no_teacher_for_lesson =
            (problems.no_teacher_for_lesson || 0) + 1;
          continue;
        }

        let chosenId: number | null = null;
        let minLoad = Infinity;
        for (const t of teachers) {
          const load = teacherLoad.get(t.teacherDeptId) || 0;
          if (load < minLoad) {
            minLoad = load;
            chosenId = t.teacherDeptId;
          }
        }

        if (chosenId !== null) {
          await ctx.db
            .update(lessons)
            .set({ teacherId: chosenId })
            .where(eq(lessons.id, l.id));
          teacherLoad.set(chosenId, (teacherLoad.get(chosenId) || 0) + 1);
        }
      }

      // 7. Удалить занятия без преподавателя (только активные)
      const deletedNoTeacher = await ctx.db
        .delete(lessons)
        .where(
          and(
            sql`${lessons.teacherId} IS NULL`,
            eq(lessons.isActive, true),
            isNull(lessons.versionId)
          )
        )
        .returning();

      // 8. Удалить дубликаты (только среди активных)
      await ctx.db.execute(sql`
        DELETE FROM ${lessons}
        WHERE id IN (
          SELECT id FROM ${lessons}
          WHERE is_active = true AND version_id IS NULL
            AND id NOT IN (
              SELECT MIN(id)
              FROM ${lessons}
              WHERE is_active = true AND version_id IS NULL
              GROUP BY curriculum_id, discipline_id, lesson_type_id, unit_id, teacher_id
            )
        )
      `);

      // 9. Статистика (только по активным занятиям)
      const [totalLessons] = await ctx.db
        .select({ cnt: sql<number>`count(*)` })
        .from(lessons)
        .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));

      if ((totalLessons?.cnt ?? 0) === 0) {
        const reasons: string[] = [];
        if (plans.length === 0) reasons.push("отсутствуют учебные планы на текущий семестр");
        if (problems.no_hour_type_mapping) reasons.push("не настроено соответствие типов часов (hourTypeMapping)");
        if (problems.no_profiles) reasons.push("не найдены активные профили для планов");
        if (problems.no_groups) reasons.push("отсутствуют учебные группы нужного курса");
        if (problems.no_units) reasons.push("отсутствуют юниты, связанные с группами");
        if (problems.no_valid_priority) reasons.push("у юнитов не задан приоритет для типов занятий");
        if (problems.unknown_priority_column) reasons.push("неизвестная колонка приоритета");
        if (problems.no_teacher_for_lesson) reasons.push("не назначены преподаватели (все занятия удалены)");
        const message = reasons.length > 0
          ? `Занятия не созданы. Возможные причины: ${reasons.join("; ")}.`
          : "Занятия не созданы. Проверьте учебные планы, группы и юниты.";
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
      const [uniquePlans] = await ctx.db
        .select({ cnt: sql<number>`count(distinct curriculum_id)` })
        .from(lessons)
        .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
      const [totalPlans] = await ctx.db
        .select({ cnt: sql<number>`count(*)` })
        .from(curriculum);
      const [uniqueTeachers] = await ctx.db
        .select({ cnt: sql<number>`count(distinct teacher_id)` })
        .from(lessons)
        .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
      const [totalTeachers] = await ctx.db
        .select({ cnt: sql<number>`count(*)` })
        .from(disciplineTeachers);

      const unitStats = await ctx.db
        .select({
          total: sql<number>`count(distinct ${lessons.unitId})`,
          streams: sql<number>`count(distinct case when ${unitTypes.name} = 'ПОТОК' then ${lessons.unitId} end)`,
          groups: sql<number>`count(distinct case when ${unitTypes.name} = 'ГРУППА' then ${lessons.unitId} end)`,
          subgroups: sql<number>`count(distinct case when ${unitTypes.name} = 'ПОДГРУППА' then ${lessons.unitId} end)`,
        })
        .from(lessons)
        .innerJoin(units, eq(lessons.unitId, units.id))
        .innerJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
        .where(
          and(
            eq(lessons.isActive, true),
            isNull(lessons.versionId),
            eq(units.isActive, true),
            isNull(units.versionId)
          )
        );

      const typeDistribution = await ctx.db
        .select({ type: lessonTypes.name, count: sql<number>`count(*)` })
        .from(lessons)
        .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
        .where(
          and(eq(lessons.isActive, true), isNull(lessons.versionId))
        )
        .groupBy(lessonTypes.name);

      return {
        lessonsCreated: totalLessons?.cnt ?? 0,
        uniquePlans: uniquePlans?.cnt ?? 0,
        totalPlans: totalPlans?.cnt ?? 0,
        uniqueTeachers: uniqueTeachers?.cnt ?? 0,
        totalTeachers: totalTeachers?.cnt ?? 0,
        unitStats: unitStats[0] ?? {},
        typeDistribution,
        problems,
        deletedNoTeacherCount: deletedNoTeacher.length,
      };
    }),
});