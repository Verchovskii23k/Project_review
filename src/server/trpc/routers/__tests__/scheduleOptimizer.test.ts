import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '@/db';
import { clearAllTestData } from '@/test/helpers';
import { seedTestData } from '@/test/fixtures/fixtures';
import { optimizeSchedule } from '../scheduleOptimizer';
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
  classrooms,
  buildings,
  hourTypeMapping,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('scheduleOptimizer', () => {
  let flowUnitId: number;
  let sg1UnitId: number;
  let sg2UnitId: number;
  let studyGroupId: number;
  let flowLessonId: number;
  let sg1LessonId: number;
  let sg2LessonId: number;
  let teacherEdId: number;
  let largeClassroomId: number;

  beforeAll(async () => {
    await clearAllTestData();
    const seed = await seedTestData();

    const flowType = await db.select({ id: unitTypes.id }).from(unitTypes).where(eq(unitTypes.name, 'ПОТОК')).limit(1).then(r => r[0]);
    const subType = await db.select({ id: unitTypes.id }).from(unitTypes).where(eq(unitTypes.name, 'ПОДГРУППА')).limit(1).then(r => r[0]);
    if (!flowType || !subType) throw new Error('unitTypes not seeded');

    const [flowUnit] = await db.insert(units).values({ code: 'FLOW', unitTypeId: flowType.id, isActive: true }).returning();
    const [sg1Unit] = await db.insert(units).values({ code: 'SG1', unitTypeId: subType.id, isActive: true }).returning();
    const [sg2Unit] = await db.insert(units).values({ code: 'SG2', unitTypeId: subType.id, isActive: true }).returning();
    flowUnitId = flowUnit.id;
    sg1UnitId = sg1Unit.id;
    sg2UnitId = sg2Unit.id;

    const profile = await db.select({ id: profiles.id }).from(profiles).limit(1).then(r => r[0]);
    const [group] = await db.insert(studyGroups).values({ code: 'TEST-GROUP', profileId: profile.id, course: 1, studentCount: 20, isActive: true }).returning();
    studyGroupId = group.id;

    await db.insert(unitRoots).values([
      { unitCode: 'FLOW', studyGroupId, isActive: true },
      { unitCode: 'SG1', studyGroupId, isActive: true },
      { unitCode: 'SG2', studyGroupId, isActive: true },
    ]);

    const disc = await db.select({ id: disciplines.id }).from(disciplines).limit(1).then(r => r[0]);
    const [cur] = await db.insert(curriculum).values({ course: 1, semester: 1, disciplineId: disc.id, hoursLecture: 0, isActive: true }).returning();
    await db.insert(curriculumProfiles).values({ curriculumId: cur.id, profileId: profile.id });

    const dept = await db.select({ id: departments.id }).from(departments).limit(1).then(r => r[0]);
    const [emp] = await db.insert(employees).values({ surname: 'Тестов', name: 'Препод', isActive: true }).returning();
    const [ed] = await db.insert(employeesDepartments).values({ employeeId: emp.id, departmentId: dept.id, isActive: true }).returning();
    teacherEdId = ed.id;

    const [flowLesson] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: flowUnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: teacherEdId, isActive: true,
    }).returning();
    const [sg1Lesson] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: sg1UnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: teacherEdId, isActive: true,
    }).returning();
    const [sg2Lesson] = await db.insert(lessons).values({
      curriculumId: cur.id, unitId: sg2UnitId, lessonTypeId: seed.lessonTypes.lecture,
      disciplineId: disc.id, countPerSemester: 1, teacherId: teacherEdId, isActive: true,
    }).returning();
    flowLessonId = flowLesson.id;
    sg1LessonId = sg1Lesson.id;
    sg2LessonId = sg2Lesson.id;
    // Убедимся, что для типа занятия "lecture" есть mapping в hourTypeMapping
    const existingMapping = await db
      .select()
      .from(hourTypeMapping)
      .where(eq(hourTypeMapping.lessonTypeId, seed.lessonTypes.lecture))
      .limit(1);

    if (existingMapping.length === 0) {
      await db.insert(hourTypeMapping).values({
        lessonTypeId: seed.lessonTypes.lecture,
        planHourColumn: 'hoursLecture',   // ← добавить обязательное поле
        priorityColumn: 'priorityLecture',
        isActive: true,
      });
    }
    const building = await db.select({ id: buildings.id }).from(buildings).limit(1).then(r => r[0]);
    const [classroom] = await db.insert(classrooms).values({
      buildingId: building.id,
      roomNumber: '777',
      capacity: 40,
      isActive: true,
    }).returning();
    largeClassroomId = classroom.id;
  });

  afterEach(async () => {
    await db.delete(scheduleDisplay);
  });

  afterAll(async () => {
    // очистка не требуется
  });

  async function createScheduleEntry(params: {
    unitCode: string;
    weekId: number | null;
    dayId: number | null;
    pairId: number | null;
    isBuffered?: boolean;
    positionFlag?: boolean;
    mergeNumber?: number;
    classroomId?: number | null;
  }) {
    let lessonId: number;
    if (params.unitCode === 'FLOW') lessonId = flowLessonId;
    else if (params.unitCode === 'SG1') lessonId = sg1LessonId;
    else if (params.unitCode === 'SG2') lessonId = sg2LessonId;
    else throw new Error(`Unknown unitCode: ${params.unitCode}`);

    const [entry] = await db.insert(scheduleDisplay).values({
      lessonId,
      unitCode: params.unitCode,
      weekId: params.weekId,
      dayOfWeekId: params.dayId,
      pairNumberId: params.pairId,
      isBuffered: params.isBuffered ?? false,
      positionFlag: params.positionFlag ?? false,
      mergeNumber: params.mergeNumber ?? 0,
      classroomId: params.classroomId ?? null,
      isActive: true,
      versionId: null,
      displayText: `test-${params.unitCode}`,
    }).returning();
    return { entryId: entry.id, lessonId };
  }

  async function getMeta() {
    const days = await db.select().from(daysOfWeek).orderBy(daysOfWeek.id);
    const pairsList = await db.select().from(pairs).orderBy(pairs.number);
    const weeksList = await db.select().from(weeks).where(eq(weeks.isActive, true)).orderBy(weeks.id);
    return { days, pairs: pairsList, weeks: weeksList };
  }

  it('должен вернуть сообщение, если занятий меньше двух', async () => {
    const result = await optimizeSchedule(null, false);
    expect(result.message).toBe('Слишком мало занятий');
    expect(result.bufferedCount).toBe(0);
  });

  it('должен разместить буферное занятие в свободный слот', async () => {
    const { days, pairs, weeks } = await getMeta();
    const day = days[0];
    const week = weeks[0];
    await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[1].id, isBuffered: false });
    await createScheduleEntry({ unitCode: 'SG1', weekId: null, dayId: null, pairId: null, isBuffered: true });
    const result = await optimizeSchedule(null, true);
    expect(result.bufferedCount).toBe(1);
    expect(result.bufferedPlaced).toBe(1);
    expect(result.bufferedFailed).toBe(0);
    const bufferedLeft = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.isBuffered, true));
    expect(bufferedLeft.length).toBe(0);
  });

  // Простой тест: если есть свободный слот, буферное занятие обязательно его займёт
  it('если есть свободный слот, буферное занятие гарантированно его занимает', async () => {
    const { days, pairs, weeks } = await getMeta();
    const day = days[0];
    const week = weeks[0];
    // Создаём одно занятие, оставляя много свободных слотов
    await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[0].id, isBuffered: false });
    await createScheduleEntry({ unitCode: 'SG1', weekId: null, dayId: null, pairId: null, isBuffered: true });
    const result = await optimizeSchedule(null, true);
    expect(result.bufferedPlaced).toBe(1);
    expect(result.bufferedFailed).toBe(0);
    // Проверяем, что буферное занятие теперь не в буфере
    const bufferedEntries = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.isBuffered, true));
    expect(bufferedEntries.length).toBe(0);
    // Проверяем, что общее количество занятий увеличилось на 1
    const allEntries = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.isBuffered, false));
    expect(allEntries.length).toBe(2);
  });

  it('должен не смочь разместить буферное занятие, если все слоты заблокированы флагом positionFlag', async () => {
    const { days, pairs, weeks } = await getMeta();
    for (const week of weeks) {
      for (const day of days) {
        for (const pair of pairs) {
          await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pair.id, positionFlag: true, isBuffered: false });
        }
      }
    }
    await createScheduleEntry({ unitCode: 'SG1', weekId: null, dayId: null, pairId: null, isBuffered: true });
    const result = await optimizeSchedule(null, true);
    expect(result.bufferedCount).toBe(1);
    expect(result.bufferedPlaced).toBe(0);
    expect(result.bufferedFailed).toBe(1);
  });

  it('должен уважать флаг positionFlag в основном цикле оптимизации', async () => {
    const { days, pairs, weeks } = await getMeta();
    const day = days[0];
    const week = weeks[0];
    const fixed = await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[0].id, positionFlag: true, isBuffered: false });
    await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[1].id, isBuffered: false });
    await optimizeSchedule(null, false);
    const updated = await db.select().from(scheduleDisplay).where(eq(scheduleDisplay.id, fixed.entryId));
    expect(updated[0].weekId).toBe(week.id);
    expect(updated[0].dayOfWeekId).toBe(day.id);
    expect(updated[0].pairNumberId).toBe(pairs[0].id);
  });

  it('должен обрабатывать группы слияния: перемещать группу вместе и подбирать аудиторию', async () => {
    const { days, pairs, weeks } = await getMeta();
    const day = days[0];
    const week = weeks[0];
    const mergeNum = 42;
    await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[0].id, mergeNumber: mergeNum, isBuffered: false });
    await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pairs[1].id, mergeNumber: mergeNum, isBuffered: false });
    await db.update(classrooms).set({ priorityLecture: 1 }).where(eq(classrooms.id, largeClassroomId));
    const result = await optimizeSchedule(null, false);
    expect(result.totalMergeGroups).toBe(1);
    expect(result.mergeGroupsFinalPlaced).toBe(1);
  }, 90000);

  it('должен возвращать корректную статистику по буферу', async () => {
    const { days, pairs, weeks } = await getMeta();
    for (const week of weeks) {
      for (const day of days) {
        for (const pair of pairs) {
          if (week.id === weeks[0].id && day.id === days[0].id && pair.id === pairs[0].id) {
            continue;
          }
          await createScheduleEntry({ unitCode: 'FLOW', weekId: week.id, dayId: day.id, pairId: pair.id, positionFlag: true, isBuffered: false });
        }
      }
    }
    await createScheduleEntry({ unitCode: 'SG1', weekId: null, dayId: null, pairId: null, isBuffered: true });
    await createScheduleEntry({ unitCode: 'SG2', weekId: null, dayId: null, pairId: null, isBuffered: true });
    const result = await optimizeSchedule(null, true);
    expect(result.bufferedCount).toBe(2);
    expect(result.bufferedPlaced).toBe(1);
    expect(result.bufferedFailed).toBe(1);
  });
});