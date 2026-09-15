/**
 * Централизованный реестр метаданных всех таблиц, доступных в CRUD-интерфейсе
 * и участвующих в генерации расписания.
 *
 * ## Зачем нужен
 * - **Универсальный CRUD**: компонент `DataTable` и форма `RecordForm` полностью
 *   строятся по метаданным. Достаточно добавить запись в `tablesMeta` — и таблица
 *   появляется в админке без написания новых компонентов.
 * - **Проверка зависимостей при удалении**: `safeDelete` и `batchDeleteRouter`
 *   используют `childTables`, чтобы до выполнения `DELETE` узнать, в каких
 *   дочерних таблицах есть ссылки на удаляемую запись, и выдать пользователю
 *   понятное сообщение с русскими названиями этих таблиц.
 * - **Единый источник названий**: русские имена, ключи роутеров и имена таблиц БД
 *   хранятся в одном месте. Это исключает рассинхронизацию между фронтендом и бэкендом.
 *
 * ## Структура интерфейсов
 * ### FieldMeta – описание одного поля таблицы
 * | Поле                        | Назначение                                                                                                                                     |
 * |-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
 * | `dbName`                    | Имя столбца в БД (snake_case). Используется в SQL-запросах и как ключ в данных строки.                                                         |
 * | `displayName`               | Человекочитаемое имя для заголовков таблиц и подписей полей в формах.                                                                          |
 * | `isFK`                      | Является ли поле внешним ключом. Если `true`, в таблице отображается через `ForeignKeyCell`, а в форме – выпадающий список.                    |
 * | `required`                  | Обязательность заполнения в форме создания/редактирования.                                                                                     |
 * | `inputType`                 | Тип поля в форме: `"text"`, `"number"`, `"select"`, `"toggle"` (для булевых полей), `"radioGroup"` (для приоритетов). По умолчанию – `"text"`. |
 * | `showInCreate`              | Показывать ли поле в форме создания новой записи. `false` скрывает поле (например, для автоинкрементного `id` или вычисляемых полей).          |
 * | `references`                | Объект с информацией о связанной таблице (только для полей с `isFK: true`):                                                                    |
 * | | `references.table`        | ключ из `tablesMeta` для связанной таблицы.                                                                                                    |
 * | | `references.displayField` | имя вычисляемого поля в данных для отображения (например, `"display"` или `"name"`).                                                           |
 * | | `references.dbTableName`  | реальное имя таблицы в БД (если отличается от ключа).                                                                                          |
 *
 * ### TableMeta – описание таблицы целиком
 * | Поле                 | Назначение                                                                                                                     |
 * |----------------------|--------------------------------------------------------------------------------------------------------------------------------|
 * | `nameRu`             | Русское название таблицы (отображается в админке).                                                                             |
 * | `fields`             | Массив `FieldMeta` – описание каждого поля.                                                                                    |
 * | `routerKey`          | Ключ для доступа к tRPC-роутеру (например, `"institutes"` → `trpc.institutes`).                                                |
 * | `dbTableName`        | Реальное имя таблицы в БД (может отличаться от ключа).                                                                         |
 * | `category`           | Категория для группировки в интерфейсе: `"reference"` (справочники), `"people"` (люди), `"generated"` (генерируемые сущности). |
 * | `hidden`             | Если `true`, таблица не показывается в общем списке CRUD (но метаданные могут использоваться внутренними механизмами).         |
 * | `childTables`        | Массив дочерних таблиц для проверки зависимостей при удалении. Каждый элемент содержит:                                        |
 * | | `dbTableName`      | имя дочерней таблицы в БД.                                                                                                     |
 * | | `foreignKeyColumn` | имя столбца в дочерней таблице, ссылающегося на `id` текущей.                                                                  |
 *
 * ## Использование
 * - **CRUD-интерфейс**: `DataTable.tsx`, `RecordForm.tsx`, `ForeignKeyCell.tsx`
 *   используют метаданные для рендеринга.
 * - **Безопасное удаление**: `safeDelete.ts` и `batchDelete.ts` проверяют
 *   `childTables` и при конфликте выводят русские названия из `nameRu`.
 * - **Генераторы и оптимизатор** не зависят от этого файла; они работают
 *   напрямую с Drizzle-схемой.
 * - **Экспортируемый `tableNames`** – отфильтрованный список для выпадающих
 *   меню выбора таблиц.
 *
 * ## Добавление новой таблицы
 * 1. Создать Drizzle-схему в `db/schema.ts`.
 * 2. Создать tRPC-роутер в `server/trpc/routers/<имя>.ts`.
 * 3. Добавить запись в `tablesMeta` с корректным `routerKey`, `dbTableName`,
 *    `fields` и (при необходимости) `childTables`.
 * 4. После этого таблица автоматически появится в CRUD-интерфейсе.
 */
