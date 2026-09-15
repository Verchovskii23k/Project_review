/**
 * Оптимизация расписания методом имитации отжига с расширенной статистикой.
 *
 * Улучшает распределение занятий по слотам (неделя, день, пара), минимизируя
 * взвешенную сумму штрафов за:
 * - **Окна** у преподавателей и учебных групп (пропуски между парами в течение дня).
 * - **Дневной дисбаланс** – неравномерная нагрузка преподавателей/групп по дням.
 * - **Однообразие типов занятий** – когда в день у группы >3 однотипных занятий.
 * - **Единственное занятие в день** – приход только ради одной пары.
 * - **Нерациональное использование юнитов** – штрафуется ситуация, когда в слоте
 * находится только одна группа или только одна подгруппа (или слот пуст).
 * Алгоритм стремится к одновременному размещению нескольких не конфликтующих
 * юнитов в одном слоте, повышая плотность расписания.
 *
 * Также обрабатываются **группы слияния** (mergeNumber ≠ 0) – перемещаются как единое
 * целое с автоматическим подбором аудитории нужной вместимости. При невозможности
 * прямого размещения применяется принудительное вытеснение (`forcePlaceGroup`).
 *
 * ## Возвращаемая статистика
 * - `iterations` – число выполненных итераций (обычно 20000).
 * - `initialScore` / `finalScore` – штраф до и после оптимизации.
 * - `acceptedMoves` – количество принятых мутаций (обменов или перемещений).
 * - `singleMoved` – количество **уникальных одиночных занятий**, изменивших слот по
 *   сравнению с исходным состоянием (не сумма событий, без учёта групп слияния).
 * - `totalSingleEntries` – общее количество одиночных записей (без групп слияния) в
 *   расписании на начало оптимизации.
 * - `mergeGroupMoved` – сколько раз группы слияния успешно перемещены (получили новый
 *   слот и аудиторию). Одна группа может перемещаться многократно.
 * - `mergeGroupsFinalPlaced` – количество групп слияния, которые в финальном состоянии
 *   находятся в одном слоте (собраны).
 * - `totalMergeGroups` – общее число групп слияния.
 * - `mergeGroupFailedNoClassroom` – количество откатов групп слияния из-за отсутствия
 *   подходящей аудитории.
 * - `mergeGroupFailedNoSlot` – количество попыток, когда группу не удалось разместить
 *   даже после принудительного вытеснения.
 * - `positionBlockedCount` – количество занятий, зафиксированных флагом `positionFlag`.
 * - `bufferedCount` – исходное количество буферных занятий.
 * - `bufferedPlaced` – количество успешно размещённых из буфера.
 * - `bufferedFailed` – количество буферных занятий, которые не удалось разместить.
 *   (они исключены из перемещений, кроме случаев слияния).
 *
 * Если занятий меньше двух, возвращается `message: "Слишком мало занятий"` и все
 * числовые показатели = 0.
 *
 * ## Особенности реализации
 * - Параметры имитации отжига (`opt_initial_temperature`, `opt_cooling_rate`) и веса
 *   штрафов (`opt_weight_*`) загружаются из таблицы `settings`. При отсутствии
 *   создаются значения по умолчанию (температура = 1000, скорость охлаждения = 0.95,
 *   веса в диапазоне 1–2).
 * - На каждой итерации с вероятностью 70% выбирается случайная группа слияния,
 *   иначе – одиночное занятие. Для одиночных: 70% — обмен двух записей, 30% —
 *   перемещение одной записи в случайный слот.
 * - Принятие нового состояния: если штраф уменьшился, либо с вероятностью
 *   `exp(-Δ / T)`, где T – температура. Температура охлаждается умножением на
 *   `coolingRate` после каждой итерации, минимальное значение 0.01.
 * - После всех итераций сохраняется **лучшее** найденное состояние (с минимальным
 *   штрафом). Обновляются координаты, аудитории и флаги в БД, пересчитываются
 *   `displayText` для человекочитаемого представления.
 * - Занятия с установленным флагом `classroomFlag` **не защищены от смены аудитории**
 *   при перемещении группы слияния – в текущей версии флаг не проверяется в этом
 *   контексте (см. примечание в коде). Флаг `positionFlag` предотвращает любые
 *   перемещения одиночных записей, но сбрасывается при вхождении в группу слияния.
 * - Для групп слияния аудитория подбирается заново по критериям: вместимость ≥
 *   суммарного числа студентов, принадлежность к кафедре дисциплины (или общая),
 *   приоритет типа занятия, метрика использования, ID.
 * - Связь `lessonClassrooms` синхронизируется после каждого успешного размещения
 *   группы слияния.
 *
 * @param versionId - фильтр версии расписания (всегда `null` при вызове из UI; архивные версии не оптимизируются).
 * @param includeBuffered - если true, перед оптимизацией будет предпринята попытка разместить буферные занятия.
 *
 * @returns Объект с детальной статистикой (см. выше). Пригоден для отображения
 *   администратору в виде информативных тостов.
 *
 * @remarks
 * - Алгоритм не гарантирует глобальный оптимум, но на практике значительно улучшает
 *   равномерность и удобство расписания.
 * - Если в расписании преобладают зафиксированные записи, эффективность снижается.
 * - Проблемы с размещением групп слияния можно диагностировать по полям
 *   `mergeGroupFailedNoClassroom` и `mergeGroupFailedNoSlot`.
 * - Для изменения параметров отжига администратор может воспользоваться интерфейсом
 *   на странице расписания (кнопка ⚙️).
 */
import { db } from "@/db";
import {
  scheduleDisplay as sdTable,
  lessons,
  unitRoots,
  daysOfWeek,
  pairs,
  settings as settingsTable,
  lessonTypes,
  lessonClassrooms,
  classrooms,
  units,
  unitTypes,
  studyGroups,
  employeesDepartments,
  buildings,
  disciplines,
  employees,
  hourTypeMapping,
} from "@/db/schema";
import { eq, inArray, and, asc, gte, isNull, or, SQL, isNotNull } from "drizzle-orm";

type SlotKey = string;
type ScheduleEntry = typeof sdTable.$inferSelect;
export type StrictScheduleEntry = ScheduleEntry & { weekId: number; dayOfWeekId: number; pairNumberId: number };

export interface Occupancy {
  teacherIds: Set<number>;
  groupIds: Set<number>;
  unitCodes: Set<string>;
  classroomIds: Set<number>;
  mergeCounts: Map<number, number>;
}

interface MergeGroup {
  mergeNum: number;
  entries: StrictScheduleEntry[];
  totalStudents: number;
}

export interface OptimizationContext {
  entries: StrictScheduleEntry[];
  slots: { weekId: number; dayId: number; pairId: number }[];
  occupancyBySlot: Map<SlotKey, Occupancy>;
  lessonTeacher: Map<number, number>;
  unitGroups: Map<string, Set<number>>;
  unitTypeByUnitCode: Map<string, string>;
  lessonLessonType: Map<number, string>;
  weights: {
    teacherWindow: number;
    groupWindow: number;
    dailyBalance: number;
    typeDiversity: number;
    singleLessonDay: number;
    unitMisuse: number;
  };
  teacherSchedule: Map<number, { dayId: number; pairId: number }[]>;
  groupSchedule: Map<number, { dayId: number; pairId: number }[]>;
  mergeMap: Map<number, MergeGroup>;
  classroomCapacity: Map<number, number>;
  mergeClassroomIds: Map<number, number | null>;
}
export { canMoveToSlot };

const slotKey = (weekId: number, d: number, p: number): SlotKey => `${weekId}-${d}-${p}`;


