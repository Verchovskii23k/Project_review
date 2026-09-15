/**
 * ## Страница «Расписание» (администратор)
 *
 * Полнофункциональный интерфейс для просмотра, ручного редактирования
 * (drag‑and‑drop), тонкой настройки (флаги, слияния) и оптимизации
 * расписания с поддержкой версионирования.
 *
 * ### Модель версионирования
 * - `selectedVersionId === null` – **«Чистый лист»**. Расписание отсутствует,
 *   редактирование и оптимизация недоступны. Можно только переключаться
 *   между версиями или запускать генераторы.
 * - `selectedVersionId !== null` – **активная версия**. Её данные
 *   восстанавливаются из архива в виде активной копии. Все изменения
 *   применяются к этой активной копии и **не сохраняются автоматически**.
 *   При переключении на другую версию или чистый лист несохранённые
 *   правки удаляются. Для фиксации изменений используйте «Сохранить как…»,
 *   создающий новую версию с текущим состоянием.
 * - Выпадающий список всегда содержит «Чистый лист» и все сохранённые
 *   версии с пометкой «(текущее)» у активной.
 * - Переключение между версиями мгновенное, без диалогов подтверждения.
 * - Кнопка «Сохранить как…» создаёт копию текущего активного расписания
 *   в виде новой версии с заданным именем.
 * - Кнопка «Удалить версию» полностью удаляет активную версию и все её
 *   данные (архив и активные копии), после чего активируется чистый лист.
 * - Кнопка «Переименовать» позволяет изменить название открытой версии.
 *   Название меняется только в справочнике версий, архивные данные не
 *   затрагиваются.
 *
 * ### Возможности
 * - **Два режима просмотра:** «По юнитам» и «По группам».
 * - **Редактирование в режиме drag‑and‑drop:** занятия можно перетаскивать
 *   в свободные ячейки (подсветка зелёным), менять местами (подсветка
 *   синим), убирать в буфер и возвращать обратно.
 * - **Буфер:** боковая панель для временного хранения занятий. При
 *   переносе в буфер координаты обнуляются. Из буфера можно перетащить
 *   занятие в конкретную свободную ячейку или использовать при оптимизации.
 * - **Флаги занятий:** фиксация позиции (`positionFlag`), закрепление
 *   аудитории (`classroomFlag`), номер слияния (`mergeNumber`).
 *   Редактируются кликом по занятию.
 * - **Оптимизация расписания:** алгоритм имитации отжига. 
 *     Если установлен чекбокс «Использовать буфер», оптимизатор сначала попытается 
 *     разместить буферные занятия (с возможностью вытеснения), а затем улучшит расписание.
 * - **Настройки отжига:** изменение начальной температуры и скорости
 *   охлаждения.
 * - **Экспорт:** печать таблицы и выгрузка в CSV.
 * - **Сброс флагов:** массовый сброс выбранных типов флагов для всех
 *   занятий активного расписания.
 *
 * ### Архитектура компонента
 * - **Состояния:** `viewMode`, `editMode`, `selectedEntry`, `flagForm`,
 *   `activeDragEntry`, `slotStatuses` / `slotSwapIds`, диалоги
 *   (подтверждения, ввода имени, использования буфера, параметров
 *   отжига, сброса флагов).
 * - **Взаимодействие с сервером:** все запросы и мутации идут через
 *   tRPC‑роутер `scheduleDisplay`. Получение данных для сетки, буфера,
 *   проверки слотов, перемещений, обменов, обновления флагов, запуска
 *   оптимизации и сброса флагов.
 * - **Drag‑and‑drop:** на базе `@dnd‑kit/core`. При старте
 *   перетаскивания вычисляются статусы слотов через `checkSlots`. При
 *   завершении выполняется `move`, `swap`, `moveToBuffer` или
 *   `moveFromBuffer` в зависимости от ситуации.
 * - Оптимизация: при нажатии кнопки вызывается мутация optimizeSchedule с флагом includeBuffered, 
 *    равным состоянию чекбокса `Использовать буфер`.
 * - **Версионирование:** состояние `selectedVersionId` берётся из
 *   глобального контекста `VersionContext`.
 *
 * ### Вспомогательные компоненты
 * - `DraggableLesson` – отдельное занятие (источник перетаскивания).
 * - `DroppableArea` – ячейка сетки (цель перетаскивания). Меняет фон в
 *   зависимости от статуса (`free`/`conflict`/`swap`) и недели.
 * - `BufferEntry` – элемент в буфере (источник перетаскивания).
 * - `BufferZone` – боковая панель буфера (цель для сброса занятий).
 *
 * ### Примечания
 * - Все мутации редактирования передают `versionId: null`, так как
 *   работают с активными записями.
 * - При чистом листе кнопки редактирования, оптимизации и экспорта
 *   скрыты или заблокированы.
 */
"use client";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirmContext } from "@/contexts/ConfirmContext";
import { InputDialog } from "@/components/ui/InputDialog";
import { useSelectedVersionId } from "@/contexts/VersionContext";
import React from 'react';  

type Day = { id: number; name: string };
type Pair = { id: number; number: number };

type ScheduleRow = {
  id: number;
  weekId: number | null;
  dayOfWeekId: number | null;
  pairNumberId: number | null;
  unitCode: string;
  displayText: string;
  mergeNumber: number | null;
  positionFlag: boolean | null;
  classroomFlag: boolean | null;
  lessonId: number | null;
  isBuffered: boolean;
};
// type AnyRow = ScheduleRow & { studyGroupCode?: string };
type ScheduleRowWithGroup = ScheduleRow & { studyGroupCode: string };
type WeekInfo = { id: number; type: string };

function isScheduleRow(value: unknown): value is ScheduleRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'unitCode' in value &&
    'displayText' in value &&
    'isBuffered' in value
  );
}

function isSlotStatus(value: unknown): value is "free" | "conflict" | "swap" {
  return value === "free" || value === "conflict" || value === "swap";
}

function extractArray<T>(arr: unknown, guard: (el: unknown) => el is T): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(guard);
}

function isScheduleRowWithGroup(value: unknown): value is ScheduleRowWithGroup {
  return isScheduleRow(value) && 'studyGroupCode' in value && typeof value.studyGroupCode === 'string';
}

