/**
 * Тесты для adminManagement роутера.
 *
 * Проверяет список сотрудников с флагом администратора
 * и назначение/снятие роли admin.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestEmployee,
  createTestUser,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

let adminCaller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  adminCaller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('adminManagement', () => {
  describe('listEmployeesWithAdminFlag', () => {
    it('возвращает сотрудников, доступных для назначения админом', async () => {
      const userId = await createTestUser({ id: '10', email: 'teacher@test.local', role: 'teacher' });
      const empId = await createTestEmployee({ surname: 'Петров', name: 'Пётр', userId, isActive: true });

      const list = await adminCaller.adminManagement.listEmployeesWithAdminFlag();
      expect(list.some(e => e.id === empId)).toBe(true);
      const emp = list.find(e => e.id === empId);
      expect(emp?.isAdmin).toBe(false);
      expect(emp?.userId).toBe(userId);
    });

    it('не возвращает неактивных сотрудников', async () => {
      const empId = await createTestEmployee({ surname: 'Сидоров', name: 'Сидор', isActive: false });
      const list = await adminCaller.adminManagement.listEmployeesWithAdminFlag();
      expect(list.some(e => e.id === empId)).toBe(false);
    });

    it('не возвращает сотрудников с ролью student', async () => {
      const userId = await createTestUser({ id: '11', email: 'student@test.local', role: 'student' });
      const empId = await createTestEmployee({ surname: 'Иванов', name: 'Иван', userId, isActive: true });
      const list = await adminCaller.adminManagement.listEmployeesWithAdminFlag();
      expect(list.some(e => e.id === empId)).toBe(false);
    });
  });

  describe('toggleAdmin', () => {
    it('назначает сотрудника администратором (isAdmin=true, роль admin)', async () => {
      const userId = await createTestUser({ id: '20', email: 'user20@test.local', role: 'teacher' });
      const empId = await createTestEmployee({ surname: 'Сергеев', name: 'Сергей', userId, isActive: true });

      const result = await adminCaller.adminManagement.toggleAdmin({ employeeId: empId, isAdmin: true });
      expect(result.success).toBe(true);

      const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
      expect(emp.isAdmin).toBe(true);

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.role).toBe('admin');
    });

    it('снимает права администратора (isAdmin=false, роль teacher)', async () => {
      const userId = await createTestUser({ id: '21', email: 'user21@test.local', role: 'admin' });
      const empId = await createTestEmployee({ surname: 'Алексеев', name: 'Алексей', userId, isAdmin: true });

      const result = await adminCaller.adminManagement.toggleAdmin({ employeeId: empId, isAdmin: false });
      expect(result.success).toBe(true);

      const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
      expect(emp.isAdmin).toBe(false);

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.role).toBe('teacher');
    });

    it('запрещает изменять свою роль', async () => {
      const userId = '1';
      await db.insert(users).values({ id: userId, email: 'admin@test.local', role: 'admin' });
      const empId = await createTestEmployee({ surname: 'Главный', name: 'Админ', userId, isActive: true });

      await expect(
        adminCaller.adminManagement.toggleAdmin({ employeeId: empId, isAdmin: false })
      ).rejects.toThrow(TRPCError);

      try {
        await adminCaller.adminManagement.toggleAdmin({ employeeId: empId, isAdmin: false });
      } catch (e) {
        expect(e).toBeInstanceOf(TRPCError);
        if (e instanceof TRPCError) {
          expect(e.code).toBe('FORBIDDEN');
          expect(e.message).toBe('Нельзя изменить свою роль');
        }
      }
    });

    it('возвращает предупреждение, если у сотрудника нет учётной записи', async () => {
      const empId = await createTestEmployee({ surname: 'БезЛогина', name: 'НетУчётки', userId: null });
      const result = await adminCaller.adminManagement.toggleAdmin({ employeeId: empId, isAdmin: true });
      expect(result.success).toBe(true);
      expect(result.warning).toContain('У сотрудника нет учётной записи');
    });

    it('выбрасывает ошибку, если сотрудник не найден', async () => {
      await expect(
        adminCaller.adminManagement.toggleAdmin({ employeeId: 9999, isAdmin: true })
      ).rejects.toThrow(TRPCError);
    });
  });
});