/**
 * Бизнес-ключи для поиска дубликатов при импорте.
 * Используются в globalImportExport и crudImportExport.
 * Для таблиц, не перечисленных здесь, поиск выполняется по всем полям.
 */
export const UNIQUE_KEYS: Record<string, string[]> = {
  education_levels: ["name"],
  education_forms: ["name"],
  days_of_week: ["name"],
  pairs: ["number"],
  weeks: ["type"],
  lesson_types: ["name"],
  unit_types: ["name"],
  buildings: ["number"],
  positions: ["name"],
  employment_types: ["name"],
  academic_load_types: ["name"],
  control_types: ["name"],
  hour_type_mapping: ["plan_hour_column"],
  institutes: ["university_code"],
  departments: ["department_code"],
  specialties: ["code"],
  disciplines: ["name"],
  education: ["level_id", "form_id"],
  profiles: ["letter_code", "specialty_id"],
  classrooms: ["room_number", "building_id"],
  curriculum: ["discipline_id", "course", "semester"],
  curriculum_profiles: ["curriculum_id", "profile_id"],
  employees_departments: ["employee_id", "department_id"],
  discipline_teachers: ["lesson_type_id", "discipline_id", "teacher_department_id"],
  study_groups: ["code"],
  unit_roots: ["unit_code", "study_group_id"],
  schedule_versions: ["name"],
};