export interface FieldMeta {
  dbName: string;
  displayName: string;
  isFK: boolean;
  required?: boolean;
  inputType?: "text" | "number" | "select" | "toggle" | "radioGroup";
  showInCreate?: boolean;
  references?: {
    table: string;
    displayField: string;
    dbTableName?: string;
  };
}

export interface TableMeta {
  nameRu: string;
  fields: FieldMeta[];
  routerKey: string;
  dbTableName: string;
  category: "reference" | "people" | "generated";
  hidden?: boolean;
  childTables?: {
    dbTableName: string;
    foreignKeyColumn: string;
  }[];
}

export const TABLE_CATEGORIES: Record<string, string> = {
  reference: "Справочники",
  people: "Люди",
  generated: "Генерации перед расписанием",
};

export const tablesMeta: Record<string, TableMeta> = {
  institutes: {
    nameRu: "Институты",
    routerKey: "institutes",
    dbTableName: "institutes",
    category: "reference",
    childTables: [
      { dbTableName: "departments", foreignKeyColumn: "institute_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "universityCode", displayName: "Код университета", isFK: false, required: true },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "directorId", displayName: "Директор", isFK: true, references: { table: "employees", displayField: "display" } },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  buildings: {
    nameRu: "Корпуса",
    routerKey: "buildings",
    dbTableName: "buildings",
    category: "reference",
    childTables: [
      { dbTableName: "classrooms", foreignKeyColumn: "building_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "number", displayName: "Номер", isFK: false, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  departments: {
    nameRu: "Кафедры",
    routerKey: "departments",
    dbTableName: "departments",
    category: "reference",
    childTables: [
      { dbTableName: "specialties", foreignKeyColumn: "department_id" },
      { dbTableName: "disciplines", foreignKeyColumn: "department_id" },
      { dbTableName: "employees_departments", foreignKeyColumn: "department_id" },
      { dbTableName: "classrooms", foreignKeyColumn: "department_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false, required: true },
      { dbName: "instituteId", displayName: "Институт", isFK: true, references: { table: "institutes", displayField: "name" }, required: true },
      { dbName: "departmentCode", displayName: "Код кафедры", isFK: false, required: true },
      { dbName: "headId", displayName: "Зав. кафедрой", isFK: true, references: { table: "employees", displayField: "display" } },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  specialties: {
    nameRu: "Специальности",
    routerKey: "specialties",
    dbTableName: "specialties",
    category: "reference",
    childTables: [
      { dbTableName: "profiles", foreignKeyColumn: "specialty_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "code", displayName: "Код", isFK: false, required: true },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "departmentId", displayName: "Кафедра", isFK: true, references: { table: "departments", displayField: "display" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  profiles: {
    nameRu: "Профили",
    routerKey: "profiles",
    dbTableName: "profiles",
    category: "reference",
      childTables: [
      { dbTableName: "study_groups", foreignKeyColumn: "profile_id" },
      { dbTableName: "students", foreignKeyColumn: "profile_id" },
      { dbTableName: "curriculum_profiles", foreignKeyColumn: "profile_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false, required: true },
      { dbName: "specialtyId", displayName: "Специальность", isFK: true, references: { table: "specialties", displayField: "display" }, required: true },
      { dbName: "letterCode", displayName: "Буквенный код", isFK: false, required: true },
      { dbName: "educationId", displayName: "Образование", isFK: true, references: { table: "education", displayField: "display" } },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  disciplines: {
    nameRu: "Дисциплины",
    routerKey: "disciplines",
    dbTableName: "disciplines",
    category: "reference",
      childTables: [
      { dbTableName: "curriculum", foreignKeyColumn: "discipline_id" },
      { dbTableName: "lessons", foreignKeyColumn: "discipline_id" },
      { dbTableName: "discipline_teachers", foreignKeyColumn: "discipline_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false, required: true },
      { dbName: "departmentId", displayName: "Кафедра", isFK: true, references: { table: "departments", displayField: "display" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  unitTypes: {
    nameRu: "Типы юнитов",
    routerKey: "unitTypes",
    dbTableName: "unit_types",
    category: "reference",
    childTables: [
      { dbTableName: "units", foreignKeyColumn: "unit_type_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "maxSize", displayName: "Макс. размер", isFK: false, required: true },
      { dbName: "priorityLecture", displayName: "Приоритет лекций", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityWorkshop", displayName: "Приоритет практик", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityGuidedStudy", displayName: "Приоритет КСР", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityLab", displayName: "Приоритет лаб.", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  lessonTypes: {
    nameRu: "Типы занятий",
    routerKey: "lessonTypes",
    dbTableName: "lesson_types",
    category: "reference",
    childTables: [
      { dbTableName: "lessons", foreignKeyColumn: "lesson_type_id" },
      { dbTableName: "hour_type_mapping", foreignKeyColumn: "lesson_type_id" },
      { dbTableName: "discipline_teachers", foreignKeyColumn: "lesson_type_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Системное имя", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  classrooms: {
    nameRu: "Аудитории",
    routerKey: "classrooms",
    dbTableName: "classrooms",
    category: "reference",
    childTables: [
      { dbTableName: "lesson_classrooms", foreignKeyColumn: "classroom_id" },
      { dbTableName: "schedule", foreignKeyColumn: "classroom_id" },
      { dbTableName: "schedule_display", foreignKeyColumn: "classroom_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "buildingId", displayName: "Корпус", isFK: true, references: { table: "buildings", displayField: "number" }, required: true },
      { dbName: "roomNumber", displayName: "Номер аудитории", isFK: false, required: true },
      { dbName: "capacity", displayName: "Вместимость", isFK: false, required: true },
      { dbName: "departmentId", displayName: "Кафедра", isFK: true, references: { table: "departments", displayField: "display" } },
      { dbName: "priorityLecture", displayName: "Приоритет лекций", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityWorkshop", displayName: "Приоритет практик", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityGuidedStudy", displayName: "Приоритет КСР", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "priorityLab", displayName: "Приоритет лаб.", isFK: false, required: true, inputType: "radioGroup" },
      { dbName: "usageMetric", displayName: "Метрика использования", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
    positions: {
    nameRu: "Должности",
    routerKey: "positions",
    dbTableName: "positions",
    category: "reference",
    childTables: [
      { dbTableName: "employees_departments", foreignKeyColumn: "position_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Сокращение", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },
  employmentTypes: {
    nameRu: "Типы занятости",
    routerKey: "employmentTypes",
    dbTableName: "employment_types",
    category: "reference",
    childTables: [
      { dbTableName: "employees_departments", foreignKeyColumn: "employment_type_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Сокращение", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },
  employees: {
      nameRu: "Сотрудники",
      routerKey: "employees",
      dbTableName: "employees",
      category: "people",
      childTables: [
        { dbTableName: "institutes", foreignKeyColumn: "director_id" },
        { dbTableName: "departments", foreignKeyColumn: "head_id" },
        { dbTableName: "study_groups", foreignKeyColumn: "curator_id" },
        { dbTableName: "employees_departments", foreignKeyColumn: "employee_id" },
      ],
      fields: [
        { dbName: "id", displayName: "ID", isFK: false },
        { dbName: "surname", displayName: "Фамилия", isFK: false, required: true },
        { dbName: "name", displayName: "Имя", isFK: false, required: true },
        { dbName: "patronymic", displayName: "Отчество", isFK: false },
        { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
      ],
  },
  students: {
      nameRu: "Студенты",
      routerKey: "students",
      dbTableName: "students",
      category: "people",
      childTables: [],
      fields: [
        { dbName: "id", displayName: "ID", isFK: false },
        { dbName: "surname", displayName: "Фамилия", isFK: false, required: true },
        { dbName: "name", displayName: "Имя", isFK: false, required: true },
        { dbName: "patronymic", displayName: "Отчество", isFK: false },
        { dbName: "admissionYear", displayName: "Год поступления", isFK: false, required: true },
        { dbName: "profileId", displayName: "Профиль", isFK: true, references: { table: "profiles", displayField: "profileDisplay" }, required: true },
        { dbName: "studyGroupId", displayName: "Учебная группа", isFK: true, references: { table: "studyGroups", displayField: "display" }, required: false, inputType: 'select' },
        { dbName: "course", displayName: "Курс", isFK: false },
        { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
      ],
  },
  studyGroups: {
    nameRu: "Учебные группы",
    routerKey: "studyGroups",
    dbTableName: "study_groups",
    category: "generated",
    childTables: [
      { dbTableName: "students", foreignKeyColumn: "study_group_id" },
      { dbTableName: "unit_roots", foreignKeyColumn: "study_group_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "code", displayName: "Код группы", isFK: false, required: true },
      { dbName: "profileId", displayName: "Профиль", isFK: true, references: { table: "profiles", displayField: "profileDisplay" }, required: true },
      { dbName: "course", displayName: "Курс", isFK: false, required: true },
      { dbName: "studentCount", displayName: "Кол-во студентов", isFK: false, required: true },
      { dbName: "curatorId", displayName: "Куратор", isFK: true, references: { table: "employees", displayField: "display" } }
    ],
  },
  units: {
    nameRu: "Юниты",
    routerKey: "units",
    dbTableName: "units",
    category: "generated",
    childTables: [
      { dbTableName: "lessons", foreignKeyColumn: "unit_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "code", displayName: "Код юнита", isFK: false, required: true },
      { dbName: "unitTypeId", displayName: "Тип юнита", isFK: true, references: { table: "unitTypes", displayField: "name" }, required: true },
    ],
  },
  lessons: {
    nameRu: "Занятия",
    routerKey: "lessons",
    dbTableName: "lessons",
    category: "generated",
    childTables: [
      { dbTableName: "lesson_classrooms", foreignKeyColumn: "lesson_id" },
      { dbTableName: "schedule", foreignKeyColumn: "lesson_id" },
      { dbTableName: "schedule_display", foreignKeyColumn: "lesson_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "curriculumId", displayName: "Учебный план", isFK: true, references: { table: "curriculum", displayField: "display" }, required: true },
      { dbName: "unitId", displayName: "Юнит", isFK: true, references: { table: "units", displayField: "display" }, required: true },
      { dbName: "lessonTypeId", displayName: "Тип занятия", isFK: true, references: { table: "lessonTypes", displayField: "display" }, required: true },
      { dbName: "disciplineId", displayName: "Дисциплина", isFK: true, references: { table: "disciplines", displayField: "name" }, required: true },
      { dbName: "teacherId", displayName: "Преподаватель", isFK: true, references: { table: "employeesDepartments", displayField: "display" }, required: true },
      { dbName: "countPerSemester", displayName: "На семестр", isFK: false, required: true },
    ],
  },
  curriculum: {
    nameRu: "Учебные планы",
    routerKey: "curriculum",
    dbTableName: "curriculum",
    category: "reference",
    childTables: [
      { dbTableName: "lessons", foreignKeyColumn: "curriculum_id" },
      { dbTableName: "curriculum_profiles", foreignKeyColumn: "curriculum_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "course", displayName: "Курс", isFK: false, required: true },
      { dbName: "semester", displayName: "Семестр", isFK: false, required: true },
      { dbName: "disciplineId", displayName: "Дисциплина", isFK: true, references: { table: "disciplines", displayField: "name" }, required: true },
      { dbName: "hoursLecture", displayName: "Часов лекций", isFK: false, required: true },
      { dbName: "hoursGuidedStudy", displayName: "Часов КСР", isFK: false, required: true },
      { dbName: "hoursWorkshop", displayName: "Часов практик", isFK: false, required: true },
      { dbName: "hoursLab", displayName: "Часов лаб.", isFK: false, required: true },
      { dbName: "additionalTaskId", displayName: "Доп. задача", isFK: true, references: { table: "academicLoadTypes", displayField: "name" }, required: true },
      { dbName: "controlTypeId", displayName: "Тип контроля", isFK: true, references: { table: "controlTypes", displayField: "name" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  lessonClassrooms: {
    nameRu: "Аудитории занятий",
    routerKey: "lessonClassrooms",
    dbTableName: "lesson_classrooms",
    category: "generated",
    childTables: [],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "lessonId", displayName: "Занятие", isFK: true, references: { table: "lessons", displayField: "display" }, required: true},
      { dbName: "classroomId", displayName: "Аудитория", isFK: true, references: { table: "classrooms", displayField: "display" }, required: true},
    ],
  },
  unitRoots: {
    nameRu: "Корни юнитов",
    routerKey: "unitRoots",
    dbTableName: "unit_roots",
    category: "generated",
    childTables: [],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "unitCode", displayName: "Код юнита", isFK: false, required: true },
      { dbName: "studyGroupId", displayName: "Учебная группа", isFK: true, references: { table: "studyGroups", displayField: "display" }, required: true },
    ],
  },
  curriculumProfiles: {
    nameRu: "Учебные планы по профилям",
    routerKey: "curriculumProfiles",
    dbTableName: "curriculum_profiles",
    category: "reference",
    childTables: [],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "curriculumId", displayName: "Учебный план", isFK: true, references: { table: "curriculum", displayField: "display" }, required: true },
      { dbName: "profileId", displayName: "Профиль", isFK: true, references: { table: "profiles", displayField: "profileDisplay" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  academicLoadTypes: {
    nameRu: "Типы нагрузки",
    routerKey: "academicLoadTypes",
    dbTableName: "academic_load_types",
    category: "reference",
    childTables: [
      { dbTableName: "curriculum", foreignKeyColumn: "additional_task_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Сокращение", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  controlTypes: {
    nameRu: "Типы контроля",
    routerKey: "controlTypes",
    dbTableName: "control_types",
    category: "reference",
    childTables: [
      { dbTableName: "curriculum", foreignKeyColumn: "control_type_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Сокращение", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  hourTypeMapping: {
    nameRu: "Соответствие часов",
    routerKey: "hourTypeMapping",
    dbTableName: "hour_type_mapping",
    category: "reference",
    childTables: [],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "planHourColumn", displayName: "План часов", isFK: false, required: true },
      { dbName: "priorityColumn", displayName: "Приоритет", isFK: false, required: true },
      { dbName: "lessonTypeId", displayName: "Тип занятия", isFK: true, references: { table: "lessonTypes", displayField: "display" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  employeesDepartments: {
    nameRu: "Сотрудники кафедр",
    routerKey: "employeesDepartments",
    dbTableName: "employees_departments",
    category: "reference",
    childTables: [
      { dbTableName: "lessons", foreignKeyColumn: "teacher_id" },
      { dbTableName: "discipline_teachers", foreignKeyColumn: "teacher_department_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "employeeId", displayName: "Сотрудник", isFK: true, references: { table: "employees", displayField: "display" }, required: true },
      { dbName: "departmentId", displayName: "Кафедра", isFK: true, references: { table: "departments", displayField: "display" }, required: true },
      { dbName: "employmentTypeId", displayName: "Тип занятости", isFK: true, references: { table: "employmentTypes", displayField: "name" } },
      { dbName: "positionId", displayName: "Должность", isFK: true, references: { table: "positions", displayField: "name" } },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },
  disciplineTeachers: {
    nameRu: "Преподаватели дисциплин",
    routerKey: "disciplineTeachers",
    dbTableName: "discipline_teachers",
    category: "reference",
    childTables: [],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "lessonTypeId", displayName: "Тип занятия", isFK: true, references: { table: "lessonTypes", displayField: "display" }, required: true },
      { dbName: "disciplineId", displayName: "Дисциплина", isFK: true, references: { table: "disciplines", displayField: "name" }, required: true },
      { dbName: "teacherDepartmentId", displayName: "Преподаватель", isFK: true, references: { table: "employeesDepartments", displayField: "display" }, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  daysOfWeek: {
    nameRu: "Дни недели",
    routerKey: "daysOfWeek",
    dbTableName: "days_of_week",
    category: "reference",
    childTables: [
      { dbTableName: "schedule", foreignKeyColumn: "day_of_week_id" },
      { dbTableName: "schedule_display", foreignKeyColumn: "day_of_week_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "День", isFK: false, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  pairs: {
    nameRu: "Пары",
    routerKey: "pairs",
    dbTableName: "pairs",
    category: "reference",
    childTables: [
      { dbTableName: "schedule", foreignKeyColumn: "pair_number_id" },
      { dbTableName: "schedule_display", foreignKeyColumn: "pair_number_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "number", displayName: "Номер пары", isFK: false, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
  weeks: {
    nameRu: "Недели",
    routerKey: "weeks",
    dbTableName: "weeks",
    category: "reference",
    childTables: [
      { dbTableName: "schedule", foreignKeyColumn: "week_number" },
      { dbTableName: "schedule_display", foreignKeyColumn: "week_number" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "type", displayName: "Тип", isFK: false, required: true },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" }
    ],
  },
    educationLevels: {
    nameRu: "Уровни образования",
    routerKey: "educationLevels",
    dbTableName: "education_levels",
    category: "reference",
    childTables: [
      { dbTableName: "education", foreignKeyColumn: "level_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },
  educationForms: {
    nameRu: "Формы обучения",
    routerKey: "educationForms",
    dbTableName: "education_forms",
    category: "reference",
    childTables: [
      { dbTableName: "education", foreignKeyColumn: "form_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "name", displayName: "Название", isFK: false, required: true },
      { dbName: "abbreviation", displayName: "Аббревиатура", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },
  education: {
    nameRu: "Образование",
    routerKey: "education",
    dbTableName: "education",
    category: "reference",
    childTables: [
      { dbTableName: "profiles", foreignKeyColumn: "education_id" },
    ],
    fields: [
      { dbName: "id", displayName: "ID", isFK: false },
      { dbName: "levelId", displayName: "Уровень", isFK: true, references: { table: "educationLevels", displayField: "name" }, required: true },
      { dbName: "formId", displayName: "Форма", isFK: true, references: { table: "educationForms", displayField: "name" }, required: true },
      { dbName: "durationMonths", displayName: "Длительность (мес.)", isFK: false },
      { dbName: "isActive", displayName: "Активен", isFK: false, required: true, inputType: "toggle" },
    ],
  },

  schedule: {
    nameRu: "Расписание",
    routerKey: "schedule",
    dbTableName: "schedule",
    category: "generated",
    hidden: true,
    fields: [],
  },
  scheduleDisplay: {
    nameRu: "Отображение расписания",
    routerKey: "scheduleDisplay",
    dbTableName: "schedule_display",
    category: "generated",
    hidden: true,
    fields: [],
  },
  scheduleVersions: {
    nameRu: "Версии расписания",
    routerKey: "scheduleVersions",
    dbTableName: "schedule_versions",
    category: "generated",
    hidden: true,
    fields: [],
  },
};

export const tableNames = Object.entries(tablesMeta)
  .filter(([, meta]) => !meta.hidden)
  .map(([key, value]) => ({
    key,
    label: value.nameRu,
  }));


