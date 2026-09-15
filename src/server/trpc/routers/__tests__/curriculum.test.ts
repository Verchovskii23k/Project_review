import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData, createTestInstitute, createTestDepartment, createTestDiscipline } from '@/test/helpers';
import { TRPCError } from '@trpc/server';
import { departments } from '@/db/schema';
import { db } from '@/db';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let disciplineId: number;

beforeAll(async () => {
  await clearAllTestData(); // ← полная очистка
  const instId = await createTestInstitute();
  const deptId = await createTestDepartment(instId);
  disciplineId = await createTestDiscipline(deptId);
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('curriculum CRUD', () => {
  let curriculumId: number;

  it('создаёт запись учебного плана', async () => {
    const [row] = await caller.curriculum.create({
      course: 1,
      semester: 1,
      disciplineId,
      hoursLecture: 30,
      hoursLab: 15,
    });
    expect(row).toHaveProperty('id');
    curriculumId = row.id;
  });

  it('отклоняет дублирование курса, семестра и дисциплины', async () => {
    await expect(
      caller.curriculum.create({
        course: 1,
        semester: 1,
        disciplineId,
        hoursLecture: 20,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.curriculum.create({
        course: 1,
        semester: 1,
        disciplineId,
        hoursLecture: 20,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Учебный план с такой дисциплиной, курсом и семестром уже существует');
      }
    }
  });
  it('отклоняет полный дубликат записи учебного плана', async () => {
    await expect(
      caller.curriculum.create({
        course: 1,
        semester: 1,
        disciplineId,
        hoursLecture: 30,
        hoursLab: 15,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.curriculum.create({
        course: 1,
        semester: 1,
        disciplineId,
        hoursLecture: 30,
        hoursLab: 15,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });
  it('отклоняет отсутствие disciplineId', async () => {
    await expect(
      (caller.curriculum.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ course: 2, semester: 1 })
    ).rejects.toThrow();
  });

  it('список содержит созданную запись', async () => {
    const list = await caller.curriculum.list();
    expect(list.some((r) => r.id === curriculumId)).toBe(true);
  });

  it('получает существующую запись', async () => {
    const row = await caller.curriculum.get({ id: curriculumId });
    expect(row).toMatchObject({
      hoursLecture: 30,
      hoursLab: 15,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.curriculum.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет поле', async () => {
    await caller.curriculum.update({ id: curriculumId, hoursLecture: 40 });
    const row = await caller.curriculum.get({ id: curriculumId });
    expect(row?.hoursLecture).toBe(40);
  });

  it('отклоняет обновление на дублирующую комбинацию', async () => {
    // Создаём второй план с другой дисциплиной
    const disc2Id = await createTestDiscipline(
      (await db.select({ id: departments.id }).from(departments).limit(1))[0].id
    );
    await caller.curriculum.create({
      course: 2,
      semester: 1,
      disciplineId: disc2Id,
      hoursLecture: 20,
    });

    // Пытаемся обновить первый план на комбинацию второго
    await expect(
      caller.curriculum.update({ id: curriculumId, course: 2, disciplineId: disc2Id, semester: 1 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.curriculum.update({ id: curriculumId, course: 2, disciplineId: disc2Id, semester: 1 });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.curriculum.update({ id: 9999, hoursLecture: 10 })
    ).resolves.toBeDefined();
  });

  it('удаляет запись', async () => {
    await caller.curriculum.delete({ id: curriculumId });
    const row = await caller.curriculum.get({ id: curriculumId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.curriculum.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});