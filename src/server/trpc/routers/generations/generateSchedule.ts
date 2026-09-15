/**
 * Генерация базового расписания (жадный алгоритм с учётом цикличности недель).
 *
 * Мутация доступна только администратору.
 * Принимает общее количество недель `totalWeeks` (по умолчанию 16).
 *
 * ## Важное поведение
 * **Перед генерацией мутация полностью очищает текущее активное расписание**:
 * удаляются все записи из `schedule` и `schedule_display`, у которых
 * `isActive = true AND versionId IS NULL`. Старое расписание не сохраняется.
 *
 * ## Алгоритм (кратко)
 * 1. Определяется длина цикла недель (активные недели в таблице `weeks`).
 * 2. Вычисляется коэффициент `step = ceil(totalWeeks / cycleLength)`, чтобы
 *    масштабировать нагрузку семестра (`countPerSemester`) до одного цикла.
 * 3. Занятия сортируются по убыванию количества обслуживаемых учебных групп
 *    (сначала самые «массовые»).
 * 4. Для каждого занятия рассчитывается понедельная нагрузка внутри цикла:
 *    `S = ceil(countPerSemester / step)` – общее число занятий в одном цикле,
 *    `base = floor(S / cycleLength)`, остаток добавляется к первым неделям цикла.
 * 5. Для каждой недели цикла и каждого требуемого слота:
 *    - Случайным образом перебираются дни недели и пары.
 *    - Проверяется занятость преподавателя, групп и наличие свободной аудитории.
 *    - При успехе занятие закрепляется за слотом, обновляются структуры занятости.
 * 6. Собранные строки расписания дедуплицируются: в одном слоте преподаватель
 *    может вести только одно занятие (удаляются дубли по ключу week-day-pair-teacher).
 * 7. Результат вставляется в таблицы `schedule` и `schedule_display` (второе –
 *    человекочитаемое представление с ФИО преподавателя, аудиторией и т.п.).
 *
 * ## Допущения и ограничения
 * - Используются только **активные** сущности (`isActive = true`) без привязки к версии
 *   (`versionId IS NULL`).
 * - Занятия без преподавателя или аудитории **пропускаются**.
 * - Если у занятия нет связанных групп (через `unitRoots`), оно также пропускается
 *   с предупреждением в консоль.
 * - Дедупликация по преподавателю **не допускает** проведения двух разных занятий
 *   одним преподавателем в одном слоте.
 * - Аудитории выбираются из списка `lessonClassrooms` без учёта вместимости;
 *   приоритет отдаётся первой свободной.
 *
 * @param input.totalWeeks - общее количество недель в семестре (целое >= 1, по умолчанию 16)
 *
 * @returns Объект со статусом генерации и метаинформацией:
 *   - `status: "schedule generated"` – успех.
 *   - `totalSlots` – общее количество созданных слотов расписания.
 *   - `placedLessons` – количество уникальных занятий, попавших в расписание.
 *
 * @throws {TRPCError} с кодом `BAD_REQUEST`, если:
 *   - отсутствуют активные недели;
 *   - отсутствуют активные занятия;
 *   - не заполнены справочники дней недели или пар.
 */
import { z } from "zod";
import { router, adminProcedure } from "../../trpc";
import { eq, asc, and, isNull } from "drizzle-orm";
import {
  schedule,
  lessons,
  lessonClassrooms,
  daysOfWeek,
  pairs,
  scheduleDisplay,
  disciplines,
  lessonTypes,
  employeesDepartments,
  employees,
  units,
  classrooms,
  buildings,
  unitRoots,
  weeks,
  scheduleVersions,   // ← добавлен
} from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { assertCleanSlate } from "./helpers";
import type { Context } from "../../context"; // ← для типизации ctx

