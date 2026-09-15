/**
 * ## Объединённый роутер генераторов
 *
 * Содержит все мутации пайплайна генерации: группы, юниты, занятия,
 * назначение аудиторий, генерация расписания.
 *
 * Мутации доступны только администратору. Защита от вызова при открытой
 * версии реализована через вызов `assertCleanSlate` внутри каждой мутации.
 */
import { router } from "../../trpc";
import { generateGroupsRouter } from "./generateGroups";
import { generateUnitsRouter } from "./generateUnits";
import { generateLessonsRouter } from "./generateLessons";
import { assignClassroomsRouter } from "./assignClassrooms"
import { generateScheduleRouter } from "./generateSchedule";
import { generateCredentialsRouter } from "./generateCredentials";

export const generationsRouter = router({
  ...generateGroupsRouter._def.procedures,
  ...generateUnitsRouter._def.procedures,
  ...generateLessonsRouter._def.procedures,
  ...assignClassroomsRouter._def.procedures,
  ...generateScheduleRouter._def.procedures,
  ...generateCredentialsRouter._def.procedures,
});