import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEmployee,
  createTestEmployeeDepartment,
} from '@/test/helpers';
import { db } from '@/db';
import {
  curriculum,
  disciplineTeachers,
  lessonTypes,
} from '@/db/schema';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let deptId: number;
let employeeDeptId: number;
let lessonTypeId: number;

beforeAll(async () => {
  await clearAllTestData();

  const instId = await createTestInstitute();
  deptId = await createTestDepartment(instId);
  const empId = await createTestEmployee();
  employeeDeptId = await createTestEmployeeDepartment(empId, deptId);

  // Создадим тип занятия для disciplineTeachers
  const [lt] = await db
    .insert(lessonTypes)
    .values({ name: 'lecture', abbreviation: 'ЛК' })
    .returning({ id: lessonTypes.id });
  lessonTypeId = lt.id;

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('disciplines CRUD', () => {
  let discId: number;
  let disc2Id: number;

  it('создаёт дисциплину', async () => {
    const [row] = await caller.disciplines.create({
      name: 'Тестовая дисциплина',
      abbreviation: 'ТД',
      departmentId: deptId,
    });
    expect(row).toHaveProperty('id');
    discId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.disciplines.create({
        name: 'Тестовая дисциплина',
        abbreviation: 'Дубль',
        departmentId: deptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.disciplines.create({
        name: 'Тестовая дисциплина',
        abbreviation: 'Дубль',
        departmentId: deptId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Дисциплина с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустые name или abbreviation', async () => {
    await expect(
      caller.disciplines.create({
        name: '',
        abbreviation: 'Т',
        departmentId: deptId,
      })
    ).rejects.toThrow();
    await expect(
      caller.disciplines.create({
        name: 'Имя',
        abbreviation: '',
        departmentId: deptId,
      })
    ).rejects.toThrow();
  });

  it('список дисциплин (все и с фильтром по кафедре)', async () => {
    const list = await caller.disciplines.list();
    expect(list.some(d => d.id === discId)).toBe(true);

    const filtered = await caller.disciplines.list({ departmentId: deptId });
    expect(filtered.some(d => d.id === discId)).toBe(true);

    // при несуществующем departmentId не должна находиться
    const filteredOther = await caller.disciplines.list({ departmentId: deptId + 1 });
    expect(filteredOther.some(d => d.id === discId)).toBe(false);
  });

  it('получает существующую дисциплину', async () => {
    const row = await caller.disciplines.get({ id: discId });
    expect(row).toMatchObject({
      name: 'Тестовая дисциплина',
      abbreviation: 'ТД',
      departmentId: deptId,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.disciplines.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.disciplines.update({ id: discId, name: 'Обновлённая' });
    const row = await caller.disciplines.get({ id: discId });
    expect(row?.name).toBe('Обновлённая');
  });

  it('отклоняет обновление на существующее название', async () => {
    const [row2] = await caller.disciplines.create({
      name: 'Вторая дисциплина',
      abbreviation: 'ВД',
      departmentId: deptId,
    });
    disc2Id = row2.id;

    await expect(
      caller.disciplines.update({ id: discId, name: 'Вторая дисциплина' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.disciplines.update({ id: discId, name: 'Вторая дисциплина' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.disciplines.update({ id: discId, name: '' })
    ).rejects.toThrow();
  });

  it('деактивирует дисциплину и каскадно отключает учебные планы и преподавателей дисциплин', async () => {
    // создаём учебный план
    const [cur] = await caller.curriculum.create({
      course: 1,
      semester: 1,
      disciplineId: disc2Id,
      hoursLecture: 10,
    });
    expect(cur).toHaveProperty('id');

    // создаём связь преподавателя
    const [dt] = await caller.disciplineTeachers.create({
      lessonTypeId,
      disciplineId: disc2Id,
      teacherDepartmentId: employeeDeptId,
    });
    expect(dt).toHaveProperty('id');

    // деактивируем дисциплину
    await caller.disciplines.update({ id: disc2Id, isActive: false });

    const disc = await caller.disciplines.get({ id: disc2Id });
    expect(disc?.isActive).toBe(false);

    const [curriculumRow] = await db
      .select()
      .from(curriculum)
      .where(eq(curriculum.id, cur.id))
      .limit(1);
    expect(curriculumRow?.isActive).toBe(false);

    const [dtRow] = await db
      .select()
      .from(disciplineTeachers)
      .where(eq(disciplineTeachers.id, dt.id))
      .limit(1);
    expect(dtRow?.isActive).toBe(false);
  });

  it('удаляет существующую дисциплину', async () => {
    await caller.disciplines.delete({ id: discId });
    const row = await caller.disciplines.get({ id: discId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.disciplines.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});