/**
 * Тесты для globalImportExport роутера.
 *
 * Проверяет глобальный экспорт всей базы в JSON и импорт из JSON
 * с корректным переназначением внешних ключей и соблюдением порядка таблиц.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestCaller } from '@/test/trpc';
import {
  clearAllTestData,
  createTestInstitute,
} from '@/test/helpers';
import { db } from '@/db';
import { institutes, departments, employees } from '@/db/schema';
import { eq } from 'drizzle-orm';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearAllTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('globalImportExport', () => {
  describe('exportAll', () => {
    it('возвращает объект с ключами таблиц и пустыми массивами для пустой БД', async () => {
      const result = await caller.globalImportExport.exportAll();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('institutes');
      expect(Array.isArray(result.institutes)).toBe(true);
      expect(result.institutes).toHaveLength(0);
    });

    it('экспортирует созданные записи (ключи camelCase)', async () => {
      await createTestInstitute({ name: 'Экспортный', universityCode: 12345 });
      const exportData = await caller.globalImportExport.exportAll();
      expect(exportData.institutes).toHaveLength(1);
      const inst = exportData.institutes[0] as Record<string, unknown>;
      expect(inst.name).toBe('Экспортный');
      expect(inst.universityCode).toBe(12345);
      // Проверяем, что id существует, но не равен null
      expect(inst.id).toBeGreaterThan(0);
    });
  });

  describe('importAll', () => {
    it('импортирует институты и кафедры с ремаппингом FK', async () => {
      // Очищаем всё перед импортом
      await clearAllTestData();

      const importPayload = {
        institutes: [
          { id: 1, name: 'Институт И1', universityCode: 11111, directorId: null, isActive: true },
          { id: 2, name: 'Институт И2', universityCode: 22222, directorId: null, isActive: true },
        ],
        departments: [
          { id: 10, name: 'Кафедра К1', abbreviation: 'К1', instituteId: 1, departmentCode: 201, headId: null, isActive: true },
          { id: 20, name: 'Кафедра К2', abbreviation: 'К2', instituteId: 2, departmentCode: 202, headId: null, isActive: true },
        ],
      };

      const stats = await caller.globalImportExport.importAll(importPayload);
      expect(stats.institutes.inserted).toBe(2);
      expect(stats.departments.inserted).toBe(2);

      // Проверяем, что институты действительно вставились
      const allInstitutes = await db.select().from(institutes);
      expect(allInstitutes).toHaveLength(2);

      // Проверяем, что кафедры ссылаются на новые id институтов
      const allDepartments = await db.select().from(departments);
      expect(allDepartments).toHaveLength(2);
      const dept1 = allDepartments.find(d => d.abbreviation === 'К1');
      const inst1 = allInstitutes.find(i => i.universityCode === 11111);
      expect(dept1?.instituteId).toBe(inst1?.id);
    });

    it('обновляет существующую запись по уникальному ключу', async () => {
    // Создаём уникальный институт (без удаления всей таблицы)
    const instId = await createTestInstitute({ name: 'Старое', universityCode: 33333 });
    const exportData = await caller.globalImportExport.exportAll();
    // Находим наш институт по коду
    const inst = (exportData.institutes as Record<string, unknown>[]).find(
        (i) => i.universityCode === 33333
    );
    if (!inst) throw new Error('Институт не найден в экспорте');
    const payload = {
        institutes: [
        { ...inst, name: 'Новое имя' },
        ],
    };
    const stats = await caller.globalImportExport.importAll(payload);
    expect(stats.institutes.updated).toBe(1);
    const updated = await db.select().from(institutes).where(eq(institutes.id, instId));
    expect(updated[0].name).toBe('Новое имя');
    });

    it('пропускает неизменённую запись', async () => {
      await createTestInstitute({ name: 'Пропуск', universityCode: 44444 });
      const exportData = await caller.globalImportExport.exportAll();
      const inst = exportData.institutes[0] as Record<string, unknown>;
      const stats = await caller.globalImportExport.importAll({ institutes: [inst] });
      expect(stats.institutes.skipped).toBe(1);
    });

    it('employees и students всегда вставляются как новые (INSERT)', async () => {
      // Создаём одного сотрудника
      await db.insert(employees).values({
        surname: 'Старый',
        name: 'Сотрудник',
        isActive: true,
        isAdmin: false,
      });
      const exportData = await caller.globalImportExport.exportAll();
      // Имитируем импорт того же сотрудника
      const payload = {
        employees: exportData.employees,
      };
      const stats = await caller.globalImportExport.importAll(payload);
      // Должно быть inserted: 1 (старый остался, новый добавился)
      expect(stats.employees.inserted).toBe(1);
      const allEmps = await db.select().from(employees);
      expect(allEmps).toHaveLength(2); // старый + новый
    });

    it('корректно обрабатывает пустой импорт', async () => {
      const stats = await caller.globalImportExport.importAll({});
      // Никаких ошибок, все счётчики нулевые
      Object.values(stats).forEach(tableStats => {
        expect(tableStats.inserted).toBe(0);
        expect(tableStats.updated).toBe(0);
        expect(tableStats.skipped).toBe(0);
        expect(tableStats.errors).toHaveLength(0);
      });
    });

    it('добавляет ошибку для некорректной строки (не объект)', async () => {
    const payload: Record<string, unknown[]> = {
        institutes: [null, 123, 'строка'],
    };
    const stats = await caller.globalImportExport.importAll(payload);
    expect(stats.institutes.errors.length).toBeGreaterThan(0);
    });
  });
});