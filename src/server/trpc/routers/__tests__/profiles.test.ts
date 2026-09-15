import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestSpecialty,
  createTestEducation,
} from '@/test/helpers';
import { db } from '@/db';
import { TRPCError } from '@trpc/server';
import { students } from '@/db/schema';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let specialtyId: number;
let educationId: number;

beforeAll(async () => {
  await clearAllTestData();

  const instId = await createTestInstitute();
  const deptId = await createTestDepartment(instId);
  specialtyId = await createTestSpecialty(deptId);
  educationId = await createTestEducation();

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('profiles CRUD', () => {
  let profileId: number;
  let secondProfileId: number;

  it('создаёт профиль', async () => {
    const [row] = await caller.profiles.create({
      name: 'Тестовый профиль',
      specialtyId,
      letterCode: 'т',
      educationId,
      abbreviation: 'ТЕСТ',
    });
    expect(row).toHaveProperty('id');
    profileId = row.id;
  });

  it('отклоняет дублирование letterCode + specialtyId', async () => {
    await expect(
      caller.profiles.create({
        name: 'Другой',
        specialtyId,
        letterCode: 'т',
        abbreviation: 'ТЕСТ1',
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.profiles.create({
        name: 'Другой',
        specialtyId,
        letterCode: 'т',
        abbreviation: 'ТЕСТ2',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Профиль с таким буквенным кодом и специальностью уже существует');
      }
    }
  });

  it('отклоняет пустые name или letterCode', async () => {
    await expect(
      caller.profiles.create({
        name: '',
        specialtyId,
        letterCode: 'а',
        abbreviation: 'ТЕСТ1',
      })
    ).rejects.toThrow();
    await expect(
      caller.profiles.create({
        name: 'Имя',
        specialtyId,
        letterCode: '',
        abbreviation: 'ТЕСТ2',
      })
    ).rejects.toThrow();
  });

  it('список профилей содержит созданный', async () => {
    const list = await caller.profiles.list();
    expect(list.some(p => p.id === profileId)).toBe(true);
    // Проверим, что display поля заполнены
    const created = list.find(p => p.id === profileId);
    expect(created?.profileDisplay).toBeDefined();
    if (educationId) {
      expect(created?.educationDisplay).toBeDefined();
    }
  });

  it('получает существующий профиль', async () => {
    const row = await caller.profiles.get({ id: profileId });
    expect(row).toMatchObject({
      name: 'Тестовый профиль',
      specialtyId,
      letterCode: 'т',
    });
    expect(row?.profileDisplay).toBeDefined();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.profiles.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.profiles.update({ id: profileId, name: 'Обновлённый профиль' });
    const row = await caller.profiles.get({ id: profileId });
    expect(row?.name).toBe('Обновлённый профиль');
  });

  it('отклоняет обновление на дублирующий letterCode+specialty', async () => {
    // Создаём второй профиль
    const [row2] = await caller.profiles.create({
      name: 'Второй',
      specialtyId,
      letterCode: 'к',
      abbreviation: 'ТЕСТ1',
    });
    secondProfileId = row2.id;

    // Пытаемся обновить второй на комбинацию первого
    await expect(
      caller.profiles.update({ id: secondProfileId, letterCode: 'т', specialtyId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.profiles.update({ id: secondProfileId, letterCode: 'т', specialtyId });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым названием', async () => {
    await expect(
      caller.profiles.update({ id: profileId, name: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.profiles.update({ id: 9999, name: 'Ghost' })
    ).resolves.toBeDefined();
  });

  it('удаляет существующий профиль', async () => {
    await caller.profiles.delete({ id: secondProfileId });
    const row = await caller.profiles.get({ id: secondProfileId });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.profiles.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });

  it('отклоняет удаление, если профиль связан с учебными группами или студентами', async () => {
    // Создаём профиль, привязываем к нему студента
    const [prof] = await caller.profiles.create({
      name: 'Связанный профиль',
      specialtyId,
      letterCode: 'с',
      abbreviation: 'ТЕСТ2',
    });
    await db.insert(students).values({
      surname: 'Иванов',
      name: 'Иван',
      admissionYear: 2023,
      profileId: prof.id,
      isActive: true,
    });

    await expect(
      caller.profiles.delete({ id: prof.id })
    ).rejects.toThrow(/Невозможно удалить/);
  });
});