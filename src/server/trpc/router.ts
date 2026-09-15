/**
 * Корневой роутер приложения.
 *
 * Объединяет все tRPC-роутеры в единое дерево `appRouter`.
 * Каждый модуль отвечает за свой набор сущностей (справочники, генерацию,
 * расписание, импорт/экспорт и т.д.).
 *
 * ## Структура
 * - `auth`, `adminManagement`, `userManagement` – аутентификация и управление пользователями.
 * - `institutes`, `departments`, `specialties`, … – CRUD-справочники (описаны в `tablesMeta`).
 * - `generations` – генераторы групп, юнитов, занятий, аудиторий, расписания.
 * - `schedule`, `scheduleDisplay`, `scheduleVersions` – работа с расписанием и версиями.
 * - `batchDelete`, `batchUpdateActive`, `crudImportExport`, `globalImportExport` – массовые операции.
 * - `e2eTestHelpers` – доступен только в тестовом окружении для сброса данных.
 *
 * ## Экспортируемый тип
 * `AppRouter` используется на клиенте для типизации tRPC-клиента (`trpc`).
 */
import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { institutesRouter } from "./routers/institutes";
import { buildingsRouter } from "./routers/buildings";
import { departmentsRouter } from "./routers/departments";
import { specialtiesRouter } from "./routers/specialties";
import { profilesRouter } from "./routers/profiles";
import { disciplinesRouter } from "./routers/disciplines";
import { unitTypesRouter } from "./routers/unitTypes";
import { lessonTypesRouter } from "./routers/lessonTypes";
import { classroomsRouter } from "./routers/classRooms";
import { employeesRouter } from "./routers/employees";
import { studentsRouter } from "./routers/students";
import { daysOfWeekRouter } from "./routers/daysOfWeek";
import { pairsRouter } from "./routers/pairs";
import { weeksRouter } from "./routers/weeks";
import { generationsRouter } from "./routers/generations";
import { scheduleRouter } from "./routers/schedule";
import { scheduleDisplayRouter } from "./routers/scheduleDisplay";
import { studyGroupsRouter } from "./routers/studyGroups";  
import { settingsRouter } from './routers/settings';
import { lookupRouter } from "./routers/lookup";
import { unitsRouter } from "./routers/units";
import { lessonsRouter } from "./routers/lessons";
import { curriculumRouter } from "./routers/curriculum";
import { lessonClassroomsRouter } from "./routers/lessonClassrooms";
import { unitRootsRouter } from "./routers/unitRoots";
import { curriculumProfilesRouter } from "./routers/curriculumProfiles";
import { academicLoadTypesRouter } from "./routers/academicLoadTypes";
import { controlTypesRouter } from "./routers/controlTypes";
import { hourTypeMappingRouter } from "./routers/hourTypeMapping";
import { employeesDepartmentsRouter } from "./routers/employeesDepartments";
import { disciplineTeachersRouter } from "./routers/disciplineTeachers";
import { educationLevelsRouter } from "./routers/educationLevels";
import { educationFormsRouter } from "./routers/educationForms";
import { educationRouter } from "./routers/education";
import { employmentTypesRouter } from "./routers/employmentTypes";
import { positionsRouter } from "./routers/positions";
import { adminManagementRouter } from "./routers/adminManagement";
import { userManagementRouter } from "./routers/userManagement";
import { crudImportExportRouter } from "./routers/crudImportExport";
import { globalImportExportRouter } from "./routers/globalImportExport";
import { batchDeleteRouter } from "./routers/batchDelete"
import { scheduleVersionsRouter } from './routers/scheduleVersions';
import { e2eTestHelpersRouter } from "./routers/e2eTestHelpers";
import { batchUpdateActiveRouter } from "./routers/batchUpdateActive";

export const appRouter = router({
  auth: authRouter,
  institutes: institutesRouter,
  buildings: buildingsRouter,
  departments: departmentsRouter,
  specialties: specialtiesRouter,
  profiles: profilesRouter,
  disciplines: disciplinesRouter,
  unitTypes: unitTypesRouter,
  lessonTypes: lessonTypesRouter,
  classrooms: classroomsRouter,
  employees: employeesRouter,
  students: studentsRouter,
  daysOfWeek: daysOfWeekRouter,
  pairs: pairsRouter,
  weeks: weeksRouter,
  generations: generationsRouter,
  schedule: scheduleRouter,
  scheduleDisplay: scheduleDisplayRouter,
  studyGroups: studyGroupsRouter,
  settings: settingsRouter,
  lookup: lookupRouter,
  units: unitsRouter,
  lessons: lessonsRouter,
  curriculum: curriculumRouter,
  lessonClassrooms: lessonClassroomsRouter,
  unitRoots: unitRootsRouter,
  curriculumProfiles: curriculumProfilesRouter,
  academicLoadTypes: academicLoadTypesRouter,
  controlTypes: controlTypesRouter,
  hourTypeMapping: hourTypeMappingRouter,
  employeesDepartments: employeesDepartmentsRouter,
  disciplineTeachers: disciplineTeachersRouter,
  educationLevels: educationLevelsRouter,
  educationForms: educationFormsRouter,
  education: educationRouter,
  positions: positionsRouter,
  employmentTypes: employmentTypesRouter,
  adminManagement: adminManagementRouter,
  userManagement: userManagementRouter,
  crudImportExport: crudImportExportRouter,
  globalImportExport: globalImportExportRouter,
  batchDelete: batchDeleteRouter,
  scheduleVersions: scheduleVersionsRouter,
  e2eTestHelpers: e2eTestHelpersRouter,
  batchUpdateActive: batchUpdateActiveRouter,
  
});

export type AppRouter = typeof appRouter;