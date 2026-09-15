import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { users, students, accounts, profiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestUser,
  createTestEmployee,
  createTestProfile,
  createTestSpecialty,
  createTestDepartment,
  createTestInstitute,
  createTestEducation,
} from '@/test/helpers';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

describe('userManagement', () => {
  beforeEach(async () => {
    await clearAllTestData();

    const instId = await createTestInstitute();
    const deptId = await createTestDepartment(instId);
    const specId = await createTestSpecialty(deptId);
    const eduId = await createTestEducation();
    await createTestProfile(specId, eduId);

    // Администратор
    const adminUserId = await createTestUser({ email: 'admin@test.com', role: 'admin' });
    await createTestEmployee({ userId: adminUserId, isAdmin: true });

    // Преподаватель
    const teacherUserId = await createTestUser({ email: 'teacher@test.com', role: 'teacher' });
    await createTestEmployee({ userId: teacherUserId, surname: 'Тестовый', name: 'Сотрудник', patronymic: 'Тестович' });

    // Студент
    const studentUserId = await createTestUser({ email: 'student@test.com', role: 'student' });
    const [profile] = await db.select({ id: profiles.id }).from(profiles).limit(1);
    if (profile) {
      await db.insert(students).values({
        surname: 'Тестов',
        name: 'Студент',
        admissionYear: 2023,
        profileId: profile.id,
        userId: studentUserId,
        isActive: true,
      });
    }

    caller = await createTestCaller({ id: adminUserId, role: 'admin' });
  });

  describe('getUsers', () => {
    it('должен вернуть список всех пользователей', async () => {
      const result = await caller.userManagement.getUsers({});
      expect(result).toHaveLength(3);
    });

    it('должен фильтровать по роли teacher', async () => {
      const result = await caller.userManagement.getUsers({ role: 'teacher' });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('teacher');
    });

    it('должен фильтровать по роли student', async () => {
      const result = await caller.userManagement.getUsers({ role: 'student' });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('student');
    });

    it('должен возвращать fullName для преподавателя', async () => {
      const result = await caller.userManagement.getUsers({ role: 'teacher' });
      expect(result[0].fullName).toBe('Тестовый Сотрудник Тестович');
    });

    it('должен возвращать fullName для студента', async () => {
      const result = await caller.userManagement.getUsers({ role: 'student' });
      expect(result[0].fullName).toBe('Тестов Студент');
    });
  });

  describe('resetUserPassword', () => {
    it('должен сгенерировать новый email и пароль, обновить БД и вернуть их', async () => {
      const teacherUser = await db.select().from(users).where(eq(users.email, 'teacher@test.com')).limit(1);
      const teacherId = teacherUser[0].id;
      const oldEmail = teacherUser[0].email;
      const oldHash = teacherUser[0].hashedPassword;

      const result = await caller.userManagement.resetUserPassword({ userId: teacherId });

      // Проверяем возвращаемые значения
      expect(result.newEmail).toBeDefined();
      expect(result.newEmail).toContain('@internal.uni');
      expect(result.newPassword).toBeDefined();
      expect(typeof result.newPassword).toBe('string');
      expect(result.newPassword.length).toBeGreaterThanOrEqual(8);

      // Проверяем обновление в БД
      const [updatedUser] = await db.select().from(users).where(eq(users.id, teacherId));
      expect(updatedUser.email).toBe(result.newEmail);
      expect(updatedUser.email).not.toBe(oldEmail);
      expect(updatedUser.hashedPassword).not.toBe(oldHash);

      // Проверяем синхронизацию с accounts
      const [account] = await db.select().from(accounts).where(and(eq(accounts.userId, teacherId), eq(accounts.providerId, 'credential')));
      expect(account).toBeDefined();
      expect(account.accountId).toBe(result.newEmail);
      expect(account.password).toBe(updatedUser.hashedPassword);
    });

    it('должен вернуть ошибку если пользователь не найден', async () => {
      await expect(caller.userManagement.resetUserPassword({ userId: 'non-existent' }))
        .rejects.toThrow('Пользователь не найден');
    });
  });
});