import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { institutes, departments } from '@/db/schema';
import { eq } from 'drizzle-orm';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('batchUpdateActive', () => {
  it('деактивирует институты и каскадно отключает кафедры', async () => {
    const instId = await createTestInstitute({ name: 'И1', universityCode: 10010 });
    const deptId = await createTestDepartment(instId, { name: 'К1', abbreviation: 'К1', departmentCode: 200 });

    const result = await caller.batchUpdateActive.updateMany({
      tableName: 'institutes',
      ids: [instId],
      isActive: false,
    });
    expect(result.updated).toBe(1);

    const inst = await db.select({ isActive: institutes.isActive }).from(institutes).where(eq(institutes.id, instId));
    const dept = await db.select({ isActive: departments.isActive }).from(departments).where(eq(departments.id, deptId));
    expect(inst[0].isActive).toBe(false);
    expect(dept[0].isActive).toBe(false);
  });

  it('активирует институты, но не трогает неактивные кафедры', async () => {
    const instId = await createTestInstitute({ name: 'И2', universityCode: 10011 });
    const deptId = await createTestDepartment(instId, { name: 'К2', abbreviation: 'К2', departmentCode: 201 });
    // вручную делаем оба неактивными
    await db.update(institutes).set({ isActive: false }).where(eq(institutes.id, instId));
    await db.update(departments).set({ isActive: false }).where(eq(departments.id, deptId));

    const result = await caller.batchUpdateActive.updateMany({
      tableName: 'institutes',
      ids: [instId],
      isActive: true,
    });
    expect(result.updated).toBe(1);

    const inst = await db.select({ isActive: institutes.isActive }).from(institutes).where(eq(institutes.id, instId));
    const dept = await db.select({ isActive: departments.isActive }).from(departments).where(eq(departments.id, deptId));
    expect(inst[0].isActive).toBe(true);
    expect(dept[0].isActive).toBe(false); // осталась неактивной
  });

    it('возвращает точное количество изменённых записей', async () => {
    const instA = await createTestInstitute({ name: 'Активный', universityCode: 10012, isActive: true });
    const instB = await createTestInstitute({ name: 'Неактивный', universityCode: 10013, isActive: false });

    // Деактивация: только instA переключится (instB уже неактивен)
    const resDeactivate = await caller.batchUpdateActive.updateMany({
        tableName: 'institutes',
        ids: [instA, instB],
        isActive: false,
    });
    expect(resDeactivate.updated).toBe(1);

    // Теперь оба неактивны. Сделаем instB активным вручную.
    await db.update(institutes).set({ isActive: true }).where(eq(institutes.id, instB));

    // Активация: переключится только instA (instB уже активен)
    const resActivate = await caller.batchUpdateActive.updateMany({
        tableName: 'institutes',
        ids: [instA, instB],
        isActive: true,
    });
    expect(resActivate.updated).toBe(1);
    });

  it('выбрасывает ошибку для таблицы без ручного toggle', async () => {
    await expect(
      caller.batchUpdateActive.updateMany({
        tableName: 'lessons', // у lessons нет поля isActive с inputType toggle
        ids: [1],
        isActive: true,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('выбрасывает ошибку для несуществующей таблицы', async () => {
    await expect(
      caller.batchUpdateActive.updateMany({
        tableName: 'non_existent_table',
        ids: [1],
        isActive: true,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('не падает при передаче несуществующих id', async () => {
    const result = await caller.batchUpdateActive.updateMany({
      tableName: 'institutes',
      ids: [99999, 99998],
      isActive: false,
    });
    expect(result.updated).toBe(0);
  });

  it('отклоняет пустой массив ids', async () => {
    await expect(
    caller.batchUpdateActive.updateMany({
        tableName: 'institutes',
        ids: [] as number[],
        isActive: true,
    } as Parameters<typeof caller.batchUpdateActive.updateMany>[0])
    ).rejects.toThrow(TRPCError);
  });
});