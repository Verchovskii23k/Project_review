import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '@/db';
import { clearAllTestData } from '@/test/helpers';
import { seedTestData } from '@/test/fixtures/fixtures';
import { scheduleDisplayRouter } from '../scheduleDisplay';
import { Context } from '@/server/trpc';
import {
  scheduleDisplay,
  lessons,
  units,
  unitRoots,
  studyGroups,
  employees,
  employeesDepartments,
  curriculum,
  curriculumProfiles,
  daysOfWeek,
  pairs,
  weeks,
  disciplines,
  unitTypes,
  profiles,
  departments,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

const mockContext = (): Context => {
  const mockUser = {
    id: 'admin-id',
    email: 'admin@test.local',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Admin',
    emailVerified: true,
    image: null,
  };

  const mockSession = {
    session: {
      id: 'session-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'admin-id',
      expiresAt: new Date(),
      token: 'token',
      ipAddress: null,
      userAgent: null,
    },
    user: mockUser,
  };

  return {
    db,
    session: mockSession as Context['session'],
    req: {} as never,
  };
};

const caller = scheduleDisplayRouter.createCaller(mockContext());

describe('scheduleDisplayRouter', () => {
  let flowUnitId: number;
  let sg1UnitId: number;
  let studyGroupId: number;
  let flowLessonId: number;
  let secondFlowLessonId: number;
  let weekId: number;
  let dayId: number;
  let pairId1: number;
  let pairId2: number;

  beforeAll(async () => {
    await clearAllTestData();
    const seed = await seedTestData();

    const flowType = await db.select({ id: unitTypes.id }).from(unitTypes).where(eq(unitTypes.name, 'ПОТОК')).limit(1).then(r => r[0]);
    const subType = await db.select({ id: unitTypes.id }).from(unitTypes).where(eq(unitTypes.name, 'ПОДГРУППА')).limit(1).then(r => r[0]);
    if (!flowType || !subType) throw new Error('unitTypes not seeded');

    const [flowUnit] = await db.insert(units).values({ code: 'FLOW', unitTypeId: flowType.id, isActive: true }).returning();
    const [sg1Unit] = await db.insert(units).values({ code: 'SG1', unitTypeId: subType.id, isActive: true }).returning();
    flowUnitId = flowUnit.id;
    sg1UnitId = sg1Unit.id;

    const profile = await db.select({ id: profiles.id }).from(profiles).limit(1).then(r => r[0]);
    const [group] = await db.insert(studyGroups).values({ code: 'TEST-GROUP', profileId: profile.id, course: 1, studentCount: 20, isActive: true }).returning();
    studyGroupId = group.id;

    await db.insert(unitRoots).values([
      { unitCode: 'FLOW', studyGroupId, isActive: true },
      { unitCode: 'SG1', studyGroupId, isActive: true },
    ]);

    const disc = await db.select({ id: disciplines.id }).from(disciplines).limit(1).then(r => r[0]);
    const [cur] = await db.insert(curriculum).values({ course: 1, semester: 1, disciplineId: disc.id, hoursLecture: 0, isActive: true }).returning();
    await db.insert(curriculumProfiles).values({ curriculumId: cur.id, profileId: profile.id });

    const dept = await db.select({ id: departments.id }).from(departments).limit(1).then(r => r[0]);
    const [emp1] = await db.insert(employees).values({ surname: 'Тестов1', name: 'Препод1', isActive: true }).returning();
    const [ed1] = await db.insert(employeesDepartments).values({ employeeId: emp1.id, departmentId: dept.id, isActive: true }).returning();

    const [emp2] = await db.insert(employees).values({ surname: 'Тестов2', name: 'Препод2', isActive: true }).returning();
    const [ed2] = await db.insert(employeesDepartments).values({ employeeId: emp2.id, departmentId: dept.id, isActive: true }).returning();

    const [flowLesson] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: flowUnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: ed1.id, isActive: true,
    }).returning();
    const [flowLesson2] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: flowUnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: ed2.id, isActive: true,
    }).returning();
    const [_sg1Lesson] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: sg1UnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: ed1.id, isActive: true,
    }).returning();
    flowLessonId = flowLesson.id;
    secondFlowLessonId = flowLesson2.id;

    const days = await db.select().from(daysOfWeek).limit(1);
    const pairsList = await db.select().from(pairs).limit(2);
    const weeksList = await db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1);
    dayId = days[0].id;
    pairId1 = pairsList[0].id;
    pairId2 = pairsList[1].id;
    weekId = weeksList[0].id;
  });

  afterEach(async () => {
    await db.delete(scheduleDisplay);
  });

  afterAll(async () => {
    await clearAllTestData();
  });

  it('moveToBuffer должен очищать координаты и флаги', async () => {
    const [entry] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      positionFlag: true,
      mergeNumber: 42,
      isActive: true,
      versionId: null,
      displayText: 'test',
    }).returning();
    await caller.moveToBuffer({ id: entry.id, versionId: null });
    const updated = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, entry.id));
    expect(updated[0].isBuffered).toBe(true);
    expect(updated[0].weekId).toBeNull();
    expect(updated[0].dayOfWeekId).toBeNull();
    expect(updated[0].pairNumberId).toBeNull();
    expect(updated[0].positionFlag).toBe(false);
    expect(updated[0].mergeNumber).toBe(0);
  });

  it('moveFromBuffer должен размещать буферное занятие в свободный слот', async () => {
    const [entry] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId: null,
      dayOfWeekId: null,
      pairNumberId: null,
      isBuffered: true,
      isActive: true,
      versionId: null,
      displayText: 'test',
    }).returning();
    await caller.moveFromBuffer({
      id: entry.id,
      targetWeekId: weekId,
      targetDayId: dayId,
      targetPairId: pairId1,
      targetUnitCode: 'FLOW',
      versionId: null,
    });
    const updated = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, entry.id));
    expect(updated[0].isBuffered).toBe(false);
    expect(updated[0].weekId).toBe(weekId);
    expect(updated[0].dayOfWeekId).toBe(dayId);
    expect(updated[0].pairNumberId).toBe(pairId1);
  });

  it('move должен перемещать занятие в свободный слот и сбрасывать флаги', async () => {
    const [entry] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      positionFlag: true,
      mergeNumber: 42,
      isActive: true,
      versionId: null,
      displayText: 'test',
    }).returning();
    await caller.move({
      id: entry.id,
      targetWeekId: weekId,
      targetDayId: dayId,
      targetPairId: pairId2,
      targetUnitCode: 'FLOW',
      versionId: null,
    });
    const updated = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, entry.id));
    expect(updated[0].weekId).toBe(weekId);
    expect(updated[0].dayOfWeekId).toBe(dayId);
    expect(updated[0].pairNumberId).toBe(pairId2);
    expect(updated[0].positionFlag).toBe(false);
    expect(updated[0].mergeNumber).toBe(0);
  });

  it('swap должен обменивать два занятия и сбрасывать флаги', async () => {
    const [entry1] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      positionFlag: true,
      mergeNumber: 1,
      isActive: true,
      versionId: null,
      displayText: 'test1',
    }).returning();
    const [entry2] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId2,
      positionFlag: true,
      mergeNumber: 2,
      isActive: true,
      versionId: null,
      displayText: 'test2',
    }).returning();
    await caller.swap({ id1: entry1.id, id2: entry2.id, versionId: null });
    const updated1 = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, entry1.id));
    const updated2 = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, entry2.id));
    expect(updated1[0].pairNumberId).toBe(pairId2);
    expect(updated2[0].pairNumberId).toBe(pairId1);
    expect(updated1[0].positionFlag).toBe(false);
    expect(updated1[0].mergeNumber).toBe(0);
    expect(updated2[0].positionFlag).toBe(false);
    expect(updated2[0].mergeNumber).toBe(0);
  });

  it('checkSlots должен возвращать swap для небуферных занятий одного юнита', async () => {
    const [entry1] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      isBuffered: false,
      isActive: true,
      versionId: null,
      displayText: 'entry1',
    }).returning();
    const [entry2] = await db.insert(scheduleDisplay).values({
      lessonId: secondFlowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId2,
      isBuffered: false,
      isActive: true,
      versionId: null,
      displayText: 'entry2',
    }).returning();
    void entry2;
    const result = await caller.checkSlots({
      movingId: entry1.id,
      slots: [{ weekId, dayId, pairId: pairId2, unitCode: 'FLOW' }],
      versionId: null,
    });
    const key = `week-${weekId}-${dayId}-${pairId2}-FLOW`;
    expect(result[key].status).toBe('swap');
  });

  it('moveFromBuffer на занятый слот должен выбрасывать CONFLICT', async () => {
    const [buffered] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId: null,
      dayOfWeekId: null,
      pairNumberId: null,
      isBuffered: true,
      isActive: true,
      versionId: null,
      displayText: 'buffered',
    }).returning();

    const [occupying] = await db.insert(scheduleDisplay).values({
      lessonId: secondFlowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      isBuffered: false,
      isActive: true,
      versionId: null,
      displayText: 'occupying',
    }).returning();
    void occupying;

    await expect(caller.moveFromBuffer({
      id: buffered.id,
      targetWeekId: weekId,
      targetDayId: dayId,
      targetPairId: pairId1,
      targetUnitCode: 'FLOW',
      versionId: null,
    })).rejects.toThrow(/Слот занят/);
  });

  it('checkSlots с буферным занятием должен возвращать conflict', async () => {
    // Создаём занятие, занимающее слот
    const [_occupying] = await db.insert(scheduleDisplay).values({
      lessonId: flowLessonId,
      unitCode: 'FLOW',
      weekId,
      dayOfWeekId: dayId,
      pairNumberId: pairId1,
      isBuffered: false,
      isActive: true,
      versionId: null,
      displayText: 'occupying',
    }).returning();

    // Создаём буферное занятие
    const [buffered] = await db.insert(scheduleDisplay).values({
      lessonId: secondFlowLessonId,
      unitCode: 'FLOW',
      weekId: null,
      dayOfWeekId: null,
      pairNumberId: null,
      isBuffered: true,
      isActive: true,
      versionId: null,
      displayText: 'buffered',
    }).returning();

    const result = await caller.checkSlots({
      movingId: buffered.id,
      slots: [{ weekId, dayId, pairId: pairId1, unitCode: 'FLOW' }],
      versionId: null,
    });
    const key = `week-${weekId}-${dayId}-${pairId1}-FLOW`;
    expect(result[key].status).toBe('conflict');
    expect(result[key].reason).toMatch(/буферное занятие не может быть обменяно/i);
  });
});