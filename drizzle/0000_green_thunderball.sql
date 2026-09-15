CREATE TYPE "public"."role" AS ENUM('admin', 'teacher', 'student');--> statement-breakpoint
CREATE TABLE "academic_load_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"providerId" text NOT NULL,
	"accountId" text NOT NULL,
	"refreshToken" text,
	"accessToken" text,
	"expiresAt" timestamp,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_providerId_accountId_unique" UNIQUE("providerId","accountId")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "buildings_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"room_number" text NOT NULL,
	"capacity" integer NOT NULL,
	"department_id" integer,
	"priority_lecture" integer DEFAULT 3,
	"priority_workshop" integer DEFAULT 3,
	"priority_guided_study" integer DEFAULT 3,
	"priority_lab" integer DEFAULT 3,
	"usage_metric" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum" (
	"id" serial PRIMARY KEY NOT NULL,
	"course" integer NOT NULL,
	"semester" integer NOT NULL,
	"discipline_id" integer NOT NULL,
	"hours_lecture" integer DEFAULT 0,
	"hours_guided_study" integer DEFAULT 0,
	"hours_workshop" integer DEFAULT 0,
	"hours_lab" integer DEFAULT 0,
	"additional_task_id" integer,
	"control_type_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"curriculum_id" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "curriculum_profiles_curriculum_id_profile_id_unique" UNIQUE("curriculum_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "days_of_week" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"institute_id" integer NOT NULL,
	"department_code" integer NOT NULL,
	"head_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "departments_abbreviation_unique" UNIQUE("abbreviation"),
	CONSTRAINT "departments_department_code_unique" UNIQUE("department_code")
);
--> statement-breakpoint
CREATE TABLE "discipline_teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_type_id" integer NOT NULL,
	"discipline_id" integer NOT NULL,
	"teacher_department_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"department_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education" (
	"id" serial PRIMARY KEY NOT NULL,
	"level_id" integer NOT NULL,
	"form_id" integer NOT NULL,
	"duration_months" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "education_level_id_form_id_unique" UNIQUE("level_id","form_id")
);
--> statement-breakpoint
CREATE TABLE "education_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "education_forms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "education_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "education_levels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"surname" text NOT NULL,
	"name" text NOT NULL,
	"patronymic" text,
	"user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "employees_departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"employment_type_id" integer,
	"position_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employees_departments_employee_id_department_id_unique" UNIQUE("employee_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "employment_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employment_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hour_type_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_hour_column" text NOT NULL,
	"priority_column" text NOT NULL,
	"lesson_type_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "hour_type_mapping_plan_hour_column_unique" UNIQUE("plan_hour_column")
);
--> statement-breakpoint
CREATE TABLE "institutes" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_code" integer NOT NULL,
	"name" text NOT NULL,
	"director_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "institutes_university_code_unique" UNIQUE("university_code")
);
--> statement-breakpoint
CREATE TABLE "lesson_classrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"classroom_id" integer NOT NULL,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lesson_classrooms_lesson_id_classroom_id_unique" UNIQUE("lesson_id","classroom_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lesson_types_name_unique" UNIQUE("name"),
	CONSTRAINT "lesson_types_abbreviation_unique" UNIQUE("abbreviation")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"curriculum_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"lesson_type_id" integer NOT NULL,
	"discipline_id" integer NOT NULL,
	"teacher_id" integer,
	"count_per_semester" integer NOT NULL,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "positions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"specialty_id" integer NOT NULL,
	"letter_code" text NOT NULL,
	"education_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "unique_profile_code" UNIQUE("letter_code","specialty_id")
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_number" integer NOT NULL,
	"day_of_week_id" integer NOT NULL,
	"pair_number_id" integer NOT NULL,
	"lesson_id" integer NOT NULL,
	"classroom_id" integer,
	"merge_flag" integer,
	"position_flag" integer,
	"classroom_flag" integer,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_display" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer,
	"week_number" integer NOT NULL,
	"day_of_week_id" integer NOT NULL,
	"pair_number_id" integer NOT NULL,
	"unit_code" text NOT NULL,
	"display_text" text NOT NULL,
	"merge_number" integer DEFAULT 0,
	"position_flag" boolean DEFAULT false,
	"classroom_flag" boolean DEFAULT false,
	"classroom_id" integer,
	"is_buffered" boolean DEFAULT false NOT NULL,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"department_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "specialties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"surname" text NOT NULL,
	"name" text NOT NULL,
	"patronymic" text,
	"admission_year" integer NOT NULL,
	"profile_id" integer NOT NULL,
	"study_group_id" integer,
	"course" integer,
	"user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"profile_id" integer NOT NULL,
	"course" integer NOT NULL,
	"student_count" integer NOT NULL,
	"curator_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "study_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unit_roots" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_code" text NOT NULL,
	"study_group_id" integer NOT NULL,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_size" integer NOT NULL,
	"priority_lecture" integer DEFAULT 3 NOT NULL,
	"priority_workshop" integer DEFAULT 3 NOT NULL,
	"priority_guided_study" integer DEFAULT 3 NOT NULL,
	"priority_lab" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "unit_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"unit_type_id" integer NOT NULL,
	"version_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false,
	"image" text,
	"role" "role" DEFAULT 'student' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"hashed_password" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "verificationToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum" ADD CONSTRAINT "curriculum_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum" ADD CONSTRAINT "curriculum_additional_task_id_academic_load_types_id_fk" FOREIGN KEY ("additional_task_id") REFERENCES "public"."academic_load_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum" ADD CONSTRAINT "curriculum_control_type_id_control_types_id_fk" FOREIGN KEY ("control_type_id") REFERENCES "public"."control_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_profiles" ADD CONSTRAINT "curriculum_profiles_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_profiles" ADD CONSTRAINT "curriculum_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_employees_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_teacher_department_id_employees_departments_id_fk" FOREIGN KEY ("teacher_department_id") REFERENCES "public"."employees_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education" ADD CONSTRAINT "education_level_id_education_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."education_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education" ADD CONSTRAINT "education_form_id_education_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."education_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees_departments" ADD CONSTRAINT "employees_departments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees_departments" ADD CONSTRAINT "employees_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees_departments" ADD CONSTRAINT "employees_departments_employment_type_id_employment_types_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "public"."employment_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees_departments" ADD CONSTRAINT "employees_departments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_type_mapping" ADD CONSTRAINT "hour_type_mapping_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutes" ADD CONSTRAINT "institutes_director_id_employees_id_fk" FOREIGN KEY ("director_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_classrooms" ADD CONSTRAINT "lesson_classrooms_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_classrooms" ADD CONSTRAINT "lesson_classrooms_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_classrooms" ADD CONSTRAINT "lesson_classrooms_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_employees_departments_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."employees_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_education_id_education_id_fk" FOREIGN KEY ("education_id") REFERENCES "public"."education"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_week_number_weeks_id_fk" FOREIGN KEY ("week_number") REFERENCES "public"."weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_day_of_week_id_days_of_week_id_fk" FOREIGN KEY ("day_of_week_id") REFERENCES "public"."days_of_week"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_pair_number_id_pairs_id_fk" FOREIGN KEY ("pair_number_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_week_number_weeks_id_fk" FOREIGN KEY ("week_number") REFERENCES "public"."weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_day_of_week_id_days_of_week_id_fk" FOREIGN KEY ("day_of_week_id") REFERENCES "public"."days_of_week"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_pair_number_id_pairs_id_fk" FOREIGN KEY ("pair_number_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_display" ADD CONSTRAINT "schedule_display_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_study_group_id_study_groups_id_fk" FOREIGN KEY ("study_group_id") REFERENCES "public"."study_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_curator_id_employees_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_roots" ADD CONSTRAINT "unit_roots_study_group_id_study_groups_id_fk" FOREIGN KEY ("study_group_id") REFERENCES "public"."study_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_roots" ADD CONSTRAINT "unit_roots_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_unit_type_id_unit_types_id_fk" FOREIGN KEY ("unit_type_id") REFERENCES "public"."unit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unit_roots_active" ON "unit_roots" USING btree ("unit_code","study_group_id") WHERE "unit_roots"."is_active" = $1;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_units_code_active" ON "units" USING btree ("code") WHERE "units"."is_active" = $1;