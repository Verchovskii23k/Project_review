import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEmployee,
  createTestEmployeeDepartment,
  createTestDiscipline,
} from '@/test/helpers';
import { db } from '@/db';
import {
  lessonTypes,
} from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let deptAId: number;
let deptBId: number;
let empADeptId: number; // связь сотрудник A -> кафедра A
let empBDeptId: number; // связь сотрудник B -> кафедра B
let discAId: number;   // дисциплина на кафедре A
let ltLecture: number;
let ltWorkshop: number;

beforeAll(async () => {
  await clearAllTestData();

  // Институт
  const instId = await createTestInstitute();

  // Две кафедры
  deptAId = await createTestDepartment(instId, { name: 'Кафедра А', abbreviation: 'КА', departmentCode: 100 });
  deptBId = await createTestDepartment(instId, { name: 'Кафедра Б', abbreviation: 'КБ', departmentCode: 200 });

  // Сотрудники и их привязки к кафедрам
  const empAId = await createTestEmployee({ surname: 'Сотрудник', name: 'А', isActive: true });
  const empBId = await createTestEmployee({ surname: 'Сотрудник', name: 'Б', isActive: true });
  empADeptId = await createTestEmployeeDepartment(empAId, deptAId);
  empBDeptId = await createTestEmployeeDepartment(empBId, deptBId);

  // Дисциплины
  discAId = await createTestDiscipline(deptAId, { name: 'Дисциплина А', abbreviation: 'ДА' });

  // Типы занятий
  const [lecture] = await db.insert(lessonTypes).values({ name: 'lecture', abbreviation: 'ЛК' }).returning({ id: lessonTypes.id });
  const [workshop] = await db.insert(lessonTypes).values({ name: 'workshop', abbreviation: 'ПР' }).returning({ id: lessonTypes.id });
  ltLecture = lecture.id;
  ltWorkshop = workshop.id;

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('disciplineTeachers CRUD', () => {
  let linkId: number;
  let link2Id: number;

  it('создаёт корректную связь', async () => {
    const [row] = await caller.disciplineTeachers.create({
      lessonTypeId: ltLecture,
      disciplineId: discAId,
      teacherDepartmentId: empADeptId,
    });
    expect(row).toHaveProperty('id');
    linkId = row.id;
  });

  it('отклоняет связь с несовпадающими кафедрами', async () => {
    // дисциплина A (кафедра A), преподаватель B (кафедра B)
    await expect(
      caller.disciplineTeachers.create({
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empBDeptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.disciplineTeachers.create({
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empBDeptId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('BAD_REQUEST');
        expect(e.message).toBe('Кафедра преподавателя и кафедра дисциплины должны совпадать');
      }
    }
  });

  it('отклоняет дублирующую комбинацию', async () => {
    await expect(
      caller.disciplineTeachers.create({
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empADeptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.disciplineTeachers.create({
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empADeptId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Такая связка уже существует');
      }
    }
  });

  it('отклоняет отсутствие обязательных полей', async () => {
    await expect(
      (caller.disciplineTeachers.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ lessonTypeId: ltLecture, disciplineId: discAId })
    ).rejects.toThrow();
  });

  it('список содержит созданную связь', async () => {
    const list = await caller.disciplineTeachers.list();
    expect(list.some(r => r.id === linkId)).toBe(true);
  });

  it('получает существующую связь', async () => {
    const row = await caller.disciplineTeachers.get({ id: linkId });
    expect(row).toMatchObject({
      lessonTypeId: ltLecture,
      disciplineId: discAId,
      teacherDepartmentId: empADeptId,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.disciplineTeachers.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет isActive', async () => {
    await caller.disciplineTeachers.update({ id: linkId, isActive: false });
    const row = await caller.disciplineTeachers.get({ id: linkId });
    expect(row?.isActive).toBe(false);
  });

  it('отклоняет обновление на связь с несовпадающими кафедрами', async () => {
    // Передаём teacherDepartmentId и disciplineId, но из разных кафедр
    await expect(
      caller.disciplineTeachers.update({
        id: linkId,
        disciplineId: discAId,
        teacherDepartmentId: empBDeptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
        await caller.disciplineTeachers.update({
        id: linkId,
        disciplineId: discAId,
        teacherDepartmentId: empBDeptId,
      });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('BAD_REQUEST');
      }
    }
  });

  it('отклоняет обновление на дублирующую комбинацию', async () => {
    // Создадим вторую валидную связку (другой тип занятия)
    const [row2] = await caller.disciplineTeachers.create({
      lessonTypeId: ltWorkshop,
      disciplineId: discAId,
      teacherDepartmentId: empADeptId,
    });
    link2Id = row2.id;

    // Попробуем обновить link2 на комбинацию link1 (lecture, discA, empA), которая уже есть
    await expect(
      caller.disciplineTeachers.update({
        id: link2Id,
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empADeptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.disciplineTeachers.update({
        id: link2Id,
        lessonTypeId: ltLecture,
        disciplineId: discAId,
        teacherDepartmentId: empADeptId,
      });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('удаляет существующую связь', async () => {
    await caller.disciplineTeachers.delete({ id: link2Id });
    const row = await caller.disciplineTeachers.get({ id: link2Id });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.disciplineTeachers.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});