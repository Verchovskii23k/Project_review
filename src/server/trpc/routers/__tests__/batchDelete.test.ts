/**
 * Тесты для batchDelete роутера.
 *
 * Проверяет массовое удаление записей с учётом зависимостей
 * и защиту от удаления самого себя для сотрудников и студентов.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEmployee,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { institutes, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('batchDelete', () => {
  it('успешно удаляет записи без зависимостей', async () => {
    const inst1 = await createTestInstitute({ name: 'И1', universityCode: 10001 });
    const inst2 = await createTestInstitute({ name: 'И2', universityCode: 10002 });

    const result = await caller.batchDelete.deleteMany({
      tableName: 'institutes',
      ids: [inst1, inst2],
    });
    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Проверяем, что записи действительно удалены
    const remaining = await db.select().from(institutes).where(eq(institutes.id, inst1));
    expect(remaining).toHaveLength(0);
  });

  it('блокирует удаление при наличии дочерних записей', async () => {
    const instId = await createTestInstitute({ name: 'И3', universityCode: 10003 });
    await createTestDepartment(instId, { name: 'К1', abbreviation: 'К1', departmentCode: 200 });

    await expect(
      caller.batchDelete.deleteMany({
        tableName: 'institutes',
        ids: [instId],
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.batchDelete.deleteMany({
        tableName: 'institutes',
        ids: [instId],
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toContain('используются в таблицах');
      }
    }
  });

    it('запрещает удалять самого себя для сотрудников', async () => {
    // Создаём пользователя с id = '1' (под которым залогинен caller)
    await db.insert(users).values({
        id: '1',
        email: 'admin@test.local',
        role: 'admin',
    });

    const emp = await createTestEmployee({
        surname: 'Тестовый',
        name: 'Админ',
        userId: '1',
    });

    const result = await caller.batchDelete.deleteMany({
        tableName: 'employees',
        ids: [emp],
    });
    expect(result.deleted).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Нельзя удалить самого себя');
    });

  it('разрешает удалять сотрудников без привязанного userId', async () => {
    const emp = await createTestEmployee({
      surname: 'Обычный',
      name: 'Сотрудник',
      userId: null,
    });

    const result = await caller.batchDelete.deleteMany({
      tableName: 'employees',
      ids: [emp],
    });
    expect(result.deleted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('возвращает ошибку для таблицы, не разрешённой к удалению', async () => {
    await expect(
      caller.batchDelete.deleteMany({
        tableName: 'user', // эта таблица исключена из ALLOWED_DELETE_TABLES
        ids: [1],
      })
    ).rejects.toThrow(TRPCError);
  });

  it('корректно обрабатывает несуществующие id', async () => {
    const result = await caller.batchDelete.deleteMany({
      tableName: 'institutes',
      ids: [99999, 99998],
    });
    expect(result.deleted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('отклоняет пустой массив ids', async () => {
    await expect(
      caller.batchDelete.deleteMany({
        tableName: 'institutes',
        ids: [] as number[],
      } as Parameters<typeof caller.batchDelete.deleteMany>[0])
    ).rejects.toThrow(TRPCError);
  });

  it('выбрасывает ошибку для несуществующей таблицы', async () => {
    await expect(
      caller.batchDelete.deleteMany({
        tableName: 'non_existent_table',
        ids: [1],
      } as Parameters<typeof caller.batchDelete.deleteMany>[0])
    ).rejects.toThrow(TRPCError);
  });
});