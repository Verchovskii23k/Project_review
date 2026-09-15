/**
 * Пересчитывает метрику использования (`usageMetric`) для всех активных аудиторий
 * на основе реального количества активных связей в `lessonClassrooms`.
 *
 * ## Зачем нужна метрика
 * Метрика отражает, сколько занятий в **текущем активном расписании** закреплено
 * за каждой аудиторией. Она используется при автоматическом назначении аудиторий
 * (`assignClassroomsAuto`) и при подборе аудитории для группы слияния в
 * оптимизаторе (`findSuitableClassroomForGroup`). Аудитории с меньшей метрикой
 * считаются менее загруженными и получают приоритет при сортировке кандидатов.
 *
 * ## Когда вызывается
 * Функция автоматически вызывается внутри `assignClassroomsAuto` (после завершения
 * всех назначений), а также в мутациях создания и удаления связей в
 * `lessonClassroomsRouter` для поддержания метрики в актуальном состоянии.
 * Ручной вызов не требуется — метрика синхронизируется с БД при любом изменении
 * аудиторий занятий.
 *
 * ## Алгоритм
 * 1. Подсчитывается количество активных связей для каждой аудитории
 *    (учитываются только активные `lessonClassrooms` и активные `lessons`
 *    без `versionId`).
 * 2. Для всех активных аудиторий метрика **полностью синхронизируется**:
 *    сначала сбрасывается в 0, затем для аудиторий с ненулевым количеством
 *    связей устанавливается актуальное значение. Такой подход гарантирует,
 *    что у аудиторий без связей метрика станет 0, а у используемых —
 *    точное количество занятий.
 *
 * ## Важно
 * - Учитываются только активные записи (`isActive = true`, `versionId IS NULL`)
 *   в таблицах `lessonClassrooms` и `lessons`. Архивные версии не влияют на
 *   метрику.
 * - Функция не очищает метрики у архивных аудиторий — только у активных.
 * - Выполняется вне транзакции; при конкурентных изменениях возможна небольшая
 *   рассинхронизация, которая устраняется следующим вызовом.
 *
 * @returns Promise<void>
 */
import { db } from "@/db";
import { lessonClassrooms, lessons, classrooms } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

export async function recalculateUsageMetrics() {
  // Подсчитываем количество активных связей для каждой аудитории
  const usage = await db
    .select({
      classroomId: lessonClassrooms.classroomId,
      cnt: count(),
    })
    .from(lessonClassrooms)
    .innerJoin(lessons, eq(lessonClassrooms.lessonId, lessons.id))
    .where(
      and(
        eq(lessonClassrooms.isActive, true),
        isNull(lessonClassrooms.versionId),
        eq(lessons.isActive, true),
        isNull(lessons.versionId)
      )
    )
    .groupBy(lessonClassrooms.classroomId);

  // Обнуляем метрики всем активным аудиториям
  await db
    .update(classrooms)
    .set({ usageMetric: 0 })
    .where(eq(classrooms.isActive, true));

  // Проставляем актуальные значения
  for (const { classroomId, cnt } of usage) {
    await db
      .update(classrooms)
      .set({ usageMetric: cnt })
      .where(eq(classrooms.id, classroomId));
  }
}