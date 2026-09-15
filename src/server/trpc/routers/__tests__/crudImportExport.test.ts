/**
 * Тесты для crudImportExport роутера (новая логика: бизнес-ключи, camelCase, без id-привязки).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
} from '@/test/helpers';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import {
  institutes,
  buildings,
  employees,
  students,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { seedTestData } from '@/test/fixtures/fixtures';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  await seedTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('crudImportExport (new)', () => {
  describe('exportAll', () => {
    it('возвращает camelCase-ключи и не содержит user_id', async () => {
      // Просто создаём институт, id не нужен
      await createTestInstitute({ name: 'Институт', universityCode: 12345 });
      const result = await caller.crudImportExport.exportAll({ tableName: 'institutes' });
      expect(result.length).toBeGreaterThanOrEqual(1);
      const row = result[0] as Record<string, unknown>;
      expect(row).toHaveProperty('universityCode');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('directorId');
      expect(row).toHaveProperty('isActive');
      expect(row).not.toHaveProperty('user_id');
      expect(row).not.toHaveProperty('userId');
    });

    it('возвращает пустой массив для пустой таблицы', async () => {
      const result = await caller.crudImportExport.exportAll({ tableName: 'scheduleVersions' });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('выбрасывает ошибку при невалидном tableName', async () => {
      await expect(
        caller.crudImportExport.exportAll({ tableName: 'nonexistent' })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('importData', () => {
    // ─── Институты (таблица с уникальным ключом university_code) ───
    describe('institutes (с уникальным ключом)', () => {
      it('вставляет новую запись (insert)', async () => {
        const countBefore = (await db.select().from(institutes)).length;
        const result = await caller.crudImportExport.importData({
          tableName: 'institutes',
          data: [
            { id: 100, name: 'Институт X', university_code: 10001, is_active: true },
            { id: 200, name: 'Институт Y', university_code: 10002, is_active: true },
          ],
        });
        expect(result.inserted).toBe(2);
        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);

        const all = await db.select().from(institutes);
        expect(all.length).toBe(countBefore + 2);
      });

      it('обновляет запись по уникальному ключу (игнорируя переданный id)', async () => {
        const originalId = await createTestInstitute({ name: 'Старое', universityCode: 33333 });
        const result = await caller.crudImportExport.importData({
          tableName: 'institutes',
          data: [
            { id: 99999, name: 'Новое', university_code: 33333, is_active: false },
          ],
        });
        expect(result.updated).toBe(1);
        expect(result.inserted).toBe(0);
        expect(result.skipped).toBe(0);

        const [updated] = await db.select().from(institutes).where(eq(institutes.id, originalId));
        expect(updated.name).toBe('Новое');
        expect(updated.isActive).toBe(false);
        expect(updated.id).toBe(originalId);
      });

      it('пропускает полностью идентичную запись (skip)', async () => {
        // Создаём запись, id не понадобится
        await createTestInstitute({ name: 'Пропуск', universityCode: 55555 });
        const result = await caller.crudImportExport.importData({
          tableName: 'institutes',
          data: [
            { id: 12345, name: 'Пропуск', university_code: 55555, is_active: true },
          ],
        });
        expect(result.skipped).toBe(1);
        expect(result.inserted).toBe(0);
        expect(result.updated).toBe(0);
        expect(result.errors).toHaveLength(0);
      });

      it('смешанный сценарий: insert + update + skip', async () => {
        // Создаём запись, existingId не нужен
        await createTestInstitute({ name: 'Обновляемый', universityCode: 77777 });
        const result = await caller.crudImportExport.importData({
          tableName: 'institutes',
          data: [
            { id: 1, name: 'Обновлённый', university_code: 77777, is_active: false }, // update
            { id: 2, name: 'Новый', university_code: 88888, is_active: true },        // insert
            { id: 3, name: 'Обновлённый', university_code: 77777, is_active: false }, // skip
          ],
        });
        expect(result.inserted).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.errors).toHaveLength(0);

        const all = await db.select().from(institutes);
        expect(all.length).toBeGreaterThanOrEqual(2);
      });

      it('валидация: ошибка при отсутствии обязательного поля', async () => {
        const result = await caller.crudImportExport.importData({
          tableName: 'institutes',
          data: [
            { id: 1, name: 'Без кода' },
          ],
        });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Код университета');
      });
    });

    // ─── Сотрудники (всегда INSERT) ───
    describe('employees (всегда INSERT)', () => {
      it('вставляет сотрудника, даже при полном дубликате', async () => {
        const countBefore = (await db.select().from(employees)).length;
        const employeeData = { id: 1, surname: 'Иванов', name: 'Иван', patronymic: 'Иванович', is_active: true };
        const first = await caller.crudImportExport.importData({
          tableName: 'employees',
          data: [employeeData],
        });
        expect(first.inserted).toBe(1);
        expect((await db.select().from(employees)).length).toBe(countBefore + 1);

        const second = await caller.crudImportExport.importData({
          tableName: 'employees',
          data: [employeeData],
        });
        expect(second.inserted).toBe(1);
        expect((await db.select().from(employees)).length).toBe(countBefore + 2);
      });

      it('игнорирует поле userId при импорте', async () => {
        const res = await caller.crudImportExport.importData({
          tableName: 'employees',
          data: [
            { id: 10, surname: 'Петров', name: 'Пётр', patronymic: '', is_active: true, userId: 'чужой-uuid' },
          ],
        });
        expect(res.inserted).toBe(1);
        const [emp] = await db.select().from(employees).where(eq(employees.surname, 'Петров'));
        expect(emp).toBeDefined();
        expect(emp.userId).toBeNull();
      });

      it('устанавливает isActive = true, если не указан', async () => {
        const res = await caller.crudImportExport.importData({
          tableName: 'employees',
          data: [
            { id: 20, surname: 'Сидоров', name: 'Сидор', patronymic: '' },
          ],
        });
        expect(res.inserted).toBe(1);
        const [emp] = await db.select().from(employees).where(eq(employees.surname, 'Сидоров'));
        expect(emp).toBeDefined();
        expect(emp.isActive).toBe(true);
      });

      it('валидация обязательных полей (surname)', async () => {
        const res = await caller.crudImportExport.importData({
          tableName: 'employees',
          data: [
            { id: 30, name: 'Без фамилии' },
          ],
        });
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toContain('Фамилия');
      });
    });

    // ─── Студенты (аналогично сотрудникам) ───
    describe('students (всегда INSERT)', () => {
      it('вставляет дубликаты', async () => {
        const countBefore = (await db.select().from(students)).length;
        const stud = { id: 1, surname: 'Студентов', name: 'Студент', patronymic: '', admission_year: 2020, profile_id: 1, is_active: true };
        const first = await caller.crudImportExport.importData({
          tableName: 'students',
          data: [stud],
        });
        expect(first.inserted).toBe(1);
        expect((await db.select().from(students)).length).toBe(countBefore + 1);

        const second = await caller.crudImportExport.importData({
          tableName: 'students',
          data: [stud],
        });
        expect(second.inserted).toBe(1);
        expect((await db.select().from(students)).length).toBe(countBefore + 2);
      });
    });

    // ─── Прочие проверки ───
    it('устанавливает умолчания для отсутствующего isActive (toggle)', async () => {
      const countBefore = (await db.select().from(buildings)).length;
      const res = await caller.crudImportExport.importData({
        tableName: 'buildings',
        data: [
          { id: 1, number: 999 },
        ],
      });
      expect(res.inserted).toBe(1);
      const [b] = await db.select().from(buildings).where(eq(buildings.number, 999));
      expect(b).toBeDefined();
      expect(b.isActive).toBe(true);
      expect((await db.select().from(buildings)).length).toBe(countBefore + 1);
    });

    it('ошибка при отсутствии id в строке', async () => {
      const data: Array<Record<string, unknown>> = [{ name: 'Без id' }];
      const result = await caller.crudImportExport.importData({
        tableName: 'institutes',
        data,
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('без id');
    });

    it('выбрасывает TRPCError при неверном tableName', async () => {
      await expect(
        caller.crudImportExport.importData({ tableName: 'no_table', data: [] })
      ).rejects.toThrow(TRPCError);
    });
  });
});