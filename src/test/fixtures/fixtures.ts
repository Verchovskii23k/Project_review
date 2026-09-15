/**
 * Тестовые фикстуры для интеграционных и E2E тестов.
 *
 * Предоставляют:
 * - `clearDatabase` – полную очистку всех таблиц и сброс автоинкрементных последовательностей.
 * - `seedTestData` – заполнение базы минимально необходимыми справочными данными
 *   (институты, кафедры, дисциплины, преподаватели, студенты, аудитории, учебные планы и т.д.).
 * - `seedAuthUser` – создание тестового пользователя (admin) с известным паролем для тестов аутентификации.
 *
 * ## Использование
 * ```ts
 * import { clearDatabase, seedTestData, seedAuthUser } from '@/test/fixtures/fixtures';
 *
 * beforeEach(async () => {
 *   await clearDatabase();
 *   await seedTestData();
 * });
 *
 * test('пример', async () => {
 *   const { email, password } = await seedAuthUser();
 *   // ...
 * });
 * ```
 *
 * @remarks
 * - `clearDatabase` удаляет данные в порядке, учитывающем внешние ключи.
 * - `seedTestData` возвращает объект с ID созданных сущностей для использования в тестах.
 * - `seedAuthUser` хеширует пароль '123456' и создаёт связанного сотрудника с флагом isAdmin.
 */