async function loadAnnealingParams(): Promise<{ initialTemperature: number; coolingRate: number }> {
  const keys = ["opt_initial_temperature", "opt_cooling_rate"];
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, keys));

  const tempRow = rows.find(r => r.key === "opt_initial_temperature");
  const rateRow = rows.find(r => r.key === "opt_cooling_rate");

  const initialTemperature = tempRow ? Number(tempRow.value) : 1000;
  const coolingRate = rateRow ? Number(rateRow.value) : 0.95;

  // Если записи отсутствуют, создадим их с умолчаниями
  if (!tempRow || !rateRow) {
    const missing = [];
    if (!tempRow) missing.push({ key: "opt_initial_temperature", value: "1000" });
    if (!rateRow) missing.push({ key: "opt_cooling_rate", value: "0.95" });
    await db
      .insert(settingsTable)
      .values(missing)
      .onConflictDoNothing();
  }

  return { initialTemperature, coolingRate };
}


async function loadWeights(): Promise<OptimizationContext["weights"]> {
  const defaultWeights = {
    teacherWindow: 1,
    groupWindow: 2,
    dailyBalance: 1,
    typeDiversity: 1,
    singleLessonDay: 1,
    unitMisuse: 1,
  };
  const keys = [
    "opt_weight_teacher_window",
    "opt_weight_group_window",
    "opt_weight_daily_balance",
    "opt_weight_type_diversity",
    "opt_weight_single_lesson_day",
    "opt_weight_unit_misuse",
  ];
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, keys));
  const existingKeys = new Set(rows.map(r => r.key));
  const result: Record<string, number> = {};
  for (const key of keys) {
    const row = rows.find(r => r.key === key);
    result[key] = row ? Number(row.value) : defaultWeights[key as keyof typeof defaultWeights];
  }
  const missing = keys.filter(k => !existingKeys.has(k));
  if (missing.length > 0) {
    await db
      .insert(settingsTable)
      .values(missing.map(k => ({ key: k, value: String(defaultWeights[k as keyof typeof defaultWeights]) })))
      .onConflictDoNothing();
  }
  return {
    teacherWindow: result["opt_weight_teacher_window"],
    groupWindow: result["opt_weight_group_window"],
    dailyBalance: result["opt_weight_daily_balance"],
    typeDiversity: result["opt_weight_type_diversity"],
    singleLessonDay: result["opt_weight_single_lesson_day"],
    unitMisuse: result["opt_weight_unit_misuse"],
  };
}

function computeTotalStudents(
  entries: ScheduleEntry[],
  unitGroups: Map<string, Set<number>>,
  unitTypeByUnitCode: Map<string, string>,
  studyGroupsMap: Map<number, number>
): number {
  let total = 0;
  const processedGroupIds = new Set<number>();

  for (const entry of entries) {
    const unitType = unitTypeByUnitCode.get(entry.unitCode) ?? "ГРУППА";
    const groups = unitGroups.get(entry.unitCode);
    if (!groups) continue;

    if (unitType === "ПОДГРУППА") {
      total += 16;
    } else {
      for (const gid of groups) {
        if (!processedGroupIds.has(gid)) {
          total += studyGroupsMap.get(gid) || 0;
          processedGroupIds.add(gid);
        }
      }
    }
  }
  return total;
}

function prepareMergeGroups(
  entries: StrictScheduleEntry[],
  unitGroups: Map<string, Set<number>>,
  unitTypeByUnitCode: Map<string, string>,
  studyGroupsMap: Map<number, number>
): { mergeMap: Map<number, MergeGroup>; individualEntries: StrictScheduleEntry[] } {
  const mergeMap = new Map<number, MergeGroup>();
  const individualEntries: StrictScheduleEntry[] = [];

  const tempGroups = new Map<number, StrictScheduleEntry[]>();
  for (const entry of entries) {
    const mn = entry.mergeNumber ?? 0;
    if (mn !== 0) {
      if (!tempGroups.has(mn)) tempGroups.set(mn, []);
      tempGroups.get(mn)!.push(entry);
    } else {
      individualEntries.push(entry);
    }
  }

  for (const [mergeNum, groupEntries] of tempGroups) {
    const totalStudents = computeTotalStudents(groupEntries, unitGroups, unitTypeByUnitCode, studyGroupsMap);
    mergeMap.set(mergeNum, { mergeNum, entries: groupEntries, totalStudents });

    for (const e of groupEntries) {
      e.positionFlag = false;
      e.classroomFlag = false;
    }
  }

  return { mergeMap, individualEntries };
}

async function buildContext(entries: StrictScheduleEntry[]): Promise<OptimizationContext> {
  const allLessons = await db.select().from(lessons).where(and(eq(lessons.isActive, true), isNull(lessons.versionId)));
  const allUnitRoots = await db.select().from(unitRoots).where(and(eq(unitRoots.isActive, true), isNull(unitRoots.versionId)));
  const allDays = await db.select().from(daysOfWeek).orderBy(asc(daysOfWeek.id));
  const allPairs = await db.select().from(pairs).orderBy(asc(pairs.number));
  const usedWeekIds = [...new Set(entries.map(e => e.weekId))];
  const allWeeks = usedWeekIds.map(id => ({ id })).sort((a, b) => a.id - b.id);

  const lessonLessonType = new Map<number, string>();
  const allLessonTypes = await db.select().from(lessonTypes);
  const typeNameById = new Map<number, string>();
  for (const lt of allLessonTypes) typeNameById.set(lt.id, lt.name);
  for (const l of allLessons) {
    if (l.lessonTypeId) lessonLessonType.set(l.id, typeNameById.get(l.lessonTypeId) ?? 'unknown');
  }

  const lessonTeacher = new Map<number, number>();
  for (const l of allLessons) {
    if (l.teacherId) lessonTeacher.set(l.id, l.teacherId);
  }

  const unitGroups = new Map<string, Set<number>>();
  for (const ur of allUnitRoots) {
    if (!unitGroups.has(ur.unitCode)) unitGroups.set(ur.unitCode, new Set());
    unitGroups.get(ur.unitCode)!.add(ur.studyGroupId);
  }

  const allUnits = await db.select().from(units).where(and(eq(units.isActive, true), isNull(units.versionId)));
  const allUnitTypes = await db.select().from(unitTypes);
  const typeNameByIdUT = new Map<number, string>();
  for (const ut of allUnitTypes) typeNameByIdUT.set(ut.id, ut.name);
  const unitTypeByUnitCode = new Map<string, string>();
  for (const u of allUnits) {
    const typeName = typeNameByIdUT.get(u.unitTypeId) ?? "ГРУППА";
    unitTypeByUnitCode.set(u.code, typeName);
  }

  const studyGroupsMap = new Map<number, number>();
  const allStudyGroups = await db.select().from(studyGroups).where(eq(studyGroups.isActive, true));
  for (const sg of allStudyGroups) {
    studyGroupsMap.set(sg.id, sg.studentCount);
  }

  const { mergeMap, individualEntries } = prepareMergeGroups(
    entries, unitGroups, unitTypeByUnitCode, studyGroupsMap
  );

  const finalEntries: StrictScheduleEntry[] = [...individualEntries];
  for (const [, group] of mergeMap) {
    finalEntries.push(...group.entries);
  }

  const allClassrooms = await db.select().from(classrooms);
  const classroomCapacity = new Map<number, number>();
  for (const c of allClassrooms) {
    classroomCapacity.set(c.id, c.capacity);
  }

  const slots: { weekId: number; dayId: number; pairId: number }[] = [];
  for (const w of allWeeks) {
    for (const d of allDays) {
      for (const p of allPairs) {
        slots.push({ weekId: w.id, dayId: d.id, pairId: p.id });
      }
    }
  }

  const occupancyBySlot = new Map<SlotKey, Occupancy>();
  const teacherSchedule = new Map<number, { dayId: number; pairId: number }[]>();
  const groupSchedule = new Map<number, { dayId: number; pairId: number }[]>();

  for (const e of finalEntries) {
    const key = slotKey(e.weekId, e.dayOfWeekId, e.pairNumberId);
    if (!occupancyBySlot.has(key)) {
      occupancyBySlot.set(key, { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set() , classroomIds: new Set(), mergeCounts: new Map()});
    }
    const occ = occupancyBySlot.get(key)!;
    const teacherId = lessonTeacher.get(e.lessonId!);
    if (e.mergeNumber && e.mergeNumber !== 0) {
      occ.mergeCounts.set(e.mergeNumber, (occ.mergeCounts.get(e.mergeNumber) || 0) + 1);
    }
    if (teacherId) {
      occ.teacherIds.add(teacherId);
      if (!teacherSchedule.has(teacherId)) teacherSchedule.set(teacherId, []);
      teacherSchedule.get(teacherId)!.push({ dayId: e.dayOfWeekId, pairId: e.pairNumberId });
    }
    const groups = unitGroups.get(e.unitCode);
    if (groups) {
      groups.forEach(g => {
        occ.groupIds.add(g);
        if (!groupSchedule.has(g)) groupSchedule.set(g, []);
        groupSchedule.get(g)!.push({ dayId: e.dayOfWeekId, pairId: e.pairNumberId });
      });
    }
    occ.unitCodes.add(e.unitCode);
    if (e.classroomId != null) {
      occ.classroomIds.add(e.classroomId);
    }
  }

  return {
    entries: finalEntries,
    slots,
    occupancyBySlot,
    lessonTeacher,
    unitGroups,
    unitTypeByUnitCode,
    weights: await loadWeights(),
    teacherSchedule,
    groupSchedule,
    lessonLessonType,
    mergeMap,
    classroomCapacity,
    mergeClassroomIds: new Map(),
  };
}

