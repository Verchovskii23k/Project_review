import { eq } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
// Enums
export const roleEnum = pgEnum('role', ['admin', 'teacher', 'student']);

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default('student'),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  hashedPassword: text("hashed_password"),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: text("providerId").notNull(),
  accountId: text("accountId").notNull(),
  refreshToken: text("refreshToken"),
  accessToken: text("accessToken"),
  expiresAt: timestamp("expiresAt"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  providerAccountUnique: unique().on(table.providerId, table.accountId),
}));

export const verificationTokens = pgTable("verificationToken", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});



export const scheduleVersions = pgTable("schedule_versions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});


export const institutes = pgTable("institutes", {
  id: serial("id").primaryKey(),
  universityCode: integer("university_code").notNull().unique(),
  name: text("name").notNull(),
  directorId: integer("director_id").references(() => employees.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const unitTypes = pgTable("unit_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  maxSize: integer("max_size").notNull(),
  priorityLecture: integer("priority_lecture").notNull().default(3),
  priorityWorkshop: integer("priority_workshop").notNull().default(3),
  priorityGuidedStudy: integer("priority_guided_study").notNull().default(3),
  priorityLab: integer("priority_lab").notNull().default(3),
  isActive: boolean("is_active").notNull().default(true),
});

export const lessonTypes = pgTable("lesson_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const hourTypeMapping = pgTable("hour_type_mapping", {
  id: serial("id").primaryKey(),
  planHourColumn: text("plan_hour_column").notNull().unique(),
  priorityColumn: text("priority_column").notNull(),
  lessonTypeId: integer("lesson_type_id").notNull().references(() => lessonTypes.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull().unique(),
  instituteId: integer("institute_id").notNull().references(() => institutes.id),
  departmentCode: integer("department_code").notNull().unique(),
  headId: integer("head_id").references(() => employees.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const specialties = pgTable("specialties", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  specialtyId: integer("specialty_id").notNull().references(() => specialties.id),
  letterCode: text("letter_code").notNull(),
  educationId: integer("education_id").references(() => education.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueProfileCode: unique("unique_profile_code").on(table.letterCode, table.specialtyId),
}));

export const disciplines = pgTable("disciplines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  surname: text("surname").notNull(),
  name: text("name").notNull(),
  patronymic: text("patronymic"),
  userId: text("user_id").unique().references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

export const studyGroups = pgTable("study_groups", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  course: integer("course").notNull(),
  studentCount: integer("student_count").notNull(),
  curatorId: integer("curator_id").references(() => employees.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  surname: text("surname").notNull(),
  name: text("name").notNull(),
  patronymic: text("patronymic"),
  admissionYear: integer("admission_year").notNull(),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  studyGroupId: integer("study_group_id").references(() => studyGroups.id),
  course: integer("course"),
  userId: text("user_id").unique().references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const educationLevels = pgTable("education_levels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});

export const educationForms = pgTable("education_forms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});

export const education = pgTable("education", {
  id: serial("id").primaryKey(),
  levelId: integer("level_id").notNull().references(() => educationLevels.id),
  formId: integer("form_id").notNull().references(() => educationForms.id),
  durationMonths: integer("duration_months"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueCombination: unique().on(table.levelId, table.formId),
}));

export const academicLoadTypes = pgTable("academic_load_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});

export const controlTypes = pgTable("control_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});

export const curriculum = pgTable("curriculum", {
  id: serial("id").primaryKey(),
  course: integer("course").notNull(),
  semester: integer("semester").notNull(),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  hoursLecture: integer("hours_lecture").default(0),
  hoursGuidedStudy: integer("hours_guided_study").default(0),
  hoursWorkshop: integer("hours_workshop").default(0),
  hoursLab: integer("hours_lab").default(0),
  additionalTaskId: integer("additional_task_id").references(() => academicLoadTypes.id),
  controlTypeId: integer("control_type_id").references(() => controlTypes.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const curriculumProfiles = pgTable("curriculum_profiles", {
  id: serial("id").primaryKey(),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  profileId: integer("profile_id").notNull().references(() => profiles.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueCurriculumProfile: unique().on(table.curriculumId, table.profileId),
}));

export const employeesDepartments = pgTable("employees_departments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  employmentTypeId: integer("employment_type_id").references(() => employmentTypes.id),
  positionId: integer("position_id").references(() => positions.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueEmployeeDepartment: unique().on(table.employeeId, table.departmentId),
}));

export const disciplineTeachers = pgTable("discipline_teachers", {
  id: serial("id").primaryKey(),
  lessonTypeId: integer("lesson_type_id").notNull().references(() => lessonTypes.id),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  teacherDepartmentId: integer("teacher_department_id").notNull().references(() => employeesDepartments.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const classrooms = pgTable("classrooms", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildings.id),
  roomNumber: text("room_number").notNull(),
  capacity: integer("capacity").notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  priorityLecture: integer("priority_lecture").default(3),
  priorityWorkshop: integer("priority_workshop").default(3),
  priorityGuidedStudy: integer("priority_guided_study").default(3),
  priorityLab: integer("priority_lab").default(3),
  usageMetric: integer("usage_metric").default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  unitTypeId: integer("unit_type_id").notNull().references(() => unitTypes.id),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueActiveCode: uniqueIndex("idx_units_code_active").on(table.code).where(eq(table.isActive, true)),
}));

export const unitRoots = pgTable("unit_roots", {
  id: serial("id").primaryKey(),
  unitCode: text("unit_code").notNull(),
  studyGroupId: integer("study_group_id").notNull().references(() => studyGroups.id),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueUnitGroup: uniqueIndex("idx_unit_roots_active").on(table.unitCode, table.studyGroupId).where(eq(table.isActive, true)),
}));

export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  unitId: integer("unit_id").notNull().references(() => units.id),
  lessonTypeId: integer("lesson_type_id").notNull().references(() => lessonTypes.id),
  disciplineId: integer("discipline_id").notNull().references(() => disciplines.id),
  teacherId: integer("teacher_id").references(() => employeesDepartments.id),
  countPerSemester: integer("count_per_semester").notNull(),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true)
});

export const lessonClassrooms = pgTable("lesson_classrooms", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id),
  classroomId: integer("classroom_id").notNull().references(() => classrooms.id),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  uniqueLessonClassroom: unique().on(table.lessonId, table.classroomId),
}));

export const daysOfWeek = pgTable("days_of_week", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const pairs = pgTable("pairs", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const weeks = pgTable("weeks", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const schedule = pgTable("schedule", {
  id: serial("id").primaryKey(),
  weekId: integer("week_number").notNull().references(() => weeks.id),
  dayOfWeekId: integer("day_of_week_id").notNull().references(() => daysOfWeek.id),
  pairNumberId: integer("pair_number_id").notNull().references(() => pairs.id),
  lessonId: integer("lesson_id").notNull().references(() => lessons.id),
  classroomId: integer("classroom_id").references(() => classrooms.id),
  mergeFlag: integer("merge_flag"),
  positionFlag: integer("position_flag"),
  classroomFlag: integer("classroom_flag"),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true)
});

export const scheduleDisplay = pgTable("schedule_display", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  weekId: integer("week_number").references(() => weeks.id),
  dayOfWeekId: integer("day_of_week_id").references(() => daysOfWeek.id),
  pairNumberId: integer("pair_number_id").references(() => pairs.id),
  unitCode: text("unit_code").notNull(),
  displayText: text("display_text").notNull(),
  mergeNumber: integer("merge_number").default(0),
  positionFlag: boolean("position_flag").default(false),
  classroomFlag: boolean("classroom_flag").default(false),
  classroomId: integer("classroom_id").references(() => classrooms.id),
  isBuffered: boolean("is_buffered").default(false).notNull(),
  versionId: integer("version_id").references(() => scheduleVersions.id),
  isActive: boolean("is_active").notNull().default(true)
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});

export const employmentTypes = pgTable("employment_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation"),
  isActive: boolean("is_active").notNull().default(true),
});