import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearTable } from '@/test/helpers';
import { controlTypes } from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearTable(controlTypes);
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('controlTypes CRUD', () => {
  let ctId: number;

  it('создаёт тип контроля', async () => {
    const [ct] = await caller.controlTypes.create({
      name: 'Зачёт',
      abbreviation: 'ЗЧ',
    });
    expect(ct).toHaveProperty('id');
    ctId = ct.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.controlTypes.create({ name: 'Зачёт', abbreviation: 'ЗЧ2' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.controlTypes.create({ name: 'Зачёт', abbreviation: 'ЗЧ2' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Тип контроля с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.controlTypes.create({ name: '', abbreviation: 'T' })
    ).rejects.toThrow();
  });

  it('список типов контроля содержит созданный', async () => {
    const list = await caller.controlTypes.list();
    expect(list.some((c) => c.id === ctId)).toBe(true);
  });

  it('получает существующий тип контроля', async () => {
    const ct = await caller.controlTypes.get({ id: ctId });
    expect(ct).toMatchObject({ name: 'Зачёт', abbreviation: 'ЗЧ' });
  });

  it('возвращает null для несуществующего id', async () => {
    const ct = await caller.controlTypes.get({ id: 9999 });
    expect(ct).toBeNull();
  });

  it('обновляет тип контроля', async () => {
    await caller.controlTypes.update({ id: ctId, name: 'Дифф. зачёт' });
    const ct = await caller.controlTypes.get({ id: ctId });
    expect(ct?.name).toBe('Дифф. зачёт');
  });

  it('отклоняет обновление на существующее название', async () => {
    // создаём второй тип
    await caller.controlTypes.create({
      name: 'Экзамен',
      abbreviation: 'ЭКЗ',
    });

    // пытаемся обновить первый на имя второго
    await expect(
      caller.controlTypes.update({ id: ctId, name: 'Экзамен' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.controlTypes.update({ id: ctId, name: 'Экзамен' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.controlTypes.update({ id: ctId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.controlTypes.update({ id: 9999, name: 'Ghost' })
    ).resolves.toBeDefined();
  });

  it('удаляет тип контроля', async () => {
    await caller.controlTypes.delete({ id: ctId });
    const ct = await caller.controlTypes.get({ id: ctId });
    expect(ct).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.controlTypes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});