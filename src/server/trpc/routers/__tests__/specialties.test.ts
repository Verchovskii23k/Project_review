import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEducation,
} from '@/test/helpers';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let deptId: number;
let educationId: number;

beforeAll(async () => {
  await clearAllTestData();

  const instId = await createTestInstitute();
  deptId = await createTestDepartment(instId);
  educationId = await createTestEducation();

  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('specialties CRUD', () => {
  let specId: number;
  let spec2Id: number;

  it('создаёт специальность', async () => {
    const [row] = await caller.specialties.create({
      code: '01.03.05',
      name: 'Тестовая специальность',
      departmentId: deptId,
    });
    expect(row).toHaveProperty('id');
    specId = row.id;
  });

  it('отклоняет дублирование кода', async () => {
    await expect(
      caller.specialties.create({
        code: '01.03.05',
        name: 'Другая',
        departmentId: deptId,
      })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.specialties.create({
        code: '01.03.05',
        name: 'Другая',
        departmentId: deptId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
        expect(e.message).toBe('Специальность с таким кодом уже существует');
      }
    }
  });

  it('отклоняет пустой код или название', async () => {
    await expect(
      caller.specialties.create({ code: '', name: 'Имя', departmentId: deptId })
    ).rejects.toThrow();
    await expect(
      caller.specialties.create({ code: '01.03.06', name: '', departmentId: deptId })
    ).rejects.toThrow();
  });

  it('список содержит созданную специальность', async () => {
    const list = await caller.specialties.list();
    expect(list.some(s => s.id === specId)).toBe(true);
    // Проверим display
    const created = list.find(s => s.id === specId);
    expect(created?.display).toBeDefined();
    expect(created?.display).toContain('01.03.05');
  });

  it('получает существующую специальность с display', async () => {
    const row = await caller.specialties.get({ id: specId });
    expect(row).toMatchObject({
      code: '01.03.05',
      name: 'Тестовая специальность',
      departmentId: deptId,
    });
    expect(row?.display).toBeDefined();
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.specialties.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет название', async () => {
    await caller.specialties.update({ id: specId, name: 'Обновлённая специальность' });
    const row = await caller.specialties.get({ id: specId });
    expect(row?.name).toBe('Обновлённая специальность');
  });

  it('отклоняет обновление на существующий код', async () => {
    // Создаём вторую специальность
    const [row2] = await caller.specialties.create({
      code: '01.03.06',
      name: 'Вторая',
      departmentId: deptId,
    });
    spec2Id = row2.id;

    await expect(
      caller.specialties.update({ id: spec2Id, code: '01.03.05' })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.specialties.update({ id: spec2Id, code: '01.03.05' });
    } catch (e) {
      if (e instanceof TRPCError) {
        expect(e.code).toBe('CONFLICT');
      }
    }
  });

  it('отклоняет обновление с пустым кодом', async () => {
    await expect(
      caller.specialties.update({ id: specId, code: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.specialties.update({ id: 9999, name: 'Ghost' })
    ).resolves.toBeDefined();
  });

  it('деактивирует специальность и каскадно отключает профили', async () => {
    // Создаём профиль, привязанный к spec2Id
    const [prof] = await db.insert(profiles).values({
      name: 'Профиль для каскада',
      specialtyId: spec2Id,
      letterCode: 'к',
      educationId,
      abbreviation: 'ТЕСТ',
      isActive: true,
    }).returning({ id: profiles.id });

    // Деактивируем специальность
    await caller.specialties.update({ id: spec2Id, isActive: false });

    const spec = await caller.specialties.get({ id: spec2Id });
    expect(spec?.isActive).toBe(false);

    // Профиль тоже должен стать неактивным
    const [updatedProf] = await db
      .select({ isActive: profiles.isActive })
      .from(profiles)
      .where(eq(profiles.id, prof.id))
      .limit(1);
    expect(updatedProf?.isActive).toBe(false);
  });

  it('удаляет существующую специальность', async () => {
    // Удаляем профиль, который был создан в предыдущем тесте (spec2Id)
    await db.delete(profiles).where(eq(profiles.specialtyId, spec2Id));
    // Теперь специальность свободна
    await caller.specialties.delete({ id: spec2Id });
    const row = await caller.specialties.get({ id: spec2Id });
    expect(row).toBeNull();
  });

  it('удаление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.specialties.delete({ id: 9999 })
    ).resolves.toBeDefined();
  });

  it('отклоняет удаление, если специальность связана с профилями', async () => {
    const [spec] = await caller.specialties.create({
      code: '01.03.07',
      name: 'Связанная',
      departmentId: deptId,
    });
    await db.insert(profiles).values({
      name: 'Активный профиль',
      specialtyId: spec.id,
      letterCode: 'св',
      educationId,
      abbreviation: 'ТЕСТ',
      isActive: true,
    });

    await expect(
      caller.specialties.delete({ id: spec.id })
    ).rejects.toThrow(/Невозможно удалить/);
  });
});