// ---------- Вынесенная логика генерации ----------
async function generateScheduleLogic(ctx: Context, totalWeeks: number) {
  // Получаем все активные недели (цикл)
  const weeksList = await ctx.db
    .select({ id: weeks.id })
    .from(weeks)
    .where(eq(weeks.isActive, true))
    .orderBy(asc(weeks.id));
  const cycleLength = weeksList.length;
  if (cycleLength === 0)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нет активных недель. Проверьте таблицу weeks' });

  const step = Math.ceil(totalWeeks / cycleLength);

  // Только активные занятия
  const allLessons = await ctx.db
    .select()
    .from(lessons)
    .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));

  if (allLessons.length === 0)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нет активных занятий для генерации расписания' });

  // Загрузка связей юнитов с группами (только активные)
  const allUnitRoots = await ctx.db
    .select()
    .from(unitRoots)
    .where(and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));

  const unitToGroups = new Map<string, Set<number>>();
  for (const ur of allUnitRoots) {
    if (!unitToGroups.has(ur.unitCode)) unitToGroups.set(ur.unitCode, new Set());
    unitToGroups.get(ur.unitCode)!.add(ur.studyGroupId);
  }

  // lessonId -> unitCode
  const lessonUnitMap = new Map<number, string>();
  const allUnits = await ctx.db
    .select()
    .from(units)
    .where(and(eq(units.isActive, true), isNull(units.versionId)));
  const unitCodeById = new Map<number, string>();
  for (const u of allUnits) unitCodeById.set(u.id, u.code);
  for (const l of allLessons) {
    lessonUnitMap.set(l.id, unitCodeById.get(l.unitId) || "");
  }

  // lessonId -> teacherId (загружаем один раз)
  const teacherMap = new Map<number, number>();
  const allLessonsWithTeacher = await ctx.db
    .select({ id: lessons.id, teacherId: lessons.teacherId })
    .from(lessons)
    .where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
  for (const l of allLessonsWithTeacher) {
    if (l.teacherId) teacherMap.set(l.id, l.teacherId);
  }

  // Сортировка по количеству групп (больше групп → выше приоритет)
  const sortedLessons = [...allLessons].sort((a, b) => {
    const codeA = lessonUnitMap.get(a.id) || "";
    const codeB = lessonUnitMap.get(b.id) || "";
    const groupsA = unitToGroups.get(codeA)?.size ?? 0;
    const groupsB = unitToGroups.get(codeB)?.size ?? 0;
    return groupsB - groupsA;
  });

  // lessonId -> список classroomId (только активные связи)
  const lessonClassroomMap = new Map<number, number[]>();
  const lcRows = await ctx.db
    .select()
    .from(lessonClassrooms)
    .where(and(eq(lessonClassrooms.isActive, true), isNull(lessonClassrooms.versionId)));
  for (const lc of lcRows) {
    if (!lessonClassroomMap.has(lc.lessonId)) lessonClassroomMap.set(lc.lessonId, []);
    lessonClassroomMap.get(lc.lessonId)!.push(lc.classroomId);
  }

  const days = await ctx.db.select().from(daysOfWeek).orderBy(daysOfWeek.id);
  const pairsList = await ctx.db.select().from(pairs).orderBy(pairs.number);
  if (days.length === 0 || pairsList.length === 0)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нет дней недели или пар. Проверьте справочники' });

  // Очистка только активных расписаний
  await ctx.db
    .delete(scheduleDisplay)
    .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
  await ctx.db
    .delete(schedule)
    .where(and(eq(schedule.isActive, true), isNull(schedule.versionId)));

  const scheduleRows: (typeof schedule.$inferInsert & { _unitCode?: string; _teacherId?: number })[] = [];

  // Структура занятости слотов
  const slotOccupancy = new Map<
    string,
    {
      teacherIds: Set<number>;
      classroomIds: Set<number>;
      groupIds: Set<number>;
    }
  >();

  // Основной цикл по отсортированным занятиям
  for (const lesson of sortedLessons) {
    if (!lesson.countPerSemester || lesson.countPerSemester <= 0) continue;

    const S = Math.ceil(lesson.countPerSemester / step);
    const base = Math.floor(S / cycleLength);
    const remainder = S % cycleLength;
    const weekLoad = Array(cycleLength).fill(base);
    for (let i = 0; i < remainder; i++) weekLoad[i]++;

    const classroomIds = lessonClassroomMap.get(lesson.id) || [];
    const lessonUnitCode = lessonUnitMap.get(lesson.id) || "";
    const lessonGroups = unitToGroups.get(lessonUnitCode) ?? new Set<number>();
    const teacherId = teacherMap.get(lesson.id);

    if (teacherId == null || classroomIds.length === 0) continue;
    if (lessonGroups.size === 0) {
      console.warn(
        `Занятие ${lesson.id} не связано с группами (unitCode=${lessonUnitCode}), пропущено`
      );
      continue;
    }

    let placed = 0;

    for (let cycleWeek = 0; cycleWeek < cycleLength; cycleWeek++) {
      const needed = weekLoad[cycleWeek];
      if (needed <= 0) continue;

      const targetWeekId = weeksList[cycleWeek].id;

      // Собираем все слоты для целевой недели
      const weekSlots: { day: typeof days[0]; pair: typeof pairsList[0] }[] = [];
      for (const day of days) {
        for (const pair of pairsList) {
          weekSlots.push({ day, pair });
        }
      }

      for (let slot = 0; slot < needed; slot++) {
        if (placed >= S) break;
        let placedInSlot = false;

        for (const { day, pair } of weekSlots) {
          const slotKey = `${targetWeekId}-${day.id}-${pair.id}`;

          if (!slotOccupancy.has(slotKey)) {
            slotOccupancy.set(slotKey, {
              teacherIds: new Set(),
              classroomIds: new Set(),
              groupIds: new Set(),
            });
          }
          const occupancy = slotOccupancy.get(slotKey)!;

          if (occupancy.teacherIds.has(teacherId)) continue;
          if ([...lessonGroups].some((g) => occupancy.groupIds.has(g))) continue;

          let freeClassroomId: number | null = null;
          for (const cid of classroomIds) {
            if (!occupancy.classroomIds.has(cid)) {
              freeClassroomId = cid;
              break;
            }
          }
          if (freeClassroomId === null) continue;

          scheduleRows.push({
            weekId: targetWeekId,
            dayOfWeekId: day.id,
            pairNumberId: pair.id,
            lessonId: lesson.id,
            classroomId: freeClassroomId,
            classroomFlag: 1,
            mergeFlag: undefined,
            positionFlag: undefined,
            _unitCode: lessonUnitCode,
            _teacherId: teacherId,
            isActive: true,
            versionId: null,
          });

          occupancy.teacherIds.add(teacherId);
          occupancy.classroomIds.add(freeClassroomId);
          for (const g of lessonGroups) occupancy.groupIds.add(g);

          placed++;
          placedInSlot = true;
          break;
        }
        if (!placedInSlot) break;
      }
    }
  }

  // Дедупликация scheduleRows
  const dedupMap = new Map<string, number>();
  const uniqueRows: typeof scheduleRows = [];
  for (let i = 0; i < scheduleRows.length; i++) {
    const row = scheduleRows[i];
    const teacherId = row._teacherId;
    if (!teacherId) {
      uniqueRows.push(row);
      continue;
    }
    const key = `${row.weekId}-${row.dayOfWeekId}-${row.pairNumberId}-t${teacherId}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, i);
      uniqueRows.push(row);
    }
  }

  // Вставка schedule
  if (uniqueRows.length > 0) {
    const cleanRows = uniqueRows.map(({ _unitCode, _teacherId, ...rest }) => rest);
    await ctx.db.insert(schedule).values(cleanRows);
  }

  // Заполнение schedule_display
  const insertedSchedule = await ctx.db
    .select()
    .from(schedule)
    .where(and(eq(schedule.isActive, true), isNull(schedule.versionId)));

  if (insertedSchedule.length > 0) {
    const enriched = await ctx.db
      .select({
        weekId: schedule.weekId,
        dayOfWeekId: schedule.dayOfWeekId,
        pairNumberId: schedule.pairNumberId,
        lessonId: schedule.lessonId,
        classroomId: schedule.classroomId,
        disciplineAbbr: disciplines.abbreviation,
        lessonTypeName: lessonTypes.name,
        teacherSurname: employees.surname,
        teacherName: employees.name,
        teacherPatronymic: employees.patronymic,
        buildingNumber: buildings.number,
        roomNumber: classrooms.roomNumber,
        unitCode: units.code,
        teacherId: lessons.teacherId,
      })
      .from(schedule)
      .innerJoin(lessons, and(eq(schedule.lessonId, lessons.id), eq(lessons.isActive, true), isNull(lessons.versionId)))
      .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
      .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
      .innerJoin(
        employeesDepartments,
        eq(lessons.teacherId, employeesDepartments.id)
      )
      .innerJoin(employees, eq(employeesDepartments.employeeId, employees.id))
      .innerJoin(units, eq(lessons.unitId, units.id))
      .leftJoin(classrooms, eq(schedule.classroomId, classrooms.id))
      .leftJoin(buildings, eq(classrooms.buildingId, buildings.id));

    const displayRowsWithTeacher = enriched.map((row) => {
      const typeMap: Record<string, string> = {
        lecture: "лек.",
        lab: "лаб.",
        workshop: "пр.",
        guidedStudy: "кср.",
      };
      const typeAbbr = typeMap[row.lessonTypeName] || row.lessonTypeName;
      const disc = row.disciplineAbbr;
      const teacher = `${row.teacherSurname} ${row.teacherName[0]}.${row.teacherPatronymic?.[0] ? row.teacherPatronymic[0] + "." : ""}`;
      const room = row.buildingNumber
        ? `${row.buildingNumber}-${row.roomNumber}`
        : "б/а";
      const text = `[${row.unitCode}] ${typeAbbr}${disc} – ${teacher}, ${room}`;
      return {
        lessonId: row.lessonId,
        weekId: row.weekId,
        dayOfWeekId: row.dayOfWeekId,
        pairNumberId: row.pairNumberId,
        unitCode: row.unitCode,
        displayText: text,
        mergeNumber: 0,
        positionFlag: false,
        classroomFlag: row.classroomId !== null,
        classroomId: row.classroomId,
        isBuffered: false,
        isActive: true,
        versionId: null,
        teacherId: row.teacherId,
      };
    });

    const displayDedupMap = new Map<string, number>();
    const uniqueDisplayRows: typeof displayRowsWithTeacher = [];
    for (const dRow of displayRowsWithTeacher) {
      const teacherId = dRow.teacherId;
      if (teacherId == null) {
        uniqueDisplayRows.push(dRow);
        continue;
      }
      const key = `${dRow.weekId}-${dRow.dayOfWeekId}-${dRow.pairNumberId}-t${teacherId}`;
      if (!displayDedupMap.has(key)) {
        displayDedupMap.set(key, uniqueDisplayRows.length);
        uniqueDisplayRows.push(dRow);
      }
    }

    const finalDisplayRows = uniqueDisplayRows.map(({ teacherId, ...rest }) => rest);

    if (finalDisplayRows.length > 0) {
      await ctx.db.insert(scheduleDisplay).values(finalDisplayRows);
    }
  }

  return {
    totalSlots: uniqueRows.length,
    placedLessons: new Set(uniqueRows.map((r) => r.lessonId)).size,
  };
}

// ---------- Роутер ----------
export const generateScheduleRouter = router({
  // Старая мутация (без сохранения версии)
  generateSchedule: adminProcedure
    .input(
      z.object({
        totalWeeks: z.number().int().min(1).default(16),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCleanSlate(ctx);
      const stats = await generateScheduleLogic(ctx, input.totalWeeks ?? 16);
      return { status: "schedule generated", ...stats };
    }),

  // Новая мутация: генерация + создание версии
  generateAndSaveSchedule: adminProcedure
    .input(
      z.object({
        totalWeeks: z.number().int().min(1).default(16),
        versionName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
    const [existingName] = await ctx.db
      .select({ id: scheduleVersions.id })
      .from(scheduleVersions)
      .where(eq(scheduleVersions.name, input.versionName))
      .limit(1);
    if (existingName) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Версия с названием «${input.versionName}» уже существует`,
      });
    }

      await assertCleanSlate(ctx);

      const stats = await generateScheduleLogic(ctx, input.totalWeeks ?? 16);

      // Создаём версию
      const [newVersion] = await ctx.db
        .insert(scheduleVersions)
        .values({ name: input.versionName })
        .returning({ id: scheduleVersions.id });

      const versionId = newVersion.id;

      // Помечаем все активные записи как архивные для этой версии
      const dynamicTables = [scheduleDisplay, schedule, lessonClassrooms, lessons, unitRoots, units] as const;
      for (const table of dynamicTables) {
        await ctx.db
          .update(table)
          .set({ isActive: false, versionId })
          .where(and(eq(table.isActive, true), isNull(table.versionId)));
      }

      return {
        status: "schedule generated",
        ...stats,
        versionId,
        versionName: input.versionName,
      };
    }),
});