function canMoveToSlot(
  ctx: OptimizationContext,
  entry: StrictScheduleEntry,
  weekId: number,
  dayId: number,
  pairId: number
): boolean {
  if (entry.positionFlag && (entry.mergeNumber ?? 0) === 0) return false;

  const key = slotKey(weekId, dayId, pairId);
  const occ = ctx.occupancyBySlot.get(key);
  if (!occ) return true;
  // Если занятие входит в группу слияния (mergeNumber !== 0), проверяем только преподавателя и аудиторию
  if ((entry.mergeNumber ?? 0) !== 0) {
    const sameMergeNum = entry.mergeNumber!;
    const slotEntries = ctx.entries.filter(e => e.weekId === weekId && e.dayOfWeekId === dayId && e.pairNumberId === pairId);
    for (const other of slotEntries) {
      if ((other.mergeNumber ?? 0) === sameMergeNum) continue; // своя группа
      // Проверка конфликта с other
      const otherTeacher = ctx.lessonTeacher.get(other.lessonId!);
      if (otherTeacher && ctx.lessonTeacher.get(entry.lessonId!) === otherTeacher) return false;
      if (other.classroomId && entry.classroomId === other.classroomId) return false;
      // Проверка общих групп
      const entryGroups = ctx.unitGroups.get(entry.unitCode);
      const otherGroups = ctx.unitGroups.get(other.unitCode);
      if (entryGroups && otherGroups) {
        for (const g of entryGroups) {
          if (otherGroups.has(g)) return false;
        }
      }
      if (entry.unitCode === other.unitCode) return false;
    }
    return true;
  }

  // Преподаватель
  const teacherId = ctx.lessonTeacher.get(entry.lessonId!);
  if (teacherId && occ.teacherIds.has(teacherId)) return false;

  // Аудитория
  if (entry.classroomId != null && occ.classroomIds.has(entry.classroomId)) return false;

  // Юнит
  if ((entry.mergeNumber ?? 0) === 0 && occ.unitCodes.has(entry.unitCode)) return false;

  // Проверка общих групп — точно как в checkSlots для чужих юнитов
  const entryType = ctx.unitTypeByUnitCode.get(entry.unitCode) ?? 'ГРУППА';
  const entryGroups = ctx.unitGroups.get(entry.unitCode);

  if (entryGroups && entryGroups.size > 0) {
    for (const existingUnitCode of occ.unitCodes) {
      const existingType = ctx.unitTypeByUnitCode.get(existingUnitCode) ?? 'ГРУППА';
      const existingGroups = ctx.unitGroups.get(existingUnitCode);
      if (!existingGroups || existingGroups.size === 0) continue;

      // Находим общие группы
      const shared = [...entryGroups].filter(g => existingGroups.has(g));
      if (shared.length === 0) continue;

      // Общие группы есть – запрет, кроме случая двух подгрупп
      if (!(entryType === 'ПОДГРУППА' && existingType === 'ПОДГРУППА')) {
        return false;
      }
    }
  }

  return true;
}

function canMoveGroupToSlot(
  ctx: OptimizationContext,
  group: MergeGroup,
  weekId: number,
  dayId: number,
  pairId: number
): boolean {
  for (const entry of group.entries) {
    if (!canMoveToSlot(ctx, entry, weekId, dayId, pairId)) return false;
  }
  return true;
}

function moveGroupToSlot(
  ctx: OptimizationContext,
  group: MergeGroup,
  targetWeek: number,
  targetDay: number,
  targetPair: number
) {
  for (const entry of group.entries) {
    const oldWeek = entry.weekId;
    const oldDay = entry.dayOfWeekId;
    const oldPair = entry.pairNumberId;
    entry.weekId = targetWeek;
    entry.dayOfWeekId = targetDay;
    entry.pairNumberId = targetPair;
    updateOccupancy(ctx, entry, oldWeek, oldDay, oldPair, targetWeek, targetDay, targetPair);
  }
}

async function syncLessonClassroom(lessonId: number, classroomId: number) {
  await db
    .insert(lessonClassrooms)
    .values({ lessonId, classroomId })
    .onConflictDoNothing();
}

async function findSuitableClassroomForGroup(
  group: MergeGroup,
): Promise<number | null> {
  const firstEntry = group.entries[0];
  const [lesson] = await db
    .select({ disciplineId: lessons.disciplineId, lessonTypeId: lessons.lessonTypeId })
    .from(lessons)
    .where(eq(lessons.id, firstEntry.lessonId!))
    .limit(1);
  if (!lesson) return null;

  const [disc] = await db
    .select({ departmentId: disciplines.departmentId })
    .from(disciplines)
    .where(eq(disciplines.id, lesson.disciplineId!))
    .limit(1);
  const deptId = disc?.departmentId ?? null;

  const [mapping] = await db
    .select({ priorityColumn: hourTypeMapping.priorityColumn })
    .from(hourTypeMapping)
    .where(
      and(
        eq(hourTypeMapping.lessonTypeId, lesson.lessonTypeId!),
        eq(hourTypeMapping.isActive, true)
      )
    )
    .limit(1);
  if (!mapping) return null;
  type ClassroomPriorityKey = keyof Pick<typeof classrooms, "priorityLecture" | "priorityWorkshop" | "priorityGuidedStudy" | "priorityLab">;
  const priorityColumn = mapping.priorityColumn as ClassroomPriorityKey;

  const conditions: SQL<unknown>[] = [
    eq(classrooms.isActive, true),
    gte(classrooms.capacity, group.totalStudents)
  ];
  if (deptId !== null) {
    conditions.push(or(
      eq(classrooms.departmentId, deptId),
      isNull(classrooms.departmentId)
    ) as SQL<unknown>);
  }

  const candidates = await db
    .select()
    .from(classrooms)
    .where(and(...conditions));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const prioA = (a[priorityColumn] as number) ?? 99;
    const prioB = (b[priorityColumn] as number) ?? 99;
    if (prioA !== prioB) return prioA - prioB;

    const metricA = a.usageMetric ?? 0;
    const metricB = b.usageMetric ?? 0;
    if (metricA !== metricB) return metricA - metricB;

    return a.id - b.id;
  });

  return candidates[0].id;
}

