import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearTable } from '@/test/helpers';
import { weeks } from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearTable(weeks);
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('weeks CRUD', () => {
  let weekId: number;
  let secondWeekId: number;

  it('создаёт неделю', async () => {
    const [row] = await caller.weeks.create({ type: 'custom' });
    expect(row).toHaveProperty('id');
    weekId = row.id;
  });

  it('отклоняет дублирование типа', async () => {
    await expect(
      caller.weeks.create({ type: 'custom' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.weeks.create({ type: 'custom' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Неделя с таким типом уже существует');
      }
    }
  });

  it('отклоняет пустой тип', async () => {
    await expect(
      caller.weeks.create({ type: '' })
    ).rejects.toThrow();
  });

  it('список недель', async () => {
    const list = await caller.weeks.list();
    expect(list.some(w => w.id === weekId)).toBe(true);
  });

  it('получает существующую неделю', async () => {
    const row = await caller.weeks.get({ id: weekId });
    expect(row?.type).toBe('custom');
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.weeks.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет тип', async () => {
    await caller.weeks.update({ id: weekId, type: 'updated' });
    const row = await caller.weeks.get({ id: weekId });
    expect(row?.type).toBe('updated');
  });

  it('отклоняет обновление на существующий тип', async () => {
    const [row2] = await caller.weeks.create({ type: 'second' });
    secondWeekId = row2.id;

    await expect(
      caller.weeks.update({ id: secondWeekId, type: 'updated' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.weeks.update({ id: secondWeekId, type: 'updated' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым типом', async () => {
    await expect(
      caller.weeks.update({ id: weekId, type: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.weeks.update({ id: 9999, type: 'ghost' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующую неделю', async () => {
    await caller.weeks.delete({ id: secondWeekId });
    const row = await caller.weeks.get({ id: secondWeekId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.weeks.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});