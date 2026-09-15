import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import { clearTable } from '@/test/helpers';
import { academicLoadTypes } from '@/db/schema';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearTable(academicLoadTypes);
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('CRUD "Типы нагрузки', () => {
  let id: number;

  it('создаёт новый тип', async () => {
    const [row] = await caller.academicLoadTypes.create({
      name: 'Test',
      abbreviation: 'T',
    });
    expect(row).toHaveProperty('id');
    id = row.id;
  });

  it('отклоняет дублирование названия', async () => {
    await expect(
      caller.academicLoadTypes.create({ name: 'Test', abbreviation: 'T2' })
    ).rejects.toThrow(TRPCError);
    // Проверим код ошибки, если нужно
    try {
      await caller.academicLoadTypes.create({ name: 'Test', abbreviation: 'T2' });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Тип нагрузки с таким названием уже существует');
      }
    }
  });

  it('отклоняет пустое название', async () => {
    await expect(
      caller.academicLoadTypes.create({ name: '', abbreviation: 'E' })
    ).rejects.toThrow();
  });

  it('список содержит созданную запись', async () => {
    const list = await caller.academicLoadTypes.list();
    expect(list.some((r) => r.id === id)).toBe(true);
  });

  it('получение возвращает корректную запись', async () => {
    const row = await caller.academicLoadTypes.get({ id });
    expect(row).toMatchObject({ name: 'Test', abbreviation: 'T' });
  });

  it('получение несуществующей записи возвращает null', async () => {
    const row = await caller.academicLoadTypes.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.academicLoadTypes.update({ id, name: 'Updated' });
    const row = await caller.academicLoadTypes.get({ id });
    expect(row?.name).toBe('Updated');
  });

  it('отклоняет обновление на существующее название', async () => {
    // Создаём вторую запись
    await caller.academicLoadTypes.create({
      name: 'Another',
      abbreviation: 'A',
    });

    // Пытаемся обновить первую запись на имя второй
    await expect(
      caller.academicLoadTypes.update({ id, name: 'Another' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.academicLoadTypes.update({ id, name: 'Another' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.academicLoadTypes.update({ id, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id ничего не делает', async () => {
    // Не должно бросать ошибку
    const result = await caller.academicLoadTypes.update({
      id: 9999,
      name: 'Ghost',
    });
    expect(result).toBeDefined();
    // Убедимся, что запись с id=9999 не появилась
    const row = await caller.academicLoadTypes.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('удаляет существующую запись', async () => {
    await caller.academicLoadTypes.delete({ id });
    const row = await caller.academicLoadTypes.get({ id });
    expect(row).toBeNull();
  });

  it('удаление несуществующей записи не вызывает ошибку', async () => {
    await expect(
      caller.academicLoadTypes.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });
});