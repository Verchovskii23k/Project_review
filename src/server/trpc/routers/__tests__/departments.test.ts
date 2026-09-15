import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { 
  clearAllTestData, 
  createTestInstitute, 
  createTestEmployee,
  createTestStudyGroup,
  createTestEducation,
  createTestSpecialty,
  createTestProfile,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let instituteId: number;

beforeAll(async () => {
  await clearAllTestData();
  instituteId = await createTestInstitute();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('departments CRUD', () => {
  let deptId: number;
  let secondDeptId: number;

  it('создаёт кафедру', async () => {
    const [dept] = await caller.departments.create({
      name: 'Тестовая кафедра',
      abbreviation: 'ТК',
      instituteId,
      departmentCode: 100,
    });
    expect(dept).toHaveProperty('id');
    deptId = dept.id;
  });

  it('отклоняет дублирование departmentCode', async () => {
    await expect(
      caller.departments.create({
        name: 'Другая',
        abbreviation: 'ДР',
        instituteId,
        departmentCode: 100,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.departments.create({
        name: 'Другая',
        abbreviation: 'ДР',
        instituteId,
        departmentCode: 100,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Кафедра с таким кодом уже существует');
      }
    }
  });

  it('отклоняет пустые name или abbreviation', async () => {
    await expect(
      caller.departments.create({
        name: '',
        abbreviation: 'Т',
        instituteId,
        departmentCode: 200,
      })
    ).rejects.toThrow();
    await expect(
      caller.departments.create({
        name: 'Имя',
        abbreviation: '',
        instituteId,
        departmentCode: 201,
      })
    ).rejects.toThrow();
  });

  it('список содержит созданную кафедру', async () => {
    const list = await caller.departments.list();
    expect(list.some(d => d.id === deptId)).toBe(true);
  });

  it('получает существующую кафедру', async () => {
    const dept = await caller.departments.get({ id: deptId });
    expect(dept).toMatchObject({
      name: 'Тестовая кафедра',
      abbreviation: 'ТК',
      departmentCode: 100,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const dept = await caller.departments.get({ id: 9999 });
    expect(dept).toBeNull();
  });

  it('обновляет поля', async () => {
    await caller.departments.update({ id: deptId, name: 'Обновлённая' });
    const dept = await caller.departments.get({ id: deptId });
    expect(dept?.name).toBe('Обновлённая');
  });

  it('отклоняет обновление на дублирующий departmentCode', async () => {
    // Создаём вторую кафедру
    const [dept2] = await caller.departments.create({
      name: 'Вторая',
      abbreviation: 'ВТ',
      instituteId,
      departmentCode: 300,
    });
    secondDeptId = dept2.id;

    await expect(
      caller.departments.update({ id: secondDeptId, departmentCode: 100 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.departments.update({ id: secondDeptId, departmentCode: 100 });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым name', async () => {
    await expect(
      caller.departments.update({ id: deptId, name: '' })
    ).rejects.toThrow();
  });

  it('отклоняет назначение заведующим, если сотрудник уже директор', async () => {
    // Создаём сотрудника и делаем его директором института
    const empId = await createTestEmployee();
    await caller.institutes.update({ id: instituteId, directorId: empId });

    await expect(
      caller.departments.create({
        name: 'Кафедра с директором',
        abbreviation: 'ДИР',
        instituteId,
        departmentCode: 400,
        headId: empId,
      })
    ).rejects.toThrow(/Этот сотрудник уже является директором института/);
  });

  it('отклоняет назначение заведующим, если сотрудник уже куратор', async () => {
    // Создаём сотрудника и группу, назначаем куратора
    const empId = await createTestEmployee();
    const eduId = await createTestEducation();
    const specId = await createTestSpecialty(deptId);
    const profId = await createTestProfile(specId, eduId);
    await createTestStudyGroup(profId, { curatorId: empId });

    await expect(
      caller.departments.create({
        name: 'Кафедра с куратором',
        abbreviation: 'КУР',
        instituteId,
        departmentCode: 500,
        headId: empId,
      })
    ).rejects.toThrow(/Этот сотрудник уже является куратором/);
  });

  it('отклоняет назначение заведующим, если сотрудник уже заведует другой кафедрой', async () => {
    // Создаём сотрудника, назначаем заведующим второй кафедры
    const empId = await createTestEmployee();
    await caller.departments.update({ id: deptId, headId: empId });

    await expect(
      caller.departments.create({
        name: 'Третья',
        abbreviation: 'ТР',
        instituteId,
        departmentCode: 600,
        headId: empId,
      })
    ).rejects.toThrow(/Этот сотрудник уже является заведующим другой кафедрой/);
  });

  it('удаляет существующую кафедру', async () => {
    await caller.departments.delete({ id: secondDeptId });
    const dept = await caller.departments.get({ id: secondDeptId });
    expect(dept).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.departments.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});