function updateOccupancy(ctx: OptimizationContext, entry: StrictScheduleEntry, oldWeekId: number, oldDay: number, oldPair: number, newWeekId: number, newDay: number, newPair: number) {
  const oldKey = slotKey(oldWeekId, oldDay, oldPair);
  const newKey = slotKey(newWeekId, newDay, newPair);

  const oldOcc = ctx.occupancyBySlot.get(oldKey);
  if (oldOcc) {
    const teacherId = ctx.lessonTeacher.get(entry.lessonId!);
    if (teacherId) oldOcc.teacherIds.delete(teacherId);
    const groups = ctx.unitGroups.get(entry.unitCode);
    if (groups) groups.forEach(g => oldOcc.groupIds.delete(g));
    oldOcc.unitCodes.delete(entry.unitCode);
    if (entry.classroomId != null) {
      oldOcc.classroomIds.delete(entry.classroomId);
    }
      const mn = entry.mergeNumber;
    if (mn && mn !== 0) {
      const cnt = oldOcc.mergeCounts.get(mn) || 0;
      if (cnt <= 1) oldOcc.mergeCounts.delete(mn);
      else oldOcc.mergeCounts.set(mn, cnt - 1);
    }
  }

  if (!ctx.occupancyBySlot.has(newKey)) {
    ctx.occupancyBySlot.set(newKey, { teacherIds: new Set(), groupIds: new Set(), unitCodes: new Set() , classroomIds: new Set(), mergeCounts: new Map()});
  }
  const newOcc = ctx.occupancyBySlot.get(newKey)!;
  const teacherId = ctx.lessonTeacher.get(entry.lessonId!);
  if (teacherId) newOcc.teacherIds.add(teacherId);
  const groups = ctx.unitGroups.get(entry.unitCode);
  if (groups) groups.forEach(g => newOcc.groupIds.add(g));
  newOcc.unitCodes.add(entry.unitCode);
  if (entry.classroomId != null) {
    newOcc.classroomIds.add(entry.classroomId);
  }
  const mn = entry.mergeNumber;
  if (mn && mn !== 0) {
    newOcc.mergeCounts.set(mn, (newOcc.mergeCounts.get(mn) || 0) + 1);
  }
}

function evaluateState(ctx: OptimizationContext): number {
  const teacherSch = new Map<number, { dayId: number; pairId: number }[]>();
  const groupSch = new Map<number, { dayId: number; pairId: number }[]>();
  for (const e of ctx.entries) {
    const tId = ctx.lessonTeacher.get(e.lessonId!);
    if (tId) {
      if (!teacherSch.has(tId)) teacherSch.set(tId, []);
      teacherSch.get(tId)!.push({ dayId: e.dayOfWeekId, pairId: e.pairNumberId });
    }
    const grps = ctx.unitGroups.get(e.unitCode);
    if (grps) {
      grps.forEach(g => {
        if (!groupSch.has(g)) groupSch.set(g, []);
        groupSch.get(g)!.push({ dayId: e.dayOfWeekId, pairId: e.pairNumberId });
      });
    }
  }

  let score = 0;
  const { weights } = ctx;

  // Окна преподавателей
  for (const [, slots] of teacherSch) {
    const byDay = new Map<number, number[]>();
    slots.forEach(s => {
      if (!byDay.has(s.dayId)) byDay.set(s.dayId, []);
      byDay.get(s.dayId)!.push(s.pairId);
    });
    for (const [, pairs] of byDay) {
      pairs.sort((a, b) => a - b);
      for (let i = 1; i < pairs.length; i++) {
        const gap = pairs[i] - pairs[i - 1] - 1;
        if (gap > 0) score += gap * weights.teacherWindow;
      }
    }
  }

  // Окна групп
  for (const [, slots] of groupSch) {
    const byDay = new Map<number, number[]>();
    slots.forEach(s => {
      if (!byDay.has(s.dayId)) byDay.set(s.dayId, []);
      byDay.get(s.dayId)!.push(s.pairId);
    });
    for (const [, pairs] of byDay) {
      pairs.sort((a, b) => a - b);
      for (let i = 1; i < pairs.length; i++) {
        const gap = pairs[i] - pairs[i - 1] - 1;
        if (gap > 0) score += gap * weights.groupWindow;
      }
    }
  }

  // Дневной баланс преподавателей
  const teacherPayPerDay = new Map<number, Map<number, number>>();
  for (const [tid, slots] of teacherSch) {
    const byDay = new Map<number, number>();
    slots.forEach(s => byDay.set(s.dayId, (byDay.get(s.dayId) || 0) + 1));
    teacherPayPerDay.set(tid, byDay);
  }
  for (const [, dayCounts] of teacherPayPerDay) {
    const counts = [...dayCounts.values()];
    if (counts.length < 2) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length;
    score += Math.round(variance * weights.dailyBalance);
  }

  // Дневной баланс групп
  const groupPayPerDay = new Map<number, Map<number, number>>();
  for (const [gid, slots] of groupSch) {
    const byDay = new Map<number, number>();
    slots.forEach(s => byDay.set(s.dayId, (byDay.get(s.dayId) || 0) + 1));
    groupPayPerDay.set(gid, byDay);
  }
  for (const [, dayCounts] of groupPayPerDay) {
    const counts = [...dayCounts.values()];
    if (counts.length < 2) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - avg) ** 2, 0) / counts.length;
    score += Math.round(variance * weights.dailyBalance);
  }

  // Однообразие типов
  const typePenaltyPerGroup = new Map<number, Map<number, Map<string, number>>>();
  for (const e of ctx.entries) {
    const lt = ctx.lessonLessonType.get(e.lessonId!);
    if (!lt) continue;
    const groups = ctx.unitGroups.get(e.unitCode);
    if (!groups) continue;
    for (const g of groups) {
      if (!typePenaltyPerGroup.has(g)) typePenaltyPerGroup.set(g, new Map());
      const dayMap = typePenaltyPerGroup.get(g)!;
      if (!dayMap.has(e.dayOfWeekId)) dayMap.set(e.dayOfWeekId, new Map());
      const typeMap = dayMap.get(e.dayOfWeekId)!;
      typeMap.set(lt, (typeMap.get(lt) || 0) + 1);
    }
  }
  for (const [, dayMap] of typePenaltyPerGroup) {
    for (const [, typeCounts] of dayMap) {
      for (const [, cnt] of typeCounts) {
        if (cnt > 3) score += (cnt - 3) * weights.typeDiversity;
      }
    }
  }

  // Единственное занятие в день
  for (const [, slots] of teacherSch) {
    const byDay = new Map<number, number>();
    slots.forEach(s => byDay.set(s.dayId, (byDay.get(s.dayId) || 0) + 1));
    for (const [, cnt] of byDay) {
      if (cnt === 1) score += weights.singleLessonDay;
    }
  }
  for (const [, slots] of groupSch) {
    const byDay = new Map<number, number>();
    slots.forEach(s => byDay.set(s.dayId, (byDay.get(s.dayId) || 0) + 1));
    for (const [, cnt] of byDay) {
      if (cnt === 1) score += weights.singleLessonDay;
    }
  }

  // Нерациональное использование юнитов
  for (const [, occ] of ctx.occupancyBySlot) {
    const groupIds = new Set<number>();
    const subgroupCodes = new Set<string>();
    for (const unitCode of occ.unitCodes) {
      const type = ctx.unitTypeByUnitCode.get(unitCode) ?? "ГРУППА";
      if (type === "ПОДГРУППА") {
        subgroupCodes.add(unitCode);
      } else {
        const gs = ctx.unitGroups.get(unitCode);
        if (gs) gs.forEach(g => groupIds.add(g));
      }
    }
    // Если в слоте есть занятия, но они принадлежат только одной группе — штраф
    if (groupIds.size === 1) score += weights.unitMisuse;
    // Аналогично для подгрупп
    if (subgroupCodes.size === 1) score += weights.unitMisuse;
    // Опционально: штраф за полностью пустой слот (если хотите заполнять всё)
    if (groupIds.size === 0 && subgroupCodes.size === 0) score += weights.unitMisuse;
  }
  // Штраф за разбросанность группы слияния
  const mergeGroupSlots = new Map<number, Set<string>>();
  for (const e of ctx.entries) {
    const mn = e.mergeNumber;
    if (mn && mn !== 0) {
      const slotKey = `${e.weekId}-${e.dayOfWeekId}-${e.pairNumberId}`;
      if (!mergeGroupSlots.has(mn)) mergeGroupSlots.set(mn, new Set());
      mergeGroupSlots.get(mn)!.add(slotKey);
    }
  }
  for (const [_, slots] of mergeGroupSlots) {
    if (slots.size > 1) {
      score += 100 * (slots.size - 1);
    }
  }

  return score;
}

