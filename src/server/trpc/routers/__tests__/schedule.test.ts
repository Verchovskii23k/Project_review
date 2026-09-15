import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestDiscipline,
  createTestEmployee,
  createTestEmployeeDepartment,
  createTestUnitType,
  createTestEducation,
  createTestSpecialty,
  createTestProfile,
} from '@/test/helpers';
import { db } from '@/db';
import {
  buildings, classrooms,
  lessonTypes,
  curriculum, curriculumProfiles,
  students,
  daysOfWeek, pairs, weeks,
  studyGroups, units, unitRoots,
  lessons, schedule, scheduleDisplay,
} from '@/db/schema';


let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();

  // 1. Институт, кафедра, дисциплина
  const instId = await createTestInstitute({ universityCode: 1 });
  const deptId = await createTestDepartment(instId);
  const disciplineId = await createTestDiscipline(deptId);

  // 2. Образование, специальность, профиль, студент (для групп)
  const eduId = await createTestEducation();
  const specId = await createTestSpecialty(deptId, { code: '09.03.01' });
  const profileId = await createTestProfile(specId, eduId, { letterCode: 'м' });
  await db.insert(students).values({ surname: 'Тест', name: 'Студент', admissionYear: 2023, profileId, isActive: true });

  // 3. Типы юнитов и юниты
  const utGroup = await createTestUnitType({ name: 'ГРУППА', maxSize: 32 });
  const [unit] = await db.insert(units).values({ code: '13м', unitTypeId: utGroup, isActive: true }).returning({ id: units.id });

  // 4. Учебная группа (вручную)
  const [group] = await db.insert(studyGroups).values({ code: '13м', profileId, course: 3, studentCount: 1, isActive: true }).returning({ id: studyGroups.id });
  await db.insert(unitRoots).values({ unitCode: '13м', studyGroupId: group.id, isActive: true });

  // 5. Типы занятий
  const [lecture] = await db.insert(lessonTypes).values({ name: 'lecture', abbreviation: 'ЛК', isActive: true }).returning({ id: lessonTypes.id });

  // 6. Сотрудник и привязка
  const empId = await createTestEmployee();
  const empDeptId = await createTestEmployeeDepartment(empId, deptId);

  // 7. Учебный план (curriculum) для урока
  const [cur] = await db.insert(curriculum).values({ course: 3, semester: 1, disciplineId, hoursLecture: 32, isActive: true }).returning({ id: curriculum.id });
  await db.insert(curriculumProfiles).values({ curriculumId: cur.id, profileId, isActive: true });

  // 8. Урок (lessons)
  const [lesson] = await db.insert(lessons).values({
    curriculumId: cur.id,
    unitId: unit.id,
    lessonTypeId: lecture.id,
    disciplineId,
    teacherId: empDeptId,
    countPerSemester: 16,
    isActive: true,
  }).returning({ id: lessons.id });

  // 9. Здание и аудитория
  const [bld] = await db.insert(buildings).values({ number: 1, isActive: true }).returning({ id: buildings.id });
  const [room] = await db.insert(classrooms).values({ buildingId: bld.id, roomNumber: '101', capacity: 60, isActive: true }).returning({ id: classrooms.id });

  // 10. Дни, пары, недели
  const [day] = await db.insert(daysOfWeek).values({ name: 'ПН', isActive: true }).returning({ id: daysOfWeek.id });
  const [pair] = await db.insert(pairs).values({ number: 1, isActive: true }).returning({ id: pairs.id });
  const [week] = await db.insert(weeks).values({ type: 'odd', isActive: true }).returning({ id: weeks.id });

  // 11. Расписание (schedule)
  await db.insert(schedule).values({
    weekId: week.id,
    dayOfWeekId: day.id,
    pairNumberId: pair.id,
    lessonId: lesson.id,
    classroomId: room.id,
    isActive: true,
  }).returning({ id: schedule.id });

  // 12. Отображение расписания (scheduleDisplay)
  await db.insert(scheduleDisplay).values({
    lessonId: lesson.id,
    weekId: week.id,
    dayOfWeekId: day.id,
    pairNumberId: pair.id,
    unitCode: '13м',
    displayText: '[13м] лек.Тест – Преподаватель Т., 1-101',
    isActive: true,
  });

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('schedule', () => {
  it('возвращает записи расписания', async () => {
    const result = await caller.schedule.getSchedule({});
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('scheduleId');
    expect(result[0].unitCode).toBe('13м');
  });

  it('фильтрует записи по weekNumber', async () => {
    const result = await caller.schedule.getSchedule({ weekNumber: 1 });
    expect(result.length).toBeGreaterThan(0);
    result.forEach(e => expect(e.weekNumber).toBe(1));
  });

  it('возвращает вспомогательные данные для фильтров', async () => {
    const filters = await caller.schedule.filters({});
    expect(filters.days.length).toBeGreaterThan(0);
    expect(filters.pairs.length).toBeGreaterThan(0);
    expect(filters.weeks.length).toBeGreaterThan(0);
    expect(filters.groups.length).toBeGreaterThan(0);
    expect(filters.teachers.length).toBeGreaterThan(0);
    expect(filters.classrooms.length).toBeGreaterThan(0);
  });
});