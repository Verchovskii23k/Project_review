/**
 * Тестовые хелперы для интеграционных и E2E тестов.
 *
 * Предоставляют функции для полной очистки базы данных и создания
 * минимально необходимых сущностей (институтов, кафедр, дисциплин и т.д.)
 * с возможностью переопределения полей через `overrides`.
 *
 * ## Назначение
 * - **Очистка данных** – `clearAllTestData` удаляет все записи и сбрасывает
 *   автоинкрементные последовательности, приводя базу в исходное состояние.
 * - **Создание тестовых данных** – каждая функция создаёт одну запись,
 *   принимая обязательные параметры (внешние ключи) и необязательные
 *   `overrides` для кастомизации.
 * - **Изоляция тестов** – каждый тест может создать только те данные,
 *   которые ему нужны, не влияя на другие.
 *
 * ## Использование
 * ```ts
 * import { clearAllTestData, createTestInstitute, createTestDepartment } from '@/test/helpers';
 *
 * beforeEach(async () => {
 *   await clearAllTestData();
 * });
 *
 * test('создание кафедры', async () => {
 *   const instId = await createTestInstitute({ name: 'Мой институт' });
 *   const deptId = await createTestDepartment(instId, { name: 'Кафедра ПМИ' });
 *   // ...
 * });
 * ```
 *
 * ## Примечания
 * - Функции **не требуют запущенного приложения** — работают напрямую с БД через Drizzle.
 * - Очистка таблиц выполняется в порядке, учитывающем внешние ключи, чтобы избежать ошибок.
 * - Сброс последовательностей гарантирует, что идентификаторы начнутся с 1 после очистки.
 * - Все создаваемые сущности активны (`isActive: true`) и используют уникальные случайные
 *   значения для полей, требующих уникальности (коды, сокращения).
 */
import { db } from '@/db';
import { sql, eq, asc } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import {
  institutes, departments, disciplines, curriculum,
  buildings, classrooms, controlTypes, academicLoadTypes,
  scheduleDisplay, schedule, curriculumProfiles, lessonClassrooms,
  lessons, employeesDepartments, disciplineTeachers, hourTypeMapping,
  lessonTypes, unitRoots, units, unitTypes, daysOfWeek,
  pairs, weeks, students, studyGroups, education,
  educationForms, educationLevels, profiles,
  specialties, employees, positions, employmentTypes,
  settings, scheduleVersions, accounts, users,
} from '@/db/schema';
import { seedTestData } from '@/test/fixtures/fixtures';


export async function clearTable(table: PgTable) {
  await db.delete(table);
  const tableName = getTableConfig(table).name;
  await db.execute(sql`
    SELECT setval(pg_get_serial_sequence(${tableName}, 'id'), 1, false)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = ${tableName} AND column_name = 'id' 
        AND column_default LIKE 'nextval%'
    )
  `);
}

// Очистка нескольких таблиц в правильном порядке (учитывая внешние ключи)
export async function clearTables(...tables: PgTable[]) {
  for (const table of tables) {
    await clearTable(table);
  }
}
export async function clearAllTestData() {
  // Порядок: сначала зависимые (дочерние) таблицы, потом родительские
  const tables = [
    scheduleDisplay, schedule, lessonClassrooms, lessons,
    curriculumProfiles, curriculum, disciplineTeachers,
    employeesDepartments, classrooms,
    hourTypeMapping, lessonTypes,
    unitRoots, units, unitTypes,
    daysOfWeek, pairs, weeks,
    students, studyGroups,
    profiles,
    education, 
    specialties,
    disciplines,
    departments,
    institutes, buildings, employees,
    educationLevels, educationForms,
    positions, employmentTypes, academicLoadTypes, controlTypes,
    settings, scheduleVersions,
    accounts, users,
  ];
  for (const t of tables) {
    await db.delete(t);
  }
  await db.execute(sql`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE ' || r.sequence_name || ' RESTART WITH 1';
      END LOOP;
    END $$;
  `);
}
/**
 * Создаёт один институт и возвращает его id.
 */
export async function createTestInstitute(overrides?: Partial<typeof institutes.$inferInsert>) {
  const [inst] = await db
    .insert(institutes)
    .values({
      name: 'Тестовый институт',
      universityCode: Math.floor(Math.random() * 90000) + 10000,
      ...overrides,
    })
    .returning({ id: institutes.id });
  return inst.id;
}

/**
 * Создаёт одну кафедру и возвращает её id.
 * Требует instituteId.
 */
