import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestEmployee,
  createTestDepartment,
  createTestStudyGroup,
  createTestEducation,
  createTestSpecialty,
  createTestProfile,
} from '@/test/helpers';
import { db } from '@/db';
import { departments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('institutes CRUD', () => {
  let instituteId: number;
  let secondInstituteId: number;
  let deptId: number;

  it('создаёт институт', async () => {
    const [row] = await caller.institutes.create({
      name: 'Тестовый институт',
      universityCode: 100,
    });
    expect(row).toHaveProperty('id');
    instituteId = row.id;
  });

  it('отклоняет дублирование кода или названия', async () => {
    await expect(
      caller.institutes.create({
        name: 'Другой',
        universityCode: 100,
      })
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.institutes.create({
        name: 'Тестовый институт',
        universityCode: 200,
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.institutes.create({ name: 'Другой', universityCode: 100 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Институт с таким кодом или названием уже существует');
      }
    }
  });

  it('отклоняет пустое название или некорректный код', async () => {
    await expect(
      caller.institutes.create({ name: '', universityCode: 300 })
    ).rejects.toThrow();
    await expect(
      caller.institutes.create({ name: 'Институт', universityCode: 0 })
    ).rejects.toThrow();
  });

  it('отклоняет директора, который уже заведует кафедрой', async () => {
    // Создаём сотрудника и делаем его завкафедрой
    const empId = await createTestEmployee();
    await createTestDepartment(instituteId, { headId: empId, departmentCode: 500 });

    await expect(
      caller.institutes.create({
        name: 'С директором-завкафедрой',
        universityCode: 400,
        directorId: empId,
      })
    ).rejects.toThrow(/Этот сотрудник уже является заведующим кафедрой/);
  });

  it('отклоняет директора, который уже является куратором', async () => {
    // Создаём сотрудника, кафедру, специальность, профиль, группу с куратором
    const empId = await createTestEmployee();
    const specDeptId = await createTestDepartment(instituteId, { departmentCode: 600 });
    const eduId = await createTestEducation();
    const specId = await createTestSpecialty(specDeptId);
    const profId = await createTestProfile(specId, eduId);
    await createTestStudyGroup(profId, { curatorId: empId });

    await expect(
      caller.institutes.create({
        name: 'С директором-куратором',
        universityCode: 700,
        directorId: empId,
      })
    ).rejects.toThrow(/Этот сотрудник уже является куратором/);
  });

  it('список содержит созданный институт', async () => {
    const list = await caller.institutes.list();
    expect(list.some(i => i.id === instituteId)).toBe(true);
  });

  it('получает существующий институт', async () => {
    const inst = await caller.institutes.get({ id: instituteId });
    expect(inst).toMatchObject({ name: 'Тестовый институт', universityCode: 100 });
  });

  it('возвращает null для несуществующего id', async () => {
    const inst = await caller.institutes.get({ id: 9999 });
    expect(inst).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.institutes.update({ id: instituteId, name: 'Обновлённый институт' });
    const inst = await caller.institutes.get({ id: instituteId });
    expect(inst?.name).toBe('Обновлённый институт');
  });

  it('отклоняет обновление на существующий код или название', async () => {
    // Создаём второй институт
    const [inst2] = await caller.institutes.create({
      name: 'Второй институт',
      universityCode: 800,
    });
    secondInstituteId = inst2.id;

    await expect(
      caller.institutes.update({ id: secondInstituteId, universityCode: 100 })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.institutes.update({ id: secondInstituteId, name: 'Обновлённый институт' })
    ).rejects.toThrow(TRPCError);
  });

  it('отклоняет назначение директора, который уже директор другого института', async () => {
    // Назначаем сотрудника директором первого института
    const empId = await createTestEmployee();
    await caller.institutes.update({ id: instituteId, directorId: empId });

    // Пытаемся назначить его же во второй
    await expect(
      caller.institutes.update({ id: secondInstituteId, directorId: empId })
    ).rejects.toThrow(/Этот сотрудник уже является директором другого института/);
  });

  it('каскадно деактивирует кафедры при отключении института', async () => {
    // Создаём кафедру, привязанную к instituteId
    deptId = await createTestDepartment(instituteId, { departmentCode: 900 });

    // Деактивируем институт
    await caller.institutes.update({ id: instituteId, isActive: false });

    const inst = await caller.institutes.get({ id: instituteId });
    expect(inst?.isActive).toBe(false);

    // Кафедра тоже должна стать неактивной
    const [dept] = await db
      .select({ isActive: departments.isActive })
      .from(departments)
      .where(eq(departments.id, deptId))
      .limit(1);
    expect(dept?.isActive).toBe(false);
  });

  it('удаляет существующий институт', async () => {
    await caller.institutes.delete({ id: secondInstituteId });
    const inst = await caller.institutes.get({ id: secondInstituteId });
    expect(inst).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.institutes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});