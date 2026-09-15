import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearAllTestData } from '@/test/helpers';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('employmentTypes CRUD', () => {
  let typeId: number;
  let secondTypeId: number;

  it('создаёт тип занятости', async () => {
    const [row] = await caller.employmentTypes.create({
      name: 'Ставка',
      abbreviation: 'СТ',
    });
    expect(row).toHaveProperty('id');
    typeId = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.employmentTypes.create({ name: 'Ставка' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.employmentTypes.create({ name: 'Ставка' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Тип занятости с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.employmentTypes.create({ name: '' })
    ).rejects.toThrow();
  });

  it('список содержит созданный тип', async () => {
    const list = await caller.employmentTypes.list();
    expect(list.some(t => t.id === typeId)).toBe(true);
  });

  it('получает существующий тип', async () => {
    const row = await caller.employmentTypes.get({ id: typeId });
    expect(row).toMatchObject({ name: 'Ставка', abbreviation: 'СТ' });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.employmentTypes.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.employmentTypes.update({ id: typeId, name: '0.5 ставки' });
    const row = await caller.employmentTypes.get({ id: typeId });
    expect(row?.name).toBe('0.5 ставки');
  });

  it('отклоняет обновление на существующее название', async () => {
    const [row2] = await caller.employmentTypes.create({ name: 'Совместительство' });
    secondTypeId = row2.id;

    await expect(
      caller.employmentTypes.update({ id: typeId, name: 'Совместительство' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.employmentTypes.update({ id: typeId, name: 'Совместительство' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.employmentTypes.update({ id: typeId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.employmentTypes.update({ id: 9999, name: 'Несуществующий' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий тип', async () => {
    await caller.employmentTypes.delete({ id: secondTypeId });
    const row = await caller.employmentTypes.get({ id: secondTypeId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.employmentTypes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});