/**
 * Роутер для управления версиями расписания.
 *
 * Все процедуры доступны только администратору (`adminProcedure`).
 * Оперирует динамическими таблицами: `scheduleDisplay`, `schedule`,
 * `lessonClassrooms`, `lessons`, `unitRoots`, `units`.
 *
 * ## Модель версионирования
 * - **Активная версия** — записи с `isActive = true` и `versionId IS NULL`.
 * - **Архивная версия** — записи с `isActive = false` и `versionId = ID версии`.
 * - Архивные записи **никогда не изменяются** после создания.
 * - При активации версии её архивные данные **копируются** в новые активные строки
 *   с перепривязкой внешних ключей.
 * - При переключении на другую версию или чистый лист активные записи **удаляются**.
 * - Операция переключения выполняется в транзакции для предотвращения гонок.
 *
 * ## Процедуры
 * - `list` — список всех сохранённых версий.
 * - `switchToVersion` — переключает активное расписание на указанную версию или «чистый лист».
 * - `saveActive` — создать новую версию из текущего активного расписания.
 * - `delete` — удалить версию и все её данные.
 * - `update` — переименовать версию.
 */
import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  scheduleVersions,
  units,
  unitRoots,
  lessons,
  lessonClassrooms,
  schedule,
  scheduleDisplay,
} from "@/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const scheduleVersionsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(scheduleVersions).orderBy(scheduleVersions.createdAt);
  }),

  /**
   * Переключает активное расписание.
   * - `targetVersionId === null` — активируется «чистый лист» (все активные записи удаляются).
   * - `targetVersionId !== null` — активируется указанная версия.
   *
   * Архив версий **не изменяется**.
   * При активации версии её архивные данные **копируются** в новые активные строки
   * с корректной перепривязкой внешних ключей.
   * Операция выполняется в транзакции для предотвращения гонок при быстрых переключениях.
   */
  switchToVersion: adminProcedure
    .input(z.object({
      currentVersionId: z.number().nullable(),
      targetVersionId: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { targetVersionId } = input;

      await ctx.db.transaction(async (tx) => {
        // 1. Удаляем все текущие активные записи (чистый лист)
        await tx.delete(scheduleDisplay).where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
        await tx.delete(schedule).where(and(eq(schedule.isActive, true), isNull(schedule.versionId)));
        await tx.delete(lessonClassrooms).where(and(eq(lessonClassrooms.isActive, true), isNull(lessonClassrooms.versionId)));
        await tx.delete(lessons).where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
        await tx.delete(unitRoots).where(and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));
        await tx.delete(units).where(and(eq(units.isActive, true), isNull(units.versionId)));

        if (targetVersionId !== null) {
          const [version] = await tx.select().from(scheduleVersions).where(eq(scheduleVersions.id, targetVersionId));
          if (!version) throw new TRPCError({ code: "NOT_FOUND" });

          // Маппинг старых архивных ID → новые активные ID
          const unitIdMap = new Map<number, number>();
          const lessonIdMap = new Map<number, number>();

          // 2. Копируем units
          const archivedUnits = await tx.select().from(units).where(and(eq(units.versionId, targetVersionId), eq(units.isActive, false)));
          for (const row of archivedUnits) {
            const { id, ...rest } = row;
            const [inserted] = await tx.insert(units).values({ ...rest, isActive: true, versionId: null }).returning({ id: units.id });
            unitIdMap.set(id, inserted.id);
          }

          // 3. Копируем unitRoots (внешние ключи не требуют перепривязки)
          const archivedUnitRoots = await tx.select().from(unitRoots).where(and(eq(unitRoots.versionId, targetVersionId), eq(unitRoots.isActive, false)));
          if (archivedUnitRoots.length > 0) {
            await tx.insert(unitRoots).values(
              archivedUnitRoots.map(({ id, ...rest }) => ({ ...rest, isActive: true, versionId: null }))
            );
          }

          // 4. Копируем lessons (перепривязываем unitId)
          const archivedLessons = await tx.select().from(lessons).where(and(eq(lessons.versionId, targetVersionId), eq(lessons.isActive, false)));
          for (const row of archivedLessons) {
            const { id, ...rest } = row;
            const newUnitId = rest.unitId ? (unitIdMap.get(rest.unitId) ?? rest.unitId) : rest.unitId;
            const [inserted] = await tx.insert(lessons).values({ ...rest, unitId: newUnitId, isActive: true, versionId: null }).returning({ id: lessons.id });
            lessonIdMap.set(id, inserted.id);
          }

          // 5. Копируем lessonClassrooms (перепривязываем lessonId, дедуплицируем)
          const archivedLC = await tx.select().from(lessonClassrooms).where(and(eq(lessonClassrooms.versionId, targetVersionId), eq(lessonClassrooms.isActive, false)));
          if (archivedLC.length > 0) {
            const unique = Array.from(
              new Map(
                archivedLC.map(row => {
                  const newLessonId = row.lessonId ? (lessonIdMap.get(row.lessonId) ?? row.lessonId) : row.lessonId;
                  return [`${newLessonId}_${row.classroomId}`, { lessonId: newLessonId, classroomId: row.classroomId, isActive: true, versionId: null }];
                })
              ).values()
            );
            if (unique.length > 0) {
              await tx.insert(lessonClassrooms).values(unique).onConflictDoNothing();
            }
          }

          // 6. Копируем schedule (перепривязываем lessonId)
          const archivedSchedule = await tx.select().from(schedule).where(and(eq(schedule.versionId, targetVersionId), eq(schedule.isActive, false)));
          if (archivedSchedule.length > 0) {
            await tx.insert(schedule).values(
              archivedSchedule.map(({ id, ...rest }) => ({
                ...rest,
                lessonId: rest.lessonId ? (lessonIdMap.get(rest.lessonId) ?? rest.lessonId) : rest.lessonId,
                isActive: true,
                versionId: null,
              }))
            );
          }

          // 7. Копируем scheduleDisplay (перепривязываем lessonId)
          const archivedSD = await tx.select().from(scheduleDisplay).where(and(eq(scheduleDisplay.versionId, targetVersionId), eq(scheduleDisplay.isActive, false)));
          if (archivedSD.length > 0) {
            await tx.insert(scheduleDisplay).values(
              archivedSD.map(({ id, ...rest }) => ({
                ...rest,
                lessonId: rest.lessonId ? (lessonIdMap.get(rest.lessonId) ?? rest.lessonId) : rest.lessonId,
                isActive: true,
                versionId: null,
              }))
            );
          }
        }
      });

      return { success: true };
    }),

  /**
   * Сохраняет текущее активное расписание как новую версию с заданным именем.
   *
   * - Проверяет уникальность имени (при совпадении выбрасывает CONFLICT).
   * - Копирует все активные записи из динамических таблиц в архив с `isActive = false`
   *   и `versionId` новой версии.
   * - **Копия полностью независима**: перепривязываются внешние ключи, чтобы удаление
   *   одной версии не затрагивало данные другой.
   * - Таблица `lessonClassrooms` также копируется (с дедупликацией).
   * - Исходные активные записи (оригинальная версия) остаются без изменений.
   *
   * @param name - название новой версии (уникальное).
   * @returns ID созданной версии.
   * @throws TRPCError CONFLICT – если версия с таким именем уже существует.
   */
  saveActive: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [existingName] = await ctx.db
        .select({ id: scheduleVersions.id })
        .from(scheduleVersions)
        .where(eq(scheduleVersions.name, input.name))
        .limit(1);
      if (existingName) throw new TRPCError({ code: "CONFLICT", message: `Версия с названием «${input.name}» уже существует` });

      const [newVersion] = await ctx.db.insert(scheduleVersions).values({ name: input.name }).returning({ id: scheduleVersions.id });
      const versionId = newVersion.id;

      // Маппинг старых активных ID → новые архивные ID
      const unitIdMap = new Map<number, number>();
      const lessonIdMap = new Map<number, number>();

      // 1. Копируем units
      const activeUnits = await ctx.db.select().from(units).where(and(eq(units.isActive, true), isNull(units.versionId)));
      for (const row of activeUnits) {
        const { id, ...rest } = row;
        const [inserted] = await ctx.db.insert(units).values({ ...rest, isActive: false, versionId }).returning({ id: units.id });
        unitIdMap.set(id, inserted.id);
      }

      // 2. Копируем unitRoots
      const activeUnitRoots = await ctx.db.select().from(unitRoots).where(and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));
      if (activeUnitRoots.length > 0) {
        await ctx.db.insert(unitRoots).values(
          activeUnitRoots.map(({ id, ...rest }) => ({ ...rest, isActive: false, versionId }))
        );
      }

      // 3. Копируем lessons (перепривязываем unitId)
      const activeLessons = await ctx.db.select().from(lessons).where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
      for (const row of activeLessons) {
        const { id, ...rest } = row;
        const newUnitId = rest.unitId ? (unitIdMap.get(rest.unitId) ?? rest.unitId) : rest.unitId;
        const [inserted] = await ctx.db.insert(lessons).values({ ...rest, unitId: newUnitId, isActive: false, versionId }).returning({ id: lessons.id });
        lessonIdMap.set(id, inserted.id);
      }

      // 4. Копируем lessonClassrooms (перепривязываем lessonId, дедуплицируем)
      const activeLC = await ctx.db.select().from(lessonClassrooms).where(and(eq(lessonClassrooms.isActive, true), isNull(lessonClassrooms.versionId)));
      if (activeLC.length > 0) {
        const unique = Array.from(
          new Map(
            activeLC.map(row => {
              const newLessonId = row.lessonId ? (lessonIdMap.get(row.lessonId) ?? row.lessonId) : row.lessonId;
              return [`${newLessonId}_${row.classroomId}`, { lessonId: newLessonId, classroomId: row.classroomId, isActive: false, versionId }];
            })
          ).values()
        );
        if (unique.length > 0) {
          await ctx.db.insert(lessonClassrooms).values(unique).onConflictDoNothing();
        }
      }

      // 5. Копируем schedule (перепривязываем lessonId)
      const activeSchedule = await ctx.db.select().from(schedule).where(and(eq(schedule.isActive, true), isNull(schedule.versionId)));
      if (activeSchedule.length > 0) {
        await ctx.db.insert(schedule).values(
          activeSchedule.map(({ id, ...rest }) => ({
            ...rest,
            lessonId: rest.lessonId ? (lessonIdMap.get(rest.lessonId) ?? rest.lessonId) : rest.lessonId,
            isActive: false,
            versionId,
          }))
        );
      }

      // 6. Копируем scheduleDisplay (перепривязываем lessonId)
      const activeSD = await ctx.db.select().from(scheduleDisplay).where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
      if (activeSD.length > 0) {
        await ctx.db.insert(scheduleDisplay).values(
          activeSD.map(({ id, ...rest }) => ({
            ...rest,
            lessonId: rest.lessonId ? (lessonIdMap.get(rest.lessonId) ?? rest.lessonId) : rest.lessonId,
            isActive: false,
            versionId,
          }))
        );
      }

      return { versionId };
    }),

  /**
   * Удаляет версию и все её данные из динамических таблиц.
   * Может удалять как архивные, так и активную версию (предварительно деактивированную).
   */
  delete: adminProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { versionId } = input;
      // Удаляем из всех динамических таблиц записи с указанным versionId
      await ctx.db.delete(scheduleDisplay).where(eq(scheduleDisplay.versionId, versionId));
      await ctx.db.delete(schedule).where(eq(schedule.versionId, versionId));
      await ctx.db.delete(lessonClassrooms).where(eq(lessonClassrooms.versionId, versionId));
      await ctx.db.delete(lessons).where(eq(lessons.versionId, versionId));
      await ctx.db.delete(unitRoots).where(eq(unitRoots.versionId, versionId));
      await ctx.db.delete(units).where(eq(units.versionId, versionId));
      // Удаляем саму версию
      await ctx.db.delete(scheduleVersions).where(eq(scheduleVersions.id, versionId));
      return { success: true };
    }),

  /**
   * Обновляет имя существующей версии.
   */
  update: adminProcedure
    .input(z.object({ versionId: z.number(), name: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.name) {
        const conflict = await ctx.db
          .select({ id: scheduleVersions.id })
          .from(scheduleVersions)
          .where(and(eq(scheduleVersions.name, input.name), ne(scheduleVersions.id, input.versionId)))
          .limit(1);
        if (conflict.length > 0) throw new TRPCError({ code: "CONFLICT", message: `Версия с названием «${input.name}» уже существует` });
        await ctx.db
          .update(scheduleVersions)
          .set({ name: input.name, createdAt: new Date() })
          .where(eq(scheduleVersions.id, input.versionId));
      }
      return { success: true };
    }),
});