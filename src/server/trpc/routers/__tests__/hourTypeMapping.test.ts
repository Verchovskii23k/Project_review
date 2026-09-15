import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { db } from '@/db';
import { lessonTypes } from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let lessonTypeId: number;

beforeAll(async () => {
  await clearAllTestData();
  
  // Создаём тип занятия, чтобы заполнить внешний ключ
  const [lt] = await db
    .insert(lessonTypes)
    .values({ name: 'lecture', abbreviation: 'ЛК' })
    .returning({ id: lessonTypes.id });
  lessonTypeId = lt.id;

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('hourTypeMapping CRUD', () => {
  let mappingId: number;
  let secondMappingId: number;

  it('создаёт маппинг', async () => {
    const [row] = await caller.hourTypeMapping.create({
      planHourColumn: 'hours_test',
      priorityColumn: 'priorityTest',
      lessonTypeId,
    });
    expect(row).toHaveProperty('id');
    mappingId = row.id;
  });

  it('отклоняет дублирование planHourColumn', async () => {
    await expect(
      caller.hourTypeMapping.create({
        planHourColumn: 'hours_test',
        priorityColumn: 'other',
        lessonTypeId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.hourTypeMapping.create({
        planHourColumn: 'hours_test',
        priorityColumn: 'other',
        lessonTypeId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Маппинг с такой колонкой плана уже существует');
      }
    }
  });

  it('отклоняет пустые planHourColumn или priorityColumn', async () => {
    await expect(
      caller.hourTypeMapping.create({
        planHourColumn: '',
        priorityColumn: 'p',
        lessonTypeId,
      })
    ).rejects.toThrow();
    await expect(
      caller.hourTypeMapping.create({
        planHourColumn: 'col',
        priorityColumn: '',
        lessonTypeId,
      })
    ).rejects.toThrow();
  });

  it('отклоняет отсутствие lessonTypeId', async () => {
    await expect(
      (caller.hourTypeMapping.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({
        planHourColumn: 'hours_x',
        priorityColumn: 'p',
      })
    ).rejects.toThrow();
  });

  it('список содержит созданный маппинг', async () => {
    const list = await caller.hourTypeMapping.list();
    expect(list.some(m => m.id === mappingId)).toBe(true);
  });

  it('получает существующий маппинг', async () => {
    const row = await caller.hourTypeMapping.get({ id: mappingId });
    expect(row).toMatchObject({
      planHourColumn: 'hours_test',
      priorityColumn: 'priorityTest',
      lessonTypeId,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.hourTypeMapping.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет planHourColumn', async () => {
    await caller.hourTypeMapping.update({
      id: mappingId,
      planHourColumn: 'hours_updated',
    });
    const row = await caller.hourTypeMapping.get({ id: mappingId });
    expect(row?.planHourColumn).toBe('hours_updated');
  });

  it('отклоняет обновление на существующий planHourColumn', async () => {
    // Создаём второй маппинг
    const [row2] = await caller.hourTypeMapping.create({
      planHourColumn: 'hours_second',
      priorityColumn: 'p2',
      lessonTypeId,
    });
    secondMappingId = row2.id;

    await expect(
      caller.hourTypeMapping.update({
        id: secondMappingId,
        planHourColumn: 'hours_updated',
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.hourTypeMapping.update({
        id: secondMappingId,
        planHourColumn: 'hours_updated',
      });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым planHourColumn', async () => {
    await expect(
      caller.hourTypeMapping.update({ id: mappingId, planHourColumn: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.hourTypeMapping.update({
        id: 9999,
        planHourColumn: 'ghost',
      })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий маппинг', async () => {
    await caller.hourTypeMapping.delete({ id: secondMappingId });
    const row = await caller.hourTypeMapping.get({ id: secondMappingId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.hourTypeMapping.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});