import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { db } from '@/db';
import { buildings } from '@/db/schema';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  // Создаём тестовое здание, чтобы был валидный id
  await db.insert(buildings).values({ number: 1 }).returning({ id: buildings.id });
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('lookup', () => {
  it('возвращает строку для существующей таблицы и id', async () => {
    const result = await caller.lookup.getRow({ tableName: 'buildings', id: 1 });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('number');
    expect(result).toHaveProperty('number');
  });

  it('возвращает null для несуществующего id', async () => {
    const result = await caller.lookup.getRow({ tableName: 'buildings', id: 99999 });
    expect(result).toBeNull();
  });

  it('отклоняет запрещённую таблицу', async () => {
    await expect(
      caller.lookup.getRow({ tableName: 'users', id: 1 })
    ).rejects.toThrow(/не разрешена/);
  });

  it('отклоняет отсутствие имени таблицы', async () => {
    await expect(
      (caller.lookup.getRow as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ id: 1 })
    ).rejects.toThrow();
  });
});