function forcePlaceGroup(
  _ctx: OptimizationContext,
  group: MergeGroup,
  targetWeek: number,
  targetDay: number,
  targetPair: number
): boolean {
  if (!_ctx) throw new Error("unreachable");
  const key = slotKey(targetWeek, targetDay, targetPair);
  const occ = _ctx.occupancyBySlot.get(key);
  if (!occ) {
    moveGroupToSlot(_ctx, group, targetWeek, targetDay, targetPair);
    return true;
  }

  const conflictingEntries = _ctx.entries.filter(e => 
    e.weekId === targetWeek && 
    e.dayOfWeekId === targetDay && 
    e.pairNumberId === targetPair &&
    group.entries.some(ge => !canMoveToSlot(_ctx, ge, targetWeek, targetDay, targetPair))
  );

  if (conflictingEntries.length === 0) {
    moveGroupToSlot(_ctx, group, targetWeek, targetDay, targetPair);
    return true;
  }

  const moves: { entry: StrictScheduleEntry; oldSlot: { week: number; day: number; pair: number }; newSlot: { week: number; day: number; pair: number } }[] = [];

  for (const entry of conflictingEntries) {
    let found = false;
    for (let attempt = 0; attempt < 20 && !found; attempt++) {
      const randSlot = _ctx.slots[Math.floor(Math.random() * _ctx.slots.length)];
      if (randSlot.weekId === targetWeek && randSlot.dayId === targetDay && randSlot.pairId === targetPair) continue;
      if (canMoveToSlot(_ctx, entry, randSlot.weekId, randSlot.dayId, randSlot.pairId)) {
        moves.push({
          entry,
          oldSlot: { week: entry.weekId, day: entry.dayOfWeekId, pair: entry.pairNumberId },
          newSlot: { week: randSlot.weekId, day: randSlot.dayId, pair: randSlot.pairId }
        });
        found = true;
      }
    }
    if (!found) return false;
  }

  for (const move of moves) {
    updateOccupancy(_ctx, move.entry, move.oldSlot.week, move.oldSlot.day, move.oldSlot.pair, move.newSlot.week, move.newSlot.day, move.newSlot.pair);
    move.entry.weekId = move.newSlot.week;
    move.entry.dayOfWeekId = move.newSlot.day;
    move.entry.pairNumberId = move.newSlot.pair;
  }

  moveGroupToSlot(_ctx, group, targetWeek, targetDay, targetPair);
  return true;
}

/**
 * Принудительное размещение одиночного буферного занятия в заданном слоте
 * с вытеснением конфликтующих занятий.
 * Возвращает true, если удалось разместить, иначе false.
 */
function forcePlaceBufferedEntry(
  ctx: OptimizationContext,
  entry: StrictScheduleEntry,
  targetWeek: number,
  targetDay: number,
  targetPair: number,
  maxAttempts = 20
): boolean {
  const key = slotKey(targetWeek, targetDay, targetPair);
  const occ = ctx.occupancyBySlot.get(key);
  if (!occ) {
    // Слот пуст – просто размещаем
    const oldWeek = entry.weekId;
    const oldDay = entry.dayOfWeekId;
    const oldPair = entry.pairNumberId;
    entry.weekId = targetWeek;
    entry.dayOfWeekId = targetDay;
    entry.pairNumberId = targetPair;
    updateOccupancy(ctx, entry, oldWeek, oldDay, oldPair, targetWeek, targetDay, targetPair);
    return true;
  }

  // Находим конфликтующие записи в целевом слоте
  const conflictingEntries = ctx.entries.filter(e =>
    e.weekId === targetWeek &&
    e.dayOfWeekId === targetDay &&
    e.pairNumberId === targetPair &&
    !canMoveToSlot(ctx, entry, targetWeek, targetDay, targetPair)
  );

  if (conflictingEntries.length === 0) {
    // Нет конфликта – просто размещаем
    const oldWeek = entry.weekId;
    const oldDay = entry.dayOfWeekId;
    const oldPair = entry.pairNumberId;
    entry.weekId = targetWeek;
    entry.dayOfWeekId = targetDay;
    entry.pairNumberId = targetPair;
    updateOccupancy(ctx, entry, oldWeek, oldDay, oldPair, targetWeek, targetDay, targetPair);
    return true;
  }

  // Пытаемся переместить конфликтующие записи в другие слоты
  const moves: { entry: StrictScheduleEntry; oldSlot: { week: number; day: number; pair: number }; newSlot: { week: number; day: number; pair: number } }[] = [];

  for (const conflict of conflictingEntries) {
    if (conflict.positionFlag) return false; // Нельзя трогать зафиксированное

    let found = false;
    for (let attempt = 0; attempt < maxAttempts && !found; attempt++) {
      const randSlot = ctx.slots[Math.floor(Math.random() * ctx.slots.length)];
      // Нельзя перемещать в тот же слот и в слот, который мы пытаемся освободить для буферного
      if (randSlot.weekId === targetWeek && randSlot.dayId === targetDay && randSlot.pairId === targetPair) continue;
      if (canMoveToSlot(ctx, conflict, randSlot.weekId, randSlot.dayId, randSlot.pairId)) {
        moves.push({
          entry: conflict,
          oldSlot: { week: conflict.weekId, day: conflict.dayOfWeekId, pair: conflict.pairNumberId },
          newSlot: { week: randSlot.weekId, day: randSlot.dayId, pair: randSlot.pairId }
        });
        found = true;
      }
    }
    if (!found) return false;
  }

  // Применяем перемещения конфликтующих записей
  for (const move of moves) {
    updateOccupancy(ctx, move.entry, move.oldSlot.week, move.oldSlot.day, move.oldSlot.pair, move.newSlot.week, move.newSlot.day, move.newSlot.pair);
    move.entry.weekId = move.newSlot.week;
    move.entry.dayOfWeekId = move.newSlot.day;
    move.entry.pairNumberId = move.newSlot.pair;
  }

  // Размещаем буферное занятие
  const oldWeek = entry.weekId;
  const oldDay = entry.dayOfWeekId;
  const oldPair = entry.pairNumberId;
  entry.weekId = targetWeek;
  entry.dayOfWeekId = targetDay;
  entry.pairNumberId = targetPair;
  updateOccupancy(ctx, entry, oldWeek, oldDay, oldPair, targetWeek, targetDay, targetPair);

  return true;
}
/**
 * Размещает все буферные записи, по возможности, в свободные или освобождаемые слоты.
 * Возвращает новый массив записей (включая размещённые) и статистику.
 */
