import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearTable } from '@/test/helpers';
import { daysOfWeek } from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearTable(daysOfWeek);
  caller = await createTestCaller({ id: 1, role: 'admin' });
}, 30000);

describe('daysOfWeek CRUD', () => {
  let id: number;

  it('создаёт день недели', async () => {
    const [row] = await caller.daysOfWeek.create({ name: 'ВС' });
    expect(row).toHaveProperty('id');
    id = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.daysOfWeek.create({ name: 'ВС' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.daysOfWeek.create({ name: 'ВС' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('День недели с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.daysOfWeek.create({ name: '' })
    ).rejects.toThrow();
  });

  it('список содержит созданный день', async () => {
    const list = await caller.daysOfWeek.list();
    expect(list.some(r => r.id === id)).toBe(true);
  });

  it('получает существующий день', async () => {
    const row = await caller.daysOfWeek.get({ id });
    expect(row?.name).toBe('ВС');
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.daysOfWeek.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.daysOfWeek.update({ id, name: 'Воскресенье' });
    const row = await caller.daysOfWeek.get({ id });
    expect(row?.name).toBe('Воскресенье');
  });

  it('отклоняет обновление на существующее название', async () => {
    await caller.daysOfWeek.create({ name: 'ПН' });

    await expect(
      caller.daysOfWeek.update({ id, name: 'ПН' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.daysOfWeek.update({ id, name: 'ПН' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.daysOfWeek.update({ id, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.daysOfWeek.update({ id: 9999, name: 'Несуществующий' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий день', async () => {
    await caller.daysOfWeek.delete({ id });
    const row = await caller.daysOfWeek.get({ id });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.daysOfWeek.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});