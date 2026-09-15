import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
  createTestDepartment,
  createTestEducation,
  createTestSpecialty,
  createTestProfile,
  createTestUser,
} from '@/test/helpers';
import { db } from '@/db';
import { students, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let profileId: number;
let adminUserId: string;

beforeAll(async () => {
  await clearAllTestData();

  const instId = await createTestInstitute();
  const deptId = await createTestDepartment(instId);
  const eduId = await createTestEducation();
  const specId = await createTestSpecialty(deptId);
  profileId = await createTestProfile(specId, eduId);

  // Создаём пользователя-админа, под которым работаем
  adminUserId = await createTestUser({ email: 'admin@test.local', role: 'admin' });

  caller = await createTestCaller({ id: adminUserId, role: 'admin' });
});

describe('students CRUD', () => {
  let studentId: number;
  let studentWithUserId: number;

  it('создаёт студента', async () => {
    const [row] = await caller.students.create({
      surname: 'Тестов',
      name: 'Студент',
      admissionYear: 2023,
      profileId,
    });
    expect(row).toHaveProperty('id');
    studentId = row.id;
  });

  it('отклоняет пустые фамилию или имя', async () => {
    await expect(
      caller.students.create({
        surname: '',
        name: 'Имя',
        admissionYear: 2023,
        profileId,
      })
    ).rejects.toThrow();
    await expect(
      caller.students.create({
        surname: 'Фамилия',
        name: '',
        admissionYear: 2023,
        profileId,
      })
    ).rejects.toThrow();
  });

  it('отклоняет отсутствие profileId', async () => {
    await expect(
      (caller.students.create as unknown as (data: Record<string, unknown>) => Promise<unknown>)({
        surname: 'Ф',
        name: 'И',
        admissionYear: 2023,
      })
    ).rejects.toThrow();
  });

  it('список студентов', async () => {
    const list = await caller.students.list();
    expect(list.some(s => s.id === studentId)).toBe(true);
  });

  it('получает существующего студента', async () => {
    const row = await caller.students.get({ id: studentId });
    expect(row).toMatchObject({
      surname: 'Тестов',
      name: 'Студент',
      admissionYear: 2023,
      profileId,
    });
  });

  it('возвращает null для несуществующего id', async () => {
    const row = await caller.students.get({ id: 9999 });
    expect(row).toBeNull();
  });

  it('обновляет студента', async () => {
    await caller.students.update({ id: studentId, name: 'Обновлённый' });
    const row = await caller.students.get({ id: studentId });
    expect(row?.name).toBe('Обновлённый');
  });

  it('отклоняет обновление с пустой фамилией', async () => {
    await expect(
      caller.students.update({ id: studentId, surname: '' })
    ).rejects.toThrow();
  });

  it('обновление несуществующего id не вызывает ошибку', async () => {
    await expect(
      caller.students.update({ id: 9999, name: 'Ghost' })
    ).resolves.toBeDefined();
  });

  it('удаляет студента без учётной записи', async () => {
    // Удаляем первого студента (без учётной записи)
    await caller.students.delete({ id: studentId });
    const row = await caller.students.get({ id: studentId });
    expect(row).toBeNull();
  });

  it('отклоняет удаление самого себя (студент с тем же userId)', async () => {
    // Создаём студента, привязанного к текущему пользователю
    const [row] = await db
      .insert(students)
      .values({
        surname: 'Сам',
        name: 'Себя',
        admissionYear: 2023,
        profileId,
        userId: adminUserId,
        isActive: true,
      })
      .returning({ id: students.id });
    studentWithUserId = row.id;

    await expect(
      caller.students.delete({ id: studentWithUserId })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.students.delete({ id: studentWithUserId });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('FORBIDDEN');
        expect(e.message).toBe('Нельзя удалить самого себя');
      }
    }
  });

  it('удаляет студента с учётной записью (отвязывает и удаляет пользователя)', async () => {
    // Используем того же студента, но с другим userId (не текущим)
    const otherUserId = await createTestUser({ email: 'other@test.local', role: 'student' });
    await db.update(students)
      .set({ userId: otherUserId })
      .where(eq(students.id, studentWithUserId));

    // Теперь удаляем
    await caller.students.delete({ id: studentWithUserId });
    const deletedStudent = await caller.students.get({ id: studentWithUserId });
    expect(deletedStudent).toBeNull();

    // Пользователь тоже должен быть удалён
    const [deletedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, otherUserId))
      .limit(1);
    expect(deletedUser).toBeUndefined();
  });

  it('отклоняет удаление несуществующего студента', async () => {
    await expect(
      caller.students.delete({ id: 9999 })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.students.delete({ id: 9999 });
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      if (e instanceof TRPCError) {
        expect(e.code).toBe('NOT_FOUND');
      }
    }
  });
});