async function placeBufferedEntries(
  versionId: number | null | undefined,
  existingEntries: StrictScheduleEntry[]
): Promise<{ newEntries: StrictScheduleEntry[]; placed: number; failed: number }> {
  const versionCondition = versionId !== undefined
    ? (versionId === null ? isNull(sdTable.versionId) : eq(sdTable.versionId, versionId))
    : isNull(sdTable.versionId);
  const buffered = await db
    .select()
    .from(sdTable)
    .where(and(eq(sdTable.isBuffered, true), versionCondition));
  if (buffered.length === 0) return { newEntries: existingEntries, placed: 0, failed: 0 };

  // Строим контекст на основе существующих записей
  let ctx = await buildContext(existingEntries);
  let currentEntries = [...existingEntries];
  let placedCount = 0;
  let failedCount = 0;

  // Готовим список слотов, отсортированный по занятости (сначала свободные)
  const slotsByOccupancy = (ctx: OptimizationContext) => {
    const counts = new Map<string, number>();
    for (const e of ctx.entries) {
      const key = slotKey(e.weekId, e.dayOfWeekId, e.pairNumberId);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...ctx.slots].sort((a, b) => {
      const aKey = slotKey(a.weekId, a.dayId, a.pairId);
      const bKey = slotKey(b.weekId, b.dayId, b.pairId);
      const aCount = counts.get(aKey) || 0;
      const bCount = counts.get(bKey) || 0;
      return aCount - bCount;
    });
  };

  for (const buf of buffered) {
    // Преобразуем в StrictScheduleEntry (координаты пока нулевые)
    const entry: StrictScheduleEntry = {
      ...buf,
      weekId: 0,
      dayOfWeekId: 0,
      pairNumberId: 0,
    };
    let placed = false;

    // Пытаемся разместить в слотах, начиная с наименее занятых
    const sortedSlots = slotsByOccupancy(ctx);
    for (const slot of sortedSlots) {
      if (canMoveToSlot(ctx, entry, slot.weekId, slot.dayId, slot.pairId)) {
        // Свободный слот – просто перемещаем
        const oldWeek = entry.weekId, oldDay = entry.dayOfWeekId, oldPair = entry.pairNumberId;
        entry.weekId = slot.weekId;
        entry.dayOfWeekId = slot.dayId;
        entry.pairNumberId = slot.pairId;
        updateOccupancy(ctx, entry, oldWeek, oldDay, oldPair, slot.weekId, slot.dayId, slot.pairId);
        placed = true;
        break;
      } else {
        // Пытаемся с вытеснением
        if (forcePlaceBufferedEntry(ctx, entry, slot.weekId, slot.dayId, slot.pairId)) {
          placed = true;
          break;
        }
      }
    }

    if (placed) {
      // Обновляем запись в БД
      await db
        .update(sdTable)
        .set({
          weekId: entry.weekId,
          dayOfWeekId: entry.dayOfWeekId,
          pairNumberId: entry.pairNumberId,
          isBuffered: false,
          positionFlag: false,
          mergeNumber: 0,
          classroomFlag: false,
        })
        .where(eq(sdTable.id, buf.id));
      // Добавляем в локальный массив и перестраиваем контекст для учёта изменений
      const newEntry = { ...buf, ...entry, isBuffered: false };
      currentEntries.push(newEntry);
      // Перестраиваем контекст целиком (проще, чем инкрементально)
      ctx = await buildContext(currentEntries);
      placedCount++;
    } else {
      failedCount++;
    }
  }

  return { newEntries: currentEntries, placed: placedCount, failed: failedCount };
}
export async function optimizeSchedule(versionId?: number | null, includeBuffered?: boolean) {
  const versionCondition = versionId !== undefined
    ? (versionId === null ? isNull(sdTable.versionId) : eq(sdTable.versionId, versionId))
    : isNull(sdTable.versionId);
  
  let allEntries = await db.select().from(sdTable)
    .where(and(
      eq(sdTable.isBuffered, false),
      isNotNull(sdTable.weekId),
      isNotNull(sdTable.dayOfWeekId),
      isNotNull(sdTable.pairNumberId),
      versionCondition
    ));
  
  let bufferedCount = 0;
  let bufferedPlaced = 0;
  let bufferedFailed = 0;

  if (includeBuffered) {
    // Получаем все буферные записи для текущей версии
    const bufferedRows = await db.select().from(sdTable)
      .where(and(eq(sdTable.isBuffered, true), versionCondition));
    bufferedCount = bufferedRows.length;

    if (bufferedCount > 0) {
      // Преобразуем текущие небуферные записи в StrictScheduleEntry
      const safeEntries = allEntries.map(e => ({
        ...e,
        weekId: e.weekId!,
        dayOfWeekId: e.dayOfWeekId!,
        pairNumberId: e.pairNumberId!,
      })) as StrictScheduleEntry[];
      
      const { newEntries, placed, failed } = await placeBufferedEntries(versionId, safeEntries);
      bufferedPlaced = placed;
      bufferedFailed = failed;
      
      // Обновляем allEntries для дальнейшей оптимизации
      allEntries = newEntries.filter(e => !e.isBuffered).map(e => ({
        ...e,
        weekId: e.weekId!,
        dayOfWeekId: e.dayOfWeekId!,
        pairNumberId: e.pairNumberId!,
      }));
    }
  }

  if (allEntries.length < 2) {
    return {
      iterations: 0,
      initialScore: 0,
      finalScore: 0,
      message: "Слишком мало занятий",
      acceptedMoves: 0,
      singleMoved: 0,
      totalSingleEntries: 0,
      mergeGroupMoved: 0,
      totalMergeGroups: 0,
      mergeGroupFailedNoClassroom: 0,
      mergeGroupFailedNoSlot: 0,
      positionBlockedCount: 0,
      bufferedCount,
      bufferedPlaced,
      bufferedFailed,
    };
  }

  // Гарантируем, что после фильтрации IS NOT NULL координаты не null
  const safeEntries = allEntries.map(e => ({
    ...e,
    weekId: e.weekId!,
    dayOfWeekId: e.dayOfWeekId!,
    pairNumberId: e.pairNumberId!,
  })) as StrictScheduleEntry[];
  const ctx = await buildContext(safeEntries);
  // Сохраняем исходные слоты для каждого занятия
  const originalSlots = new Map<number, { week: number; day: number; pair: number }>();
  for (const e of ctx.entries) {
    originalSlots.set(e.id, { week: e.weekId, day: e.dayOfWeekId, pair: e.pairNumberId });
  }
  let currentScore = evaluateState(ctx);
  const initialScore = currentScore;
  let iterations = 0, accepted = 0;
  const MAX_ITER = 20000;
  const MAX_GROUP_ATTEMPTS = 5;

  // Параметры имитации отжига
  const { initialTemperature, coolingRate } = await loadAnnealingParams();
  let temperature = initialTemperature;

  const mergeGroups = [...ctx.mergeMap.values()];
  let bestScore = currentScore;
  let bestState = ctx.entries.map(e => ({ ...e }));

  // === НОВЫЕ СЧЁТЧИКИ ===
  let singleMoved = 0;                // сколько одиночных занятий изменили слот
  let mergeGroupMoved = 0;            // успешные перемещения групп слияния
  let mergeGroupFailedNoClassroom = 0; // откаты из-за отсутствия аудитории
  let mergeGroupFailedNoSlot = 0;     // не удалось разместить даже силой

  // Подсчёт одиночных записей и зафиксированных
  const totalSingleEntries = ctx.entries.filter(e => (e.mergeNumber ?? 0) === 0).length;
  const positionBlockedCount = ctx.entries.filter(e => e.positionFlag).length;
  const totalMergeGroups = mergeGroups.length;
  const singleEntries = ctx.entries.filter(e => (e.mergeNumber ?? 0) === 0);
  const singleCount = singleEntries.length;
  while (iterations < MAX_ITER) {
    if (mergeGroups.length > 0 && Math.random() < 0.7) {
      // === Блок для групп слияния ===
      const group = mergeGroups[Math.floor(Math.random() * mergeGroups.length)];
      let placed = false;
      // Целенаправленная попытка собрать разбросанную группу в один слот (схлопнуть)
      const firstEntry = group.entries[0];
      const isScattered = group.entries.some(e =>
        e.weekId !== firstEntry.weekId ||
        e.dayOfWeekId !== firstEntry.dayOfWeekId ||
        e.pairNumberId !== firstEntry.pairNumberId
      );
      if (isScattered && Math.random() < 0.7) {
        const targetSlot = {
          weekId: firstEntry.weekId,
          dayId: firstEntry.dayOfWeekId,
          pairId: firstEntry.pairNumberId
        };
        if (canMoveGroupToSlot(ctx, group, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId)) {
          const oldSlots = group.entries.map(e => ({ week: e.weekId, day: e.dayOfWeekId, pair: e.pairNumberId }));
          moveGroupToSlot(ctx, group, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId);
          const newScore = evaluateState(ctx);
          const delta = newScore - currentScore;
          if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            const classroomId = await findSuitableClassroomForGroup(group);
            if (classroomId !== null) {
              for (const entry of group.entries) {
                entry.classroomId = classroomId;
                if (entry.lessonId) await syncLessonClassroom(entry.lessonId, classroomId);
              }
              ctx.mergeClassroomIds.set(group.mergeNum, classroomId);
              currentScore = newScore;
              accepted++;
              mergeGroupMoved++;
              if (currentScore <= bestScore) {
                bestScore = currentScore;
                bestState = ctx.entries.map(e => ({ ...e }));
              }
              placed = true;
              continue; // не выполняем обычные случайные попытки в этой итерации
            } else {
              // откат
              for (let i = 0; i < group.entries.length; i++) {
                const entry = group.entries[i];
                const old = oldSlots[i];
                entry.weekId = old.week;
                entry.dayOfWeekId = old.day;
                entry.pairNumberId = old.pair;
                updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
              }
              mergeGroupFailedNoClassroom++;
            }
          } else {
            // откат по температуре
            for (let i = 0; i < group.entries.length; i++) {
              const entry = group.entries[i];
              const old = oldSlots[i];
              entry.weekId = old.week;
              entry.dayOfWeekId = old.day;
              entry.pairNumberId = old.pair;
              updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
            }
          }
        }
      }
      for (let attempt = 0; attempt < MAX_GROUP_ATTEMPTS && !placed; attempt++) {
        const targetSlot = ctx.slots[Math.floor(Math.random() * ctx.slots.length)];
        if (canMoveGroupToSlot(ctx, group, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId)) {
          const oldSlots = group.entries.map(e => ({ week: e.weekId, day: e.dayOfWeekId, pair: e.pairNumberId }));

          moveGroupToSlot(ctx, group, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId);
          const newScore = evaluateState(ctx);

          const delta = newScore - currentScore;
          if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            const classroomId = await findSuitableClassroomForGroup(group);
            if (classroomId !== null) {
              for (const entry of group.entries) {
                entry.classroomId = classroomId;
                if (entry.lessonId) await syncLessonClassroom(entry.lessonId, classroomId);
              }
              ctx.mergeClassroomIds.set(group.mergeNum, classroomId);
              currentScore = newScore;
              accepted++;
              mergeGroupMoved++; // <-- успешное перемещение группы
              if (currentScore <= bestScore) {
                bestScore = currentScore;
                bestState = ctx.entries.map(e => ({ ...e }));
              }
              placed = true;
            } else {
              // Аудитория не найдена – откатываем
              for (let i = 0; i < group.entries.length; i++) {
                const entry = group.entries[i];
                const old = oldSlots[i];
                entry.weekId = old.week;
                entry.dayOfWeekId = old.day;
                entry.pairNumberId = old.pair;
                updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
              }
              mergeGroupFailedNoClassroom++; // <-- не нашли аудиторию
            }
          } else {
            // Не принято по температуре – откатываем
            for (let i = 0; i < group.entries.length; i++) {
              const entry = group.entries[i];
              const old = oldSlots[i];
              entry.weekId = old.week;
              entry.dayOfWeekId = old.day;
              entry.pairNumberId = old.pair;
              updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
            }
          }
        }
      }

      if (!placed) {
        // Принудительное размещение через forcePlaceGroup
        for (let forceAttempt = 0; forceAttempt < 10 && !placed; forceAttempt++) {
          const targetSlot = ctx.slots[Math.floor(Math.random() * ctx.slots.length)];
          
          const oldEntries = group.entries.map(e => ({
            week: e.weekId,
            day: e.dayOfWeekId,
            pair: e.pairNumberId,
          }));
          const forceSuccess = forcePlaceGroup(ctx, group, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId);
          if (!forceSuccess) continue;

          const newScore = evaluateState(ctx);
          const delta = newScore - currentScore;
          if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            const classroomId = await findSuitableClassroomForGroup(group);
            if (classroomId !== null) {
              for (const entry of group.entries) {
                entry.classroomId = classroomId;
                if (entry.lessonId) await syncLessonClassroom(entry.lessonId, classroomId);
              }
              ctx.mergeClassroomIds.set(group.mergeNum, classroomId);
              currentScore = newScore;
              accepted++;
              mergeGroupMoved++;
              if (currentScore <= bestScore) {
                bestScore = currentScore;
                bestState = ctx.entries.map(e => ({ ...e }));
              }
              placed = true;
            } else {
              // Нет аудитории – откатываем
              for (let i = 0; i < group.entries.length; i++) {
                const entry = group.entries[i];
                const old = oldEntries[i];
                entry.weekId = old.week;
                entry.dayOfWeekId = old.day;
                entry.pairNumberId = old.pair;
                updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
              }
              mergeGroupFailedNoClassroom++;
            }
          } else {
            // Не принят по температуре – откатываем
            for (let i = 0; i < group.entries.length; i++) {
              const entry = group.entries[i];
              const old = oldEntries[i];
              entry.weekId = old.week;
              entry.dayOfWeekId = old.day;
              entry.pairNumberId = old.pair;
              updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, old.week, old.day, old.pair);
            }
          }
        }
        if (!placed) {
          mergeGroupFailedNoSlot++;
        }
      }
    } else {
      // === Обычные ходы (обмен или перемещение) ===
      const r = Math.random();
      if (r < 0.7) {
        // Обмен двух занятий
        if (singleCount < 2) { iterations++; continue; }
        const i = Math.floor(Math.random() * singleCount);
        let j = Math.floor(Math.random() * (singleCount - 1));
        if (j >= i) j++;
        const a = singleEntries[i];
        const b = singleEntries[j];
        if (a.positionFlag || b.positionFlag || a.unitCode !== b.unitCode) { iterations++; continue; }
        if (!canMoveToSlot(ctx, a, b.weekId, b.dayOfWeekId, b.pairNumberId) ||
            !canMoveToSlot(ctx, b, a.weekId, a.dayOfWeekId, a.pairNumberId)) {
          iterations++; continue;
        }

        const oldA = { w: a.weekId, d: a.dayOfWeekId, p: a.pairNumberId };
        const oldB = { w: b.weekId, d: b.dayOfWeekId, p: b.pairNumberId };
        // Меняем местами
        a.weekId = oldB.w; a.dayOfWeekId = oldB.d; a.pairNumberId = oldB.p;
        b.weekId = oldA.w; b.dayOfWeekId = oldA.d; b.pairNumberId = oldA.p;
        updateOccupancy(ctx, a, oldA.w, oldA.d, oldA.p, a.weekId, a.dayOfWeekId, a.pairNumberId);
        updateOccupancy(ctx, b, oldB.w, oldB.d, oldB.p, b.weekId, b.dayOfWeekId, b.pairNumberId);

        const newScore = evaluateState(ctx);
        const delta = newScore - currentScore;
        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
          currentScore = newScore;
          accepted++;
          if (currentScore <= bestScore) {
            bestScore = currentScore;
            bestState = ctx.entries.map(e => ({ ...e }));
          }
        } else {
          // Откат
          a.weekId = oldA.w; a.dayOfWeekId = oldA.d; a.pairNumberId = oldA.p;
          b.weekId = oldB.w; b.dayOfWeekId = oldB.d; b.pairNumberId = oldB.p;
          updateOccupancy(ctx, a, a.weekId, a.dayOfWeekId, a.pairNumberId, oldA.w, oldA.d, oldA.p);
          updateOccupancy(ctx, b, b.weekId, b.dayOfWeekId, b.pairNumberId, oldB.w, oldB.d, oldB.p);
        }
      } else {
        // Перемещение одного занятия
        if (ctx.slots.length === 0) { iterations++; continue; }
        if (singleCount === 0) { iterations++; continue; }
        const entryIdx = Math.floor(Math.random() * singleCount);
        const entry = singleEntries[entryIdx];
        if (entry.positionFlag) { iterations++; continue; }
        const slotIdx = Math.floor(Math.random() * ctx.slots.length);
        const targetSlot = ctx.slots[slotIdx];
        if (!canMoveToSlot(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId)) {
          iterations++; continue;
        }
        if (entry.weekId === targetSlot.weekId && entry.dayOfWeekId === targetSlot.dayId && entry.pairNumberId === targetSlot.pairId) {
          iterations++; continue;
        }

        const oldW = entry.weekId, oldD = entry.dayOfWeekId, oldP = entry.pairNumberId;
        entry.weekId = targetSlot.weekId; entry.dayOfWeekId = targetSlot.dayId; entry.pairNumberId = targetSlot.pairId;
        updateOccupancy(ctx, entry, oldW, oldD, oldP, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId);

        const newScore = evaluateState(ctx);
        const delta = newScore - currentScore;
        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
          currentScore = newScore;
          accepted++;
          if (currentScore <= bestScore) {
            bestScore = currentScore;
            bestState = ctx.entries.map(e => ({ ...e }));
          }
        } else {
          entry.weekId = oldW; entry.dayOfWeekId = oldD; entry.pairNumberId = oldP;
          updateOccupancy(ctx, entry, targetSlot.weekId, targetSlot.dayId, targetSlot.pairId, oldW, oldD, oldP);
        }
      }
    }
    // Охлаждение температуры
    temperature *= coolingRate;
    if (temperature < 0.01) temperature = 0.01;
    iterations++;
  }
  // Подсчёт уникальных занятий, у которых изменился слот
  if (accepted > 0) {
    singleMoved = ctx.entries.filter(e => {
      if ((e.mergeNumber ?? 0) !== 0) return false;
      const orig = originalSlots.get(e.id);
      if (!orig) return false;
      return e.weekId !== orig.week || e.dayOfWeekId !== orig.day || e.pairNumberId !== orig.pair;
    }).length;
  }
  if (bestScore <= currentScore) {
    ctx.entries = bestState;
    currentScore = bestScore;
  }
  // Пересчитаем группы слияния по финальному состоянию
  const finalMergeMap = new Map<number, StrictScheduleEntry[]>();
  for (const e of ctx.entries) {
    const mn = e.mergeNumber ?? 0;
    if (mn !== 0) {
      if (!finalMergeMap.has(mn)) finalMergeMap.set(mn, []);
      finalMergeMap.get(mn)!.push(e);
    }
  }
  // Принудительное финальное схлопывание разбросанных групп слияния
  for (const group of mergeGroups) {
    const first = group.entries[0];
    const isScattered = group.entries.some(e =>
      e.weekId !== first.weekId ||
      e.dayOfWeekId !== first.dayOfWeekId ||
      e.pairNumberId !== first.pairNumberId
    );
    if (isScattered && canMoveGroupToSlot(ctx, group, first.weekId, first.dayOfWeekId, first.pairNumberId)) {
      moveGroupToSlot(ctx, group, first.weekId, first.dayOfWeekId, first.pairNumberId);
      const classroomId = await findSuitableClassroomForGroup(group);
      if (classroomId !== null) {
        for (const entry of group.entries) {
          entry.classroomId = classroomId;
          if (entry.lessonId) await syncLessonClassroom(entry.lessonId, classroomId);
        }
        ctx.mergeClassroomIds.set(group.mergeNum, classroomId);
      }
    }
  }
  // Пересчитаем штраф после принудительного схлопывания (необязательно, но для статистики)
  currentScore = evaluateState(ctx);
  let mergeGroupsFinalPlaced = 0;
  for (const entries of finalMergeMap.values()) {
    const firstSlot = `${entries[0].weekId}-${entries[0].dayOfWeekId}-${entries[0].pairNumberId}`;
    const allSame = entries.every(e => `${e.weekId}-${e.dayOfWeekId}-${e.pairNumberId}` === firstSlot);
    if (allSame) mergeGroupsFinalPlaced++;
  }
  // Сохранение результата (без изменений)
  if (accepted > 0) {
    for (const entry of ctx.entries) {
      await db
        .update(sdTable)
        .set({
          weekId: entry.weekId,
          dayOfWeekId: entry.dayOfWeekId,
          pairNumberId: entry.pairNumberId,
          classroomId: entry.classroomId,
          positionFlag: entry.positionFlag,
          mergeNumber: entry.mergeNumber,
          classroomFlag: entry.classroomFlag,
        })
        .where(eq(sdTable.id, entry.id));
    }

    for (const [mergeNum, classroomId] of ctx.mergeClassroomIds) {
      if (classroomId === null) continue;
      const group = ctx.mergeMap.get(mergeNum);
      if (!group) continue;
      for (const entry of group.entries) {
        await db
          .update(sdTable)
          .set({ classroomId })
          .where(eq(sdTable.id, entry.id));
      }
    }

    const allDisplayRows = await db
      .select({
        id: sdTable.id,
        lessonId: sdTable.lessonId,
        unitCode: sdTable.unitCode,
        classroomId: sdTable.classroomId,
        disciplineAbbr: disciplines.abbreviation,
        lessonTypeName: lessonTypes.name,
        teacherSurname: employees.surname,
        teacherName: employees.name,
        teacherPatronymic: employees.patronymic,
        buildingNumber: buildings.number,
        roomNumber: classrooms.roomNumber,
      })
      .from(sdTable)
      .innerJoin(lessons, and(eq(sdTable.lessonId, lessons.id), eq(lessons.isActive, true), isNull(lessons.versionId)))
      .innerJoin(disciplines, eq(lessons.disciplineId, disciplines.id))
      .innerJoin(lessonTypes, eq(lessons.lessonTypeId, lessonTypes.id))
      .leftJoin(employeesDepartments, eq(lessons.teacherId, employeesDepartments.id))
      .leftJoin(employees, eq(employeesDepartments.employeeId, employees.id))
      .leftJoin(classrooms, eq(sdTable.classroomId, classrooms.id))
      .leftJoin(buildings, eq(classrooms.buildingId, buildings.id))
      .where(eq(sdTable.isBuffered, false));

    for (const row of allDisplayRows) {
      const typeMap: Record<string, string> = {
        lecture: 'лек.',
        lab: 'лаб.',
        workshop: 'пр.',
        guidedStudy: 'кср.'
      };
      const typeAbbr = typeMap[row.lessonTypeName] || row.lessonTypeName;
      const disc = row.disciplineAbbr;
      const teacher = `${row.teacherSurname} ${row.teacherName?.[0] ?? ''}.${row.teacherPatronymic?.[0] ? row.teacherPatronymic[0] + '.' : ''}`;
      const room = row.buildingNumber ? `${row.buildingNumber}-${row.roomNumber}` : 'б/а';
      const text = `[${row.unitCode}] ${typeAbbr}${disc} – ${teacher}, ${room}`;

      await db
        .update(sdTable)
        .set({ displayText: text })
        .where(eq(sdTable.id, row.id));
    }
  }

  return {
    iterations,
    initialScore,
    finalScore: currentScore,
    acceptedMoves: accepted,
    singleMoved,
    totalSingleEntries,
    mergeGroupMoved,
    mergeGroupsFinalPlaced,
    totalMergeGroups,
    mergeGroupFailedNoClassroom,
    mergeGroupFailedNoSlot,
    positionBlockedCount,
    bufferedCount,
    bufferedPlaced,
    bufferedFailed,
  };
}