export async function createTestDepartment(instituteId: number, overrides?: Partial<typeof departments.$inferInsert>) {
  const [dept] = await db
    .insert(departments)
    .values({
      name: 'Тестовая кафедра',
      abbreviation: `ТК-${Math.floor(Math.random() * 9000)}`,
      instituteId,
      departmentCode: Math.floor(Math.random() * 90000) + 100,
      ...overrides,
    })
    .returning({ id: departments.id });
  return dept.id;
}

/**
 * Создаёт одну дисциплину и возвращает её id.
 * Требует departmentId.
 */
export async function createTestDiscipline(departmentId: number, overrides?: Partial<typeof disciplines.$inferInsert>) {
  const [disc] = await db
    .insert(disciplines)
    .values({
      name: 'Тестовая дисциплина',
      abbreviation: 'ТД',
      departmentId,
      ...overrides,
    })
    .returning({ id: disciplines.id });
  return disc.id;
}

export async function createTestEducation(overrides?: Partial<typeof education.$inferInsert>) {
  // Убедимся, что есть уровень и форма
  let levelId = overrides?.levelId;
  if (!levelId) {
    const [lvl] = await db.select({ id: educationLevels.id }).from(educationLevels).limit(1);
    if (!lvl) {
      const [newLvl] = await db.insert(educationLevels).values({ name: 'Бакалавриат', isActive: true }).returning({ id: educationLevels.id });
      levelId = newLvl.id;
    } else {
      levelId = lvl.id;
    }
  }
  let formId = overrides?.formId;
  if (!formId) {
    const [frm] = await db.select({ id: educationForms.id }).from(educationForms).limit(1);
    if (!frm) {
      const [newFrm] = await db.insert(educationForms).values({ name: 'Очная', isActive: true }).returning({ id: educationForms.id });
      formId = newFrm.id;
    } else {
      formId = frm.id;
    }
  }
  const [edu] = await db
    .insert(education)
    .values({
      levelId,
      formId,
      durationMonths: 48,
      ...overrides,
    })
    .returning({ id: education.id });
  return edu.id;
}

export async function createTestSpecialty(departmentId: number, overrides?: Partial<typeof specialties.$inferInsert>) {
  const [spec] = await db
    .insert(specialties)
    .values({
      code: `TEST-${Math.floor(Math.random() * 9000)}`,
      name: 'Тестовая специальность',
      departmentId,
      ...overrides,
    })
    .returning({ id: specialties.id });
  return spec.id;
}

export async function createTestProfile(specialtyId: number, educationId: number, overrides?: Partial<typeof profiles.$inferInsert>) {
  const [prof] = await db
    .insert(profiles)
    .values({
      name: 'Тестовый профиль',
      letterCode: `t${Math.floor(Math.random() * 100)}`,
      specialtyId,
      educationId,
      abbreviation: overrides?.abbreviation ?? 'ТЕСТ',
      ...overrides,
    })
    .returning({ id: profiles.id });
  return prof.id;
}
/**
 * Создаёт сотрудника и возвращает его id.
 */
export async function createTestEmployee(overrides?: Partial<typeof employees.$inferInsert>) {
  const [emp] = await db
    .insert(employees)
    .values({
      surname: 'Тестовый',
      name: 'Сотрудник',
      patronymic: 'Тестович',
      isActive: true,
      ...overrides,
    })
    .returning({ id: employees.id });
  return emp.id;
}

/**
 * Привязывает сотрудника к кафедре и возвращает id связи.
 */
export async function createTestEmployeeDepartment(
  employeeId: number,
  departmentId: number,
  overrides?: Partial<typeof employeesDepartments.$inferInsert>
) {
  const [ed] = await db
    .insert(employeesDepartments)
    .values({
      employeeId,
      departmentId,
      ...overrides,
    })
    .returning({ id: employeesDepartments.id });
  return ed.id;
}

/**
 * Создаёт учебную группу и возвращает её id.
 * Требует profileId.
 */
export async function createTestStudyGroup(
  profileId: number,
  overrides?: Partial<typeof studyGroups.$inferInsert>
) {
  const [grp] = await db
    .insert(studyGroups)
    .values({
      code: `TEST-${Math.floor(Math.random() * 9000)}`,
      profileId,
      course: 1,
      studentCount: 10,
      isActive: true,
      ...overrides,
    })
    .returning({ id: studyGroups.id });
  return grp.id;
}
export async function createTestUser(overrides?: Partial<typeof users.$inferInsert>) {
  const [user] = await db
    .insert(users)
    .values({
      email: `test-${Date.now()}@test.local`,
      role: 'admin',
      ...overrides,
    })
    .returning({ id: users.id });
  return user.id;
}
export async function createTestEmploymentType(overrides?: Partial<typeof employmentTypes.$inferInsert>) {
  const [et] = await db
    .insert(employmentTypes)
    .values({
      name: 'Основная',
      abbreviation: 'ОСН',
      ...overrides,
    })
    .returning({ id: employmentTypes.id });
  return et.id;
}

