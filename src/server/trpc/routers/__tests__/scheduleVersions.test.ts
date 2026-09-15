/**
 * Тесты для мутаций scheduleVersions (версионирование расписания).
 *
 * Полностью соответствуют актуальной модели:
 * - чистый лист не содержит активных записей,
 * - переключение версий только меняет флаги (UPDATE isActive/versionId),
 *   без дублирования данных,
 * - saveActive создаёт неизменяемый снимок,
 * - delete полностью удаляет версию и её данные.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  scheduleVersions,
  scheduleDisplay,
  lessons,
  lessonClassrooms,
  units,
  unitRoots,
  studyGroups,
  employeesDepartments,
  classrooms,
  curriculum,
  unitTypes,
} from '@/db/schema';
import { eq, and, isNull, count } from 'drizzle-orm';
import { clearAllTestData, createTestUser } from '@/test/helpers';
import { seedTestData } from '@/test/fixtures/fixtures';
import { createTestCaller } from '@/test/trpc';

let caller: Awaited<ReturnType<typeof createTestCaller>>;
let base: Awaited<ReturnType<typeof seedTestData>>;

// Вспомогательная функция для создания минимальной «сгенерированной» записи
async function createActiveEntry(displayText: string) {
  const [lesson] = await db.select().from(lessons).limit(1);
  const [unit] = await db.select().from(units).limit(1);
  const [classroom] = await db.select().from(classrooms).limit(1);
  await db.insert(lessonClassrooms).values({
    lessonId: lesson.id,
    classroomId: classroom.id,
    isActive: true,
  }).onConflictDoNothing();
  await db.insert(scheduleDisplay).values({
    lessonId: lesson.id,
    weekId: 1,
    dayOfWeekId: 1,
    pairNumberId: 1,
    unitCode: unit.code,
    displayText,
    isBuffered: false,
    isActive: true,
    versionId: null,
  });
}

beforeEach(async () => {
  await clearAllTestData();
  base = await seedTestData();
  const userId = await createTestUser();
  caller = await createTestCaller({ id: userId, role: 'admin' });

  // Создаём тестовую группу и юнит
  const [group] = await db.insert(studyGroups).values({
    code: 'TEST-GRP',
    profileId: base.profiles.A,
    course: 1,
    studentCount: 10,
    isActive: true,
  }).returning();
  const [unitType] = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ГРУППА')).limit(1);
  const [unit] = await db.insert(units).values({
    code: 'TEST-UNIT',
    unitTypeId: unitType.id,
    isActive: true,
  }).returning();
  await db.insert(unitRoots).values({
    unitCode: unit.code,
    studyGroupId: group.id,
    isActive: true,
  });
  const [edId] = await db.select({ id: employeesDepartments.id })
    .from(employeesDepartments)
    .where(eq(employeesDepartments.employeeId, base.employees.E1))
    .limit(1);
  await db.insert(lessons).values({
    curriculumId: (await db.select().from(curriculum).limit(1))[0].id,
    unitId: unit.id,
    lessonTypeId: base.lessonTypes.lecture,
    disciplineId: base.disciplines.D1,
    countPerSemester: 1,
    teacherId: edId?.id,
    isActive: true,
  });
});

describe('scheduleVersions (actual logic)', () => {
  it('list пуст изначально', async () => {
    expect(await caller.scheduleVersions.list()).toHaveLength(0);
  });

  it('saveActive создаёт версию и копирует активные данные', async () => {
    await createActiveEntry('test');

    const { versionId } = await caller.scheduleVersions.saveActive({ name: 'v1' });
    expect(versionId).toBeGreaterThan(0);

    const [ver] = await db.select().from(scheduleVersions).where(eq(scheduleVersions.id, versionId));
    expect(ver.name).toBe('v1');

    // Архивная копия есть, активная осталась
    const archCount = await db.select({ count: count() }).from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.versionId, versionId), eq(scheduleDisplay.isActive, false)));
    expect(archCount[0].count).toBe(1);

    const activeCount = await db.select({ count: count() }).from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(activeCount[0].count).toBe(1);

    // Проверяем, что lessonClassrooms теперь тоже скопировались (с дедупликацией)
    const archLc = await db.select({ count: count() }).from(lessonClassrooms)
        .where(eq(lessonClassrooms.versionId, versionId));
    // Ожидаем как минимум одну запись, а не 0
    expect(archLc[0].count).toBeGreaterThanOrEqual(1);
  });

  it('saveActive: дубликат имени – CONFLICT', async () => {
    await createActiveEntry('tmp');
    await caller.scheduleVersions.saveActive({ name: 'v1' });
    await expect(caller.scheduleVersions.saveActive({ name: 'v1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('switchToVersion: переключение между версиями и чистым листом', async () => {
    // Создаём версию v1
    await createActiveEntry('v1');
    const { versionId: v1Id } = await caller.scheduleVersions.saveActive({ name: 'v1' });

    // Переключаемся на чистый лист
    await caller.scheduleVersions.switchToVersion({ currentVersionId: v1Id, targetVersionId: null });
    let active = await db.select({ count: count() }).from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(active[0].count).toBe(0); // записей нет

    // Создаём новое расписание и сохраняем как v2
    await createActiveEntry('v2');
    const { versionId: v2Id } = await caller.scheduleVersions.saveActive({ name: 'v2' });

    // Переключаемся на v1
    await caller.scheduleVersions.switchToVersion({ currentVersionId: v2Id, targetVersionId: v1Id });
    const v1Rows = await db.select().from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(v1Rows).toHaveLength(1);
    expect(v1Rows[0].displayText).toBe('v1');

    // Переключаемся на v2
    await caller.scheduleVersions.switchToVersion({ currentVersionId: v1Id, targetVersionId: v2Id });
    const v2Rows = await db.select().from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(v2Rows).toHaveLength(1);
    expect(v2Rows[0].displayText).toBe('v2');
  });

  it('переключение не оставляет мусора (многократные переключения)', async () => {
    // v1
    await createActiveEntry('v1');
    const { versionId: v1Id } = await caller.scheduleVersions.saveActive({ name: 'v1' });
    // v2
    await db.update(scheduleDisplay)
      .set({ displayText: 'v2' })
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    const { versionId: v2Id } = await caller.scheduleVersions.saveActive({ name: 'v2' });

    // Многократные переключения
    for (let i = 0; i < 3; i++) {
      await caller.scheduleVersions.switchToVersion({ currentVersionId: v2Id, targetVersionId: v1Id });
      await caller.scheduleVersions.switchToVersion({ currentVersionId: v1Id, targetVersionId: v2Id });
    }

    // В конце должны быть активны записи v2 (последнее переключение)
    const active = await db.select().from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.isActive, true), isNull(scheduleDisplay.versionId)));
    expect(active).toHaveLength(1);
    expect(active[0].displayText).toBe('v2');

    // Архив v1 не должен быть пустым и содержать ровно одну запись
    const archV1 = await db.select().from(scheduleDisplay)
      .where(and(eq(scheduleDisplay.versionId, v1Id), eq(scheduleDisplay.isActive, false)));
    expect(archV1).toHaveLength(1);
    expect(archV1[0].displayText).toBe('v1');
  });

  it('delete полностью удаляет версию и её данные', async () => {
    await createActiveEntry('tmp');
    const { versionId } = await caller.scheduleVersions.saveActive({ name: 'toDelete' });
    // Переключаемся на чистый лист, чтобы версия стала архивной
    await caller.scheduleVersions.switchToVersion({ currentVersionId: versionId, targetVersionId: null });
    await caller.scheduleVersions.delete({ versionId });

    // Версии нет в списке
    const list = await caller.scheduleVersions.list();
    expect(list.find(v => v.id === versionId)).toBeUndefined();

    // Все записи с этим versionId удалены
    const remaining = await db.select({ count: count() }).from(scheduleDisplay)
      .where(eq(scheduleDisplay.versionId, versionId));
    expect(remaining[0].count).toBe(0);
  });

  it('update переименовывает версию', async () => {
    await createActiveEntry('tmp');
    const { versionId } = await caller.scheduleVersions.saveActive({ name: 'old' });
    await caller.scheduleVersions.update({ versionId, name: 'new' });
    const [ver] = await db.select().from(scheduleVersions).where(eq(scheduleVersions.id, versionId));
    expect(ver.name).toBe('new');
  });

  it('update: дубликат имени – CONFLICT', async () => {
    await createActiveEntry('tmp');
    await caller.scheduleVersions.saveActive({ name: 'v1' });
    const { versionId: v2Id } = await caller.scheduleVersions.saveActive({ name: 'v2' });
    await expect(caller.scheduleVersions.update({ versionId: v2Id, name: 'v1' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});