/**
 * Генерация юнитов (групп, подгрупп, потоков) на основе активных учебных групп
 * и учебных планов с лекциями.
 *
 * Мутация доступна только администратору. Не принимает входных параметров,
 * текущий семестр определяется из таблицы `settings` (ключ `current_semester`).
 *
 * ## Важное поведение
 * **Мутация полностью очищает текущие активные сгенерированные данные**:
 * в одной транзакции удаляются все активные записи (без `versionId`) из таблиц
 * `schedule_display`, `schedule`, `lesson_classrooms`, `lessons`, `unitRoots` и `units`.
 * Это гарантирует чистоту последующих шагов генерации, но **старое расписание не сохраняется**.
 *
 * ## Алгоритм (кратко)
 * 1. **Загрузка типов юнитов** – ищутся записи с именами `ГРУППА`, `ПОДГРУППА`, `ПОТОК`.
 *    Если какой-либо из типов отсутствует, выбрасывается ошибка.
 * 2. **Создание юнитов-групп** – для каждой активной учебной группы:
 *    - Если активного юнита с кодом, равным коду группы, ещё нет, он создаётся с типом `ГРУППА`.
 *    - Создаётся (или проверяется существующая) связь `unitRoots` между юнитом и группой.
 * 3. **Создание юнитов-подгрупп** – если число студентов в группе превышает
 *    `maxSize` типа `ПОДГРУППА`, создаются подгруппы с кодами вида `<код группы>1`, `<код группы>2` …
 *    Для каждой подгруппы также создаётся связь `unitRoots`.
 * 4. **Создание юнитов-потоков** – на основе учебных планов с лекциями
 *    (`hoursLecture > 0`) для текущего семестра:
 *    - Группируются записи по комбинации `(disciplineId, course, semester, hoursLecture)`.
 *    - Если такая комбинация обслуживает **два и более профиля**, формируется поток.
 *    - Код потока строится как `<первая буква кода группы><вторая цифра кода группы><объединённые letterCodes профилей>`.
 *      (Например, для профилей с кодами "А" и "Б" и первой группы "21..." получится "21АБ").
 *    - Создаётся юнит с типом `ПОТОК` и связи `unitRoots` со всеми группами, входящими в поток.
 *    - Дублирующиеся комбинации профилей игнорируются (защита от повторного создания одинаковых потоков).
 *
 * ## Допущения и ограничения
 * - Мутация **полностью очищает** активные юниты и связи перед созданием; старые данные не сохраняются.
 * - Используются только **активные** сущности (`isActive = true`) без привязки к версии (`versionId IS NULL`).
 * - Потоки создаются **только для лекционных часов** (hoursLecture > 0).
 * - Для формирования потока необходимо минимум два профиля с одинаковой дисциплиной, курсом и семестром.
 * - Код потока чувствителен к структуре кода первой группы (первая буква – институт, вторая цифра – год набора).
 * - Подгруппы делятся равномерно, не учитывая индивидуальные особенности.
 * - Связи создаются для всех активных групп, даже если у них нет студентов (но тогда подгруппы не создаются).
 * - Проверки на существование юнита/связи перед вставкой оставлены для предотвращения дублирования в случае,
 *   если транзакция очистки по какой-то причине не затронула все записи.
 *
 * @returns Объект со статистикой созданного:
 *   - `createdUnits` – общее количество созданных юнитов (группы + подгруппы + потоки).
 *   - `groups` – количество созданных юнитов-групп.
 *   - `subgroups` – количество созданных юнитов-подгрупп.
 *   - `streams` – количество созданных юнитов-потоков.
 *   - `connections` – количество созданных связей `unitRoots`.
 *
 * @throws {TRPCError} с кодом `BAD_REQUEST`, если:
 *   - не найдены все три типа юнитов (ГРУППА, ПОДГРУППА, ПОТОК);
 *   - нет активных учебных групп (не выполнена генерация групп).
 */
import { router, adminProcedure } from "../../trpc";
import {
  units, unitTypes, unitRoots,
  studyGroups, profiles, settings,
  curriculum, curriculumProfiles,
  lessons, lessonClassrooms, schedule,
  scheduleDisplay,
} from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { assertCleanSlate } from "./helpers";

