import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('pairs CRUD', () => {
  let pairId: number;
  let secondPairId: number;

  it('создаёт пару', async () => {
    const [row] = await caller.pairs.create({ number: 1 });
    expect(row).toHaveProperty('id');
    pairId = row.id;
  });

  it('отклоняет дублирование номера', async () => {
    await expect(
      caller.pairs.create({ number: 1 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.pairs.create({ number: 1 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Пара с таким номером уже существует');
      }
    }
  });

  it('отклоняет нулевой или отрицательный номер', async () => {
    await expect(
      caller.pairs.create({ number: 0 })
    ).rejects.toThrow();
    await expect(
      caller.pairs.create({ number: -1 })
    ).rejects.toThrow();
  });

  it('список содержит созданную пару', async () => {
    const list = await caller.pairs.list();
    expect(list.some(p => p.id === pairId)).toBe(true);
  });

  it('получает существующую пару', async () => {
    const row = await caller.pairs.get({ id: pairId });
    expect(row?.number).toBe(1);
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.pairs.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет номер', async () => {
    await caller.pairs.update({ id: pairId, number: 5 });
    const row = await caller.pairs.get({ id: pairId });
    expect(row?.number).toBe(5);
  });

  it('отклоняет обновление на существующий номер', async () => {
    const [row2] = await caller.pairs.create({ number: 10 });
    secondPairId = row2.id;

    await expect(
      caller.pairs.update({ id: secondPairId, number: 5 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.pairs.update({ id: secondPairId, number: 5 });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с некорректным номером', async () => {
    await expect(
      caller.pairs.update({ id: pairId, number: 0 })
    ).rejects.toThrow();
    await expect(
      caller.pairs.update({ id: pairId, number: -1 })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.pairs.update({ id: 9999, number: 8 })
    ).resolves.toBeDefined();
  });

  it('удаляет существующую пару', async () => {
    await caller.pairs.delete({ id: secondPairId });
    const row = await caller.pairs.get({ id: secondPairId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.pairs.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});