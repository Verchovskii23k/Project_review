import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import {
  studyGroups, students, settings,
  unitTypes, disciplines, curriculum, units, unitRoots,
  curriculumProfiles,
  lessonTypes,
  employees,
  hourTypeMapping,
  employeesDepartments,
  disciplineTeachers,
  lessons,
  buildings,
  classrooms,
  lessonClassrooms,
  weeks,
  pairs,
  daysOfWeek,
  scheduleDisplay,
} from "@/db/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { createTestCaller } from "@/test/trpc";
import { clearAllTestData, createTestInstitute, createTestDepartment, createTestSpecialty, createTestProfile, createTestEducation } from "@/test/helpers";

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let deptId: number;
let profId: number;

// Инициализация перед КАЖДЫМ тестом – полная изоляция
beforeEach(async () => {
  await clearAllTestData();

  // 1. Институт с universityCode = 1
  const instId = await createTestInstitute({ universityCode: 1 });

  // 2. Кафедра
  deptId = await createTestDepartment(instId);

  // 3. Специальность
  const specId = await createTestSpecialty(deptId, { code: "09.03.01" });
  // 4. Создаём образование (уровень и форма обучения) через хелпер
  const eduId = await createTestEducation();

  // 5. Профиль с буквенным кодом 'м'
  profId = await createTestProfile(specId, eduId, { letterCode: "м" });

  // 5. Активные студенты (3 человека) – базовый набор
  await db.insert(students).values([
    { surname: "Иванов", name: "Иван", admissionYear: 2023, profileId: profId, isActive: true },
    { surname: "Петров", name: "Петр", admissionYear: 2023, profileId: profId, isActive: true },
    { surname: "Сидорова", name: "Анна", admissionYear: 2023, profileId: profId, isActive: true },
  ]);

  // 6. Настройки
  await db.insert(settings).values({ key: "current_semester", value: "1" });

  // 7. Типы юнитов
  await db.insert(unitTypes).values([
    { name: "ГРУППА", maxSize: 32, priorityLecture: 2, priorityWorkshop: 1, priorityGuidedStudy: 1, priorityLab: 2 },
    { name: "ПОДГРУППА", maxSize: 16, priorityLecture: 3, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 1 },
    { name: "ПОТОК", maxSize: 128, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3 },
  ]);

  // 8. Дисциплина и учебный план
  const [disc] = await db.insert(disciplines).values({
    name: "Тестовая дисциплина",
    abbreviation: "ТД",
    departmentId: deptId,
    isActive: true,
  }).returning({ id: disciplines.id });

  const [cur] = await db.insert(curriculum).values({
    course: 3,
    semester: 1,
    disciplineId: disc.id,
    hoursLecture: 32,
    hoursGuidedStudy: 0,
    hoursWorkshop: 0,
    hoursLab: 0,
    isActive: true,
  }).returning({ id: curriculum.id });

  await db.insert(curriculumProfiles).values({
    curriculumId: cur.id,
    profileId: profId,
    isActive: true,
  });

  // 9. Типы занятий
  const [lecture, workshop, guidedStudy, lab] = await db.insert(lessonTypes).values([
    { name: "lecture", abbreviation: "ЛК", isActive: true },
    { name: "workshop", abbreviation: "ПР", isActive: true },
    { name: "guidedStudy", abbreviation: "КСР", isActive: true },
    { name: "lab", abbreviation: "ЛАБ", isActive: true },
  ]).returning({ id: lessonTypes.id });

  // 10. Маппинг часов
  await db.insert(hourTypeMapping).values([
    { planHourColumn: "hours_lecture", priorityColumn: "priorityLecture", lessonTypeId: lecture.id, isActive: true },
    { planHourColumn: "hours_workshop", priorityColumn: "priorityWorkshop", lessonTypeId: workshop.id, isActive: true },
    { planHourColumn: "hours_guided_study", priorityColumn: "priorityGuidedStudy", lessonTypeId: guidedStudy.id, isActive: true },
    { planHourColumn: "hours_lab", priorityColumn: "priorityLab", lessonTypeId: lab.id, isActive: true },
  ]);

  // 11. Преподаватель
  const [emp] = await db.insert(employees).values({
    surname: "Преподаватель",
    name: "Тест",
    patronymic: "Тестович",
    isActive: true,
  }).returning({ id: employees.id });

  const [empDept] = await db.insert(employeesDepartments).values({
    employeeId: emp.id,
    departmentId: deptId,
    isActive: true,
  }).returning({ id: employeesDepartments.id });

  // 12. Связки преподаватель-дисциплина для всех типов занятий
  for (const ltId of [lecture.id, workshop.id, guidedStudy.id, lab.id]) {
    await db.insert(disciplineTeachers).values({
      lessonTypeId: ltId,
      disciplineId: disc.id,
      teacherDepartmentId: empDept.id,
      isActive: true,
    });
  }

  // 13. Аудитории
  const [bld] = await db.insert(buildings).values({ number: 1, isActive: true }).returning({ id: buildings.id });
  await db.insert(classrooms).values([
    { buildingId: bld.id, roomNumber: "101", capacity: 60, priorityLecture: 1, priorityWorkshop: 2, priorityGuidedStudy: 3, priorityLab: 3, isActive: true },
    { buildingId: bld.id, roomNumber: "102", capacity: 30, priorityLecture: 2, priorityWorkshop: 1, priorityGuidedStudy: 2, priorityLab: 2, isActive: true },
    { buildingId: bld.id, roomNumber: "103", capacity: 15, priorityLecture: 3, priorityWorkshop: 3, priorityGuidedStudy: 1, priorityLab: 1, isActive: true },
  ]);

  // 14. Дни недели, пары, недели
  await db.insert(daysOfWeek).values(
    ["ПН","ВТ","СР","ЧТ","ПТ","СБ"].map(name => ({ name, isActive: true }))
  );
  await db.insert(pairs).values([1,2,3,4,5].map(number => ({ number, isActive: true })));
  await db.insert(weeks).values([{ type: "odd", isActive: true }, { type: "even", isActive: true }]);

  // 15. Создаём caller для каждого теста
  caller = await createTestCaller({ id: 1, role: "admin" });
});

