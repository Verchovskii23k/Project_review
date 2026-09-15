/**
 * Тесты для мутации checkSlots (drag-and-drop проверка конфликтов).
 * Проверяет правила: потоки/группы/подгруппы, преподаватели, аудитории,
 * совместное размещение подгрупп одной группы, swap.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createCheckSlotsEnvironment } from '@/test/helpers';
import { db } from '@/db';
import { lessons, lessonClassrooms, scheduleDisplay, units, unitRoots, unitTypes, studyGroups, profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createTestCaller } from '@/test/trpc';

let env: Awaited<ReturnType<typeof createCheckSlotsEnvironment>>;
let caller: Awaited<ReturnType<typeof createTestCaller>>;

beforeAll(async () => {
  env = await createCheckSlotsEnvironment();
  caller = await createTestCaller({ id: 1, role: 'admin' });
});


// Вспомогательная функция для получения id слота и ключа
function s(weekIdx = 0, dayIdx = 0, pairIdx = 0, unitCode = 'SG1') {
  const w = env.weeks[weekIdx].id;
  const d = env.days[dayIdx].id;
  const p = env.pairs[pairIdx].id;
  const key = `week-${w}-${d}-${p}-${unitCode}`;
  return { w, d, p, unitCode, key };
}

describe('checkSlots', () => {
  it('свободный слот', async () => {
    const { w, d, p, key } = s(0, 0, 3); // 4-я пара свободна
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('free');
  });

  it('конфликт потока и подгруппы (общие группы)', async () => {
    const { w, d, p, key } = s(0, 0, 0, 'SG1'); // слот, где FLOW
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('conflict');
  });

  it('подгруппа и подгруппа без конфликта ресурсов – free', async () => {
    const { w, d, p, key } = s(0, 0, 2, 'SG1'); // слот с SG2
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('free');
  });

  it('подгруппа и подгруппа с одинаковым преподавателем – conflict', async () => {
    // Временно назначаем SG2 того же преподавателя, что и SG1
    await db.update(lessons).set({ teacherId: env.teacher2Id }).where(eq(lessons.id, env.sg2LessonId));
    const { w, d, p, key } = s(0, 0, 2, 'SG1');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('conflict');
    // Возвращаем обратно
    await db.update(lessons).set({ teacherId: env.teacher3Id }).where(eq(lessons.id, env.sg2LessonId));
  });

  it('подгруппа и подгруппа с одинаковой аудиторией – conflict', async () => {
    // Меняем аудиторию SG2 на ту же, что у SG1
    await db.delete(lessonClassrooms).where(eq(lessonClassrooms.lessonId, env.sg2LessonId));
    await db.insert(lessonClassrooms).values({ lessonId: env.sg2LessonId, classroomId: env.classroom2Id });
    const { w, d, p, key } = s(0, 0, 2, 'SG1');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('conflict');
    // Возвращаем
    await db.delete(lessonClassrooms).where(eq(lessonClassrooms.lessonId, env.sg2LessonId));
    await db.insert(lessonClassrooms).values({ lessonId: env.sg2LessonId, classroomId: env.classroom3Id });
  });

  it('swap между разными занятиями одного юнита (разные преподаватели)', async () => {
    // Создаём второй урок для SG1 с другим преподавателем (teacher3) и аудиторией (classroom3)
    const [lSG1bis] = await db.insert(lessons).values({
      curriculumId: env.curriculumId,
      unitId: env.unitSG1Id,
      lessonTypeId: 1,
      disciplineId: env.disciplineId,
      countPerSemester: 1,
      teacherId: env.teacher3Id,
      isActive: true,
    }).returning();
    // Привязываем аудиторию
    await db.insert(lessonClassrooms).values({ lessonId: lSG1bis.id, classroomId: env.classroom3Id });

    // Создаём запись в расписании для этого урока в другой ячейке
    const day1Id = env.days[1]?.id ?? env.days[0].id;
    const { w, p } = s(0, 0, 0); // используем первую пару
    const [sg1bis] = await db.insert(scheduleDisplay).values({
      lessonId: lSG1bis.id,
      weekId: w, dayOfWeekId: day1Id, pairNumberId: p,
      unitCode: 'SG1', displayText: 'sg1-bis', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    const key = `week-${w}-${day1Id}-${p}-SG1`;
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: day1Id, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('swap');
    expect(res[key].swapId).toBe(sg1bis.id);

    // Очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, sg1bis.id));
    await db.delete(lessonClassrooms).where(eq(lessonClassrooms.lessonId, lSG1bis.id));
    await db.delete(lessons).where(eq(lessons.id, lSG1bis.id));
  });

  it('обратный конфликт запрещает swap', async () => {
    // Добавляем в исходный слот SG1 (пара 1) занятие потока, которое создаст обратный конфликт
    const { w, d, p: p2 } = s(0, 0, 1, 'SG1'); // исходный слот SG1
    const [flowBlocker] = await db.insert(scheduleDisplay).values({
      lessonId: env.flowLessonId,
      weekId: w, dayOfWeekId: d, pairNumberId: p2,
      unitCode: 'FLOW', displayText: 'blocker', isBuffered: false, isActive: true,
    }).returning();

    // Создаём вторую SG1 в другом слоте для swap
    const day1Id = env.days[1]?.id ?? env.days[0].id;
    const p1 = env.pairs[0].id;
    const [sg1bis] = await db.insert(scheduleDisplay).values({
      lessonId: env.sg1LessonId,
      weekId: w, dayOfWeekId: day1Id, pairNumberId: p1,
      unitCode: 'SG1', displayText: 'sg1-bis', isBuffered: false, isActive: true,
    }).returning();

    // Попытка swap: SG1 (p2) -> слот SG1bis
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: day1Id, pairId: p1, unitCode: 'SG1' }],
    });
    const key = `week-${w}-${day1Id}-${p1}-SG1`;
    expect(res[key].status).toBe('conflict');

    // Убираем
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, flowBlocker.id));
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, sg1bis.id));
  });

  it('swap между разными неделями (без конфликтов)', async () => {
    // Создаём вторую запись SG1 на неделе 2, день 0, пара 0
    const week2Id = env.weeks[1]?.id ?? env.weeks[0].id; // неделя 2
    const day0Id = env.days[0].id;
    const pair0Id = env.pairs[0].id;

    // Кладём туда занятие с другим преподавателем (teacher3) и аудиторией (classroom3)
    const [lSG1bis] = await db.insert(lessons).values({
      curriculumId: env.curriculumId,
      unitId: env.unitSG1Id,
      lessonTypeId: 1,
      disciplineId: env.disciplineId,
      countPerSemester: 1,
      teacherId: env.teacher3Id,
      isActive: true,
    }).returning();
    await db.insert(lessonClassrooms).values({ lessonId: lSG1bis.id, classroomId: env.classroom3Id });

    const [sg1bis] = await db.insert(scheduleDisplay).values({
      lessonId: lSG1bis.id,
      weekId: week2Id, dayOfWeekId: day0Id, pairNumberId: pair0Id,
      unitCode: 'SG1', displayText: 'sg1-week2', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    const key = `week-${week2Id}-${day0Id}-${pair0Id}-SG1`;
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,           // запись на неделе 1, день 0, пара 1
      slots: [{ weekId: week2Id, dayId: day0Id, pairId: pair0Id, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('swap');
    expect(res[key].swapId).toBe(sg1bis.id);

    // Очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, sg1bis.id));
    await db.delete(lessonClassrooms).where(eq(lessonClassrooms.lessonId, lSG1bis.id));
    await db.delete(lessons).where(eq(lessons.id, lSG1bis.id));
  });

  it('занятие с positionFlag не блокируется в checkSlots (статус free)', async () => {
    // Устанавливаем positionFlag = true у SG1Entry
    await db.update(scheduleDisplay).set({ positionFlag: true }).where(eq(scheduleDisplay.id, env.sg1EntryId));

    const { w, d, p, key } = s(0, 0, 3); // свободный слот
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    // checkSlots не учитывает positionFlag, поэтому слот должен быть free
    expect(res[key].status).toBe('free');

    // Возвращаем обратно
    await db.update(scheduleDisplay).set({ positionFlag: false }).where(eq(scheduleDisplay.id, env.sg1EntryId));
  });

  it('буферное занятие не может обменяться (swap) с другим', async () => {
    // Делаем sg1Entry буферным
    await db.update(scheduleDisplay).set({ isBuffered: true, weekId: null, dayOfWeekId: null, pairNumberId: null })
      .where(eq(scheduleDisplay.id, env.sg1EntryId));

    // Создаём вторую SG1 для попытки swap
    const day1Id = env.days[1]?.id ?? env.days[0].id;
    const pair0Id = env.pairs[0].id;
    const [sg1bis] = await db.insert(scheduleDisplay).values({
      lessonId: env.sg1LessonId,
      weekId: env.weeks[0].id, dayOfWeekId: day1Id, pairNumberId: pair0Id,
      unitCode: 'SG1', displayText: 'sg1-bis', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    const key = `week-${env.weeks[0].id}-${day1Id}-${pair0Id}-SG1`;
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,   // буферное
      slots: [{ weekId: env.weeks[0].id, dayId: day1Id, pairId: pair0Id, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('conflict');

    // Возвращаем обратно
    await db.update(scheduleDisplay).set({ isBuffered: false, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[1].id })
      .where(eq(scheduleDisplay.id, env.sg1EntryId));

    // Убираем временную запись
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, sg1bis.id));
  });
    it('подгруппа и группа – conflict (общие группы)', async () => {
    // создадим группу GRP, которая тоже относится к groupId
    const utGroup = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ГРУППА')).limit(1).then(r => r[0]);
    const [unitGRP] = await db.insert(units).values({ code: 'GRP', unitTypeId: utGroup.id, isActive: true }).returning();
    const groupId = (await db.select({ id: studyGroups.id }).from(studyGroups).limit(1))[0].id;
      await db.insert(unitRoots).values({ unitCode: 'GRP', studyGroupId: groupId, isActive: true });
    // создадим lesson и entry для GRP в каком-то слоте
    const [lGRP] = await db.insert(lessons).values({
      curriculumId: env.curriculumId, unitId: unitGRP.id, lessonTypeId: 1, disciplineId: env.disciplineId,
      countPerSemester: 1, teacherId: env.teacher1Id, isActive: true,
    }).returning();
    const [grpEntry] = await db.insert(scheduleDisplay).values({
      lessonId: lGRP.id, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[3].id,
      unitCode: 'GRP', displayText: 'grp', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    const { w, d, p, key } = s(0, 0, 3, 'GRP');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'GRP' }],
    });
    expect(res[key].status).toBe('conflict');

    // очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, grpEntry.id));
    await db.delete(lessons).where(eq(lessons.id, lGRP.id));
    await db.delete(unitRoots).where(eq(unitRoots.unitCode, 'GRP'));
    await db.delete(units).where(eq(units.id, unitGRP.id));
  });

  it('поток и группа (общие группы) – conflict', async () => {
    // используем FLOW и создадим группу GRP, входящую в FLOW (studyGroupId уже общий)
    const utGroup = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ГРУППА')).limit(1).then(r => r[0]);
    const [unitGRP] = await db.insert(units).values({ code: 'GRP', unitTypeId: utGroup.id, isActive: true }).returning();
    const root = await db.select({ studyGroupId: unitRoots.studyGroupId }).from(unitRoots).where(eq(unitRoots.unitCode, 'FLOW')).limit(1);
    const groupId = root[0]?.studyGroupId;
    if (!groupId) throw new Error('No group for FLOW');
    await db.insert(unitRoots).values({ unitCode: 'GRP', studyGroupId: groupId, isActive: true });
    await db.insert(unitRoots).values({ unitCode: 'GRP', studyGroupId: groupId, isActive: true });
    const [lGRP] = await db.insert(lessons).values({
      curriculumId: env.curriculumId, unitId: unitGRP.id, lessonTypeId: 1, disciplineId: env.disciplineId,
      countPerSemester: 1, teacherId: env.teacher1Id, isActive: true,
    }).returning();
    const [grpEntry] = await db.insert(scheduleDisplay).values({
      lessonId: lGRP.id, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[3].id,
      unitCode: 'GRP', displayText: 'grp', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    // пытаемся переместить занятие потока в слот группы
    const { w, d, p, key } = s(0, 0, 3, 'FLOW');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.flowEntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'FLOW' }],
    });
    expect(res[key].status).toBe('conflict');

    // очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, grpEntry.id));
    await db.delete(lessons).where(eq(lessons.id, lGRP.id));
    await db.delete(unitRoots).where(eq(unitRoots.unitCode, 'GRP'));
    await db.delete(units).where(eq(units.id, unitGRP.id));
  });
    it('группа в слот с потоком (общие группы) – conflict', async () => {
    // создадим группу GRP, входящую в FLOW, и попробуем переместить GRP в слот FLOW
    const utGroup = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ГРУППА')).limit(1).then(r => r[0]);
    const [unitGRP] = await db.insert(units).values({ code: 'GRP2', unitTypeId: utGroup.id, isActive: true }).returning();
    const flowRoots = await db.select({ studyGroupId: unitRoots.studyGroupId }).from(unitRoots).where(eq(unitRoots.unitCode, 'FLOW'));
    const groupId = flowRoots[0]?.studyGroupId;
    if (!groupId) throw new Error('No group for FLOW');
    await db.insert(unitRoots).values({ unitCode: 'GRP2', studyGroupId: groupId, isActive: true });

    const [lGRP] = await db.insert(lessons).values({
      curriculumId: env.curriculumId, unitId: unitGRP.id, lessonTypeId: 1, disciplineId: env.disciplineId,
      countPerSemester: 1, teacherId: env.teacher1Id, isActive: true,
    }).returning();
    const [grpEntry] = await db.insert(scheduleDisplay).values({
      lessonId: lGRP.id, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[3].id,
      unitCode: 'GRP2', displayText: 'grp2', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    // перемещаем GRP в слот FLOW
    const flowSlot = s(0, 0, 0, 'GRP2');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: grpEntry.id,
      slots: [{ weekId: flowSlot.w, dayId: flowSlot.d, pairId: flowSlot.p, unitCode: 'GRP2' }],
    });
    const key = `week-${flowSlot.w}-${flowSlot.d}-${flowSlot.p}-GRP2`;
    expect(res[key].status).toBe('conflict');

    // очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, grpEntry.id));
    await db.delete(lessons).where(eq(lessons.id, lGRP.id));
    await db.delete(unitRoots).where(eq(unitRoots.unitCode, 'GRP2'));
    await db.delete(units).where(eq(units.id, unitGRP.id));
  });

  it('две группы без общих групп – free', async () => {
    // создадим вторую группу GRP3 с другой группой, никак не связанной с первой
    const utGroup = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ГРУППА')).limit(1).then(r => r[0]);
    const [unitGRP3] = await db.insert(units).values({ code: 'GRP3', unitTypeId: utGroup.id, isActive: true }).returning();
    const anotherGroup = await db.insert(studyGroups).values({
      code: 'TEST2',
      profileId: (await db.select({ id: profiles.id }).from(profiles).limit(1))[0].id,
      course: 1, studentCount: 10, isActive: true,
    }).returning().then(r => r[0]);
    await db.insert(unitRoots).values({ unitCode: 'GRP3', studyGroupId: anotherGroup.id, isActive: true });

    const [lGRP3] = await db.insert(lessons).values({
      curriculumId: env.curriculumId, unitId: unitGRP3.id, lessonTypeId: 1, disciplineId: env.disciplineId,
      countPerSemester: 1, teacherId: env.teacher1Id, isActive: true,
    }).returning();
    const [grp3Entry] = await db.insert(scheduleDisplay).values({
      lessonId: lGRP3.id, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[4].id,
      unitCode: 'GRP3', displayText: 'grp3', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    // перемещаем первую SG1 в слот GRP3 (должен быть free)
    const { w, d, p, key } = s(0, 0, 4, 'SG1');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.sg1EntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'SG1' }],
    });
    expect(res[key].status).toBe('free');

    // очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, grp3Entry.id));
    await db.delete(lessons).where(eq(lessons.id, lGRP3.id));
    await db.delete(unitRoots).where(eq(unitRoots.unitCode, 'GRP3'));
    await db.delete(units).where(eq(units.id, unitGRP3.id));
    await db.delete(studyGroups).where(eq(studyGroups.id, anotherGroup.id));
  });

  it('два потока с общими группами – conflict', async () => {
    // создадим второй поток FLOW2 с той же группой, что у FLOW
    const utFlow = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ПОТОК')).limit(1).then(r => r[0]);
    const [unitFlow2] = await db.insert(units).values({ code: 'FLOW2', unitTypeId: utFlow.id, isActive: true }).returning();
    const flowGroupId = (await db.select({ studyGroupId: unitRoots.studyGroupId }).from(unitRoots).where(eq(unitRoots.unitCode, 'FLOW')).limit(1))[0].studyGroupId;
    await db.insert(unitRoots).values({ unitCode: 'FLOW2', studyGroupId: flowGroupId, isActive: true });

    const [lFlow2] = await db.insert(lessons).values({
      curriculumId: env.curriculumId, unitId: unitFlow2.id, lessonTypeId: 1, disciplineId: env.disciplineId,
      countPerSemester: 1, teacherId: env.teacher1Id, isActive: true,
    }).returning();
    const [flow2Entry] = await db.insert(scheduleDisplay).values({
      lessonId: lFlow2.id, weekId: env.weeks[0].id, dayOfWeekId: env.days[0].id, pairNumberId: env.pairs[4].id,
      unitCode: 'FLOW2', displayText: 'flow2', isBuffered: false, isActive: true, versionId: null,
    }).returning();

    // пытаемся переместить FLOW в слот FLOW2
    const { w, d, p, key } = s(0, 0, 4, 'FLOW');
    const res = await caller.scheduleDisplay.checkSlots({
      movingId: env.flowEntryId,
      slots: [{ weekId: w, dayId: d, pairId: p, unitCode: 'FLOW' }],
    });
    expect(res[key].status).toBe('conflict');

    // очистка
    await db.delete(scheduleDisplay).where(eq(scheduleDisplay.id, flow2Entry.id));
    await db.delete(lessons).where(eq(lessons.id, lFlow2.id));
    await db.delete(unitRoots).where(eq(unitRoots.unitCode, 'FLOW2'));
    await db.delete(units).where(eq(units.id, unitFlow2.id));
  });
});