const WEEK_COLORS = [
  { bg: "bg-teal-200 dark:bg-teal-800", border: "border-teal-400 dark:border-teal-600" },
  { bg: "bg-indigo-200 dark:bg-indigo-800", border: "border-indigo-400 dark:border-indigo-600" },
  { bg: "bg-purple-200 dark:bg-purple-800", border: "border-purple-400 dark:border-purple-600" },
  { bg: "bg-amber-200 dark:bg-amber-800", border: "border-amber-400 dark:border-amber-600" },
  { bg: "bg-pink-200 dark:bg-pink-800", border: "border-pink-400 dark:border-pink-600" },
  { bg: "bg-cyan-200 dark:bg-cyan-800", border: "border-cyan-400 dark:border-cyan-600" },
];

function DraggableLesson({ entry, isEditMode }: { entry: ScheduleRow; isEditMode: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lesson-${entry.id}`,
    data: { entry },
    disabled: !isEditMode,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-default rounded p-1 text-xs leading-tight ${isDragging ? "opacity-50" : ""} ${
        isEditMode ? "cursor-grab hover:ring-2 hover:ring-blue-300" : ""
      } bg-card text-foreground dark:bg-gray-700`}
      style={style}
    >
      {entry.displayText}
    </div>
  );
}

function DroppableArea({
  weekId,
  weekIndex,
  dayId,
  pairId,
  unitCode,
  entry,
  isEditMode,
  status,
  onCellClick,
}: {
  weekId: number;
  weekIndex: number;
  dayId: number;
  pairId: number;
  unitCode: string;
  entry: ScheduleRow | undefined;
  isEditMode: boolean;
  status: "free" | "conflict" | "swap" | null;
  onCellClick: (e: ScheduleRow) => void;
}) {
  const droppableId = `week-${weekId}-${dayId}-${pairId}-${unitCode}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: { weekId, dayId, pairId, unitCode },
    disabled: !isEditMode,
  });

  let bg = "";
  if (isEditMode) {
    if (status === "free") bg = "bg-green-100 dark:bg-green-900/20";
    else if (status === "conflict") bg = "bg-red-100 dark:bg-red-900/20";
    else if (status === "swap") bg = "bg-blue-100 dark:bg-blue-900/20";
    else {
      const color = WEEK_COLORS[weekIndex % WEEK_COLORS.length];
      bg = `${color.bg} ${color.border}`;
    }
    if (isOver) bg += " ring-2 ring-blue-500";
  } else {
    const color = WEEK_COLORS[weekIndex % WEEK_COLORS.length];
    bg = `${color.bg} ${color.border}`;
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded border p-1 text-xs leading-tight ${bg} ${isEditMode ? "min-h-[1.5rem]" : ""}`}
      onClick={() => entry && isEditMode && onCellClick(entry)}
    >
      {entry ? (
        <div className="flex items-center gap-1 rounded p-1">
          <DraggableLesson entry={entry} isEditMode={isEditMode} />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

function BufferEntry({ entry }: { entry: ScheduleRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `buffer-${entry.id}`,
    data: { entry },
  });
  if (isDragging) return null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="mb-1 flex cursor-grab items-center gap-1 rounded border border-amber-200 bg-amber-50 p-1 text-xs dark:border-amber-800 dark:bg-amber-900/20"
    >
      <span className="truncate text-foreground">{entry.displayText}</span>
    </div>
  );
}

function BufferZone({ entries, isEditMode }: { entries: ScheduleRow[]; isEditMode: boolean }) {
  const droppableId = "buffer-zone";
  const { isOver, setNodeRef } = useDroppable({ id: droppableId, disabled: !isEditMode });

  return (
    <div
      ref={setNodeRef}
      className={`h-full w-64 flex-shrink-0 overflow-y-auto rounded border border-dashed border-border bg-muted p-2 ${
        isOver ? "bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-900/30" : ""
      }`}
    >
      <div className="sticky top-0 mb-2 bg-muted py-1 text-xs font-bold text-foreground">Буфер</div>
      {entries.map((entry) => (
        <BufferEntry key={entry.id} entry={entry} />
      ))}
      {entries.length === 0 && <div className="text-xs text-muted-foreground">Пусто</div>}
    </div>
  );
}

