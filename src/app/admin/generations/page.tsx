/**
 * ## Страница «Системные генераторы» (администратор)
 *
 * Последовательный пайплайн для создания учебных групп, юнитов, занятий,
 * назначения аудиторий и генерации расписания. Все генераторы запускаются
 * только на **чистом листе** (отсутствует активная версия расписания).
 *
 * ### Возможности
 * - **Защита от случайного запуска:** если на странице расписания открыта
 *   какая-либо версия (`selectedVersionId !== null`), кнопки генераторов
 *   блокируются и отображается предупреждение «Переключитесь на Чистый лист».
 * - **Настройка порога подгруппы** и **номера текущего семестра** прямо в
 *   карточке генерации юнитов.
 * - **Генерация расписания с созданием версии:** при нажатии кнопки
 *   «Сгенерировать расписание» открывается диалог ввода имени версии
 *   (по умолчанию «Версия от …»). После подтверждения расписание
 *   генерируется и сразу сохраняется как именованная версия, которая
 *   становится активной. Используется мутация `generateAndSaveSchedule`.
 * - **Обратная связь:** каждый шаг сопровождается тостом с количеством
 *   созданных/распределённых сущностей.
 *
 * ### Используемые состояния и контексты
 * - `useSelectedVersionId()` – глобальное состояние активной версии.
 * - `isCleanSlate = selectedVersionId === null` – определяет доступность
 *   генераторов и необходимость показа предупреждения.
 * - `scheduleDialog` – управляет диалогом ввода имени версии.
 *
 * ### Примечания
 * - Генераторы не могут быть запущены в произвольном порядке; каждый
 *   последующий шаг зависит от данных, созданных на предыдущем.
 * - Серверная защита реализована вызовом `assertCleanSlate` в начале каждой
 *   мутации генерации (групп, юнитов, занятий, аудиторий, расписания).
 */
"use client";
import { trpc } from "@/trpc/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { InputDialog } from "@/components/ui/InputDialog";
import { useSelectedVersionId } from "@/contexts/VersionContext";

