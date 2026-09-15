"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const WEIGHT_KEYS = {
  teacherWindow: "opt_weight_teacher_window",
  groupWindow: "opt_weight_group_window",
  dailyBalance: "opt_weight_daily_balance",
  typeDiversity: "opt_weight_type_diversity",
  singleLessonDay: "opt_weight_single_lesson_day",
  unitMisuse: "opt_weight_unit_misuse",
};

// Тип для ключей WEIGHT_KEYS
type WeightField = keyof typeof WEIGHT_KEYS;

export default function OptimizationSettingsPage() {
  const utils = trpc.useUtils();

  // Загружаем все настройки разом или по отдельности – оставим по отдельности, но с refetch
  const qTeacher = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.teacherWindow });
  const qGroup = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.groupWindow });
  const qBalance = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.dailyBalance });
  const qDiversity = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.typeDiversity });
  const qSingle = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.singleLessonDay });
  const qUnit = trpc.settings.get.useQuery({ key: WEIGHT_KEYS.unitMisuse });
  
  const isLoading =
    qTeacher.isLoading ||
    qGroup.isLoading ||
    qBalance.isLoading ||
    qDiversity.isLoading ||
    qSingle.isLoading ||
    qUnit.isLoading 
    


  const initialWeights = {
    teacherWindow: Number(qTeacher.data) || 1,
    groupWindow: Number(qGroup.data) || 2,
    dailyBalance: Number(qBalance.data) || 1,
    typeDiversity: Number(qDiversity.data) || 1,
    singleLessonDay: Number(qSingle.data) || 1,
    unitMisuse: Number(qUnit.data) || 1,
  };

  const [weights, setWeights] = useState(initialWeights);
  
  // Синхронизируем состояние при загрузке данных
  useEffect(() => {
    if (!isLoading) {
      setWeights({
        teacherWindow: Number(qTeacher.data) || 1,
        groupWindow: Number(qGroup.data) || 2,
        dailyBalance: Number(qBalance.data) || 1,
        typeDiversity: Number(qDiversity.data) || 1,
        singleLessonDay: Number(qSingle.data) || 1,
        unitMisuse: Number(qUnit.data) || 1,
      });
    }
  }, [isLoading, qTeacher.data, qGroup.data, qBalance.data, qDiversity.data, qSingle.data, qUnit.data]);

  const updateMut = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Сохранено");
      // Инвалидируем все запросы настроек
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.teacherWindow });
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.groupWindow });
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.dailyBalance });
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.typeDiversity });
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.singleLessonDay });
      utils.settings.get.invalidate({ key: WEIGHT_KEYS.unitMisuse });
    },
    onError: (e) => {toast.error(e.message)},
  });

  const handleSave = (field: string, value: number) => {
    // Проверяем, что field действительно ключ из WEIGHT_KEYS
    if (field in WEIGHT_KEYS) {
      const key = WEIGHT_KEYS[field as WeightField];
      updateMut.mutate({ key, value: String(value) });
    } else {
      toast.error(`Неизвестное поле: ${field}`);
    }
  };

  if (isLoading)
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
    );

  return (
    <div className="mx-auto max-w-xl bg-background p-6 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">Параметры оптимизации</h1>
      <div className="space-y-4">
        {[
          { label: "Штраф за окна у преподавателя", field: "teacherWindow", val: weights.teacherWindow },
          { label: "Штраф за окна у группы", field: "groupWindow", val: weights.groupWindow },
          { label: "Штраф за неравномерность по дням", field: "dailyBalance", val: weights.dailyBalance },
          { label: "Штраф за однообразие типов занятий", field: "typeDiversity", val: weights.typeDiversity },
          { label: "Штраф за единственное занятие в день", field: "singleLessonDay", val: weights.singleLessonDay },
          { label: "Штраф за нерациональное использование юнитов", field: "unitMisuse", val: weights.unitMisuse },
        ].map((item) => (
          <div key={item.field} className="flex items-center gap-4">
            <label className="w-64 text-sm">{item.label}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={item.val}
              onChange={(e) =>
                setWeights({ ...weights, [item.field]: Number(e.target.value) })
              }
              className="w-24 rounded border border-border px-2 py-1"
            />
            <button
              onClick={() => handleSave(item.field, item.val)}
              disabled={updateMut.isPending}
              className="rounded bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {updateMut.isPending ? "..." : "OK"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}