import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearTable } from '@/test/helpers';
import { buildings, classrooms } from '@/db/schema';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  // Очищаем classrooms перед buildings из-за внешнего ключа
  await clearTable(classrooms);
  await clearTable(buildings);
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('buildings CRUD', () => {
  let buildingId: number;
  let secondBuildingId: number;

  it('создаёт здание', async () => {
    const [bld] = await caller.buildings.create({ number: 99 });
    expect(bld).toHaveProperty('id');
    buildingId = bld.id;
  });

  it('отклоняет дубликат номера', async () => {
    await expect(
      caller.buildings.create({ number: 99 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.buildings.create({ number: 99 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Корпус с таким номером уже существует');
      }
    }
  });

  it('отклоняет нулевой или отрицательный номер', async () => {
    await expect(
      caller.buildings.create({ number: 0 })
    ).rejects.toThrow();
    await expect(
      caller.buildings.create({ number: -5 })
    ).rejects.toThrow();
  });

  it('список содержит созданное здание', async () => {
    const list = await caller.buildings.list();
    expect(list.some((b) => b.id === buildingId)).toBe(true);
  });

  it('получает существующее здание', async () => {
    const bld = await caller.buildings.get({ id: buildingId });
    expect(bld).toMatchObject({ number: 99 });
  });

  it('получение несуществующего возвращает null', async () => {
    const bld = await caller.buildings.get({ id: 9999 });
    expect(bld).toBeNull();
  });

  it('обновляет номер', async () => {
    await caller.buildings.update({ id: buildingId, number: 100 });
    const bld = await caller.buildings.get({ id: buildingId });
    expect(bld?.number).toBe(100);
  });

  it('отклоняет обновление на существующий номер', async () => {
    // Создаём второе здание
    const [bld2] = await caller.buildings.create({ number: 200 });
    secondBuildingId = bld2.id;

    // Пытаемся обновить первое здание на номер второго
    await expect(
      caller.buildings.update({ id: buildingId, number: 200 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.buildings.update({ id: buildingId, number: 200 });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с некорректным номером', async () => {
    await expect(
      caller.buildings.update({ id: buildingId, number: 0 })
    ).rejects.toThrow();
    await expect(
      caller.buildings.update({ id: buildingId, number: -1 })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id ничего не делает', async () => {
    const result = await caller.buildings.update({
      id: 9999,
      number: 300,
    });
    expect(result).toBeDefined();
    const bld = await caller.buildings.get({ id: 9999 });
    expect(bld).toBeNull();
  });

  it('удаляет существующее здание', async () => {
    // Удаляем второе здание (неиспользуемое)
    await caller.buildings.delete({ id: secondBuildingId });
    const bld = await caller.buildings.get({ id: secondBuildingId });
    expect(bld).toBeNull();
  });

  it('удаление несуществующего не вызывает ошибку', async () => {
    await expect(
      caller.buildings.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });

  it('отклоняет удаление используемого здания (с аудиториями)', async () => {
    // Создаём здание и аудиторию, привязанную к нему
    const [bld] = await caller.buildings.create({ number: 400 });
    await db.insert(classrooms).values({
      buildingId: bld.id,
      roomNumber: '101',
      capacity: 30,
    });

    await expect(
      caller.buildings.delete({ id: bld.id })
    ).rejects.toThrow(/Невозможно удалить/);
  });
});