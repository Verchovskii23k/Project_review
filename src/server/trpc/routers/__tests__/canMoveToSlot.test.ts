import { describe, it, expect } from 'vitest';
import { canMoveToSlot } from '../scheduleOptimizer';
import type { OptimizationContext, StrictScheduleEntry, Occupancy } from '../scheduleOptimizer';

function buildMockEntry(overrides: Partial<StrictScheduleEntry> & { lessonId: number; unitCode: string; classroomId?: number | null }): StrictScheduleEntry {
  return {
    id: 1,
    weekId: 1,
    dayOfWeekId: 1,
    pairNumberId: 1,
    displayText: '',
    mergeNumber: 0,
    positionFlag: false,
    classroomFlag: false,
    classroomId: null,
    isBuffered: false,
    isActive: true,
    versionId: null,
    ...overrides,
  } as StrictScheduleEntry;
}

function mockCtx(): OptimizationContext {
  return {
    entries: [],
    slots: [{ weekId: 1, dayId: 1, pairId: 1 }],
    occupancyBySlot: new Map(),
    lessonTeacher: new Map(),
    unitGroups: new Map(),
    unitTypeByUnitCode: new Map(),
    lessonLessonType: new Map(),
    weights: { teacherWindow: 1, groupWindow: 1, dailyBalance: 1, typeDiversity: 1, singleLessonDay: 1, unitMisuse: 1 },
    teacherSchedule: new Map(),
    groupSchedule: new Map(),
    mergeMap: new Map(),
    classroomCapacity: new Map(),
    mergeClassroomIds: new Map(),
  };
}

describe('canMoveToSlot (правила размещения юнитов)', () => {
  it('пустой слот – можно', () => {
    const ctx = mockCtx();
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'U1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true);
  });

  it('занятый преподаватель – нельзя', () => {
    const ctx = mockCtx();
    ctx.lessonTeacher.set(1, 10);
    const occ: Occupancy = { teacherIds: new Set([10]), groupIds: new Set(), unitCodes: new Set(), classroomIds: new Set(), mergeCounts: new Map()};
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'U1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('занятая аудитория – нельзя', () => {
    const ctx = mockCtx();
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set(), classroomIds: new Set([5]), mergeCounts: new Map()};
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'U1', classroomId: 5 });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('две подгруппы одной группы – можно', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('SG1', new Set([100]));
    ctx.unitGroups.set('SG2', new Set([100]));
    ctx.unitTypeByUnitCode.set('SG1', 'ПОДГРУППА');
    ctx.unitTypeByUnitCode.set('SG2', 'ПОДГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set([100]), unitCodes: new Set(['SG2']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'SG1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true);
  });

  it('подгруппа + группа (общие группы) – нельзя', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('SG1', new Set([100]));
    ctx.unitGroups.set('GRP', new Set([100]));
    ctx.unitTypeByUnitCode.set('SG1', 'ПОДГРУППА');
    ctx.unitTypeByUnitCode.set('GRP', 'ГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set([100]), unitCodes: new Set(['GRP']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'SG1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('поток + подгруппа (подгруппа в потоке) – нельзя', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('FLOW', new Set([100]));
    ctx.unitGroups.set('SG1', new Set([100]));
    ctx.unitTypeByUnitCode.set('FLOW', 'ПОТОК');
    ctx.unitTypeByUnitCode.set('SG1', 'ПОДГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set([100]), unitCodes: new Set(['SG1']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'FLOW' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('поток + группа (группа в потоке) – нельзя', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('FLOW', new Set([100]));
    ctx.unitGroups.set('GRP', new Set([100]));
    ctx.unitTypeByUnitCode.set('FLOW', 'ПОТОК');
    ctx.unitTypeByUnitCode.set('GRP', 'ГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set([100]), unitCodes: new Set(['GRP']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'FLOW' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('два потока с непересекающимися группами – можно', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('FLOW1', new Set([1]));
    ctx.unitGroups.set('FLOW2', new Set([2]));
    ctx.unitTypeByUnitCode.set('FLOW1', 'ПОТОК');
    ctx.unitTypeByUnitCode.set('FLOW2', 'ПОТОК');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set(['FLOW2']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'FLOW1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true);
  });
    it('занятие с positionFlag нельзя перемещать (кроме слияния)', () => {
    const ctx = mockCtx();
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'U1', positionFlag: true });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('positionFlag + mergeNumber разрешает перемещение', () => {
    const ctx = mockCtx();
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'U1', positionFlag: true, mergeNumber: 5 });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true); // позиция сбрасывается в группе
  });

  it('два потока с общими группами – нельзя', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('FLOW1', new Set([100]));
    ctx.unitGroups.set('FLOW2', new Set([100]));
    ctx.unitTypeByUnitCode.set('FLOW1', 'ПОТОК');
    ctx.unitTypeByUnitCode.set('FLOW2', 'ПОТОК');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set([100]), unitCodes: new Set(['FLOW2']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'FLOW1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(false);
  });

  it('группа + группа без общих групп – можно', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('GRP1', new Set([1]));
    ctx.unitGroups.set('GRP2', new Set([2]));
    ctx.unitTypeByUnitCode.set('GRP1', 'ГРУППА');
    ctx.unitTypeByUnitCode.set('GRP2', 'ГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set(['GRP2']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'GRP1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true);
  });

  it('подгруппа + подгруппа из разных групп – можно', () => {
    const ctx = mockCtx();
    ctx.unitGroups.set('SG1', new Set([1]));
    ctx.unitGroups.set('SG2', new Set([2]));
    ctx.unitTypeByUnitCode.set('SG1', 'ПОДГРУППА');
    ctx.unitTypeByUnitCode.set('SG2', 'ПОДГРУППА');
    const occ: Occupancy = { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set(['SG2']), classroomIds: new Set(), mergeCounts: new Map() };
    ctx.occupancyBySlot.set('1-1-1', occ);
    const entry = buildMockEntry({ lessonId: 1, unitCode: 'SG1' });
    expect(canMoveToSlot(ctx, entry, 1, 1, 1)).toBe(true);
  });
});