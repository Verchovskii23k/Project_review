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
  curriculum,
  curriculumProfiles,
  lessonTypes,
  units,
} from '@/db/schema';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let curriculumId: number;
let unitId: number;
let lessonTypeId: number;
let disciplineId: number;
let teacherDeptId: number;

beforeAll(async () => {
  await clearAllTestData();

  // Институт и кафедра
  const instId = await createTestInstitute();
  const deptId = await createTestDepartment(instId);

  // Дисциплина
  disciplineId = await createTestDiscipline(deptId);

  // Тип занятия
  const [lt] = await db.insert(lessonTypes).values({
    name: 'lecture',
    abbreviation: 'ЛК',
    isActive: true,
  }).returning({ id: lessonTypes.id });
  lessonTypeId = lt.id;

  // Сотрудник и привязка к кафедре
  const empId = await createTestEmployee();
  teacherDeptId = await createTestEmployeeDepartment(empId, deptId);

  // Образование, специальность, профиль
  const eduId = await createTestEducation();
  const specId = await createTestSpecialty(deptId);
  const profileId = await createTestProfile(specId, eduId);

  // Учебный план (curriculum)
  const [cur] = await db.insert(curriculum).values({
    course: 3,
    semester: 1,
    disciplineId,
    hoursLecture: 32,
    hoursGuidedStudy: 16,
    hoursWorkshop: 0,
    hoursLab: 32,
    isActive: true,
  }).returning({ id: curriculum.id });
  curriculumId = cur.id;

  // Привязка плана к профилю
  await db.insert(curriculumProfiles).values({
    curriculumId,
    profileId,
    isActive: true,
  });

  // Тип юнита и юнит
  const unitTypeId = await createTestUnitType();
  const [unit] = await db.insert(units).values({
    code: 'TEST-UNIT',
    unitTypeId,
    isActive: true,
  }).returning({ id: units.id });
  unitId = unit.id;

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('lessons CRUD', () => {
  let lessonId: number;

  it('создаёт занятие', async () => {
    const [row] = await caller.lessons.create({
      curriculumId,
      unitId,
      lessonTypeId,
      disciplineId,
      teacherId: teacherDeptId,
      countPerSemester: 16,
    });
    expect(row).toHaveProperty('id');
    lessonId = row.id;
  });

  it('отклоняет отсутствие обязательных полей', async () => {
    await expect(
      (caller.lessons.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ curriculumId, unitId, lessonTypeId, countPerSemester: 10 })
    ).rejects.toThrow();
    await expect(
      (caller.lessons.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ unitId, lessonTypeId, disciplineId, countPerSemester: 10 })
    ).rejects.toThrow();
  });

  it('список занятий содержит созданное', async () => {
    const list = await caller.lessons.list();
    expect(list.some(l => l.id === lessonId)).toBe(true);
    // Проверим наличие display
    const created = list.find(l => l.id === lessonId);
    expect(created?.display).toBeDefined();
    expect(created?.display).toContain('TEST-UNIT');
  });

  it('получает существующее занятие с display', async () => {
    const row = await caller.lessons.get({ id: lessonId });
    expect(row).toMatchObject({
      curriculumId,
      unitId,
      lessonTypeId,
      disciplineId,
      teacherId: teacherDeptId,
      countPerSemester: 16,
    });
    expect(row?.display).toBeDefined();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.lessons.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет countPerSemester', async () => {
    await caller.lessons.update({ id: lessonId, countPerSemester: 20 });
    const row = await caller.lessons.get({ id: lessonId });
    expect(row?.countPerSemester).toBe(20);
  });

  it('отклоняет обновление с некорректными данными', async () => {
    await expect(
      caller.lessons.update({ id: lessonId, countPerSemester: -1 })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.lessons.update({ id: 9999, countPerSemester: 5 })
    ).resolves.toBeDefined();
  });

  it('удаляет существующее занятие', async () => {
    await caller.lessons.delete({ id: lessonId });
    const row = await caller.lessons.get({ id: lessonId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.lessons.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});