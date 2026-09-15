/**
 * ## Роутер `scheduleDisplayRouter`
 *
 * Отвечает за отображение и редактирование расписания. Предоставляет
 * запросы и мутации для таблицы `schedule_display`, буфера, проверки
 * конфликтов drag‑and‑drop и запуска оптимизатора.
 *
 * Все процедуры доступны только администраторам (`adminProcedure`).
 *
 * ### 🔐 Версионирование данных
 *
 * Система поддерживает архивные версии расписания. В зависимости от
 * переданного `versionId` выбирается один из режимов:
 * - `null` или `undefined` – **активное расписание** (`isActive = true`, `versionId IS NULL`).
 * - число – конкретная **архивная версия** (`isActive = false`, `versionId = переданному`).
 *
 * При работе с активным расписанием все мутации передают `versionId: null`.
 *
 * ### Процедуры
 *
 * | Процедура          | Тип      | Описание |
 * |--------------------|----------|----------|
 * | `getForWeekPair`   | query    | Строки расписания, дни, пары и недели для режима «По юнитам». |
 * | `getByGroup`       | query    | То же для одной учебной группы. |
 * | `getByStudyGroups` | query    | Агрегация по всем группам. |
 * | `getBuffer`        | query    | Записи в буфере. |
 * | `getBufferedCount` | query    | Количество записей в буфере. |
 * | `moveToBuffer`     | mutation | Переместить в буфер (обнулить координаты). |
 * | `moveFromBuffer`   | mutation | Вернуть из буфера в указанный слот. |
 * | `checkSlots`       | mutation | Проверка слотов для drag‑and‑drop (`free`/`conflict`/`swap`). |
 * | `move`             | mutation | Перемещение занятия в свободный слот. |
 * | `swap`             | mutation | Обмен двух занятий местами. |
 * | `updateFlags`      | mutation | Изменение флагов занятия. |
 * | `optimizeSchedule` | mutation | Запуск оптимизации. При `includeBuffered` размещает буферные занятия по свободным слотам, при необходимости вытесняя конфликтующие занятия |
 * | `resetFlags`       | mutation | Массовый сброс выбранных флагов. |
 *
 * ### Логика `checkSlots`
 *
 * Для каждого слота проверяются:
 * 1. Исходная позиция – `"free"`.
 * 2. Прямой конфликт по группам (кроме двух подгрупп), преподавателю и аудитории.
 * 3. Если в слоте есть запись того же юнита и занятие не из буфера – проверка swap.
 * 4. Иначе `"free"`.
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  scheduleDisplay,
  daysOfWeek,
  pairs,
  unitRoots,
  studyGroups,
  weeks,
  lessons,
  lessonClassrooms,
  unitTypes,
  units,
} from "@/db/schema";
import { eq, inArray, asc, and, isNull, isNotNull } from "drizzle-orm";
import { optimizeSchedule } from "./scheduleOptimizer";
import { TRPCError } from "@trpc/server";
import { Context } from '@/server/trpc'

// Вспомогательная функция для построения условия на scheduleDisplay
function scheduleVersionCondition(
  versionId: number | null | undefined
) {
  if (versionId === undefined) {
    // по умолчанию – активная версия
    return and(
      eq(scheduleDisplay.isActive, true),
      isNull(scheduleDisplay.versionId)
    );
  }
  if (versionId === null) {
    return and(
      eq(scheduleDisplay.isActive, true),
      isNull(scheduleDisplay.versionId)
    );
  }
  return and(
    eq(scheduleDisplay.isActive, false),
    eq(scheduleDisplay.versionId, versionId)
  );
}

// Условие для unitRoots (у них тоже isActive и versionId)
function unitRootsVersionCondition(
  versionId: number | null | undefined
) {
  if (versionId === undefined || versionId === null) {
    return and(
      eq(unitRoots.isActive, true),
      isNull(unitRoots.versionId)
    );
  }
  return and(
    eq(unitRoots.isActive, false),
    eq(unitRoots.versionId, versionId)
  );
}

// Условие для lessons и lessonClassrooms (у них isActive и versionId)
function lessonsVersionCondition(
  versionId: number | null | undefined
) {
  if (versionId === undefined || versionId === null) {
    return and(
      eq(lessons.isActive, true),
      isNull(lessons.versionId)
    );
  }
  return and(
    eq(lessons.isActive, false),
    eq(lessons.versionId, versionId)
  );
}

function lessonClassroomsVersionCondition(
  versionId: number | null | undefined
) {
  if (versionId === undefined || versionId === null) {
    return and(
      eq(lessonClassrooms.isActive, true),
      isNull(lessonClassrooms.versionId)
    );
  }
  return and(
    eq(lessonClassrooms.isActive, false),
    eq(lessonClassrooms.versionId, versionId)
  );
}
export const scheduleDisplayRouter = router({
  getForWeekPair: adminProcedure
    .input(
      z.object({
        weekBaseId: z.number().int().min(1).optional(),
        versionId: z.number().nullable().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);

let weeksList;
if (input.versionId != null) {
  // Архивная версия: только недели, реально используемые в этой версии
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.versionId, input.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
} else {
  // Активная версия: только недели, используемые в активных записях
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.isActive, true),
        isNull(scheduleDisplay.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
}

      const rows = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(
          eq(scheduleDisplay.isBuffered, false),
          isNotNull(scheduleDisplay.weekId),
          isNotNull(scheduleDisplay.dayOfWeekId),
          isNotNull(scheduleDisplay.pairNumberId),
          versionCond
        ))

      const days = await ctx.db
        .select()
        .from(daysOfWeek)
        .orderBy(asc(daysOfWeek.id));
      const pairsList = await ctx.db
        .select()
        .from(pairs)
        .orderBy(asc(pairs.number));

      return { rows, days, pairs: pairsList, weeks: weeksList };
    }),

  getByGroup: adminProcedure
    .input(
      z.object({
        studyGroupCode: z.string().min(1),
        weekBaseId: z.number().int().min(1).optional(),
        versionId: z.number().nullable().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      const unitRootsCond = unitRootsVersionCondition(input.versionId);

let weeksList;
if (input.versionId != null) {
  // Архивная версия: только недели, реально используемые в этой версии
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.versionId, input.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
} else {
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.isActive, true),
        isNull(scheduleDisplay.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
}

      const unitLinks = await ctx.db
        .select({ unitCode: unitRoots.unitCode })
        .from(unitRoots)
        .innerJoin(studyGroups, eq(unitRoots.studyGroupId, studyGroups.id))
        .where(
          and(
            eq(studyGroups.code, input.studyGroupCode),
            unitRootsCond
          )
        );

      if (unitLinks.length === 0)
        return { rows: [], days: [], pairs: [], weeks: weeksList };

      const unitCodes = [...new Set(unitLinks.map((u) => u.unitCode))];

      const rows = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(
          inArray(scheduleDisplay.unitCode, unitCodes),
          eq(scheduleDisplay.isBuffered, false),
          isNotNull(scheduleDisplay.weekId),
          isNotNull(scheduleDisplay.dayOfWeekId),
          isNotNull(scheduleDisplay.pairNumberId),
          versionCond
        ))
        .orderBy(
          asc(scheduleDisplay.weekId),
          asc(scheduleDisplay.dayOfWeekId),
          asc(scheduleDisplay.pairNumberId),
          asc(scheduleDisplay.unitCode)
        );

      const days = await ctx.db
        .select()
        .from(daysOfWeek)
        .orderBy(asc(daysOfWeek.id));
      const pairsList = await ctx.db
        .select()
        .from(pairs)
        .orderBy(asc(pairs.number));

      return { rows, days, pairs: pairsList, weeks: weeksList };
    }),

  getByStudyGroups: adminProcedure
    .input(
      z.object({
        weekBaseId: z.number().int().min(1).optional(),
        versionId: z.number().nullable().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      const unitRootsCond = unitRootsVersionCondition(input.versionId);

let weeksList;
if (input.versionId != null) {
  // Архивная версия: только недели, реально используемые в этой версии
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.versionId, input.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
} else {
  weeksList = (await ctx.db
    .selectDistinct({ id: scheduleDisplay.weekId, type: weeks.type })
    .from(scheduleDisplay)
    .innerJoin(weeks, eq(scheduleDisplay.weekId, weeks.id))
    .where(
      and(
        eq(scheduleDisplay.isActive, true),
        isNull(scheduleDisplay.versionId),
        eq(scheduleDisplay.isBuffered, false),
        isNotNull(scheduleDisplay.weekId)
      )
    )
    .orderBy(asc(scheduleDisplay.weekId))
  ).map(w => ({ id: w.id as number, type: w.type }));
}

      const roots = await ctx.db
        .select({
          studyGroupCode: studyGroups.code,
          unitCode: unitRoots.unitCode,
        })
        .from(unitRoots)
        .innerJoin(
          studyGroups,
          eq(unitRoots.studyGroupId, studyGroups.id)
        )
        .innerJoin(
          scheduleDisplay,
          eq(unitRoots.unitCode, scheduleDisplay.unitCode)
        )
        .where(and(
          eq(scheduleDisplay.isBuffered, false),
          isNotNull(scheduleDisplay.weekId),
          isNotNull(scheduleDisplay.dayOfWeekId),
          isNotNull(scheduleDisplay.pairNumberId),
          versionCond,
          unitRootsCond
        ))

      const groupUnitMap = new Map<string, Set<string>>();
      for (const { studyGroupCode, unitCode } of roots) {
        if (!groupUnitMap.has(studyGroupCode))
          groupUnitMap.set(studyGroupCode, new Set());
        groupUnitMap.get(studyGroupCode)!.add(unitCode);
      }

      const allRows: (typeof scheduleDisplay.$inferSelect & {
        studyGroupCode: string;
      })[] = [];

      for (const [groupCode, unitCodes] of groupUnitMap.entries()) {
        const unitList = [...unitCodes];
        const groupRows = await ctx.db
          .select({
            id: scheduleDisplay.id,
            lessonId: scheduleDisplay.lessonId,
            weekId: scheduleDisplay.weekId,
            dayOfWeekId: scheduleDisplay.dayOfWeekId,
            pairNumberId: scheduleDisplay.pairNumberId,
            unitCode: scheduleDisplay.unitCode,
            displayText: scheduleDisplay.displayText,
            mergeNumber: scheduleDisplay.mergeNumber,
            positionFlag: scheduleDisplay.positionFlag,
            classroomFlag: scheduleDisplay.classroomFlag,
            versionId: scheduleDisplay.versionId,
            isActive: scheduleDisplay.isActive,
            classroomId: scheduleDisplay.classroomId,
            isBuffered: scheduleDisplay.isBuffered,
          })
          .from(scheduleDisplay)
          .where(and(
            inArray(scheduleDisplay.unitCode, unitList),
            eq(scheduleDisplay.isBuffered, false),
            isNotNull(scheduleDisplay.weekId),
            isNotNull(scheduleDisplay.dayOfWeekId),
            isNotNull(scheduleDisplay.pairNumberId),
            versionCond
          ))

        for (const row of groupRows) {
          allRows.push({
            ...row,
            studyGroupCode: groupCode,
          });
        }
      }

      allRows.sort(
        (a, b) =>
          a.weekId! - b.weekId! ||
          a.dayOfWeekId! - b.dayOfWeekId! ||
          a.pairNumberId! - b.pairNumberId! ||
          a.studyGroupCode.localeCompare(b.studyGroupCode)
      );

      const days = await ctx.db
        .select()
        .from(daysOfWeek)
        .orderBy(asc(daysOfWeek.id));
      const pairsList = await ctx.db
        .select()
        .from(pairs)
        .orderBy(asc(pairs.number));

      return { rows: allRows, days, pairs: pairsList, weeks: weeksList };
    }),

  getBuffer: adminProcedure
    .input(
      z.object({
        versionId: z.number().nullable().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      return ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.isBuffered, true), versionCond))
        .orderBy(asc(scheduleDisplay.id));
    }),
  getBufferedCount: adminProcedure
    .input(z.object({ versionId: z.number().nullable().optional() }))
    .query(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      const rows = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.isBuffered, true), versionCond));
      return { count: rows.length };
    }),
  moveToBuffer: adminProcedure
    .input(z.object({ id: z.number(), versionId: z.number().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      await ctx.db
        .update(scheduleDisplay)
        .set({
          isBuffered: true,
          weekId: null,
          dayOfWeekId: null,
          pairNumberId: null,
          positionFlag: false,
          classroomFlag: false,
          mergeNumber: 0,
        })
        .where(and(eq(scheduleDisplay.id, input.id), versionCond));
      return { success: true };
    }),

  moveFromBuffer: adminProcedure
    .input(
      z.object({
        id: z.number(),
        targetWeekId: z.number().int().min(1),
        targetDayId: z.number().int(),
        targetPairId: z.number().int(),
        targetUnitCode: z.string(),
        versionId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);

      const record = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.id, input.id), versionCond))
        .limit(1);
      if (!record.length || !record[0].isBuffered)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Запись не в буфере' });

      const existing = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(
          and(
            eq(scheduleDisplay.weekId, input.targetWeekId),
            eq(scheduleDisplay.dayOfWeekId, input.targetDayId),
            eq(scheduleDisplay.pairNumberId, input.targetPairId),
            eq(scheduleDisplay.unitCode, input.targetUnitCode),
            eq(scheduleDisplay.isBuffered, false),
            versionCond
          )
        );
      if (existing.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Слот занят' });
      if (input.targetUnitCode !== record[0].unitCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нельзя переместить занятие в чужой юнит' });
      }
      await ctx.db
        .update(scheduleDisplay)
        .set({
          weekId: input.targetWeekId,
          dayOfWeekId: input.targetDayId,
          pairNumberId: input.targetPairId,
          unitCode: input.targetUnitCode,
          isBuffered: false,
          positionFlag: false,
          mergeNumber: 0,
        })
        .where(and(eq(scheduleDisplay.id, input.id), versionCond));
      return { success: true };
    }),

  checkSlots: adminProcedure
    .input(
      z.object({
        movingId: z.number(),
        slots: z.array(
          z.object({
            weekId: z.number().int(),
            dayId: z.number().int(),
            pairId: z.number().int(),
            unitCode: z.string(),
          })
        ),
        versionId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);
      const unitRootsCond = unitRootsVersionCondition(input.versionId);
      const lessonsCond = lessonsVersionCondition(input.versionId);
      const lcCond = lessonClassroomsVersionCondition(input.versionId);

      const moving = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.id, input.movingId), versionCond))
        .limit(1);
      if (!moving.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Занятие не найдено' });
      const m = moving[0];

      // Вспомогательная функция для получения типа юнита по unitCode (с кэшированием)
      const unitTypeCache = new Map<string, string>();
      const getUnitType = async (code: string, ctx: Context) => {
        if (unitTypeCache.has(code)) return unitTypeCache.get(code)!;
        const [unit] = await ctx.db
          .select({ name: unitTypes.name })
          .from(units)
          .innerJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
          .where(and(eq(units.code, code), eq(units.isActive, true), isNull(units.versionId)))
          .limit(1);
        const typeName = unit?.name ?? 'ГРУППА';
        unitTypeCache.set(code, typeName);
        return typeName;
      };

      // Группы перемещаемого юнита
      const movingUnitRoots = await ctx.db
        .select({ studyGroupId: unitRoots.studyGroupId })
        .from(unitRoots)
        .where(
          and(
            eq(unitRoots.unitCode, m.unitCode),
            unitRootsCond
          )
        );
      const movingGroupIds = new Set(
        movingUnitRoots.map((r) => r.studyGroupId)
      );

      // Преподаватель и аудитория перемещаемого занятия
      let mTeacherId: number | null = null;
      let mClassroomId: number | null = null;
      if (m.lessonId != null) {
        const [mTeacher, mClassroom] = await Promise.all([
          ctx.db
            .select({ teacherId: lessons.teacherId })
            .from(lessons)
            .where(and(eq(lessons.id, m.lessonId), lessonsCond))
            .limit(1),
          ctx.db
            .select({ classroomId: lessonClassrooms.classroomId })
            .from(lessonClassrooms)
            .where(
              and(
                eq(lessonClassrooms.lessonId, m.lessonId),
                lcCond
              )
            )
            .limit(1),
        ]);
        mTeacherId = mTeacher[0]?.teacherId ?? null;
        mClassroomId = mClassroom[0]?.classroomId ?? null;
      }

      const oldSlot = m.isBuffered
        ? null
        : {
            weekId: m.weekId,
            dayId: m.dayOfWeekId,
            pairId: m.pairNumberId,
            unitCode: m.unitCode,
          };

      const results: Record<string, { status: string; swapId?: number; reason?: string }> = {};

      for (const slot of input.slots) {
        const key = `week-${slot.weekId}-${slot.dayId}-${slot.pairId}-${slot.unitCode}`;
        // Если это исходная позиция перемещаемого занятия – всегда "free"
        if (
          !m.isBuffered &&
          m.weekId === slot.weekId &&
          m.dayOfWeekId === slot.dayId &&
          m.pairNumberId === slot.pairId &&
          m.unitCode === slot.unitCode
        ) {
          results[key] = { status: "free" };
          continue;
        }

        const allInSlot = await ctx.db
          .select()
          .from(scheduleDisplay)
          .where(
            and(
              eq(scheduleDisplay.weekId, slot.weekId),
              eq(scheduleDisplay.dayOfWeekId, slot.dayId),
              eq(scheduleDisplay.pairNumberId, slot.pairId),
              eq(scheduleDisplay.isBuffered, false),
              versionCond
            )
          );

        const others = allInSlot.filter((e) => e.id !== input.movingId);
        const sameUnitEntry =
          others.find((e) => e.unitCode === m.unitCode) ?? null;
        const differentUnitEntries = others.filter(
          (e) => e.unitCode !== m.unitCode
        );

        // Проверка прямого конфликта
        let directConflict = false;
        let conflictReason: string | undefined
        for (const other of differentUnitEntries) {
                    const otherUnitRoots = await ctx.db
            .select({ studyGroupId: unitRoots.studyGroupId })
            .from(unitRoots)
            .where(
              and(
                eq(unitRoots.unitCode, other.unitCode),
                unitRootsCond
              )
            );
          const otherGroupIds = new Set(
            otherUnitRoots.map((r) => r.studyGroupId)
          );

          let oTeacherId: number | null = null;
          let oClassroomId: number | null = null;
          if (other.lessonId != null) {
            const [otherTeacher, otherClassroom] = await Promise.all([
              ctx.db
                .select({ teacherId: lessons.teacherId })
                .from(lessons)
                .where(and(eq(lessons.id, other.lessonId), lessonsCond))
                .limit(1),
              ctx.db
                .select({ classroomId: lessonClassrooms.classroomId })
                .from(lessonClassrooms)
                .where(
                  and(
                    eq(lessonClassrooms.lessonId, other.lessonId),
                    lcCond
                  )
                )
                .limit(1),
            ]);
            oTeacherId = otherTeacher[0]?.teacherId ?? null;
            oClassroomId = otherClassroom[0]?.classroomId ?? null;
          }
          if ((mTeacherId && oTeacherId && mTeacherId === oTeacherId) ||
              (mClassroomId && oClassroomId && mClassroomId === oClassroomId)) {
            directConflict = true;
            if (mTeacherId && oTeacherId && mTeacherId === oTeacherId) {
              conflictReason = "Преподаватель уже занят в это время";
            } else {
              conflictReason = "Аудитория уже занята в это время";
            }
            break;
          }
          // Проверка общих групп, но исключаем случай двух подгрупп
          const sharedGroups = [...movingGroupIds].filter(g => otherGroupIds.has(g));
          const conflictByGroup = sharedGroups.length > 0;
          // Если есть общие группы, проверим типы юнитов
          if (conflictByGroup) {
            // Определяем типы юнитов для moving и other
            const mUnitType = await getUnitType(m.unitCode, ctx);
            const oUnitType = await getUnitType(other.unitCode, ctx);
            // Конфликт по группам отменяется, только если оба юнита — подгруппы
            
            if (!(mUnitType === 'ПОДГРУППА' && oUnitType === 'ПОДГРУППА')) {
              directConflict = true;
              conflictReason = `Конфликт по группам: ${mUnitType} не может стоять в одно время с ${oUnitType}`;
              break;
            }
          }
        }

        if (directConflict) {
          results[key] = { status: "conflict", reason: conflictReason ?? "Конфликт" };
          continue;
        }

        // Если есть запись того же юнита в слоте
        if (sameUnitEntry) {
          if (m.isBuffered) {
            results[key] = { status: "conflict", reason: "Буферное занятие не может быть обменяно" };
            continue;
          }

          // Данные того же юнита
          let sTeacherId: number | null = null;
          let sClassroomId: number | null = null;
          if (sameUnitEntry.lessonId != null) {
            const [sameTeacher, sameClassroom] = await Promise.all([
              ctx.db
                .select({ teacherId: lessons.teacherId })
                .from(lessons)
                .where(
                  and(eq(lessons.id, sameUnitEntry.lessonId), lessonsCond)
                )
                .limit(1),
              ctx.db
                .select({ classroomId: lessonClassrooms.classroomId })
                .from(lessonClassrooms)
                .where(
                  and(
                    eq(lessonClassrooms.lessonId, sameUnitEntry.lessonId),
                    lcCond
                  )
                )
                .limit(1),
            ]);
            sTeacherId = sameTeacher[0]?.teacherId ?? null;
            sClassroomId = sameClassroom[0]?.classroomId ?? null;
          }

          let mDisc: number | null = null;
          let sDisc: number | null = null;
          if (m.lessonId != null) {
            [mDisc] = (
              await ctx.db
                .select({ disciplineId: lessons.disciplineId })
                .from(lessons)
                .where(and(eq(lessons.id, m.lessonId), lessonsCond))
                .limit(1)
            ).map((r) => r.disciplineId) as number[];
          }
          if (sameUnitEntry.lessonId != null) {
            [sDisc] = (
              await ctx.db
                .select({ disciplineId: lessons.disciplineId })
                .from(lessons)
                .where(
                  and(eq(lessons.id, sameUnitEntry.lessonId), lessonsCond)
                )
                .limit(1)
            ).map((r) => r.disciplineId) as number[];
          }

          // Если полностью идентичны – конфликт
          if (
            mTeacherId === sTeacherId &&
            mClassroomId === sClassroomId &&
            mDisc === sDisc
          ) {
            results[key] = { status: "conflict", reason: "Занятия идентичны – обмен не имеет смысла" };
            continue;
          }

          // Проверка обратного конфликта (при swap)
          if (oldSlot) {
            const oldSlotAll = await ctx.db
              .select()
              .from(scheduleDisplay)
              .where(
                and(
                  eq(scheduleDisplay.weekId, oldSlot.weekId!),
                  eq(scheduleDisplay.dayOfWeekId, oldSlot.dayId!),
                  eq(scheduleDisplay.pairNumberId, oldSlot.pairId!),
                  eq(scheduleDisplay.isBuffered, false),
                  versionCond
                )
              );

            const oldOthers = oldSlotAll.filter(
              (e) => e.id !== input.movingId
            );

            let reverseConflict = false;
            const sameUnitGroups = await ctx.db
              .select({ studyGroupId: unitRoots.studyGroupId })
              .from(unitRoots)
              .where(
                and(
                  eq(unitRoots.unitCode, sameUnitEntry.unitCode),
                  unitRootsCond
                )
              );
            const sameGroupIds = new Set(
              sameUnitGroups.map((r) => r.studyGroupId)
            );

            for (const oldOther of oldOthers) {
              const oldOtherUnitRoots = await ctx.db
                .select({ studyGroupId: unitRoots.studyGroupId })
                .from(unitRoots)
                .where(
                  and(
                    eq(unitRoots.unitCode, oldOther.unitCode),
                    unitRootsCond
                  )
                );
              const oldOtherGroupIds = new Set(
                oldOtherUnitRoots.map((r) => r.studyGroupId)
              );

              let ooTId: number | null = null;
              let ooCId: number | null = null;
              if (oldOther.lessonId != null) {
                const [oldOtherTeacher, oldOtherClassroom] =
                  await Promise.all([
                    ctx.db
                      .select({ teacherId: lessons.teacherId })
                      .from(lessons)
                      .where(
                        and(eq(lessons.id, oldOther.lessonId), lessonsCond)
                      )
                      .limit(1),
                    ctx.db
                      .select({ classroomId: lessonClassrooms.classroomId })
                      .from(lessonClassrooms)
                      .where(
                        and(
                          eq(lessonClassrooms.lessonId, oldOther.lessonId),
                          lcCond
                        )
                      )
                      .limit(1),
                  ]);
                ooTId = oldOtherTeacher[0]?.teacherId ?? null;
                ooCId = oldOtherClassroom[0]?.classroomId ?? null;
              }

              const sharedGroupsOld = [...sameGroupIds].filter(g => oldOtherGroupIds.has(g));
              const conflictByGroupOld = sharedGroupsOld.length > 0;
              if (conflictByGroupOld) {
                const sType = await getUnitType(sameUnitEntry.unitCode, ctx);
                const ooType = await getUnitType(oldOther.unitCode, ctx);
                if (!(sType === 'ПОДГРУППА' && ooType === 'ПОДГРУППА')) {
                  reverseConflict = true;
                  break;
                }
              }
              if (!reverseConflict) {
                if ((sTeacherId && ooTId && sTeacherId === ooTId) ||
                    (sClassroomId && ooCId && sClassroomId === ooCId)) {
                  reverseConflict = true;
                  break;
                }
              }
            }
            results[key] = reverseConflict
              ? { status: "conflict", reason: "Обратный конфликт: занятие обмена не может быть перемещено" }
              : { status: "swap", swapId: sameUnitEntry.id };
          } else {
            results[key] = { status: "conflict" };
          }
        } else {
          results[key] = { status: "free" };
        }
      }

      return results;
    }),

  move: adminProcedure
    .input(
      z.object({
        id: z.number(),
        targetWeekId: z.number().int(),
        targetDayId: z.number().int(),
        targetPairId: z.number().int(),
        targetUnitCode: z.string(),
        versionId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);

      const existing = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(
          and(
            eq(scheduleDisplay.weekId, input.targetWeekId),
            eq(scheduleDisplay.dayOfWeekId, input.targetDayId),
            eq(scheduleDisplay.pairNumberId, input.targetPairId),
            eq(scheduleDisplay.unitCode, input.targetUnitCode),
            eq(scheduleDisplay.isBuffered, false),
            versionCond
          )
        );
      if (existing.length > 0 && existing[0].id !== input.id) throw new TRPCError({ code: 'CONFLICT', message: 'Слот занят' });

      await ctx.db
        .update(scheduleDisplay)
        .set({
          weekId: input.targetWeekId,
          dayOfWeekId: input.targetDayId,
          pairNumberId: input.targetPairId,
          unitCode: input.targetUnitCode,
          positionFlag: false,
          mergeNumber: 0,
        })
        .where(
          and(eq(scheduleDisplay.id, input.id), versionCond)
        );
      return { success: true };
    }),

  swap: adminProcedure
    .input(
      z.object({
        id1: z.number(),
        id2: z.number(),
        versionId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const versionCond = scheduleVersionCondition(input.versionId);

      const rec1 = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.id, input.id1), versionCond))
        .limit(1);
      const rec2 = await ctx.db
        .select()
        .from(scheduleDisplay)
        .where(and(eq(scheduleDisplay.id, input.id2), versionCond))
        .limit(1);

      const r1 = rec1[0] as typeof scheduleDisplay.$inferSelect;
      const r2 = rec2[0] as typeof scheduleDisplay.$inferSelect;

      if (r1.unitCode !== r2.unitCode)
        throw new TRPCError({ code: 'CONFLICT', message: 'Обмен между разными юнитами запрещён' });

      const slot1 = {
        weekId: r1.weekId,
        dayOfWeekId: r1.dayOfWeekId,
        pairNumberId: r1.pairNumberId,
        unitCode: r1.unitCode,
      };
      const slot2 = {
        weekId: r2.weekId,
        dayOfWeekId: r2.dayOfWeekId,
        pairNumberId: r2.pairNumberId,
        unitCode: r2.unitCode,
      };

      await Promise.all([
        ctx.db
          .update(scheduleDisplay)
          .set({ ...slot2, positionFlag: false, mergeNumber: 0 })
          .where(and(eq(scheduleDisplay.id, input.id1), versionCond)),
        ctx.db
          .update(scheduleDisplay)
          .set({ ...slot1, positionFlag: false, mergeNumber: 0 })
          .where(and(eq(scheduleDisplay.id, input.id2), versionCond)),
      ]);
      return { success: true };
    }),

  updateFlags: adminProcedure
    .input(
      z.object({
        id: z.number(),
        mergeNumber: z.number().int().optional(),
        positionFlag: z.boolean().optional(),
        classroomFlag: z.boolean().optional(),
        versionId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, versionId, ...data } = input;
      const versionCond = scheduleVersionCondition(versionId);
      await ctx.db
        .update(scheduleDisplay)
        .set(data)
        .where(and(eq(scheduleDisplay.id, id), versionCond));
      return { success: true };
    }),

  optimizeSchedule: adminProcedure
    .input(z.object({
      versionId: z.number().nullable().optional(),
      includeBuffered: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return await optimizeSchedule(input.versionId, input.includeBuffered);
    }),
    resetFlags: adminProcedure
    .input(
      z.object({
        positionFlag: z.boolean().optional(),
        classroomFlag: z.boolean().optional(),
        mergeNumber: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const setData: Record<string, boolean | number> = {};
      if (input.positionFlag) setData.positionFlag = false;
      if (input.classroomFlag) setData.classroomFlag = false;
      if (input.mergeNumber) setData.mergeNumber = 0;

      if (Object.keys(setData).length === 0) {
        return { success: true };
      }

      await ctx.db
        .update(scheduleDisplay)
        .set(setData)
        .where(
          and(
            eq(scheduleDisplay.isActive, true),
            isNull(scheduleDisplay.versionId),
            eq(scheduleDisplay.isBuffered, false)
          )
        );
      return { success: true };
    }),
});