// ------------------- Тесты -------------------
describe("generateGroups logic", () => {
  it("создаёт активные группы и привязывает студентов", async () => {
    const result = await caller.generations.generateGroups();
    expect(result.createdGroups).toBeGreaterThan(0);
    expect(result.assignedStudents).toBeGreaterThan(0);

    const groups = await db.select().from(studyGroups).where(eq(studyGroups.isActive, true));
    expect(groups.length).toBe(1);
    expect(groups[0].code).toBe("13м");

    const assigned = await db.select().from(students).where(eq(students.studyGroupId, groups[0].id));
    expect(assigned.length).toBe(3);
  });

  it("при повторном запуске не создаёт дубликаты групп", async () => {
    await caller.generations.generateGroups();
    const cntBefore = (await db.select({ cnt: count() }).from(studyGroups).where(eq(studyGroups.isActive, true)))[0]?.cnt ?? 0;
    await caller.generations.generateGroups();
    const cntAfter = (await db.select({ cnt: count() }).from(studyGroups).where(eq(studyGroups.isActive, true)))[0]?.cnt ?? 0;
    expect(cntAfter).toBe(cntBefore);
  });

  it("возвращает 0 групп, если нет активных студентов", async () => {
    // Деактивируем всех студентов
    await db.update(students).set({ isActive: false });
    const result = await caller.generations.generateGroups();
    expect(result.createdGroups).toBe(0);
    expect(result.assignedStudents).toBe(0);

    const activeGroups = await db.select().from(studyGroups).where(eq(studyGroups.isActive, true));
    expect(activeGroups.length).toBe(0);
  });
});

describe("generateUnits logic", () => {
  it("создаёт юниты и связи unitRoots", async () => {
    await caller.generations.generateGroups();
    const result = await caller.generations.generateUnits();
    expect(result.createdUnits).toBeGreaterThan(0);
    expect(result.groups).toBeGreaterThan(0);

    const activeUnits = await db.select().from(units).where(and(eq(units.isActive, true), isNull(units.versionId)));
    expect(activeUnits.length).toBe(result.createdUnits);

    for (const unit of activeUnits) {
      const roots = await db.select().from(unitRoots).where(and(eq(unitRoots.unitCode, unit.code), eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));
      expect(roots.length).toBeGreaterThan(0);
    }

    const allRoots = await db.select().from(unitRoots).where(and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));
    const activeGroupIds = (await db.select({ id: studyGroups.id }).from(studyGroups).where(eq(studyGroups.isActive, true))).map(g => g.id);
    for (const root of allRoots) {
      expect(activeGroupIds).toContain(root.studyGroupId);
    }
  });

  it("выбрасывает ошибку, если нет активных учебных групп", async () => {
    // Деактивируем группы (групп пока нет, сгенерируем и сразу деактивируем)
    await caller.generations.generateGroups();
    await db.update(studyGroups).set({ isActive: false });
    await expect(caller.generations.generateUnits()).rejects.toThrow('Нет активных учебных групп');
  });

  it("создаёт подгруппы, если размер группы превышает maxSize подгруппы", async () => {
    // Добавляем 20 новых студентов (активных) – вместе с 3 из beforeEach будет 23
    for (let i = 0; i < 20; i++) {
      await db.insert(students).values({
        surname: `Студент${i}`,
        name: `Имя${i}`,
        admissionYear: 2023,
        profileId: profId,
        isActive: true,
      });
    }
    await caller.generations.generateGroups();
    const result = await caller.generations.generateUnits();
    expect(result.subgroups).toBeGreaterThan(0);

    const subgroupUnits = await db.select().from(units).where(and(eq(units.isActive, true), isNull(units.versionId), eq(units.unitTypeId, 2)));
    expect(subgroupUnits.length).toBeGreaterThan(0);
  });
});

