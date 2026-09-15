import { db } from "@/db";
import {
  institutes, buildings, unitTypes, lessonTypes,
  academicLoadTypes, controlTypes, hourTypeMapping,
  departments, specialties, disciplines,
  employees, students,
  profiles,
  disciplineTeachers,
  curriculum, curriculumProfiles,
  classrooms, studyGroups,
  employeesDepartments,
  weeks, daysOfWeek, pairs, unitRoots, units,
  educationLevels, educationForms, education,
  positions, employmentTypes,
  settings, scheduleDisplay, schedule, lessonClassrooms, lessons,
} from "@/db/schema";
import { eq, getTableName, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

const SEED_DATA: Record<string, Record<string, unknown>[]> = {
  employees: [
    { id: 1, surname: "АЛЬТМАН", name: "ЕВГЕНИЙ", patronymic: "АНАТОЛЬЕВИЧ", isActive: true, isAdmin: false },
    { id: 2, surname: "ЕЛИЗАРОВ", name: "ДМИТРИЙ", patronymic: "АЛЕКСАНДРОВИЧ", userId: null, isActive: true, isAdmin: false },
    { id: 3, surname: "КАШТАНОВ", name: "АЛЕКСЕЙ", patronymic: "ЛЕОНИДОВИЧ", userId: null, isActive: true, isAdmin: false },
    { id: 4, surname: "ОКИШЕВ", name: "АНДРЕЙ", patronymic: "СЕРГЕЕВИЧ", userId: null, isActive: true, isAdmin: false },
    { id: 5, surname: "МАЛЮТИН", name: "АНДРЕЙ", patronymic: "ГЕННАДЬЕВИЧ", userId: null, isActive: true, isAdmin: false },
    { id: 6, surname: "ГЕРМАН", name: "ЕЛЕНА", patronymic: "ВИКТОРОВНА", userId: null, isActive: true, isAdmin: false },
  ],
  education_levels: [
    { id: 1, name: "БАКАЛАВРИАТ", abbreviation: "БАК", isActive: true },
    { id: 2, name: "СПЕЦИАЛИТЕТ", abbreviation: "СПЕЦ", isActive: true },
    { id: 3, name: "МАГИСТРАТУРА", abbreviation: "МАГ", isActive: true },
  ],
  education_forms: [
    { id: 1, name: "ОЧНАЯ", abbreviation: "ОЧ", isActive: true },
    { id: 2, name: "ЗАОЧНАЯ", abbreviation: "ЗАОЧ", isActive: true },
    { id: 3, name: "ОЧНО-ЗАОЧНАЯ", abbreviation: "ОЧ-ЗАОЧ", isActive: true },
  ],
  education: [
    { id: 1, levelId: 1, formId: 1, durationMonths: 48, isActive: true },
  ],
  positions: [
    { id: 1, name: "СТАРШИЙ ПРЕПОДАВАТЕЛЬ", abbreviation: "СТ. ПР", isActive: true },
    { id: 2, name: "ДОЦЕНТ", abbreviation: "ДОЦ", isActive: true },
  ],
  employment_types: [
    { id: 1, name: "ОСНОВНАЯ", abbreviation: "ОСН", isActive: true },
    { id: 2, name: "ВНУТРЕННИЙ СОВМЕСТИТЕЛЬ", abbreviation: "ВНУТР. СОВМ", isActive: true },
    { id: 3, name: "ВНЕШНИЙ СОВМЕСТИТЕЛЬ", abbreviation: "ВНЕШ. СОВМ", isActive: true },
  ],
  days_of_week: [
    { id: 1, name: "ПН", isActive: true }, { id: 2, name: "ВТ", isActive: true },
    { id: 3, name: "СР", isActive: true }, { id: 4, name: "ЧТ", isActive: true },
    { id: 5, name: "ПТ", isActive: true }, { id: 6, name: "СБ", isActive: true },
  ],
  pairs: [
    { id: 1, number: 1, isActive: true }, { id: 2, number: 2, isActive: true },
    { id: 3, number: 3, isActive: true }, { id: 4, number: 4, isActive: true },
    { id: 5, number: 5, isActive: true },
  ],
  weeks: [
    { id: 1, type: "НЕЧЕТ", isActive: true },
    { id: 2, type: "ЧЕТ", isActive: true },
  ],
  lesson_types: [
    { id: 1, name: "lecture", abbreviation: "ЛК", isActive: true },
    { id: 2, name: "workshop", abbreviation: "ПР", isActive: true },
    { id: 3, name: "guidedStudy", abbreviation: "КСР", isActive: true },
    { id: 4, name: "lab", abbreviation: "ЛАБ", isActive: true },
  ],
  unit_types: [
    { id: 1, name: "ПОТОК", maxSize: 150, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3, isActive: true },
    { id: 3, name: "ПОДГРУППА", maxSize: 16, priorityLecture: 3, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 1, isActive: true },
    { id: 2, name: "ГРУППА", maxSize: 32, priorityLecture: 2, priorityWorkshop: 1, priorityGuidedStudy: 1, priorityLab: 2, isActive: true },
  ],
  buildings: [
    { id: 1, number: 1, isActive: true },
  ],
  academic_load_types: [
    { id: 1, name: "КУРСОВАЯ РАБОТА", abbreviation: "КР", isActive: true },
    { id: 2, name: "КУРСОВОЙ ПРОЕКТ", abbreviation: "КП", isActive: true },
    { id: 3, name: "ПРАКТИКА", abbreviation: "ПР", isActive: true },
    { id: 4, name: "ПРЕДДИПЛОМНАЯ ПРАКТИКА", abbreviation: "ПДП", isActive: true },
    { id: 5, name: "ДИПЛОМ", abbreviation: "Д", isActive: true },
    { id: 6, name: "ОТСУТСТВУЕТ ", abbreviation: "—", isActive: true },
  ],
  control_types: [
    { id: 1, name: "ЗАЧЕТ", abbreviation: "ЗАЧ", isActive: true },
    { id: 2, name: "ДИФФЕРЕНЦИАЛЬНЫЙ ЗАЧЕТ", abbreviation: "ДИФ. ЗАЧ", isActive: true },
    { id: 3, name: "ЭКЗАМЕН", abbreviation: "ЭКЗ", isActive: true },
  ],
  hour_type_mapping: [
    { id: 1, planHourColumn: "hours_lecture", priorityColumn: "priorityLecture", lessonTypeId: 1, isActive: true },
    { id: 2, planHourColumn: "hours_workshop", priorityColumn: "priorityWorkshop", lessonTypeId: 2, isActive: true },
    { id: 3, planHourColumn: "hours_guided_study", priorityColumn: "priorityGuidedStudy", lessonTypeId: 3, isActive: true },
    { id: 4, planHourColumn: "hours_lab", priorityColumn: "priorityLab", lessonTypeId: 4, isActive: true },
  ],
  institutes: [
    { id: 1, universityCode: 1, name: "ИЭТСЭ", directorId: null, isActive: true },
    { id: 2, universityCode: 2, name: "ИАТИТ", directorId: null, isActive: true },
    { id: 3, universityCode: 4, name: "ИНТС", directorId: null, isActive: true },
    { id: 4, universityCode: 5, name: "ИМЭК", directorId: null, isActive: true },
  ],
  departments: [
    { id: 1, name: "АВТОМАТИКА И СИСТЕМЫ УПРАВЛЕНИЯ", abbreviation: "АиСУ", instituteId: 2, departmentCode: 17, headId: null, isActive: true },
    { id: 2, name: "ФИЗИЧЕСКОЕ ВОСПИТАНИЕ И СПОРТ", abbreviation: "ФВиС", instituteId: 1, departmentCode: 3, headId: null, isActive: true },
  ],
  specialties: [
    { id: 1, code: "09.03.01", name: "ИНФОРМАТИКА И ВЫЧИСЛИТЕЛЬНАЯ ТЕХНИКА", departmentId: 1, isActive: true },
    { id: 2, code: "09.03.02", name: "ИНФОРМАЦИОННЫЕ СИСТЕМЫ И ТЕХНОЛОГИИ", departmentId: 1, isActive: true },
  ],
  profiles: [
    { id: 1, name: "ИНФОРМАТИКА И ПРОГРАММНАЯ ИНЖЕНЕРИЯ", abbreviation: "ИиПИ",specialtyId: 1, letterCode: "м", educationId: 1, isActive: true },
    { id: 2, name: "ПРОГРАММИРОВАНИЕ И ИНФОРМАЦИОННЫЕ ТЕХНОЛОГИИ", abbreviation: "ПИТ",specialtyId: 2, letterCode: "з", educationId: 1, isActive: true },
    { id: 3, name: "ПРОГРАММИРОВАНИЕ И ИНФОРМАЦИОННЫЕ ТЕХНОЛОГИИ", abbreviation: "ПИТ", specialtyId: 2, letterCode: "к", educationId: 1, isActive: true },
  ],
  disciplines: [
    { id: 1, name: "ПРИКЛАДНОЕ ПРОГРАММИРОВАНИЕ", abbreviation: "ПП", departmentId: 1, isActive: true },
    { id: 2, name: "ТЕСТИРОВАНИЕ ПРОГРАММНЫХ ПРОДУКТОВ", abbreviation: "ТПП", departmentId: 1, isActive: true },
    { id: 3, name: "ИНЖЕНЕРИЯ ИНФОРМАЦИОННЫХ СИСТЕМ", abbreviation: "ИИС", departmentId: 1, isActive: true },
    { id: 4, name: "ИНФОРМАЦИОННЫЕ СИСТЕМЫ И СЕТИ", abbreviation: "ИСС", departmentId: 1, isActive: true },
    { id: 5, name: "КОМПЬЮТЕРНЫЕ КОМПЛЕКСЫ И СЕТИ", abbreviation: "ККС", departmentId: 1, isActive: true },
    { id: 6, name: "ФИЗИЧЕСКАЯ КУЛЬТУРА И СПОРТ (ТЕОРЕТИЧЕСКАЯ ЧАСТЬ)", abbreviation: "ФКиС (ТЕОР.)", departmentId: 2, isActive: true },
  ],
  classrooms: [
    { id: 1, buildingId: 1, roomNumber: "160", capacity: 150, departmentId: null, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3, usageMetric: 0, isActive: true },
    { id: 2, buildingId: 1, roomNumber: "210", capacity: 150, departmentId: null, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3, usageMetric: 0, isActive: true },
    { id: 3, buildingId: 1, roomNumber: "220", capacity: 150, departmentId: null, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3, usageMetric: 0, isActive: true },
    { id: 4, buildingId: 1, roomNumber: "322", capacity: 32, departmentId: 1, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1, usageMetric: 0, isActive: true },
    { id: 5, buildingId: 1, roomNumber: "325", capacity: 32, departmentId: 1, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1, usageMetric: 0, isActive: true },
    { id: 6, buildingId: 1, roomNumber: "329", capacity: 60, departmentId: 1, priorityLecture: 3, priorityWorkshop: 1, priorityGuidedStudy: 1, priorityLab: 2, usageMetric: 0, isActive: true },
    { id: 7, buildingId: 1, roomNumber: "330", capacity: 60, departmentId: 1, priorityLecture: 3, priorityWorkshop: 2, priorityGuidedStudy: 2, priorityLab: 1, usageMetric: 0, isActive: true },
    { id: 8, buildingId: 1, roomNumber: "350", capacity: 150, departmentId: null, priorityLecture: 1, priorityWorkshop: 3, priorityGuidedStudy: 3, priorityLab: 3, usageMetric: 0, isActive: true },
  ],
  curriculum: [
    { id: 1, course: 3, semester: 2, disciplineId: 1, hoursLecture: 32, hoursGuidedStudy: 12, hoursWorkshop: 0, hoursLab: 32, additionalTaskId: 1, controlTypeId: 3, isActive: true },
    { id: 3, course: 3, semester: 2, disciplineId: 3, hoursLecture: 32, hoursGuidedStudy: 12, hoursWorkshop: 0, hoursLab: 32, additionalTaskId: 6, controlTypeId: 3, isActive: true },
    { id: 2, course: 3, semester: 2, disciplineId: 2, hoursLecture: 32, hoursGuidedStudy: 12, hoursWorkshop: 0, hoursLab: 48, additionalTaskId: 6, controlTypeId: 3, isActive: true },
    { id: 4, course: 3, semester: 2, disciplineId: 4, hoursLecture: 32, hoursGuidedStudy: 28, hoursWorkshop: 0, hoursLab: 48, additionalTaskId: 2, controlTypeId: 3, isActive: true },
    { id: 5, course: 3, semester: 2, disciplineId: 5, hoursLecture: 32, hoursGuidedStudy: 12, hoursWorkshop: 0, hoursLab: 32, additionalTaskId: 6, controlTypeId: 3, isActive: true },
    { id: 6, course: 3, semester: 2, disciplineId: 6, hoursLecture: 16, hoursGuidedStudy: 0, hoursWorkshop: 0, hoursLab: 0, additionalTaskId: 6, controlTypeId: 1, isActive: true },
  ],
  curriculum_profiles: [
    { id: 1, curriculumId: 1, profileId: 1, isActive: true },
    { id: 2, curriculumId: 3, profileId: 1, isActive: true },
    { id: 3, curriculumId: 2, profileId: 1, isActive: true },
    { id: 4, curriculumId: 4, profileId: 1, isActive: true },
    { id: 5, curriculumId: 5, profileId: 1, isActive: true },
    { id: 6, curriculumId: 6, profileId: 1, isActive: true },
    { id: 7, curriculumId: 1, profileId: 2, isActive: true },
    { id: 8, curriculumId: 3, profileId: 2, isActive: true },
    { id: 9, curriculumId: 2, profileId: 2, isActive: true },
    { id: 10, curriculumId: 4, profileId: 2, isActive: true },
    { id: 11, curriculumId: 5, profileId: 2, isActive: true },
    { id: 12, curriculumId: 6, profileId: 2, isActive: true },
    { id: 13, curriculumId: 1, profileId: 3, isActive: true },
    { id: 14, curriculumId: 3, profileId: 3, isActive: true },
    { id: 15, curriculumId: 2, profileId: 3, isActive: true },
    { id: 16, curriculumId: 4, profileId: 3, isActive: true },
    { id: 17, curriculumId: 5, profileId: 3, isActive: true },
    { id: 18, curriculumId: 6, profileId: 3, isActive: true },
  ],
  employees_departments: [
    { id: 1, employeeId: 1, departmentId: 1, employmentTypeId: 1, positionId: 2, isActive: true },
    { id: 2, employeeId: 6, departmentId: 2, employmentTypeId: 1, positionId: 2, isActive: true },
    { id: 3, employeeId: 2, departmentId: 1, employmentTypeId: 1, positionId: 2, isActive: true },
    { id: 4, employeeId: 3, departmentId: 1, employmentTypeId: 1, positionId: 2, isActive: true },
    { id: 5, employeeId: 5, departmentId: 1, employmentTypeId: 1, positionId: 2, isActive: true },
    { id: 6, employeeId: 4, departmentId: 1, employmentTypeId: 1, positionId: 2, isActive: true },
  ],
  discipline_teachers: [
    { id: 1, lessonTypeId: 1, disciplineId: 1, teacherDepartmentId: 1, isActive: true },
    { id: 2, lessonTypeId: 3, disciplineId: 1, teacherDepartmentId: 1, isActive: true },
    { id: 3, lessonTypeId: 4, disciplineId: 1, teacherDepartmentId: 1, isActive: true },
    { id: 4, lessonTypeId: 1, disciplineId: 2, teacherDepartmentId: 3, isActive: true },
    { id: 5, lessonTypeId: 3, disciplineId: 2, teacherDepartmentId: 3, isActive: true },
    { id: 6, lessonTypeId: 4, disciplineId: 2, teacherDepartmentId: 3, isActive: true },
    { id: 7, lessonTypeId: 1, disciplineId: 3, teacherDepartmentId: 4, isActive: true },
    { id: 8, lessonTypeId: 3, disciplineId: 3, teacherDepartmentId: 4, isActive: true },
    { id: 9, lessonTypeId: 4, disciplineId: 3, teacherDepartmentId: 4, isActive: true },
    { id: 10, lessonTypeId: 1, disciplineId: 4, teacherDepartmentId: 6, isActive: true },
    { id: 11, lessonTypeId: 3, disciplineId: 4, teacherDepartmentId: 6, isActive: true },
    { id: 12, lessonTypeId: 4, disciplineId: 4, teacherDepartmentId: 6, isActive: true },
    { id: 13, lessonTypeId: 1, disciplineId: 5, teacherDepartmentId: 5, isActive: true },
    { id: 14, lessonTypeId: 3, disciplineId: 5, teacherDepartmentId: 5, isActive: true },
    { id: 15, lessonTypeId: 4, disciplineId: 5, teacherDepartmentId: 5, isActive: true },
    { id: 16, lessonTypeId: 1, disciplineId: 6, teacherDepartmentId: 2, isActive: true },
  ],
};
// ----------------------------------------------------------------

async function main() {
  console.log("Очистка справочных данных...");

  await db.delete(scheduleDisplay);
  await db.delete(schedule);
  await db.delete(lessonClassrooms);
  await db.delete(lessons);
  await db.delete(curriculumProfiles);
  await db.delete(curriculum);
  await db.delete(disciplineTeachers);
  await db.delete(employeesDepartments);
  await db.delete(classrooms);
  await db.delete(hourTypeMapping);
  await db.delete(controlTypes);
  await db.delete(academicLoadTypes);
  await db.delete(lessonTypes);
  await db.delete(unitRoots);
  await db.delete(units);
  await db.delete(unitTypes);
  await db.delete(daysOfWeek);
  await db.delete(pairs);
  await db.delete(weeks);
  await db.delete(students);
  await db.delete(studyGroups);
  await db.delete(profiles);
  await db.delete(education);
  await db.delete(educationForms);
  await db.delete(educationLevels);
  await db.delete(specialties);
  await db.delete(disciplines);
  await db.delete(departments);
  await db.delete(institutes);
  await db.delete(buildings);
  await db.delete(employees);
  await db.delete(positions);
  await db.delete(employmentTypes);
  await db.delete(settings);

  // Сброс всех последовательностей
  await db.execute(sql`
    DO $$
    DECLARE
      seq RECORD;
    BEGIN
      FOR seq IN
        SELECT sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = 'public'
      LOOP
        EXECUTE 'ALTER SEQUENCE ' || seq.sequence_name || ' RESTART WITH 1';
      END LOOP;
    END $$;
  `);

  console.log("Заполнение таблиц...");

  const tablesInOrder: { table: PgTable; data: Record<string, unknown>[] }[] = [
    { table: educationLevels, data: SEED_DATA.education_levels },
    { table: educationForms, data: SEED_DATA.education_forms },
    { table: education, data: SEED_DATA.education },
    { table: employees, data: SEED_DATA.employees },
    { table: positions, data: SEED_DATA.positions },
    { table: employmentTypes, data: SEED_DATA.employment_types },
    { table: buildings, data: SEED_DATA.buildings },
    { table: unitTypes, data: SEED_DATA.unit_types },
    { table: lessonTypes, data: SEED_DATA.lesson_types },
    { table: academicLoadTypes, data: SEED_DATA.academic_load_types },
    { table: controlTypes, data: SEED_DATA.control_types },
    { table: institutes, data: SEED_DATA.institutes },
    { table: departments, data: SEED_DATA.departments },
    { table: specialties, data: SEED_DATA.specialties },
    { table: profiles, data: SEED_DATA.profiles },
    { table: disciplines, data: SEED_DATA.disciplines },
    { table: classrooms, data: SEED_DATA.classrooms },
    { table: hourTypeMapping, data: SEED_DATA.hour_type_mapping },
    { table: employeesDepartments, data: SEED_DATA.employees_departments },
    { table: disciplineTeachers, data: SEED_DATA.discipline_teachers },
    { table: curriculum, data: SEED_DATA.curriculum },
    { table: curriculumProfiles, data: SEED_DATA.curriculum_profiles },
    { table: daysOfWeek, data: SEED_DATA.days_of_week },
    { table: pairs, data: SEED_DATA.pairs },
    { table: weeks, data: SEED_DATA.weeks },
  ];

  for (const { table, data } of tablesInOrder) {
    if (data && data.length > 0) {
      console.log(`Вставка в ${getTableName(table)}`);
      await db.insert(table).values(data);
    }
  }

  const profileMap = new Map(
    (await db.select().from(profiles)).map(p => [p.letterCode, p.id])
  );

  const studentsList: { surname: string; name: string; admissionYear: number; profileLetter: string }[] = [
    ...[ "Винаев","Гордеев","Григорьев","Дивина","Живина","Захаров","Кривощеков","Леванов","Нарыжный","Оботуров",
        "Пастушенко","Полоротов","Сергиенко","Сидорова","Субоч","Титова","Худяков","Шкудун","Шруб","Аферов"
      ].map(surname => ({ surname, name: "", admissionYear: 2023, profileLetter: "з" })),
    ...[ "Атаманчук","Верн","Верховский","Гаврлова","Дубровский","Еремина","Журавлев","Зорина","Космачева","Краснюков",
        "Кузичев","Лихтнер","Медведев","Мингалев","Сидоренко","Синцова","Снегирев","Терехов","Труфанов","Черноморов","Ципичев"
      ].map(surname => ({ surname, name: "", admissionYear: 2023, profileLetter: "к" })),
    ...[ "Абитов","Абуталипов","Болдырева","Васильев","Вижевитов","Данилова","Жуманов","Ишматова","Карпов",
        "Макаров","Петриченко","Самойленко","Толмашева","Хохлов","Черевиченко","Шамардина","Максименко","Шапран","Яковлев"
      ].map(surname => ({ surname, name: "", admissionYear: 2023, profileLetter: "м" })),
  ];

  const namesOriginal = [
    "Максим","Антон","Дмитрий","Александра","Елизавета","Александр","Егор","Дмитрий","Сергей","Денис",
    "Ольга","Юрий","Ярослав","Софья","Иван","Алиса","Максим","Ярослав","Мария","Екатерина",
    "Олеся","Екатерина","Игорь","Полина","Никита","Дарья","Даниил","Ксения","Анна","Андрей",
    "Владислав","Кристина","Дмитрий","Андрей","Максим","Елизавета","Сергей","Александр","Глеб","Илья","Александр",
    "Дамир","Тимур","Екатерина","Владимир","Андрей","Ангелина","Валерий","Екатерина","Никита","Никита",
    "Никита","София","Екатерина","Денис","Виктория","Елизавета","Евгений","Дмитрий","Николай",
    "Дамир","Тимур","Екатерина","Владимир","Андрей","Ангелина","Валерий","Екатерина","Никита","Никита"
  ];
  for (let i = 0; i < studentsList.length; i++) {
    studentsList[i].name = namesOriginal[i] || "";
  }

  for (const stud of studentsList) {
    const profileId = profileMap.get(stud.profileLetter);
    if (!profileId) {
      console.warn(`Профиль с буквенным кодом '${stud.profileLetter}' не найден, пропущен студент ${stud.surname}`);
      continue;
    }
    await db.insert(students).values({
      surname: stud.surname,
      name: stud.name,
      admissionYear: stud.admissionYear,
      profileId,
      isActive: true,
    });
  }
  console.log('Студентов в базе после seed:', studentsList.length);

  const existingSettings = await db.select().from(settings).where(eq(settings.key, 'total_weeks'));
  if (existingSettings.length === 0) {
    await db.insert(settings).values({ key: 'total_weeks', value: '16' });
  }
  const semesterExists = await db.select().from(settings).where(eq(settings.key, 'current_semester'));
  if (semesterExists.length === 0) {
    await db.insert(settings).values({ key: 'current_semester', value: '2' });
  }
  const optWeights: Record<string, string> = {
    opt_weight_teacher_window: "1",
    opt_weight_group_window: "2",
    opt_weight_daily_balance: "1",
    opt_weight_type_diversity: "1",
    opt_weight_single_lesson_day: "1",
    opt_weight_unit_misuse: "1",
  };
  for (const [key, value] of Object.entries(optWeights)) {
    const existing = await db.select().from(settings).where(eq(settings.key, key));
    if (existing.length === 0) {
      await db.insert(settings).values({ key, value });
    }
  }

  console.log("Обновление последовательностей...");
  for (const { table } of tablesInOrder) {
    const tableName = getTableName(table);
    if (tableName) {
      await db.execute(sql`SELECT setval(pg_get_serial_sequence(${tableName}, 'id'), coalesce(max(id), 1)) FROM ${sql.identifier(tableName)}`);
    }
  }

  console.log("Готово! Справочники и студенты загружены.");
}

main().catch(console.error).finally(() => process.exit());