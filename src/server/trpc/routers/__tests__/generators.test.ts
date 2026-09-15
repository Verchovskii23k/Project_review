import { beforeAll, describe, expect, it } from 'vitest';
import { clearDatabase, seedTestData } from '@/test/fixtures/fixtures';
import { createTestCaller } from '@/test/trpc';

let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  await clearDatabase();
  await seedTestData();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});

describe('generators (ordered)', () => {
  it('1. создаёт учебные группы', async () => {
    const res = await caller.generations.generateGroups();
    expect(res.createdGroups).toBeGreaterThan(0);
  });

  it('2. создаёт юниты', async () => {
    const res = await caller.generations.generateUnits();
    expect(res.createdUnits).toBeGreaterThan(0);
  });

  it('3. создаёт занятия', async () => {
    const res = await caller.generations.generateLessons({ currentSemester: 1 });
    const count = Number(res.lessonsCreated);
    expect(isNaN(count)).toBe(false);
    expect(count).toBeGreaterThan(0);
  });

  it('4. автоматически назначает аудитории', async () => {
    const res = await caller.generations.assignClassroomsAuto();
    expect(res.assignedClassrooms).toBeGreaterThan(0);
  });

  it('5. генерирует расписание', async () => {
    const res = await caller.generations.generateSchedule({ totalWeeks: 16 });
    expect(res).toHaveProperty('status', 'schedule generated');
    expect(res.totalSlots).toBeGreaterThan(0);
  });
});
describe('generators order validation', () => {
  let caller2: Awaited<ReturnType<typeof createTestCaller>>;

  beforeAll(async () => {
    // полностью очищаем базу и наполняем справочниками (без генерации групп/юнитов)
    await clearDatabase();
    await seedTestData();
    caller2 = await createTestCaller({ id: 1, role: 'admin' });
  });

  it('выбрасывает ошибку, если generateUnits вызван до generateGroups', async () => {
    // групп ещё нет, роутер должен выбросить ошибку
    await expect(caller2.generations.generateUnits()).rejects.toThrow();
  });

  it('возвращает проблемы, если generateLessons вызван до generateUnits', async () => {
    // создаём группы, но не юниты
    await caller2.generations.generateGroups();
    const result = await caller2.generations.generateLessons({ currentSemester: 1 });
    // вместо исключения должны получить problems.no_units > 0
    expect(result).toHaveProperty('problems');
    expect(result.problems.no_units).toBeGreaterThan(0);
  });
});