describe("generateLessons logic", () => {
  it("создаёт занятия и назначает преподавателей", async () => {
    await caller.generations.generateGroups();
    await caller.generations.generateUnits();

    const result = await caller.generations.generateLessons();
    const lessonsCreated = Number(result.lessonsCreated);
    expect(lessonsCreated).toBeGreaterThan(0);

    const activeLessons = await db.select().from(lessons).where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
    expect(activeLessons.length).toBe(lessonsCreated);
    for (const lesson of activeLessons) {
      expect(lesson.teacherId).not.toBeNull();
    }

    expect(Number(result.uniqueTeachers)).toBeGreaterThan(0);
    expect(Number(result.uniquePlans)).toBeGreaterThan(0);
    expect(result.problems).toBeDefined();
  });

  it("генерирует проблемы при отсутствии маппинга часов", async () => {
    // Удаляем один маппинг
    await db.delete(hourTypeMapping).where(eq(hourTypeMapping.planHourColumn, "hours_lecture"));

    await caller.generations.generateGroups();
    await caller.generations.generateUnits();
    const result = await caller.generations.generateLessons();
    expect(result.problems?.no_hour_type_mapping).toBeGreaterThan(0);
  });
});

describe("assignClassrooms logic", () => {
  it("назначает аудитории для всех активных занятий", async () => {
    await caller.generations.generateGroups();
    await caller.generations.generateUnits();
    await caller.generations.generateLessons();

    const result = await caller.generations.assignClassroomsAuto();
    expect(result.assignedClassrooms).toBeGreaterThan(0);
    expect(result.failed).toBeNull();

    const activeLessons = await db.select().from(lessons).where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
    for (const lesson of activeLessons) {
      const link = await db.select().from(lessonClassrooms).where(and(eq(lessonClassrooms.lessonId, lesson.id), eq(lessonClassrooms.isActive, true), isNull(lessonClassrooms.versionId)));
      expect(link.length).toBe(1);
    }
  });

  it("сообщает о проблемах, если аудиторий недостаточно", async () => {
    // Уменьшаем вместимость всех аудиторий до 1
    await db.update(classrooms).set({ capacity: 1 });

    await caller.generations.generateGroups();
    await caller.generations.generateUnits();
    await caller.generations.generateLessons();

    const result = await caller.generations.assignClassroomsAuto();
    expect(result.failed).not.toBeNull();
    expect(result.failed!.length).toBeGreaterThan(0);
  });
});

describe("generateSchedule logic", () => {
  it("создаёт расписание без конфликтов", async () => {
    await caller.generations.generateGroups();
    await caller.generations.generateUnits();
    await caller.generations.generateLessons();
    await caller.generations.assignClassroomsAuto();

    const result = await caller.generations.generateSchedule({ totalWeeks: 16 });
    expect(result.totalSlots).toBeGreaterThan(0);
    expect(result.status).toBe("schedule generated");

    const displayRows = await db.select().from(scheduleDisplay).where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(displayRows.length).toBeGreaterThan(0);

    // Проверка на дублирование преподавателей в одном слоте
    const teacherSlots = new Map<string, Set<number>>();
    for (const row of displayRows) {
      if (!row.lessonId) continue;
      const [lesson] = await db.select({ teacherId: lessons.teacherId }).from(lessons).where(eq(lessons.id, row.lessonId)).limit(1);
      if (!lesson?.teacherId) continue;
      const slotKey = `${row.weekId}-${row.dayOfWeekId}-${row.pairNumberId}`;
      const key = `${slotKey}-t${lesson.teacherId}`;
      if (teacherSlots.has(key)) {
        throw new Error(`Дубликат преподавателя ${lesson.teacherId} в слоте ${slotKey}`);
      }
      teacherSlots.set(key, new Set());
    }
  });
});