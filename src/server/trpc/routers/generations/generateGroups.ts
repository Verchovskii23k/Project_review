/**
 * Генерация учебных групп на основе активных студентов, профилей и текущего
 * академического года.
 *
 * Мутация доступна только администратору. Не принимает входных параметров.
 * Определяет текущий курс студентов по разнице между текущим годом и годом
 * поступления, учитывая месяц запуска (август – курс ещё не повышен).
 *
 * ## Важное поведение
 * **Мутация полностью очищает текущие активные сгенерированные данные**:
 * удаляются все активные записи (без `versionId`) из таблиц
 * `schedule_display`, `schedule`, `lesson_classrooms`, `lessons`, `unitRoots`,
 * `units`. Затем **деактивируются** все существующие учебные группы
 * (`isActive = false`), а у всех студентов сбрасываются `studyGroupId` и `course`.
 * Это гарантирует, что после генерации в системе останутся только новые
 * актуальные группы.
 *
 * ## Алгоритм
 * 1. **Очистка** – одной транзакцией удаляются все динамические таблицы и
 *    сбрасываются привязки студентов к группам.
 * 2. **Сбор данных** – из таблицы студентов, через цепочку профилей,
 *    специальностей, кафедр и институтов, собираются агрегированные данные:
 *    количество студентов, массив их ID, `profileId`, `admissionYear`,
 *    `letterCode` профиля и `universityCode` института.
 *    Учитываются только активные записи на всём пути.
 * 3. **Определение текущего курса** – вычисляется на основе разницы между
 *    началом текущего учебного года и годом поступления. Начало учебного года:
 *    с сентября по июль – текущий календарный год; в августе – предыдущий
 *    календарный год (студенты ещё не перешли на следующий курс).
 *    Итоговый курс ограничен диапазоном 1–6.
 * 4. **Формирование кода группы** – строится по шаблону:
 *    `<университетский код><последняя цифра года поступления><буквенный код профиля>`.
 *    Например, для института с кодом `2`, года поступления `2023` и буквы `К`
 *    получится `23К`. Если буквенный код отсутствует, используется `"П"`.
 * 5. **Создание или обновление группы** – если группа с таким кодом уже
 *    существует, она обновляется (профиль, курс, количество студентов,
 *    активируется). Иначе создаётся новая запись в `studyGroups`.
 * 6. **Привязка студентов** – всем студентам, попавшим в агрегацию,
 *    проставляются `studyGroupId` и `course` в соответствии с новой группой.
 *
 * ## Допущения и ограничения
 * - Группа считается уникальной по полю `code`.
 * - Количество студентов в группе (`studentCount`) равно количеству активных
 *   студентов, подпадающих под комбинацию профиля и года поступления.
 * - Если буквенный код профиля не задан, используется заполнитель `"Я"`.
 * - Месяц запуска влияет на расчёт курса: в августе курс ещё не повышен,
 *   с сентября – повышен.
 * - Если после группировки не найдено ни одной записи (нет активных студентов
 *   или нарушены связи), возвращается `{ createdGroups: 0, assignedStudents: 0 }`.
 * - Генерация **не создаёт** новые записи в таблице `students` – только
 *   привязывает существующих.
 *
 * @returns Объект со статистикой:
 *   - `createdGroups` – количество созданных или обновлённых групп.
 *   - `assignedStudents` – суммарное количество студентов, привязанных к группам.
 *
 * @remarks
 * - Генератор групп должен запускаться **перед** генерацией юнитов, занятий
 *   и расписания, так как все последующие шаги зависят от активных групп.
 * - При повторном запуске старые группы деактивируются, но не удаляются
 *   физически – это сохраняет историю для возможного аудита.
 */
import { router, adminProcedure } from "../../trpc";
import {
  students, studyGroups, profiles,
  specialties, departments, institutes,
  unitRoots, lessons, lessonClassrooms, schedule, units,
  scheduleDisplay
} from "@/db/schema";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { assertCleanSlate } from "./helpers";

export const generateGroupsRouter = router({
  generateGroups: adminProcedure.mutation(async ({ ctx }) => {
    await assertCleanSlate(ctx);
    // 1. Удаляем все активные динамические данные
    await ctx.db.transaction(async (tx) => {
      await tx.delete(scheduleDisplay).where(
        and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId))
      );
      await tx.delete(schedule).where(
        and(eq(schedule.isActive, true), isNull(schedule.versionId))
      );
      await tx.delete(lessonClassrooms).where(
        and(isNull(lessonClassrooms.versionId), eq(lessonClassrooms.isActive, true))
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
      // Деактивируем активные группы и открепляем студентов
      await tx.update(studyGroups).set({ isActive: false }).where(eq(studyGroups.isActive, true));
      await tx.update(students).set({ studyGroupId: null, course: null });
    });

    // 2. Формируем новые группы
    const groupsData = await ctx.db
      .select({
        profileId: students.profileId,
        admissionYear: students.admissionYear,
        studentCount: sql<number>`COUNT(*)`.mapWith(Number),
        studentIds: sql<number[]>`ARRAY_AGG(${students.id})`.mapWith(ids => ids as number[]),
        letterCode: profiles.letterCode,
        universityCode: institutes.universityCode,
      })
      .from(students)
      .innerJoin(profiles, eq(students.profileId, profiles.id))
      .innerJoin(specialties, eq(profiles.specialtyId, specialties.id))
      .innerJoin(departments, eq(specialties.departmentId, departments.id))
      .innerJoin(institutes, eq(departments.instituteId, institutes.id))
      .where(
        and(
          eq(students.isActive, true),
          eq(profiles.isActive, true),
          eq(specialties.isActive, true),
          eq(departments.isActive, true),
          eq(institutes.isActive, true)
        )
      )
      .groupBy(
        students.profileId,
        students.admissionYear,
        profiles.letterCode,
        institutes.universityCode
      );

    if (groupsData.length === 0) {
      return { createdGroups: 0, assignedStudents: 0 };
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    let academicYearStart: number;
    if (month >= 9) {
      academicYearStart = currentYear;
    } else if (month === 8) {
      academicYearStart = currentYear - 1;
    } else {
      academicYearStart = currentYear - 1;
    }

    let createdGroups = 0;

    await ctx.db.transaction(async (tx) => {
      for (const g of groupsData) {
        const { profileId, admissionYear, studentCount, studentIds, letterCode, universityCode } = g;

        let course = academicYearStart - admissionYear + 1;
        if (month === 8) {
          course = academicYearStart - admissionYear;
        }
        course = Math.max(1, Math.min(6, course));

        const lastDigit = admissionYear % 10;
        const code = `${universityCode}${lastDigit}${letterCode || "Я"}`;

        const [existing] = await tx.select({ id: studyGroups.id }).from(studyGroups).where(eq(studyGroups.code, code)).limit(1);
        let groupId: number;
        if (existing) {
          await tx.update(studyGroups)
            .set({ profileId, course, studentCount, isActive: true })
            .where(eq(studyGroups.id, existing.id));
          groupId = existing.id;
        } else {
          const [inserted] = await tx.insert(studyGroups).values({ code, profileId, course, studentCount, isActive: true }).returning({ id: studyGroups.id });
          groupId = inserted.id;
        }

        if (studentIds.length > 0) {
          await tx.update(students).set({ studyGroupId: groupId, course }).where(inArray(students.id, studentIds));
        }

        createdGroups++;
      }
    });

    const assignedStudents = groupsData.reduce((sum, g) => sum + g.studentCount, 0);
    return { createdGroups, assignedStudents };
  }),
});