export const generateUnitsRouter = router({
  generateUnits: adminProcedure.mutation(async ({ ctx }) => {
    await assertCleanSlate(ctx);
    // 1. Удаляем только активные записи во всех динамических таблицах
    await ctx.db.transaction(async (tx) => {
      await tx.delete(scheduleDisplay).where(
        and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId))
      );
      await tx.delete(schedule).where(
        and(eq(schedule.isActive, true), isNull(schedule.versionId))
      );
      await tx.delete(lessonClassrooms).where(
        and(eq(lessonClassrooms.isActive, true), isNull(lessonClassrooms.versionId))
      );
      await tx.delete(lessons).where(
        and(eq(lessons.isActive, true), isNull(lessons.versionId))
      );
      await tx.delete(unitRoots).where(
        and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId))
      );
      await tx.delete(units).where(
        and(eq(units.isActive, true), isNull(units.versionId))
      );
    });

    const [unitTypeGroup] = await ctx.db
      .select()
      .from(unitTypes)
      .where(eq(unitTypes.name, "ГРУППА"))
      .limit(1);
    const [unitTypeSubgroup] = await ctx.db
      .select()
      .from(unitTypes)
      .where(eq(unitTypes.name, "ПОДГРУППА"))
      .limit(1);
    const [unitTypeStream] = await ctx.db
      .select()
      .from(unitTypes)
      .where(eq(unitTypes.name, "ПОТОК"))
      .limit(1);

    if (!unitTypeGroup || !unitTypeSubgroup || !unitTypeStream) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Не все типы юнитов (ГРУППА, ПОДГРУППА, ПОТОК) найдены. Проверьте справочник типов юнитов' });
    }

    const maxSubgroupSize = unitTypeSubgroup.maxSize;

    // Берём только активные группы
    const groups = await ctx.db
      .select()
      .from(studyGroups)
      .where(eq(studyGroups.isActive, true));
        if (groups.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нет активных учебных групп. Сначала выполните генерацию групп' });

    const profileCourseToGroup = new Map<number, Map<number, typeof groups[0]>>();
    for (const g of groups) {
      if (!profileCourseToGroup.has(g.profileId)) profileCourseToGroup.set(g.profileId, new Map());
      profileCourseToGroup.get(g.profileId)!.set(g.course, g);
    }

    const counters = { groups: 0, subgroups: 0, streams: 0, connections: 0 };

    for (const group of groups) {
      const unitCode = group.code;
      // Ищем активный юнит с таким кодом (не архивный)
      let [existingUnit] = await ctx.db
        .select({ id: units.id })
        .from(units)
        .where(and(
          eq(units.code, unitCode),
          eq(units.isActive, true),
          isNull(units.versionId)
        ))
        .limit(1);
      if (!existingUnit) {
        const [inserted] = await ctx.db.insert(units).values({
          code: unitCode,
          unitTypeId: unitTypeGroup.id,
          isActive: true,
        }).returning({ id: units.id });
        existingUnit = inserted;
        counters.groups++;
      }

      // Проверяем наличие активной связи
      const [rootExist] = await ctx.db
        .select()
        .from(unitRoots)
        .where(and(
          eq(unitRoots.unitCode, unitCode),
          eq(unitRoots.studyGroupId, group.id),
          eq(unitRoots.isActive, true),
          isNull(unitRoots.versionId)
        ))
        .limit(1);
      if (!rootExist) {
        await ctx.db.insert(unitRoots).values({
          unitCode,
          studyGroupId: group.id,
          isActive: true,
        });
        counters.connections++;
      }

      const size = group.studentCount ?? 0;
      if (size > maxSubgroupSize) {
        const numSubgroups = Math.ceil(size / maxSubgroupSize);
        for (let i = 1; i <= numSubgroups; i++) {
          const subCode = `${unitCode}${i}`;
          let [existingSub] = await ctx.db
            .select({ id: units.id })
            .from(units)
            .where(and(
              eq(units.code, subCode),
              eq(units.isActive, true),
              isNull(units.versionId)
            ))
            .limit(1);
          if (!existingSub) {
            const [inserted] = await ctx.db.insert(units).values({
              code: subCode,
              unitTypeId: unitTypeSubgroup.id,
              isActive: true,
            }).returning({ id: units.id });
            existingSub = inserted;
            counters.subgroups++;
          }
          const [subRootExist] = await ctx.db
            .select()
            .from(unitRoots)
            .where(and(
              eq(unitRoots.unitCode, subCode),
              eq(unitRoots.studyGroupId, group.id),
              eq(unitRoots.isActive, true),
              isNull(unitRoots.versionId)
            ))
            .limit(1);
          if (!subRootExist) {
            await ctx.db.insert(unitRoots).values({
              unitCode: subCode,
              studyGroupId: group.id,
              isActive: true,
            });
            counters.connections++;
          }
        }
      }
    }

    // Получаем текущий семестр из настроек
    const [semesterSetting] = await ctx.db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "current_semester"))
      .limit(1);
    const currentSemester = semesterSetting ? parseInt(semesterSetting.value, 10) : 1;

    const planRows = await ctx.db
      .select({
        disciplineId: curriculum.disciplineId,
        course: curriculum.course,
        semester: curriculum.semester,
        hoursLecture: curriculum.hoursLecture,
        profileId: curriculumProfiles.profileId,
      })
      .from(curriculum)
      .innerJoin(curriculumProfiles, eq(curriculum.id, curriculumProfiles.curriculumId))
      .innerJoin(profiles, eq(curriculumProfiles.profileId, profiles.id))
      .where(
        and(
          eq(curriculum.isActive, true),
          eq(profiles.isActive, true),
          eq(curriculum.semester, currentSemester),
          sql`${curriculum.hoursLecture} > 0`
        )
      );

    const streamMap = new Map<string, { course: number; profileIds: Set<number> }>();
    for (const row of planRows) {
      const key = `${row.disciplineId}_${row.course}_${row.semester}_${row.hoursLecture}`;
      if (!streamMap.has(key)) streamMap.set(key, { course: row.course, profileIds: new Set() });
      streamMap.get(key)!.profileIds.add(row.profileId);
    }

    const createdCombinations = new Set<string>();

    for (const [, { course, profileIds }] of streamMap) {
      if (profileIds.size < 2) continue;
      const profArray = Array.from(profileIds).sort((a, b) => a - b);
      const tupleKey = profArray.join(",");
      if (createdCombinations.has(tupleKey)) continue;

      const pData = await ctx.db
        .select({ letterCode: profiles.letterCode })
        .from(profiles)
        .where(
          and(
            inArray(profiles.id, profArray),
            eq(profiles.isActive, true)
          )
        )
        .orderBy(profiles.letterCode);
      const codes = pData.map(p => p.letterCode).join("");

      const firstProf = profArray[0];
      const groupForCourse = profileCourseToGroup.get(firstProf)?.get(course);
      if (!groupForCourse) continue;

      const groupCode = groupForCourse.code;
      const instituteCode = groupCode[0];
      const yearDigit = groupCode[1];
      const streamCode = `${instituteCode}${yearDigit}${codes}`;

      // Ищем активный поток
      let [existingStream] = await ctx.db
        .select({ id: units.id })
        .from(units)
        .where(and(
          eq(units.code, streamCode),
          eq(units.isActive, true),
          isNull(units.versionId)
        ))
        .limit(1);
      if (!existingStream) {
        const [inserted] = await ctx.db.insert(units).values({
          code: streamCode,
          unitTypeId: unitTypeStream.id,
          isActive: true,
        }).returning({ id: units.id });
        existingStream = inserted;
        counters.streams++;
      }

      for (const profId of profArray) {
        const g = profileCourseToGroup.get(profId)?.get(course);
        if (!g) continue;
        const [root] = await ctx.db
          .select()
          .from(unitRoots)
          .where(and(
            eq(unitRoots.unitCode, streamCode),
            eq(unitRoots.studyGroupId, g.id),
            eq(unitRoots.isActive, true),
            isNull(unitRoots.versionId)
          ))
          .limit(1);
        if (!root) {
          await ctx.db.insert(unitRoots).values({
            unitCode: streamCode,
            studyGroupId: g.id,
            isActive: true,
          });
          counters.connections++;
        }
      }
      createdCombinations.add(tupleKey);
    }

    return {
      createdUnits: counters.groups + counters.subgroups + counters.streams,
      groups: counters.groups,
      subgroups: counters.subgroups,
      streams: counters.streams,
      connections: counters.connections,
    };
  }),
});