export default function AdminSchedulePage() {
  const [viewMode, setViewMode] = useState<"units" | "groups">("units");
  const [editMode, setEditMode] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleRow | null>(null);
  const [flagForm, setFlagForm] = useState({ mergeNumber: 0, positionFlag: false, classroomFlag: false });
  const [activeDragEntry, setActiveDragEntry] = useState<ScheduleRow | null>(null);
  const [slotStatuses, setSlotStatuses] = useState<Record<string, { status: "free" | "conflict" | "swap"; reason?: string }>>({});
  const [slotSwapIds, setSlotSwapIds] = useState<Record<string, number>>({});
  const [showAnnealingDialog, setShowAnnealingDialog] = useState(false);
  const [tempInput, setTempInput] = useState(1000);
  const [rateInput, setRateInput] = useState(0.95);
  const [resetFlagsDialog, setResetFlagsDialog] = useState(false);
  const [useBuffer, setUseBuffer] = useState(false);
  const [resetFlagsSelection, setResetFlagsSelection] = useState({
    positionFlag: false,
    classroomFlag: false,
    mergeNumber: false,
  });

  // Состояние версионирования
  const { selectedVersionId, setSelectedVersionId } = useSelectedVersionId();
  const isActiveVersion = selectedVersionId !== null;

  // Сброс редактирования при переходе на чистый лист
  useEffect(() => {
    if (!isActiveVersion) {
      setEditMode(false);
    }
  }, [isActiveVersion]);

  const tempQuery = trpc.settings.get.useQuery(
    { key: "opt_initial_temperature" },
    { enabled: showAnnealingDialog }
  );
  const rateQuery = trpc.settings.get.useQuery(
    { key: "opt_cooling_rate" },
    { enabled: showAnnealingDialog }
  );

  const settingsUpdateMut = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success("Настройки отжига сохранены") },
    onError: (e) => { toast.error(e.message) },
  });

  const handleSaveAnnealingSettings = async () => {
    try {
      await settingsUpdateMut.mutateAsync({ key: "opt_initial_temperature", value: String(tempInput) });
      await settingsUpdateMut.mutateAsync({ key: "opt_cooling_rate", value: String(rateInput) });
      setShowAnnealingDialog(false);
    } catch (e) {}
  };

  const handleOptimize = () => {
    optimizeScheduleMut.mutate({ versionId: null, includeBuffered: useBuffer });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && resetFlagsDialog) {
        setResetFlagsDialog(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [resetFlagsDialog]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showAnnealingDialog) {
        setShowAnnealingDialog(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showAnnealingDialog]);

  const handleOpenAnnealing = async () => {
    setShowAnnealingDialog(true);
    const tempRes = await tempQuery.refetch();
    const rateRes = await rateQuery.refetch();
    setTempInput(Number(tempRes.data) || 1000);
    setRateInput(Number(rateRes.data) || 0.95);
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean; message: string; onConfirm: () => void;
  }>({ show: false, message: "", onConfirm: () => {} });

  const [inputDialog, setInputDialog] = useState<{
    show: boolean;
    title: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
  }>({ show: false, title: "", onConfirm: () => {} });

  const utils = trpc.useUtils();
  const versionsQuery = trpc.scheduleVersions.list.useQuery();

  // Мутации
  const switchToVersionMut = trpc.scheduleVersions.switchToVersion.useMutation({
    onSuccess: (_, variables) => {
      // Сбрасываем кэш, чтобы UI сразу обновился
      utils.scheduleDisplay.getForWeekPair.refetch({ weekBaseId: 1, versionId: null });
      utils.scheduleDisplay.getByStudyGroups.refetch({ weekBaseId: 1, versionId: null });
      utils.scheduleDisplay.getBuffer.refetch({ versionId: null });

      utils.scheduleVersions.list.invalidate();

      // Тосты
      if (variables.targetVersionId === null) {
        toast.success("Переключено на Чистый лист. Генераторы разблокированы.");
      } else {
        const versionName = versionsQuery.data?.find(v => v.id === variables.targetVersionId)?.name ?? "";
        toast.success(`Вы переключились на версию «${versionName}»`);
      }
    },
    onError: (e) => { toast.error(e.message); },
  });

  const saveActiveMut = trpc.scheduleVersions.saveActive.useMutation({
    onSuccess: async () => {
      toast.success("Копия версии сохранена");
      utils.scheduleVersions.list.invalidate();
    },
    onError: (e) => {toast.error(e.message)},
  });

  const deleteVersionMut = trpc.scheduleVersions.delete.useMutation({
    onSuccess: async () => {
      toast.success("Версия удалена");
      utils.scheduleVersions.list.invalidate();
      utils.scheduleDisplay.getForWeekPair.invalidate();
      utils.scheduleDisplay.getByStudyGroups.invalidate();
      utils.scheduleDisplay.getBuffer.invalidate();
    },
    onError: (e) => {toast.error(e.message)},
  });
  const { data: allUnits } = trpc.units.list.useQuery(
    undefined,
    { enabled: viewMode === "units" }
  );
  const { data: allUnitTypes } = trpc.unitTypes.list.useQuery(undefined, { enabled: viewMode === "units" });

  const versionParam = null;
  const { data: unitsData, isLoading: unitsLoading } = trpc.scheduleDisplay.getForWeekPair.useQuery(
    { weekBaseId: 1, versionId: versionParam },
    { enabled: viewMode === "units" }
  );
  const { data: groupsData, isLoading: groupsLoading } = trpc.scheduleDisplay.getByStudyGroups.useQuery(
    { weekBaseId: 1, versionId: versionParam },
    { enabled: viewMode === "groups" }
  );
  const { data: bufferData } = trpc.scheduleDisplay.getBuffer.useQuery(
    { versionId: null },
    { enabled: editMode && isActiveVersion }
  );

  const activeWeeksData: WeekInfo[] = (unitsData?.weeks || groupsData?.weeks || []).map(w => ({ id: w.id as number, type: w.type }));
  const activeWeekIds = activeWeeksData.map((w) => w.id);

  const moveMutation = trpc.scheduleDisplay.move.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const swapMutation = trpc.scheduleDisplay.swap.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const updateFlags = trpc.scheduleDisplay.updateFlags.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const moveToBufferMut = trpc.scheduleDisplay.moveToBuffer.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const moveFromBufferMut = trpc.scheduleDisplay.moveFromBuffer.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const checkSlots = trpc.scheduleDisplay.checkSlots.useMutation({
    onError: (e) => { toast.error(e.message); },
  });
  const optimizeScheduleMut = trpc.scheduleDisplay.optimizeSchedule.useMutation({
    onSuccess: (data) => {
      let msg = `Оптимизация завершена за ${data.iterations} итер. Штраф: ${data.initialScore} → ${data.finalScore}.`;
      
      if (data.acceptedMoves === 0) {
        msg += ' Изменений не внесено.';
        if (data.positionBlockedCount > 0) {
          msg += ` ${data.positionBlockedCount} занятий зафиксированы.`;
        }
        toast.info(msg);
        refreshData();
        return;
      }

      msg += ` Перемещено занятий: ${data.singleMoved} из ${data.totalSingleEntries}.`;
      if (data.totalMergeGroups > 0) {
        msg += ` Групп слияния собрано: ${data.mergeGroupsFinalPlaced} из ${data.totalMergeGroups}.`;
      }
      toast.success(msg);
      if (data.bufferedCount > 0) {
        toast.info(`Буфер: размещено ${data.bufferedPlaced} из ${data.bufferedCount}, не удалось: ${data.bufferedFailed}`);
      }

      const warnings: string[] = [];
      if (data.mergeGroupFailedNoClassroom > 0) {
        warnings.push(`Не удалось подобрать аудиторию для групп слияния (${data.mergeGroupFailedNoClassroom} попыток).`);
      }
      if (data.mergeGroupFailedNoSlot > 0 && data.totalMergeGroups === 0) {
        warnings.push(`Не удалось разместить группу слияния (${data.mergeGroupFailedNoSlot} раз).`);
      }
      if (data.positionBlockedCount > 0 && data.totalSingleEntries > 0) {
        const pct = Math.round((data.positionBlockedCount / (data.totalSingleEntries + data.totalMergeGroups * 5)) * 100);
        if (pct > 50) {
          warnings.push(`Много зафиксированных занятий (${data.positionBlockedCount}), это снижает эффективность оптимизации.`);
        }
      }
      if (warnings.length > 0) {
        toast.warning(warnings.join(' '), { duration: 6000 });
      }

      refreshData();
    },
    onError: (e) => { toast.error(e.message); },
  });

  const resetFlagsMut = trpc.scheduleDisplay.resetFlags.useMutation({
    onSuccess: () => {
      toast.success("Выбранные флаги сброшены");
      setResetFlagsDialog(false);
      setResetFlagsSelection({ positionFlag: false, classroomFlag: false, mergeNumber: false });
      refreshData();
    },
    onError: (e) => { toast.error(e.message); },
  });

  const refreshData = useCallback(() => {
    if (viewMode === "units") {
      utils.scheduleDisplay.getForWeekPair.invalidate({ weekBaseId: 1, versionId: versionParam });
    } else {
      utils.scheduleDisplay.getByStudyGroups.invalidate({ weekBaseId: 1, versionId: versionParam });
    }
    utils.scheduleDisplay.getBuffer.invalidate();
  }, [viewMode, utils, versionParam]);

  const performMove = useCallback(
    async (entry: ScheduleRow, targetId: string) => {
      const parts = targetId.split("-");
      const targetWeekId = parseInt(parts[1], 10);
      const targetDayId = parseInt(parts[2], 10);
      const targetPairId = parseInt(parts[3], 10);
      const targetUnitCode = parts.slice(4).join("-");
      if (
        !entry.isBuffered &&
        entry.weekId === targetWeekId &&
        entry.dayOfWeekId === targetDayId &&
        entry.pairNumberId === targetPairId &&
        entry.unitCode === targetUnitCode
      ) {
        return;
      }
      if (targetUnitCode !== entry.unitCode) {
        toast.error("Нельзя перенести занятие в другой юнит")
        return;
      }

      const slot = slotStatuses[targetId];
      if (slot?.status === "conflict") {
        toast.error(slot.reason ?? "Невозможно разместить: конфликт");
        return;
      }

      try {
        if (slot?.status === "free") {
          await moveMutation.mutateAsync({ id: entry.id, targetWeekId, targetDayId, targetPairId, targetUnitCode, versionId: null });
        } else if (slot?.status === "swap") {
            const swapId = slotSwapIds[targetId];
          if (!swapId) {
            toast.error("Занятие для обмена не найдено");
            return;
          }
          await swapMutation.mutateAsync({ id1: entry.id, id2: swapId, versionId: null });
        }
        refreshData();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Неизвестная ошибка");
      }
    },
    [slotStatuses, slotSwapIds, moveMutation, swapMutation, refreshData, selectedVersionId]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refreshSlotStatuses = useCallback(
    async (entry: ScheduleRow) => {
      const sourceData = unitsData || groupsData;
      if (!sourceData) return;
      const days = sourceData.days;
      const pairs = sourceData.pairs;
      const slots: { weekId: number; dayId: number; pairId: number; unitCode: string }[] = [];
      for (const weekId of activeWeekIds) {
        for (const day of days) {
          for (const pair of pairs) {
            slots.push({ weekId, dayId: day.id, pairId: pair.id, unitCode: entry.unitCode });
          }
        }
      }
      const result = await checkSlots.mutateAsync({ movingId: entry.id, slots, versionId: null });
      const newStatuses: Record<string, { status: "free" | "conflict" | "swap"; reason?: string | undefined }> = {};
      const newSwapIds: Record<string, number> = {};
      for (const [key, val] of Object.entries(result)) {
        if (val && typeof val === 'object' && 'status' in val && isSlotStatus(val.status)) {
          newStatuses[key] = { status: val.status as "free" | "conflict" | "swap", reason: val.reason };
          if (val.status === 'swap' && 'swapId' in val && typeof val.swapId === 'number') {
            newSwapIds[key] = val.swapId;
          }
        }
      }
      setSlotStatuses(newStatuses as Record<string, { status: "free" | "conflict" | "swap"; reason?: string }>);
      setSlotSwapIds(newSwapIds);
    },
    [unitsData, groupsData, activeWeekIds, checkSlots, selectedVersionId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current?.entry;
    if (isScheduleRow(data)) {
      setActiveDragEntry(data);
      refreshSlotStatuses(data);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragEntry(null);
    setSlotStatuses({});
    setSlotSwapIds({});

    if (!over || !active.data.current?.entry) return;
    
    const entryData = active.data.current.entry;
    if (!isScheduleRow(entryData)) return;

    const entry: ScheduleRow = entryData;
    const targetId = over.id;
    if (typeof targetId !== 'string') return;

    if (targetId === "buffer-zone") {
      if (!entry.isBuffered) {
        const msg = entry.mergeNumber && entry.mergeNumber !== 0
          ? "Занятие входит в группу слияния. При перемещении в буфер номер слияния будет сброшен только у этого занятия, остальные занятия группы сохранят слияние между собой. Все флаги данного занятия будут сброшены. Продолжить?"
          : "Занятие будет перемещено в буфер. Все его флаги (позиция, аудитория, номер слияния) будут сброшены. Оно перестанет участвовать в расписании, пока вы не вернёте его вручную или не включите использование буфера в оптимизаторе. Продолжить?";
        const ok = await confirm({
          title: "Перемещение в буфер",
          message: msg,
          confirmLabel: "Переместить",
          variant: "danger",
        });
        if (ok) {
          await moveToBufferMut.mutateAsync({ id: entry.id, versionId: null });
          refreshData();
        }
      }
      return;
    }

    if (entry.isBuffered) {
      const parts = targetId.split("-");
      if (parts.length < 5 || parts[0] !== "week") return;
      const targetWeekId = parseInt(parts[1], 10);
      const targetDayId = parseInt(parts[2], 10);
      const targetPairId = parseInt(parts[3], 10);
      const targetUnitCode = parts.slice(4).join("-");
      const slots = [{ weekId: targetWeekId, dayId: targetDayId, pairId: targetPairId, unitCode: targetUnitCode }];
      const result = await checkSlots.mutateAsync({ movingId: entry.id, slots, versionId: null });
      const statusKey = `week-${targetWeekId}-${targetDayId}-${targetPairId}-${targetUnitCode}`;
      const slotResult = result[statusKey];
      if (slotResult?.status !== "free") {
        toast.error(slotResult?.reason ?? "Невозможно разместить: конфликт");
        return;
      }
      await moveFromBufferMut.mutateAsync({ id: entry.id, targetWeekId, targetDayId, targetPairId, targetUnitCode, versionId: null });
      refreshData();
      return;
    }

    const hasFlags = entry.positionFlag || entry.mergeNumber !== 0;
    if (hasFlags) {
      setConfirmDialog({
        show: true,
        message:
          "Есть зафиксированные занятия или подвергнутые слиянию. При переносе/обмене флаги фиксации и слияния будут сброшены. Продолжить?",
        onConfirm: () => {
          setConfirmDialog({ show: false, message: "", onConfirm: () => {} });
          performMove(entry, targetId);
        },
      });
      return;
    }

    await performMove(entry, targetId);
  };

  const openFlagEditor = (entry: ScheduleRow) => {
    setSelectedEntry(entry);
    setFlagForm({
      mergeNumber: entry.mergeNumber ?? 0,
      positionFlag: entry.positionFlag ?? false,
      classroomFlag: entry.classroomFlag ?? false,
    });
  };

  const saveFlags = async () => {
    if (!selectedEntry) return;
    await updateFlags.mutateAsync({ id: selectedEntry.id, ...flagForm, versionId: null });
    setSelectedEntry(null);
    refreshData();
  };

  const handlePrint = () => {
    const headerCells: string[] = [];
    const rows: string[][] = [];

    if (viewMode === "units" && unitsData) {
      const unitCodes = Array.from(new Set(unitsData.rows.map(r => r.unitCode))).sort();
      headerCells.push("День", "Пара", "Неделя", ...unitCodes);

      for (const day of unitsData.days) {
        for (const pair of unitsData.pairs) {
          for (const week of activeWeeksData) {
            const row = [
              day.name,
              String(pair.number),
              week.type,
            ];
            for (const code of unitCodes) {
              const entries = unitsData.rows.filter(
                r => r.unitCode === code && r.dayOfWeekId === day.id && r.pairNumberId === pair.id && r.weekId === week.id
              );
              row.push(entries.length > 0 ? entries.map(e => e.displayText).join("<br>") : "—");
            }
            (row as string[] & { _isEven?: boolean })._isEven = week.id % 2 === 0;
            rows.push(row);
          }
        }
      }
    } else if (viewMode === "groups" && groupsData) {
      const groupCodes = Array.from(new Set(groupsData.rows.map((r: ScheduleRowWithGroup) => r.studyGroupCode))).sort();
      headerCells.push("День", "Пара", "Неделя", ...groupCodes);

      for (const day of groupsData.days) {
        for (const pair of groupsData.pairs) {
          for (const week of activeWeeksData) {
            const row = [
              day.name,
              String(pair.number),
              week.type,
            ];
            for (const code of groupCodes) {
              const entries = groupsData.rows.filter(
                r => r.studyGroupCode === code && r.dayOfWeekId === day.id && r.pairNumberId === pair.id && r.weekId === week.id
              );
              row.push(entries.length > 0 ? entries.map(e => e.displayText).join("<br>") : "—");
            }
            (row as string[] & { _isEven?: boolean })._isEven = week.id % 2 === 0;
            rows.push(row);
          }
        }
      }
    }

    if (rows.length === 0) return;

    let html = `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 10px;">`;
    html += `<thead><tr>${headerCells.map(h => `<th style="border:1px solid #666; padding:4px; background:#e5e7eb;">${h}</th>`).join("")}</tr></thead>`;
    html += `<tbody>`;
    rows.forEach(row => {
      const isEven = (row as string[] & { _isEven?: boolean })._isEven === true;
      const bg = isEven ? 'background-color:#d1d5db;' : '';
      html += `<tr style="${bg}">`;
      row.forEach(cell => {
        html += `<td style="border:1px solid #666; padding:4px; vertical-align:middle;">${cell}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Расписание</title>
          <style>
            @media print {
              * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { border-collapse: collapse; width: 100%; font-size: 9px; }
              th { background: #e5e7eb !important; }
            }
          </style>
        </head>
        <body class="p-4">
          <h1 class="text-xl font-bold mb-4">Расписание</h1>
          ${html}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

const handleCSV = () => {
  const rows: string[][] = [];

  if (viewMode === "units" && unitsData) {
    const unitCodes = Array.from(new Set(unitsData.rows.map(r => r.unitCode))).sort();
    const header = ["День", "Пара", "Неделя", ...unitCodes];
    rows.push(header);

    for (const day of unitsData.days) {
      for (const pair of unitsData.pairs) {
        for (const week of activeWeeksData) {
          const row = [
            day.name,
            String(pair.number),
            week.type,
          ];
          for (const code of unitCodes) {
            const entries = unitsData.rows.filter(
              r => r.unitCode === code && r.dayOfWeekId === day.id && r.pairNumberId === pair.id && r.weekId === week.id
            );
            row.push(entries.length > 0 ? entries.map(e => e.displayText).join(" | ") : "—");
          }
          rows.push(row);
        }
      }
    }
  } else if (viewMode === "groups" && groupsData) {
    const groupCodes = Array.from(new Set(groupsData.rows.map((r: ScheduleRowWithGroup) => r.studyGroupCode))).sort();
    const header = ["День", "Пара", "Неделя", ...groupCodes];
    rows.push(header);

    for (const day of groupsData.days) {
      for (const pair of groupsData.pairs) {
        for (const week of activeWeeksData) {
          const row = [
            day.name,
            String(pair.number),
            week.type,
          ];
          for (const code of groupCodes) {
            const entries = groupsData.rows.filter(
              r => r.studyGroupCode === code && r.dayOfWeekId === day.id && r.pairNumberId === pair.id && r.weekId === week.id
            );
            row.push(entries.length > 0 ? entries.map(e => e.displayText).join(" | ") : "—");
          }
          rows.push(row);
        }
      }
    }
  }

  if (rows.length === 0) return;

  const bom = "\uFEFF";
  const csvContent = "data:text/csv;charset=utf-8," + bom + rows.map(r => r.join(";")).join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `schedule.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

  const { confirm } = useConfirmContext();

  // Обработчик изменения версии
  const handleVersionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const targetVersionId = val === "" ? null : Number(val);
    if (targetVersionId === selectedVersionId) return;
    await switchToVersionMut.mutateAsync({
      currentVersionId: selectedVersionId,
      targetVersionId,
    });
    setSelectedVersionId(targetVersionId);
  };

  // Обработчик сохранения копии версии
  const handleSaveAsCopy = () => {
    setInputDialog({
      show: true,
      title: "Название копии",
      defaultValue: `Копия от ${new Date().toLocaleDateString()}`,
      onConfirm: async (name) => {
        await saveActiveMut.mutateAsync({ name });
        setInputDialog({ show: false, title: "", onConfirm: () => {} });
        // После сохранения копии переключаемся на чистый лист
        setSelectedVersionId(null);
      },
    });
  };

  // Удаление активной версии
  const handleDeleteVersion = async () => {
    if (selectedVersionId === null) return;
    const versionId = selectedVersionId;
    const versionName = versionsQuery.data?.find(v => v.id === versionId)?.name ?? "";
    const ok = await confirm({
      title: "Удаление версии",
      message: `Удалить версию «${versionName}» и все её данные?`,
      confirmLabel: "Удалить",
      variant: "danger",
    });
    if (!ok) return;

    try {
      // Сначала деактивируем текущую версию (чистый лист)
      await switchToVersionMut.mutateAsync({
        currentVersionId: selectedVersionId,
        targetVersionId: null,
      });
      // Затем удаляем версию
      await deleteVersionMut.mutateAsync({ versionId });
      setSelectedVersionId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };
  //Переименование активной версии
  const renameVersionMut = trpc.scheduleVersions.update.useMutation({
    onSuccess: () => {
      utils.scheduleVersions.list.invalidate();
      toast.success('Версия переименована');
    },
    onError: (e) => {toast.error(e.message)},
  });

  if (viewMode === "units" && unitsLoading) return <div className="p-6"><Skeleton className="h-4 w-32" /></div>;
  if (viewMode === "groups" && groupsLoading) return <div className="p-6"><Skeleton className="h-4 w-32" /></div>;

  const bufferEntries = bufferData || [];
  
  const displayRows = viewMode === "units"
    ? (unitsData?.rows ?? [])
    : extractArray<ScheduleRowWithGroup>(groupsData?.rows, isScheduleRowWithGroup);
  
  const days = viewMode === "units" ? unitsData?.days : groupsData?.days;
  const pairs = viewMode === "units" ? unitsData?.pairs : groupsData?.pairs;
  
  const unitKeys = (() => {
    if (viewMode === "units") {
      const codes = Array.from(new Set((unitsData?.rows ?? []).map(r => r.unitCode)));
      if (!allUnits || !allUnitTypes) return codes.sort();

      const typeMap = new Map<number, string>();
      for (const ut of allUnitTypes) typeMap.set(ut.id, ut.name);

      const codeToType = new Map<string, string>();
      for (const u of allUnits) {
        const type = typeMap.get(u.unitTypeId) ?? 'ГРУППА';
        codeToType.set(u.code, type);
      }

      const flows: string[] = [];
      const groups: string[] = [];
      const subByGroup = new Map<string, string[]>();

      for (const code of codes) {
        const type = codeToType.get(code) ?? 'ГРУППА';
        if (type === 'ПОТОК') {
          flows.push(code);
        } else {
          const match = code.match(/^(.+?)(\d+)$/);
          if (match && codes.includes(match[1])) {
            const parent = match[1];
            if (!subByGroup.has(parent)) subByGroup.set(parent, []);
            subByGroup.get(parent)!.push(code);
          } else {
            groups.push(code);
          }
        }
      }

      flows.sort();
      groups.sort();


      const ordered: string[] = [...flows];
      for (const g of groups) {
        ordered.push(g);
        if (subByGroup.has(g)) ordered.push(...subByGroup.get(g)!);
      }
      // Подгруппы, чья родительская группа сама является подгруппой (редко), добавляются в конец
      for (const [parent, subs] of subByGroup) {
        if (!groups.includes(parent) && !flows.includes(parent)) {
          ordered.push(parent);
          ordered.push(...subs);
        }
      }
      return ordered;
    } else {
      return Array.from(new Set((groupsData?.rows ?? []).map(r => r.studyGroupCode))).sort();
    }
  })();

  return (
    <div className="flex h-full flex-col bg-background p-4 text-foreground">
      <h1 className="mb-4 text-xl font-bold">Расписание</h1>

      {/* Панель версионирования */}
      <div className="mb-4 flex items-center gap-3">
        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={selectedVersionId === null ? "" : selectedVersionId.toString()}
          onChange={handleVersionChange}
        >
          <option value="">
            Чистый лист {selectedVersionId === null ? "(текущее)" : ""}
          </option>
          {versionsQuery.data?.map((v) => (
            <option key={v.id} value={v.id.toString()}>
              {v.name}
              {v.id === selectedVersionId ? " (текущее)" : ""}
            </option>
          ))}
        </select>

        <button
          onClick={handleSaveAsCopy}
          disabled={!isActiveVersion || saveActiveMut.isPending}
          aria-label="Сохранить копию версии"
          className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saveActiveMut.isPending ? "Сохранение..." : "Сохранить как…"}
        </button>

        {isActiveVersion && (
          <button
            onClick={handleDeleteVersion}
            disabled={deleteVersionMut.isPending}
            aria-label="Удалить версию"
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteVersionMut.isPending ? "Удаление..." : "Удалить версию"}
          </button>
        )}
        {isActiveVersion && (
          <button
            onClick={() => {
              const currentName = versionsQuery.data?.find(v => v.id === selectedVersionId)?.name ?? '';
              setInputDialog({
                show: true,
                title: 'Переименовать версию',
                defaultValue: currentName,
                onConfirm: async (name) => {
                  await renameVersionMut.mutateAsync({ versionId: selectedVersionId!, name });
                  setInputDialog({ show: false, title: '', onConfirm: () => {} });
                },
              });
            }}
            disabled={renameVersionMut.isPending}
            aria-label="Переименовать версию"
            className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {renameVersionMut.isPending ? 'Переименование...' : 'Переименовать'}
          </button>
        )}
      </div>

      <InputDialog
        open={inputDialog.show}
        title={inputDialog.title}
        defaultValue={inputDialog.defaultValue}
        onConfirm={inputDialog.onConfirm}
        onCancel={() => setInputDialog({ show: false, title: "", onConfirm: () => {} })}
      />

      {/* Легенда */}
      <div className="mb-4 flex flex-wrap gap-4 rounded border border-border bg-muted p-3 text-sm">
        {activeWeeksData.map((week, idx) => (
          <div key={week.id} className="flex items-center gap-2">
            <span
              className={`inline-block h-4 w-4 rounded ${WEEK_COLORS[idx % WEEK_COLORS.length].bg} ${WEEK_COLORS[idx % WEEK_COLORS.length].border}`}
            ></span>
            {week.type} (ID:{week.id})
          </div>
        ))}
        {editMode && (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded border border-green-400 bg-green-300 dark:border-green-800 dark:bg-green-900/20"></span> Свободно
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded border border-red-400 bg-red-300 dark:border-red-800 dark:bg-red-900/20"></span> Конфликт
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded border border-blue-400 bg-blue-300 dark:border-blue-800 dark:bg-blue-900/20"></span> Обмен
            </div>
          </>
        )}
      </div>

      {confirmDialog.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="max-w-md rounded border border-border bg-background p-6 shadow-lg">
            <p className="mb-4 text-foreground">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog({ show: false, message: "", onConfirm: () => {} })}
                className="rounded border border-border px-4 py-2 text-foreground hover:bg-muted"
                aria-label="Отменить"
              >
                Отмена
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white"
                aria-label="Подтвердить"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-4">
        <button onClick={() => setViewMode("units")} className={viewMode === "units" ? "border-b-2 border-blue-500 font-bold" : ""}>По юнитам</button>
        <button onClick={() => setViewMode("groups")} className={viewMode === "groups" ? "border-b-2 border-blue-500 font-bold" : ""}>По группам</button>
        {isActiveVersion && (
          <>
            <button onClick={handlePrint} className="ml-2 rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700">🖨️ Печать</button>
            <button onClick={handleCSV} className="ml-2 rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700">📥 CSV</button>
          </>
        )}
        {viewMode === "units" && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleOptimize}
              disabled={editMode || optimizeScheduleMut.isPending || !isActiveVersion}
              className="rounded bg-purple-600 px-3 py-1 text-white hover:bg-purple-700 disabled:bg-gray-400"
            >
              {optimizeScheduleMut.isPending ? "Оптимизация..." : "Оптимизировать"}
            </button>
            {isActiveVersion && (
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={useBuffer}
                  onChange={(e) => setUseBuffer(e.target.checked)}
                  disabled={editMode || optimizeScheduleMut.isPending}
                />
                Использовать буфер
              </label>
            )}
          </div>
        )}
        {editMode && isActiveVersion && (
          <button
            onClick={handleOpenAnnealing}
            className="rounded bg-gray-600 px-3 py-1 text-white hover:bg-gray-700"
            title="Настройки отжига"
          >
            ⚙️
          </button>
        )}
        {editMode && isActiveVersion && (
          <>
            <button
              onClick={() => setResetFlagsDialog(true)}
              aria-label="Сбросить флаги"
              className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"
            >
              Сбросить флаги…
            </button>

            {resetFlagsDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                <div className="w-80 rounded border border-border bg-background p-6 shadow-lg">
                  <h2 className="mb-4 font-bold text-foreground">Сброс флагов</h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Выберите, какие флаги сбросить у всех занятий активного расписания:
                  </p>
                  <label className="mb-4 flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={resetFlagsSelection.mergeNumber}
                      onChange={(e) =>
                        setResetFlagsSelection({ ...resetFlagsSelection, mergeNumber: e.target.checked })
                      }
                    />
                    Сбросить номер слияния
                  </label>
                  <label className="mb-2 flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={resetFlagsSelection.positionFlag}
                      onChange={(e) =>
                        setResetFlagsSelection({ ...resetFlagsSelection, positionFlag: e.target.checked })
                      }
                    />
                    Сбросить закрепление позиции
                  </label>
                  <label className="mb-2 flex items-center gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={resetFlagsSelection.classroomFlag}
                      onChange={(e) =>
                        setResetFlagsSelection({ ...resetFlagsSelection, classroomFlag: e.target.checked })
                      }
                    />
                    Сбросить закрепление аудитории
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setResetFlagsDialog(false)}
                      className="rounded border border-border px-4 py-2 text-foreground hover:bg-muted"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => resetFlagsMut.mutate(resetFlagsSelection)}
                      disabled={resetFlagsMut.isPending}
                      className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white"
                    >
                      {resetFlagsMut.isPending ? "Сброс..." : "Сбросить"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {viewMode === "units" && (
          <button
            onClick={() => setEditMode(!editMode)}
            disabled={!isActiveVersion}
            aria-label="Режим редактирования"
            className="ml-auto rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600 disabled:bg-gray-400"
          >
            {editMode ? "Завершить редактирование" : "Редактировать"}
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          {editMode && isActiveVersion && <BufferZone entries={bufferEntries} isEditMode={editMode} />}

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" id="schedule-table">
            {days && pairs && displayRows && (
              <div
                className="schedule-grid h-full w-full"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `70px 50px repeat(${unitKeys.length}, minmax(180px, 1fr))`,
                  gridTemplateRows: `auto repeat(${days.length * pairs.length * activeWeeksData.length}, auto)`,
                  overflow: 'auto',
                }}
              >
                {/* Шапка */}
                <div
                  className="sticky-header-left border border-border bg-muted p-2 font-bold text-foreground"
                  style={{ gridRow: 1, gridColumn: 1 }}
                >
                  День
                </div>
                <div
                  className="sticky-header-left border border-border bg-muted p-2 font-bold text-foreground"
                  style={{ gridRow: 1, gridColumn: 2, left: '70px' }}
                >
                  Пара
                </div>
                {unitKeys.map((code, idx) => (
                  <div
                    key={`header-${code}`}
                    className="sticky-header-top border border-border bg-blue-50 p-2 font-bold text-foreground dark:bg-blue-900/30"
                    style={{ gridRow: 1, gridColumn: idx + 3 }}
                  >
                    {code}
                  </div>
                ))}
                {/* Тело */}
                {days.map((day: Day, dayIdx: number) =>
                  pairs.map((pair: Pair, pairIdx: number) =>
                    activeWeeksData.map((week, weekIdx) => {
                      const rowIndex =
                        2 +
                        (dayIdx * pairs.length * activeWeeksData.length +
                          pairIdx * activeWeeksData.length +
                          weekIdx);
                      const color = WEEK_COLORS[weekIdx % WEEK_COLORS.length];
                      const bgClass = `${color.bg} ${color.border}`;

                      return (
                        <React.Fragment key={`${day.id}-${pair.id}-${week.id}`}>
                          {/* Колонка День */}
                          <div
                            className="sticky-col-left border border-border p-2 text-center font-medium"
                            style={{
                              gridRow: rowIndex,
                              gridColumn: 1,
                              position: 'sticky',
                              left: 0,
                              zIndex: 3,
                              background: 'var(--background)',
                            }}
                          >
                            {day.name}
                          </div>
                          {/* Колонка Пара */}
                          <div
                            className="sticky-col-left border border-border p-2 text-center"
                            style={{
                              gridRow: rowIndex,
                              gridColumn: 2,
                              position: 'sticky',
                              left: '70px',
                              zIndex: 3,
                              background: 'var(--background)',
                            }}
                          >
                            {pair.number}
                          </div>
                          {/* Колонки юнитов/групп */}
                          {unitKeys.map((code, colIdx) => (
                            <div
                              key={`cell-${day.id}-${pair.id}-${week.id}-${code}`}
                              className={`border border-border p-1 align-top ${viewMode === 'units' ? '' : bgClass}`}
                              style={{ gridRow: rowIndex, gridColumn: colIdx + 3 }}
                            >
                              {viewMode === 'units' ? (
                                (() => {
                                  const entry = displayRows.find(
                                    (r) =>
                                      'unitCode' in r &&
                                      r.unitCode === code &&
                                      r.dayOfWeekId === day.id &&
                                      r.pairNumberId === pair.id &&
                                      r.weekId === week.id
                                  );
                                  return (
                                    <DroppableArea
                                      weekId={week.id}
                                      weekIndex={weekIdx}
                                      dayId={day.id}
                                      pairId={pair.id}
                                      unitCode={code}
                                      entry={entry as ScheduleRow | undefined}
                                      isEditMode={editMode && isActiveVersion}
                                      status={slotStatuses[`week-${week.id}-${day.id}-${pair.id}-${code}`]?.status ?? null}
                                      onCellClick={openFlagEditor}
                                    />
                                  );
                                })()
                              ) : (
                                (() => {
                                  const entries = (displayRows as ScheduleRowWithGroup[]).filter(
                                    (r) =>
                                      r.studyGroupCode === code &&
                                      r.dayOfWeekId === day.id &&
                                      r.pairNumberId === pair.id &&
                                      r.weekId === week.id
                                  );
                                  return entries.length > 0 ? (
                                    entries.map((entry) => (
                                      <DraggableLesson key={entry.id} entry={entry} isEditMode={false} />
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  );
                                })()
                              )}
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragEntry ? (
            <div className="rounded border border-border bg-background p-2 text-xs text-foreground shadow">
              {activeDragEntry.displayText}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSelectedEntry(null);
              e.stopPropagation();
            }
          }}>
          <div className="w-80 rounded border border-border bg-background p-6 shadow-lg">
            <h2 className="mb-4 font-bold text-foreground">Редактирование занятия</h2>
            <div className="mb-2 text-sm text-foreground">{selectedEntry.displayText}</div>
            <label className="mb-2 block text-foreground">
              Номер слияния:
              <input
                type="number"
                value={flagForm.mergeNumber}
                onChange={(e) => setFlagForm({ ...flagForm, mergeNumber: +e.target.value })}
                className="w-full rounded border border-border bg-background px-2 py-1 text-foreground"
              />
            </label>
            <label className="mb-2 block text-foreground">
              <input
                type="checkbox"
                checked={flagForm.positionFlag}
                onChange={(e) => setFlagForm({ ...flagForm, positionFlag: e.target.checked })}
              />
              <span className="ml-2">Закрепить позицию занятия</span>
            </label>
            <label className="mb-4 block text-foreground">
              <input
                type="checkbox"
                checked={flagForm.classroomFlag}
                onChange={(e) => setFlagForm({ ...flagForm, classroomFlag: e.target.checked })}
              />
              <span className="ml-2">Закрепить аудиторию</span>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedEntry(null)} className="hover:bg-muted/70 rounded bg-muted px-3 py-1 text-foreground">
                Отмена
              </button>
              <button onClick={saveFlags} className="hover:bg-primary/90 rounded bg-primary px-3 py-1 text-white">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {showAnnealingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="w-full max-w-md rounded border border-border bg-background p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-bold text-foreground">Параметры отжига</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Эти параметры влияют на работу оптимизатора расписания. 
              <strong>Начальная температура</strong> определяет, насколько активно перемешиваются занятия в начале. 
              Чем выше температура, тем больше случайных перемещений, что помогает избежать застревания в локальных минимумах. 
              <strong>Скорость охлаждения</strong> определяет, как быстро температура снижается. 
              Значение близкое к 1 даёт более тщательный поиск, но увеличивает время оптимизации.
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-foreground">
                Начальная температура
              </label>
              <input
                type="number"
                min={1}
                step={10}
                value={tempInput}
                onChange={(e) => setTempInput(Number(e.target.value))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
                title="Начальная температура (1–10000). Чем выше, тем больше случайных перестановок на старте."
              />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-foreground">
                Скорость охлаждения
              </label>
              <input
                type="number"
                min={0.001}
                max={0.999}
                step={0.001}
                value={rateInput}
                onChange={(e) => setRateInput(Number(e.target.value))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
                title="Скорость охлаждения (0.001–0.999). Ближе к 1 – медленное охлаждение, дольше оптимизация, потенциально лучший результат."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAnnealingDialog(false)}
                className="rounded border border-border px-4 py-2 text-foreground hover:bg-muted"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveAnnealingSettings}
                disabled={settingsUpdateMut.isPending}
                className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white"
              >
                {settingsUpdateMut.isPending ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}