export default function GenerationsPage() {
  const utils = trpc.useUtils();
  const { selectedVersionId } = useSelectedVersionId();
  const isCleanSlate = selectedVersionId === null;

  // Порог подгруппы
  const { data: subgroupType, isLoading: thresholdLoading } =
    trpc.unitTypes.getByName.useQuery({ name: "ПОДГРУППА" });

  const updateThreshold = trpc.unitTypes.update.useMutation({
    onSuccess: () => utils.unitTypes.getByName.invalidate({ name: "ПОДГРУППА" }),
    onError: (e) => { toast.error(e.message); },
  });

  const [threshold, setThreshold] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (subgroupType?.maxSize !== undefined) setThreshold(subgroupType.maxSize);
  }, [subgroupType]);

  const handleSaveThreshold = () => {
    if (!subgroupType || threshold === undefined) return;
    updateThreshold.mutate({
      id: subgroupType.id,
      name: subgroupType.name,
      maxSize: threshold,
      priorityLecture: subgroupType.priorityLecture,
      priorityWorkshop: subgroupType.priorityWorkshop,
      priorityGuidedStudy: subgroupType.priorityGuidedStudy,
      priorityLab: subgroupType.priorityLab,
      isActive: subgroupType.isActive,
    });
  };

  // Настройки
  const { data: totalWeeksSetting, isLoading: weeksLoading } =
    trpc.settings.get.useQuery({ key: "total_weeks" });

  const updateTotalWeeks = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate({ key: "total_weeks" }),
    onError: (e) => { toast.error(e.message); },
  });

  const [totalWeeksInput, setTotalWeeksInput] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (totalWeeksSetting) {
      const num = Number(totalWeeksSetting);
      if (!isNaN(num)) setTotalWeeksInput(num);
    }
  }, [totalWeeksSetting]);

  const handleSaveTotalWeeks = () => {
    if (totalWeeksInput === undefined || isNaN(totalWeeksInput)) return;
    updateTotalWeeks.mutate({ key: "total_weeks", value: String(totalWeeksInput) });
  };

  const { data: semesterSetting } = trpc.settings.get.useQuery({ key: "current_semester" });
  const updateSemester = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate({ key: "current_semester" }),
    onError: (e) => { toast.error(e.message); },
  });
  const [semesterInput, setSemesterInput] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (semesterSetting) {
      const num = Number(semesterSetting);
      if (!isNaN(num)) setSemesterInput(num);
    }
  }, [semesterSetting]);

  const handleSaveSemester = () => {
    if (semesterInput === undefined || isNaN(semesterInput)) return;
    updateSemester.mutate({ key: "current_semester", value: String(semesterInput) });
  };

  // Мутации генераторов (старые, с блокировкой)
  const groups = trpc.generations.generateGroups.useMutation({
    onSuccess: (data) => {
      utils.studyGroups.list.invalidate();
      if (data.createdGroups === 0) {
        toast.warning("Групп не создано. Возможно, все студенты уже распределены или нет активных профилей.");
      } else {
        toast.success(`Создано групп: ${data.createdGroups}, распределено студентов: ${data.assignedStudents}`);
      }
    },
    onError: (e) => { toast.error(e.message); },
  });

  const units = trpc.generations.generateUnits.useMutation({
    onSuccess: (data) => {
      if (data.createdUnits === 0) {
        toast.warning("Юнитов не создано. Проверьте наличие учебных групп.");
      } else {
        toast.success(
          `Создано юнитов: ${data.createdUnits} (групп: ${data.groups}, подгрупп: ${data.subgroups}, потоков: ${data.streams})`
        );
      }
    },
    onError: (e) => { toast.error(e.message); },
  });

  const lessons = trpc.generations.generateLessons.useMutation({
    onSuccess: (data) => {
      const created = Number(data.lessonsCreated);
      if (created === 0) {
        toast.warning("Занятий не создано. Проверьте учебные планы, юниты и типы часов.");
      } else {
        toast.success(
          `Создано занятий: ${created} (преподавателей: ${data.uniqueTeachers}, планов: ${data.uniquePlans})`
        );
      }
    },
    onError: (e) => { toast.error(e.message); },
  });

  const classrooms = trpc.generations.assignClassroomsAuto.useMutation({
    onSuccess: (data) => {
      if (data.assignedClassrooms === 0) {
        toast.warning("Аудитории не назначены. Возможно, занятия не созданы или нет подходящих аудиторий.");
      } else {
        toast.success(`Для ${data.assignedClassrooms} занятий(ия) назначены аудитории`);
      }
    },
    onError: (e) => { toast.error(e.message); },
  });

  // Новая мутация – генерация и сохранение версии
  const generateAndSaveSchedule = trpc.generations.generateAndSaveSchedule.useMutation({
    onSuccess: (data) => {
      utils.scheduleVersions.list.invalidate();
      utils.scheduleDisplay.getForWeekPair.invalidate();
      utils.scheduleDisplay.getByStudyGroups.invalidate();
      toast.success(
        `Версия «${data.versionName}» создана. Занято слотов: ${data.totalSlots}, уникальных занятий: ${data.placedLessons}`
      );
      setScheduleDialog({ show: false, totalWeeks: 0 });
    },
    onError: (e) => { toast.error(e.message); },
  });

  // Диалог ввода имени версии
  const [scheduleDialog, setScheduleDialog] = useState<{
    show: boolean;
    totalWeeks: number;
  }>({ show: false, totalWeeks: 16 });

  const handleStartScheduleGeneration = () => {
    const weeks = totalWeeksInput ?? 16;
    setScheduleDialog({ show: true, totalWeeks: weeks });
  };

  if (thresholdLoading || weeksLoading)
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    );

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto bg-background p-6 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">Системные генераторы</h1>

      {/* Предупреждение, если активна версия */}
      {!isCleanSlate && (
        <div className="mb-4 rounded border border-yellow-400 bg-yellow-50 p-3 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          ⚠️ Переключитесь на <strong>Чистый лист</strong> на странице расписания, чтобы запустить генераторы.
        </div>
      )}

      {/* Карточка: Группы */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">1. Учебные группы</h2>
        <button
          className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
          onClick={() => groups.mutate()}
          disabled={groups.isPending || !isCleanSlate}
        >
          {groups.isPending ? "Генерация..." : "Сгенерировать группы"}
        </button>
      </div>

      {/* Карточка: Юниты + порог подгруппы + семестр */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">2. Юниты</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground">Макс. размер подгруппы:</label>
          <input
            type="number"
            value={threshold ?? ""}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-foreground placeholder:text-muted-foreground"
            placeholder="..."
          />
          <button
            className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
            onClick={handleSaveThreshold}
            disabled={updateThreshold.isPending}
          >
            {updateThreshold.isPending ? "..." : "ОК"}
          </button>
          <button
            className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
            onClick={() => units.mutate()}
            disabled={units.isPending || !isCleanSlate}
          >
            {units.isPending ? "Генерация..." : "Сгенерировать юниты"}
          </button>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Текущий семестр:</label>
            <input
              type="number"
              min={1}
              max={12}
              value={semesterInput ?? ""}
              onChange={(e) => setSemesterInput(Number(e.target.value))}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground placeholder:text-muted-foreground"
              placeholder="1"
            />
            <button
              className="rounded bg-green-600 px-2 py-1 text-sm text-white hover:bg-green-700"
              onClick={handleSaveSemester}
              disabled={updateSemester.isPending}
            >
              {updateSemester.isPending ? "..." : "OK"}
            </button>
          </div>
        </div>
      </div>

      {/* Карточка: Занятия */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">3. Занятия</h2>
        <button
          className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
          onClick={() => lessons.mutate({ currentSemester: semesterInput })}
          disabled={lessons.isPending || !isCleanSlate}
        >
          {lessons.isPending ? "Генерация..." : "Сгенерировать занятия"}
        </button>
      </div>

      {/* Карточка: Аудитории */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">4. Аудиторные назначения</h2>
        <button
          className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
          onClick={() => classrooms.mutate()}
          disabled={classrooms.isPending || !isCleanSlate}
        >
          {classrooms.isPending ? "Назначение..." : "Назначить аудитории"}
        </button>
      </div>

      {/* Карточка: Расписание + настройки */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">5. Расписание</h2>
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Всего недель:</label>
            <input
              type="number"
              value={totalWeeksInput ?? ""}
              onChange={(e) => setTotalWeeksInput(Number(e.target.value))}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground placeholder:text-muted-foreground"
              placeholder="16"
            />
            <button
              className="rounded bg-green-600 px-2 py-1 text-sm text-white hover:bg-green-700"
              onClick={handleSaveTotalWeeks}
              disabled={updateTotalWeeks.isPending}
            >
              {updateTotalWeeks.isPending ? "..." : "OK"}
            </button>
          </div>
        </div>
        <button
          className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
          onClick={handleStartScheduleGeneration}
          disabled={generateAndSaveSchedule.isPending || !isCleanSlate}
        >
          {generateAndSaveSchedule.isPending ? "Генерация..." : "Сгенерировать расписание"}
        </button>
      </div>

      {/* Диалог ввода имени версии */}
      {scheduleDialog.show && (
        <InputDialog
          open={scheduleDialog.show}
          title="Название новой версии"
          defaultValue={`Версия от ${new Date().toLocaleDateString()}`}
          onConfirm={(name) => {
            generateAndSaveSchedule.mutate({
              totalWeeks: scheduleDialog.totalWeeks,
              versionName: name,
            });
          }}
          onCancel={() => setScheduleDialog({ show: false, totalWeeks: 0 })}
        />
      )}
    </div>
  );
}