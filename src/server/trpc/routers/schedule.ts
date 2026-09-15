/**
 * Роутер для публичного получения расписания и значений фильтров.
 *
 * Предоставляет два запроса:
 * - `getSchedule` – получение списка занятий с возможностью фильтрации по
 *   неделе, дню, группе, преподавателю, аудитории и версии.
 * - `filters` – получение всех доступных для фильтрации значений (недели,
 *   дни, пары, группы, преподаватели, аудитории) с учётом версии расписания.
 *
 * ## Особенности
 * - Все процедуры **публичные** – доступны без аутентификации.
 * - Поддерживается версионирование: если передан `versionId`, данные берутся
 *   из архивной версии (isActive = false, versionId = переданному),
 *   иначе – из активной (isActive = true, versionId IS NULL).
 * - Для фильтрации по группе используется цепочка `unitRoots` → `units` →
 *   `lessons` → `schedule`. Если группа не имеет юнитов, возвращается
 *   пустой массив.
 * - Для фильтрации по преподавателю проверяется наличие `teacherSurname`,
 *   которое заполняется через `leftJoin`, поэтому строки без преподавателя
 *   отфильтровываются на уровне JS.
 * - В `filters` группы возвращаются активными для активной версии и
 *   неактивными для архивной версии.
 *
 * @remarks
 * - В ответе `getSchedule` для каждой строки возвращаются поля:
 *   `scheduleId`, `weekNumber`, `dayOfWeek`, `pairNumber`, `lessonId`,
 *   `disciplineName`, `lessonTypeName`, `classroomId`, `classroomNumber`,
 *   `buildingNumber`, `teacherSurname`, `teacherName`, `unitCode`.
 * - Для архивных версий убедитесь, что связанные данные (аудитории,
 *   преподаватели, группы) не были удалены физически.
 */
import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  schedule,
  lessons,
  lessonTypes,
  disciplines,
  classrooms,
  buildings,
  daysOfWeek,
  pairs,
  employeesDepartments,
  employees,
  studyGroups,
  units,
  unitRoots,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const scheduleRouter = router({
  getSchedule: publicProcedure
    .input(
      z.object({
        weekNumber: z.number().int().optional(),
        dayOfWeekId: z.number().int().optional(),
        groupId: z.number().int().optional(),
        teacherId: z.number().int().optional(),
        classroomId: z.number().int().optional(),
        versionId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { versionId } = input;

      // Фильтры для основных таблиц в зависимости от версии
      const scheduleFilter = versionId
        ? eq(schedule.versionId, versionId)
        : and(eq(schedule.isActive, true), isNull(schedule.versionId));
      const lessonsFilter = versionId
        ? eq(lessons.versionId, versionId)
        : and(eq(lessons.isActive, true), isNull(lessons.versionId));
      const unitsFilter = versionId
        ? eq(units.versionId, versionId)
        : and(eq(units.isActive, true), isNull(units.versionId));
      const unitRootsFilter = versionId
        ? eq(unitRoots.versionId, versionId)
        : and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId));

      const conditions = [];

      if (input.weekNumber) conditions.push(eq(schedule.weekId, input.weekNumber));
      if (input.dayOfWeekId) conditions.push(eq(schedule.dayOfWeekId, input.dayOfWeekId));
      if (input.classroomId) conditions.push(eq(schedule.classroomId, input.classroomId));

      // Фильтрация по группе
      let groupUnitCodes: string[] | undefined;
      if (input.groupId) {
        const roots = await ctx.db
          .select({ unitCode: unitRoots.unitCode })
          .from(unitRoots)
          .where(
            and(
              eq(unitRoots.studyGroupId, input.groupId),
              unitRootsFilter
            )
          );
        groupUnitCodes = roots.map((r) => r.unitCode);
        if (groupUnitCodes.length === 0) return [];
      }

      const data = await ctx.db
        .select({
          scheduleId: schedule.id,
          weekNumber: schedule.weekId,
          dayOfWeek: daysOfWeek.name,
          pairNumber: pairs.number,
          lessonId: schedule.lessonId,
          disciplineName: disciplines.name,
          lessonTypeName: lessonTypes.name,
          classroomId: schedule.classroomId,
          classroomNumber: classrooms.roomNumber,
          buildingNumber: buildings.number,
          teacherSurname: employees.surname,
          teacherName: employees.name,
          unitCode: units.code,
        })
        .from(schedule)
        .innerJoin(lessons, eq(schedule.lessonId, lessons.id))
        .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
        .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
        .leftJoin(classrooms, eq(schedule.classroomId, classrooms.id))
        .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
        .innerJoin(units, eq(lessons.unitId, units.id))
        .leftJoin(
          employeesDepartments,
          eq(lessons.teacherId, employeesDepartments.id)
        )
        .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
        .innerJoin(daysOfWeek, eq(schedule.dayOfWeekId, daysOfWeek.id))
        .innerJoin(pairs, eq(schedule.pairNumberId, pairs.id))
        .where(
          and(
            scheduleFilter,
            lessonsFilter,
            unitsFilter,
            ...conditions
          )
        )
        .orderBy(schedule.weekId, daysOfWeek.id, pairs.number);

      let filtered = data;
      if (input.groupId && groupUnitCodes) {
        filtered = filtered.filter((row) =>
          groupUnitCodes!.includes(row.unitCode)
        );
      }
      if (input.teacherId) {
        filtered = filtered.filter((row) => row.teacherSurname !== null);
      }

      return filtered;
    }),

  filters: publicProcedure
    .input(
      z.object({
        versionId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { versionId } = input;

      const scheduleFilter = versionId
        ? eq(schedule.versionId, versionId)
        : and(eq(schedule.isActive, true), isNull(schedule.versionId));

      const [
        weeks,
        days,
        pairsList,
        groups,
        teachers,
        classroomsList,
      ] = await Promise.all([
        ctx.db
          .selectDistinct({ weekNumber: schedule.weekId })
          .from(schedule)
          .where(scheduleFilter)
          .orderBy(schedule.weekId),
        ctx.db.select().from(daysOfWeek).orderBy(daysOfWeek.id),
        ctx.db.select().from(pairs).orderBy(pairs.number),
        ctx.db
          .select({ id: studyGroups.id, code: studyGroups.code })
          .from(studyGroups)
          .where(
            versionId
              ? eq(studyGroups.isActive, false)
              : eq(studyGroups.isActive, true)
          ),
        ctx.db
          .select({
            id: employeesDepartments.id,
            surname: employees.surname,
            name: employees.name,
          })
          .from(employeesDepartments)
          .innerJoin(
            employees,
            eq(employeesDepartments.employeeId, employees.id)
          ),
        ctx.db
          .select({
            id: classrooms.id,
            roomNumber: classrooms.roomNumber,
            buildingId: classrooms.buildingId,
          })
          .from(classrooms)
          .where(eq(classrooms.isActive, true)),
      ]);

      return {
        weeks,
        days,
        pairs: pairsList,
        groups,
        teachers,
        classrooms: classroomsList,
      };
    }),
});