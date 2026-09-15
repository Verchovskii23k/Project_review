import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('positions CRUD', () => {
  let posId: number;
  let secondPosId: number;

  it('создаёт должность', async () => {
    const [row] = await caller.positions.create({
      name: 'Доцент',
      abbreviation: 'доц',
    });
    expect(row).toHaveProperty('id');
    posId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.positions.create({ name: 'Доцент' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.positions.create({ name: 'Доцент' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Должность с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.positions.create({ name: '' })
    ).rejects.toThrow();
  });

  it('список содержит созданную должность', async () => {
    const list = await caller.positions.list();
    expect(list.some(p => p.id === posId)).toBe(true);
  });

  it('получает существующую должность', async () => {
    const row = await caller.positions.get({ id: posId });
    expect(row).toMatchObject({ name: 'Доцент', abbreviation: 'доц' });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.positions.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.positions.update({ id: posId, name: 'Профессор' });
    const row = await caller.positions.get({ id: posId });
    expect(row?.name).toBe('Профессор');
  });

  it('отклоняет обновление на существующее название', async () => {
    const [row2] = await caller.positions.create({ name: 'Старший преподаватель' });
    secondPosId = row2.id;

    await expect(
      caller.positions.update({ id: secondPosId, name: 'Профессор' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.positions.update({ id: secondPosId, name: 'Профессор' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.positions.update({ id: posId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.positions.update({ id: 9999, name: 'Несуществующий' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующую должность', async () => {
    await caller.positions.delete({ id: secondPosId });
    const row = await caller.positions.get({ id: secondPosId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.positions.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});