import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('educationLevels CRUD', () => {
  let levelId: number;
  let secondLevelId: number;

  it('создаёт уровень образования', async () => {
    const [row] = await caller.educationLevels.create({
      name: 'Бакалавриат',
      abbreviation: 'БАК',
    });
    expect(row).toHaveProperty('id');
    levelId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.educationLevels.create({ name: 'Бакалавриат' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.educationLevels.create({ name: 'Бакалавриат' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Уровень образования с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.educationLevels.create({ name: '' })
    ).rejects.toThrow();
  });

  it('список содержит созданный уровень', async () => {
    const list = await caller.educationLevels.list();
    expect(list.some(l => l.id === levelId)).toBe(true);
  });

  it('получает существующий уровень', async () => {
    const row = await caller.educationLevels.get({ id: levelId });
    expect(row).toMatchObject({ name: 'Бакалавриат', abbreviation: 'БАК' });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.educationLevels.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.educationLevels.update({ id: levelId, name: 'Магистратура' });
    const row = await caller.educationLevels.get({ id: levelId });
    expect(row?.name).toBe('Магистратура');
  });

  it('отклоняет обновление на существующее название', async () => {
    const [row2] = await caller.educationLevels.create({ name: 'Специалитет' });
    secondLevelId = row2.id;

    await expect(
      caller.educationLevels.update({ id: levelId, name: 'Специалитет' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.educationLevels.update({ id: levelId, name: 'Специалитет' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.educationLevels.update({ id: levelId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.educationLevels.update({ id: 9999, name: 'Несуществующий' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий уровень', async () => {
    await caller.educationLevels.delete({ id: secondLevelId });
    const row = await caller.educationLevels.get({ id: secondLevelId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.educationLevels.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});