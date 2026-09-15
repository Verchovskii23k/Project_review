import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('lessonTypes CRUD', () => {
  let typeId: number;
  let secondTypeId: number;

  it('создаёт тип занятия', async () => {
    const [row] = await caller.lessonTypes.create({
      name: 'custom',
      abbreviation: 'CUST',
    });
    expect(row).toHaveProperty('id');
    typeId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.lessonTypes.create({ name: 'custom', abbreviation: 'C2' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.lessonTypes.create({ name: 'custom', abbreviation: 'C2' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Тип занятия с таким системным именем уже существует');
      }
    }
  });

  it('отклоняет пустые name или abbreviation', async () => {
    await expect(
      caller.lessonTypes.create({ name: '', abbreviation: 'A' })
    ).rejects.toThrow();
    await expect(
      caller.lessonTypes.create({ name: 'n', abbreviation: '' })
    ).rejects.toThrow();
  });

  it('список типов занятий с полем display', async () => {
    const list = await caller.lessonTypes.list();
    expect(list.some(t => t.id === typeId)).toBe(true);
    // Проверим наличие поля display (оно не пустое)
    const created = list.find(t => t.id === typeId);
    expect(created?.display).toBeDefined();
    expect(created?.display).toBeTruthy();
  });

  it('получает существующий тип занятия с display', async () => {
    const row = await caller.lessonTypes.get({ id: typeId });
    expect(row).toMatchObject({
      name: 'custom',
      abbreviation: 'CUST',
    });
    expect(row?.display).toBeDefined();
    expect(row?.display).toBeTruthy();
    // Для несистемных имён display = name
    expect(row?.display).toBe('custom');
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.lessonTypes.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет abbreviation', async () => {
    await caller.lessonTypes.update({ id: typeId, abbreviation: 'CST' });
    const row = await caller.lessonTypes.get({ id: typeId });
    expect(row?.abbreviation).toBe('CST');
  });

  it('отклоняет обновление на существующее название', async () => {
    // Создаём второй тип
    const [row2] = await caller.lessonTypes.create({
      name: 'workshop_new',
      abbreviation: 'WN',
    });
    secondTypeId = row2.id;

    // Пытаемся обновить первый тип на имя второго
    await expect(
      caller.lessonTypes.update({ id: typeId, name: 'workshop_new' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.lessonTypes.update({ id: typeId, name: 'workshop_new' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.lessonTypes.update({ id: typeId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.lessonTypes.update({ id: 9999, abbreviation: 'NONE' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий тип', async () => {
    await caller.lessonTypes.delete({ id: secondTypeId });
    const row = await caller.lessonTypes.get({ id: secondTypeId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.lessonTypes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});