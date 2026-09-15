import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEmployee,
  createTestEmployeeDepartment,
  createTestDiscipline,
  createTestUser,
} from '@/test/helpers';
import { db } from '@/db';
import {
  disciplineTeachers,
  employees,
  lessonTypes,
} from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let deptId: number;
let lessonTypeId: number;
let adminUserId: string;

beforeAll(async () => {
  await clearAllTestData();

  // Инфраструктура
  const instId = await createTestInstitute();
  deptId = await createTestDepartment(instId);
  const [lt] = await db
    .insert(lessonTypes)
    .values({ name: 'lecture', abbreviation: 'ЛК' })
    .returning({ id: lessonTypes.id });
  lessonTypeId = lt.id;

  // Создаём пользователя-админа, под которым будем вызывать процедуры
  adminUserId = await createTestUser({ email: 'admin@test.local', role: 'admin' });

  caller = await createTestCaller({ id: adminUserId, role: 'admin' });
});

describe('employees CRUD', () => {
  let empId: number;          // обычный сотрудник
  let empWithUserId: number; // сотрудник, привязанный к adminUserId (для теста "нельзя удалить себя")

  it('создаёт сотрудника', async () => {
    const [row] = await caller.employees.create({
      surname: 'Новый',
      name: 'Сотрудник',
    });
    expect(row).toHaveProperty('id');
    empId = row.id;
  });

  it('отклоняет пустые surname или name', async () => {
    await expect(
      caller.employees.create({ surname: '', name: 'Имя' })
    ).rejects.toThrow();
    await expect(
      caller.employees.create({ surname: 'Фамилия', name: '' })
    ).rejects.toThrow();
  });

  it('список всех сотрудников', async () => {
    const list = await caller.employees.list();
    expect(list.some(e => e.id === empId)).toBe(true);
  });

  it('фильтрует список по departmentId', async () => {
    // Привяжем сотрудника к кафедре
    await createTestEmployeeDepartment(empId, deptId);

    const list = await caller.employees.list({ departmentId: deptId });
    expect(list.some(e => e.id === empId)).toBe(true);
  });

  it('фильтрует список по instituteId', async () => {
    const list = await caller.employees.list({ instituteId: 1 });
    expect(list.some(e => e.id === empId)).toBe(true);
  });

  it('возвращает пустой массив для несуществующего profileId', async () => {
    const list = await caller.employees.list({ profileId: 9999 });
    expect(list).toEqual([]);
  });

  it('получает существующего сотрудника', async () => {
    const row = await caller.employees.get({ id: empId });
    expect(row).toMatchObject({ surname: 'Новый', name: 'Сотрудник' });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.employees.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет фамилию', async () => {
    await caller.employees.update({ id: empId, surname: 'Обновлённый' });
    const row = await caller.employees.get({ id: empId });
    expect(row?.surname).toBe('Обновлённый');
  });

  it('отклоняет обновление с пустой фамилией', async () => {
    await expect(
      caller.employees.update({ id: empId, surname: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.employees.update({ id: 9999, surname: 'Ghost' })
    ).resolves.toBeDefined();
  });

  it('удаляет сотрудника без конфликтов', async () => {
    await caller.employees.delete({ id: empId });
    const row = await caller.employees.get({ id: empId });
    expect(row).toBeNull();
  });

  it('отклоняет удаление самого себя', async () => {
    // Создаём сотрудника, привязанного к текущему пользователю
    const [row] = await db
      .insert(employees)
      .values({
        surname: 'Администратор',
        name: 'Тестовый',
        userId: adminUserId,
        isActive: true,
      })
      .returning({ id: employees.id });
    empWithUserId = row.id;

    await expect(
      caller.employees.delete({ id: empWithUserId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.employees.delete({ id: empWithUserId });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('FORBIDDEN');
        expect(e.message).toBe('Нельзя удалить самого себя');
      }
    }
  });

  it('отклоняет удаление сотрудника, назначенного преподавателем', async () => {
    // Создаём сотрудника, привязываем к кафедре, создаём дисциплину и связь disciplineTeachers
    const empId2 = await createTestEmployee({ surname: 'Преподаватель', name: 'Тестовый' });
    const empDeptId = await createTestEmployeeDepartment(empId2, deptId);
    const discId = await createTestDiscipline(deptId);

    await db
      .insert(disciplineTeachers)
      .values({
        lessonTypeId,
        disciplineId: discId,
        teacherDepartmentId: empDeptId,
        isActive: true,
      })
      .returning({ id: disciplineTeachers.id });

    await expect(
      caller.employees.delete({ id: empId2 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.employees.delete({ id: empId2 });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe(
          'Невозможно удалить сотрудника, так как он назначен преподавателем дисциплины. Сначала удалите его из дисциплин.'
        );
      }
    }
  });

  it('отклоняет удаление несуществующего сотрудника', async () => {
    await expect(
      caller.employees.delete({ id: 9999 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.employees.delete({ id: 9999 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('NOT_FOUND');
      }
    }
  });
});