import { db } from "@/db";
import {
  institutes, buildings, unitTypes, lessonTypes,
  hourTypeMapping, departments, specialties, disciplines,
  employees, students, profiles, disciplineTeachers,
  curriculum, curriculumProfiles, classrooms,
  employeesDepartments, weeks, daysOfWeek, pairs, settings,
  users, accounts,
  scheduleDisplay, schedule, lessonClassrooms, lessons,
  unitRoots, studyGroups, units,
  controlTypes, employmentTypes, academicLoadTypes,
  educationForms, education, educationLevels,
  positions, scheduleVersions,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function clearDatabase() {
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
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE ' || r.sequence_name || ' RESTART WITH 1';
      END LOOP;
    END $$;
  `);
}

export async function seedTestData() {
  await clearDatabase();

  // === 1. Институты ===
  const [inst] = await db.insert(institutes).values([
    { name: "Институт тестов", universityCode: 999 },
  ]).returning();
  const instId = inst.id;

  // === 2. Корпус ===
  const [bld] = await db.insert(buildings).values([
    { number: 1 },
  ]).returning();
  const bldId = bld.id;

  // === 3. Типы юнитов ===
  await db.insert(unitTypes).values([
    { name: "ПОТОК", maxSize: 128, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3 },
    { name: "ГРУППА", maxSize: 32, priorityLecture: 2, priorityWorkshop: 1, priorityGuidedStudy: 1, priorityLab: 2 },
    { name: "ПОДГРУППА", maxSize: 16, priorityLecture: 3, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 1 },
  ]);

  // === 4. Типы занятий ===
  const ltData = await db.insert(lessonTypes).values([
    { name: "lecture", abbreviation: "ЛК" },
    { name: "workshop", abbreviation: "ПР" },
    { name: "guidedStudy", abbreviation: "КСР" },
    { name: "lab", abbreviation: "ЛАБ" },
  ]).returning();
  const ltMap = new Map(ltData.map(t => [t.name, t.id]));

  // === 5. Соответствие часов и приоритетов ===
  await db.insert(hourTypeMapping).values([
    { planHourColumn: "hours_lecture", priorityColumn: "priorityLecture", lessonTypeId: ltMap.get("lecture")! },
    { planHourColumn: "hours_workshop", priorityColumn: "priorityWorkshop", lessonTypeId: ltMap.get("workshop")! },
    { planHourColumn: "hours_guided_study", priorityColumn: "priorityGuidedStudy", lessonTypeId: ltMap.get("guidedStudy")! },
    { planHourColumn: "hours_lab", priorityColumn: "priorityLab", lessonTypeId: ltMap.get("lab")! },
  ]);

  // === 6. Кафедры ===
  const deptData = await db.insert(departments).values([
    { name: "Кафедра А", abbreviation: "КА", instituteId: instId, departmentCode: 101 },
    { name: "Кафедра Б", abbreviation: "КБ", instituteId: instId, departmentCode: 102 },
  ]).returning();
  const deptA = deptData[0];
  const deptB = deptData[1];

  // === 7. Специальности ===
  const specData = await db.insert(specialties).values([
    { code: "01.03.01", name: "Специальность А", departmentId: deptA.id },
    { code: "01.03.02", name: "Специальность Б", departmentId: deptB.id },
  ]).returning();
  const specA = specData[0];
  const specB = specData[1];

  // === 8. Профили ===
  const profData = await db.insert(profiles).values([
    { name: "Профиль А", abbreviation: 'ТЕСТ1',specialtyId: specA.id, letterCode: "а" },
    { name: "Профиль Б", abbreviation: 'ТЕСТ2',specialtyId: specB.id, letterCode: "б" },
  ]).returning();
  const profA = profData[0];
  const profB = profData[1];

  // === 9. Дисциплины ===
  const discData = await db.insert(disciplines).values([
    { name: "Дисциплина 1", abbreviation: "Д1", departmentId: deptA.id },
    { name: "Дисциплина 2", abbreviation: "Д2", departmentId: deptB.id },
  ]).returning();
  const disc1 = discData[0];
  const disc2 = discData[1];

  // === 10. Преподаватели ===
  const empData = await db.insert(employees).values([
    { surname: "Преподаватель", name: "Один", patronymic: "Первый", isActive: true },
    { surname: "Преподаватель", name: "Два", patronymic: "Второй", isActive: true },
  ]).returning();
  const emp1 = empData[0];
  const emp2 = empData[1];

  // === 11. Привязка преподавателей к кафедрам ===
  const empDeptData = await db.insert(employeesDepartments).values([
    { employeeId: emp1.id, departmentId: deptA.id },
    { employeeId: emp2.id, departmentId: deptB.id },
  ]).returning();

  // === 12. Дисциплины-преподаватели ===
  await db.insert(disciplineTeachers).values([
    { lessonTypeId: ltMap.get("lecture")!, disciplineId: disc1.id, teacherDepartmentId: empDeptData[0].id },
    { lessonTypeId: ltMap.get("guidedStudy")!, disciplineId: disc1.id, teacherDepartmentId: empDeptData[0].id },
    { lessonTypeId: ltMap.get("lab")!, disciplineId: disc1.id, teacherDepartmentId: empDeptData[0].id },
    { lessonTypeId: ltMap.get("lecture")!, disciplineId: disc2.id, teacherDepartmentId: empDeptData[1].id },
    { lessonTypeId: ltMap.get("guidedStudy")!, disciplineId: disc2.id, teacherDepartmentId: empDeptData[1].id },
    { lessonTypeId: ltMap.get("lab")!, disciplineId: disc2.id, teacherDepartmentId: empDeptData[1].id },
  ]);

  // === 13. Учебный план ===
  const curriculumData = await db.insert(curriculum).values([
    {
      course: 3, semester: 1, disciplineId: disc1.id,
      hoursLecture: 32, hoursGuidedStudy: 16, hoursWorkshop: 0, hoursLab: 32,
      isActive: true,
    },
    {
      course: 3, semester: 1, disciplineId: disc2.id,
      hoursLecture: 16, hoursGuidedStudy: 16, hoursWorkshop: 0, hoursLab: 16,
      isActive: true,
    },
  ]).returning();

  for (const plan of curriculumData) {
    await db.insert(curriculumProfiles).values([
      { curriculumId: plan.id, profileId: profA.id },
      { curriculumId: plan.id, profileId: profB.id },
    ]);
  }

  // === 14. Аудитории ===
  await db.insert(classrooms).values([
    { buildingId: bldId, roomNumber: "322", capacity: 16, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1 },
    { buildingId: bldId, roomNumber: "325", capacity: 16, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1 },
    { buildingId: bldId, roomNumber: "329", capacity: 60, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1 },
    { buildingId: bldId, roomNumber: "345", capacity: 60, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1 },
    { buildingId: bldId, roomNumber: "467", capacity: 100, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1 },
    { buildingId: bldId, roomNumber: "471", capacity: 100, priorityLecture: 1, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 3 },
    { buildingId: bldId, roomNumber: "350", capacity: 150, priorityLecture: 3, priorityWorkshop: 3, priorityGuidedStudy: 3 },
    { buildingId: bldId, roomNumber: "160", capacity: 150, priorityLecture: 2, priorityWorkshop: 2, priorityGuidedStudy: 3 },
    { buildingId: bldId, roomNumber: "210", capacity: 150, priorityLecture: 2, priorityWorkshop: 2, priorityGuidedStudy: 3 },
  ]);

  // === 15. Студенты ===
  const studentProfiles = [
    { surname: "Студентова", name: "Анна", admissionYear: 2023, profileId: profA.id, course: 3 },
    { surname: "Студентов", name: "Борис", admissionYear: 2023, profileId: profA.id, course: 3 },
    { surname: "Студентова", name: "Вера", admissionYear: 2023, profileId: profA.id, course: 3 },
    { surname: "Студентов", name: "Глеб", admissionYear: 2021, profileId: profA.id, course: 2 },
    { surname: "Студентова", name: "Диана", admissionYear: 2023, profileId: profB.id, course: 3 },
    { surname: "Студентов", name: "Егор", admissionYear: 2023, profileId: profB.id, course: 3 },
    { surname: "Студентова", name: "Жанна", admissionYear: 2023, profileId: profB.id, course: 3 },
    { surname: "Студентов", name: "Захар", admissionYear: 2022, profileId: profB.id, course: 3 },
    { surname: "Студентова", name: "Ирина", admissionYear: 2021, profileId: profA.id, course: 2 },
    { surname: "Студентов", name: "Константин", admissionYear: 2023, profileId: profB.id, course: 3 },
  ];
  for (const s of studentProfiles) {
    await db.insert(students).values({
      surname: s.surname,
      name: s.name,
      admissionYear: s.admissionYear,
      profileId: s.profileId,
      course: s.course,
      isActive: true,
    });
  }

  // === 16. Дни недели, пары, недели ===
  await db.insert(daysOfWeek).values(
    ["ПН","ВТ","СР","ЧТ","ПТ","СБ"].map(name => ({ name }))
  );
  await db.insert(pairs).values(
    [1,2,3,4,5].map(number => ({ number }))
  );
  await db.insert(weeks).values([
    { type: "odd" },
    { type: "even" },
  ]);

  // === 17. Настройки ===
  await db.insert(settings).values([
    { key: "total_weeks", value: "16" },
    { key: "current_semester", value: "1" },
  ]);

  return {
    instituteId: instId,
    buildingId: bldId,
    departments: { A: deptA.id, B: deptB.id },
    specialties: { A: specA.id, B: specB.id },
    profiles: { A: profA.id, B: profB.id },
    disciplines: { D1: disc1.id, D2: disc2.id },
    employees: { E1: emp1.id, E2: emp2.id },
    lessonTypes: Object.fromEntries(ltMap),
  };
}

// Новая функция для создания тестового пользователя
export async function seedAuthUser(email: string | null = null) {
  const password = "123456";
  const hashed = await bcrypt.hash(password, 10);
  const userEmail = email || `test-${Date.now()}@test.local`;

  // Создаём пользователя в users
  const [user] = await db.insert(users).values({
    email: userEmail,
    hashedPassword: hashed,
    role: 'admin',
  }).returning({ id: users.id });

  // Создаём сотрудника-админа, привязанного к users
  await db.insert(employees).values({
    surname: "Тестовый",
    name: "Админ",
    isAdmin: true,
    isActive: true,
    userId: user.id,
  }).returning({ id: employees.id });

  return { email: userEmail, password, userId: user.id };
}