import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestUnitType,
} from '@/test/helpers';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let unitTypeId: number;

beforeAll(async () => {
  await clearAllTestData();
  unitTypeId = await createTestUnitType();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('units CRUD', () => {
  let unitId: number;

  it('создаёт юнит', async () => {
    const [row] = await caller.units.create({
      code: 'TEST-UNIT',
      unitTypeId,
    });
    expect(row).toHaveProperty('id');
    unitId = row.id;
  });

  it('отклоняет пустой код', async () => {
    await expect(
      caller.units.create({ code: '', unitTypeId })
    ).rejects.toThrow();
  });

  it('список юнитов с полем display', async () => {
    const list = await caller.units.list();
    expect(list.some(u => u.id === unitId)).toBe(true);
    const created = list.find(u => u.id === unitId);
    expect(created?.display).toBeDefined();
    expect(created?.display).toContain('TEST-UNIT');
  });

  it('получает существующий юнит с display', async () => {
    const row = await caller.units.get({ id: unitId });
    expect(row).toMatchObject({ code: 'TEST-UNIT', unitTypeId });
    expect(row?.display).toBeDefined();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.units.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет код', async () => {
    await caller.units.update({ id: unitId, code: 'UPDATED-UNIT' });
    const row = await caller.units.get({ id: unitId });
    expect(row?.code).toBe('UPDATED-UNIT');
  });

  it('отклоняет обновление с пустым кодом', async () => {
    await expect(
      caller.units.update({ id: unitId, code: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.units.update({ id: 9999, code: 'GHOST' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий юнит', async () => {
    await caller.units.delete({ id: unitId });
    const row = await caller.units.get({ id: unitId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.units.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});