export async function createTestPosition(overrides?: Partial<typeof positions.$inferInsert>) {
  const [pos] = await db
    .insert(positions)
    .values({
      name: 'Доцент',
      abbreviation: 'доц',
      ...overrides,
    })
    .returning({ id: positions.id });
  return pos.id;
}
export async function createTestUnitType(overrides?: Partial<typeof unitTypes.$inferInsert>) {
  const [ut] = await db
    .insert(unitTypes)
    .values({
      name: 'ГРУППА',
      maxSize: 32,
      priorityLecture: 3,
      priorityWorkshop: 3,
      priorityGuidedStudy: 3,
      priorityLab: 3,
      isActive: true,
      ...overrides,
    })
    .returning({ id: unitTypes.id });
  return ut.id;
}

export async function createTestUnit(unitTypeId: number, overrides?: Partial<typeof units.$inferInsert>) {
  const [u] = await db
    .insert(units)
    .values({
      code: `TEST-UNIT-${Math.floor(Math.random() * 9000)}`,
      unitTypeId,
      isActive: true,
      ...overrides,
    })
    .returning({ id: units.id, code: units.code });
  return u;
}
export async function createCheckSlotsEnvironment() {
  await clearAllTestData();
  const seed = await seedTestData();

  // Создаём учебную группу
  const [group] = await db.insert(studyGroups).values({
    code: 'TEST',
    profileId: seed.profiles.A,
    course: 1,
    studentCount: 10,
    isActive: true,
  }).returning();
  const groupId = group.id;

  const utFlow = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ПОТОК')).limit(1).then(r => r[0]);
  const utSub = await db.select().from(unitTypes).where(eq(unitTypes.name, 'ПОДГРУППА')).limit(1).then(r => r[0]);

  const [unitFlow] = await db.insert(units).values({ code: 'FLOW', unitTypeId: utFlow.id, isActive: true }).returning();
  const [unitSG1] = await db.insert(units).values({ code: 'SG1', unitTypeId: utSub.id, isActive: true }).returning();
  const [unitSG2] = await db.insert(units).values({ code: 'SG2', unitTypeId: utSub.id, isActive: true }).returning();

  await db.insert(unitRoots).values([
    { unitCode: 'FLOW', studyGroupId: groupId, isActive: true },
    { unitCode: 'SG1', studyGroupId: groupId, isActive: true },
    { unitCode: 'SG2', studyGroupId: groupId, isActive: true },
  ]);

  // Преподаватели — создаём/добираем трёх, и обязательно создаём employeesDepartments
  let employeesList = await db.select().from(employees).where(eq(employees.isActive, true)).limit(3);
  if (employeesList.length < 3) {
    const need = 3 - employeesList.length;
    for (let i = 0; i < need; i++) {
      const [emp] = await db.insert(employees).values({
        surname: `Преподаватель${employeesList.length + i + 1}`,
        name: 'Тест',
        isActive: true,
      }).returning();
      employeesList.push(emp);
    }
  }
  const [t1, t2, t3] = employeesList;

  // Привязываем каждого преподавателя к первой кафедре (или к любой существующей)
  const [dept] = await db.select({ id: departments.id }).from(departments).limit(1);
  if (!dept) throw new Error('No department');
  // Создаём записи в employeesDepartments, если их ещё нет
  for (const t of [t1, t2, t3]) {
    const existing = await db.select().from(employeesDepartments).where(eq(employeesDepartments.employeeId, t.id)).limit(1);
    if (existing.length === 0) {
      await db.insert(employeesDepartments).values({
        employeeId: t.id,
        departmentId: dept.id,
        isActive: true,
      });
    }
  }
  // Получаем id записей employeesDepartments для использования в lessons
  const ed1 = await db.select().from(employeesDepartments).where(eq(employeesDepartments.employeeId, t1.id)).limit(1).then(r => r[0]);
  const ed2 = await db.select().from(employeesDepartments).where(eq(employeesDepartments.employeeId, t2.id)).limit(1).then(r => r[0]);
  const ed3 = await db.select().from(employeesDepartments).where(eq(employeesDepartments.employeeId, t3.id)).limit(1).then(r => r[0]);
  if (!ed1 || !ed2 || !ed3) throw new Error('employeesDepartments not created');

  // Аудитории — добираем/создаём три
  let classroomsList = await db.select().from(classrooms).where(eq(classrooms.isActive, true)).limit(3);
  if (classroomsList.length < 3) {
    const need = 3 - classroomsList.length;
    const buildingId = (await db.select().from(buildings).limit(1))[0]?.id;
    if (!buildingId) throw new Error('No buildings');
    for (let i = 0; i < need; i++) {
      const [c] = await db.insert(classrooms).values({
        buildingId,
        roomNumber: `${100 + i}`,
        capacity: 30,
        isActive: true,
      }).returning();
      classroomsList.push(c);
    }
  }
  const [c1, c2, c3] = classroomsList;

  // Дисциплина и учебный план
  const [disc] = await db.select().from(disciplines).where(eq(disciplines.isActive, true)).limit(1);
  if (!disc) throw new Error('No discipline');
  const [cur] = await db.insert(curriculum).values({
    course: 1, semester: 1, disciplineId: disc.id, hoursLecture: 0, isActive: true,
  }).returning();

  // Создаём уроки, используя id employeesDepartments
  const [lFlow] = await db.insert(lessons).values({
    curriculumId: cur.id, unitId: unitFlow.id, lessonTypeId: 1, disciplineId: disc.id,
    countPerSemester: 1, teacherId: ed1.id, isActive: true,
  }).returning();
  const [lSG1] = await db.insert(lessons).values({
    curriculumId: cur.id, unitId: unitSG1.id, lessonTypeId: 1, disciplineId: disc.id,
    countPerSemester: 1, teacherId: ed2.id, isActive: true,
  }).returning();
  const [lSG2] = await db.insert(lessons).values({
    curriculumId: cur.id, unitId: unitSG2.id, lessonTypeId: 1, disciplineId: disc.id,
    countPerSemester: 1, teacherId: ed3.id, isActive: true,
  }).returning();

  // Привязываем аудитории
  await db.insert(lessonClassrooms).values([
    { lessonId: lFlow.id, classroomId: c1.id },
    { lessonId: lSG1.id, classroomId: c2.id },
    { lessonId: lSG2.id, classroomId: c3.id },
  ]);

  const daysList = await db.select().from(daysOfWeek).orderBy(asc(daysOfWeek.id));
  const pairsList = await db.select().from(pairs).orderBy(asc(pairs.number));
  const weeksList = await db.select().from(weeks).where(eq(weeks.isActive, true)).orderBy(asc(weeks.id));
  if (weeksList.length === 0) throw new Error('No active weeks');

  const flowEntry = await db.insert(scheduleDisplay).values({
    lessonId: lFlow.id, weekId: weeksList[0].id, dayOfWeekId: daysList[0].id, pairNumberId: pairsList[0].id,
    unitCode: 'FLOW', displayText: 'flow', isBuffered: false, isActive: true, versionId: null,
  }).returning().then(r => r[0]);
  const sg1Entry = await db.insert(scheduleDisplay).values({
    lessonId: lSG1.id, weekId: weeksList[0].id, dayOfWeekId: daysList[0].id, pairNumberId: pairsList[1].id,
    unitCode: 'SG1', displayText: 'sg1', isBuffered: false, isActive: true, versionId: null,
  }).returning().then(r => r[0]);
  const sg2Entry = await db.insert(scheduleDisplay).values({
    lessonId: lSG2.id, weekId: weeksList[0].id, dayOfWeekId: daysList[0].id, pairNumberId: pairsList[2].id,
    unitCode: 'SG2', displayText: 'sg2', isBuffered: false, isActive: true, versionId: null,
  }).returning().then(r => r[0]);

return {
    weeks: weeksList,
    days: daysList,
    pairs: pairsList,
    flowEntryId: flowEntry.id,
    sg1EntryId: sg1Entry.id,
    sg2EntryId: sg2Entry.id,
    flowLessonId: lFlow.id,
    sg1LessonId: lSG1.id,
    sg2LessonId: lSG2.id,
    teacher1Id: t1.id,
    teacher2Id: t2.id,
    teacher3Id: t3.id,
    classroom1Id: c1.id,
    classroom2Id: c2.id,
    classroom3Id: c3.id,
    curriculumId: cur.id,
    unitSG1Id: unitSG1.id,
    unitSG2Id: unitSG2.id,
    unitFlowId: unitFlow.id,
    disciplineId: disc.id,
};
}