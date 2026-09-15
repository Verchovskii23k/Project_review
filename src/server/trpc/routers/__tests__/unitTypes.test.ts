import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('unitTypes CRUD', () => {
  let typeId: number;
  let secondTypeId: number;

  it('создаёт тип юнита', async () => {
    const [row] = await caller.unitTypes.create({
      name: 'Тестовый тип',
      maxSize: 32,
      priorityLecture: 1,
      priorityWorkshop: 2,
      priorityGuidedStudy: 3,
      priorityLab: 4,
    });
    expect(row).toHaveProperty('id');
    typeId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.unitTypes.create({
        name: 'Тестовый тип',
        maxSize: 16,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.unitTypes.create({
        name: 'Тестовый тип',
        maxSize: 16,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Тип юнита с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.unitTypes.create({
        name: '',
        maxSize: 10,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
  });

  it('отклоняет нулевой или отрицательный maxSize', async () => {
    await expect(
      caller.unitTypes.create({
        name: 'Нулевой размер',
        maxSize: 0,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
    await expect(
      caller.unitTypes.create({
        name: 'Отрицательный размер',
        maxSize: -5,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
  });

  it('отклоняет отсутствие обязательных полей', async () => {
    // Пропущены все приоритеты
    await expect(
      (caller.unitTypes.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({
        name: 'Без приоритетов',
        maxSize: 10,
      })
    ).rejects.toThrow();
    // Пропущен maxSize
    await expect(
      (caller.unitTypes.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({
        name: 'Без размера',
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
  });

  it('список типов юнитов', async () => {
    const list = await caller.unitTypes.list();
    expect(list.some(t => t.id === typeId)).toBe(true);
  });

  it('получает существующий тип юнита', async () => {
    const row = await caller.unitTypes.get({ id: typeId });
    expect(row).toMatchObject({
      name: 'Тестовый тип',
      maxSize: 32,
      priorityLecture: 1,
      priorityWorkshop: 2,
      priorityGuidedStudy: 3,
      priorityLab: 4,
    });
  });

  it('получает тип юнита по имени', async () => {
    const row = await caller.unitTypes.getByName({ name: 'Тестовый тип' });
    expect(row).toMatchObject({ id: typeId });
  });

  it('возвращает null для несуществующего имени', async () => {
    const row = await caller.unitTypes.getByName({ name: 'Несуществующий' });
    expect(row).toBeNull();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.unitTypes.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет (передавая все обязательные поля)', async () => {
    // Теперь все поля обязательны при обновлении
    await caller.unitTypes.update({
      id: typeId,
      name: 'Тестовый тип',
      maxSize: 64,
      priorityLecture: 1,
      priorityWorkshop: 2,
      priorityGuidedStudy: 3,
      priorityLab: 4,
    });
    const row = await caller.unitTypes.get({ id: typeId });
    expect(row?.maxSize).toBe(64);
  });

  it('отклоняет обновление с отсутствием обязательных полей', async () => {
    // Пытаемся обновить только maxSize, но без имени и приоритетов
    await expect(
      (caller.unitTypes.update as unknown as (data: Record<string, unknown>) => Promise<unknown>)({ id: typeId, maxSize: 100 })
    ).rejects.toThrow();
  });

  it('отклоняет обновление на существующее название', async () => {
    // Создаём второй тип
    const [row2] = await caller.unitTypes.create({
      name: 'Второй тип',
      maxSize: 10,
      priorityLecture: 1,
      priorityWorkshop: 2,
      priorityGuidedStudy: 3,
      priorityLab: 4,
    });
    secondTypeId = row2.id;

    // Пытаемся обновить второй тип на имя первого
    await expect(
      caller.unitTypes.update({
        id: secondTypeId,
        name: 'Тестовый тип',
        maxSize: 10,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.unitTypes.update({
        id: typeId,
        name: '',
        maxSize: 32,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
  });

  it('отклоняет обновление с нулевым maxSize', async () => {
    await expect(
      caller.unitTypes.update({
        id: typeId,
        name: 'Тестовый тип',
        maxSize: 0,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    // Передаём все обязательные поля
    await expect(
      caller.unitTypes.update({
        id: 9999,
        name: 'Ghost',
        maxSize: 10,
        priorityLecture: 1,
        priorityWorkshop: 2,
        priorityGuidedStudy: 3,
        priorityLab: 4,
      })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий тип', async () => {
    await caller.unitTypes.delete({ id: secondTypeId });
    const row = await caller.unitTypes.get({ id: secondTypeId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.unitTypes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});