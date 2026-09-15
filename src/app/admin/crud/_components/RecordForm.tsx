/**
 * Универсальная модальная форма для создания и редактирования записей в любой таблице,
 * описанной в {@link tablesMeta}.
 *
 * Полностью управляется метаданными: набор полей, их типы, валидация, способ ввода
 * (текст, число, выпадающий список, переключатель, группа radio) определяются
 * объектом `FieldMeta` из `tablesMeta[tableName].fields`.
 *
 * ## Режимы работы
 * - **Создание** (`editId === null`): форма открывается с начальными значениями по
 *   умолчанию (radioGroup = 3, toggles = false / true для isActive, числовые = null,
 *   текстовые = ""). При отправке вызывается `create.mutateAsync`.
 * - **Редактирование** (`editId` передан): данные загружаются через `get.useQuery`
 *   и заполняют поля. При отправке вызывается `update.mutateAsync`.
 * - Закрытие по Escape или кнопке «Отмена». После успешной мутации форма закрывается
 *   автоматически.
 *
 * ## Типы полей и их рендеринг
 * 1. **Внешний ключ** (`isFK === true`, `references` заданы) – выпадающий список,
 *    загружаемый через `list.useQuery` связанной таблицы. Для некоторых полей
 *    (например, `classroomId` в `lessonClassrooms`, `directorId`, `headId`,
 *    `curatorId`) передаются дополнительные параметры фильтрации.
 *    Особая логика для таблицы `disciplineTeachers`: при выборе дисциплины
 *    фильтруются преподаватели по кафедре, и наоборот.
 * 2. **Приоритет** (`inputType === "radioGroup"`) – три radio-кнопки: «Низкий» (3),
 *    «Средний» (2), «Высокий» (1). По умолчанию 3.
 * 3. **Переключатель / булево поле** (`inputType === "toggle"` или имя поля входит
 *    в `TOGGLE_FIELDS`) – визуальный toggle (цветная кнопка-ползунок) с подписью
 *    «Да»/«Нет» или «Вкл»/«Выкл».
 * 4. **Числовое поле** – определяется эвристикой `isNumericField()`: если имя поля
 *    содержит `year`, `count`, `Id`, `course`, `semester`, `capacity`, `code`, но
 *    не является кодом/unitCode/letterCode. Пустое значение преобразуется в `null`.
 * 5. **Текстовое поле** – всё остальное. Пустая строка при необязательном поле
 *    отправляется как `""`.
 *
 * ## Валидация
 * - При отправке проверяются все поля, помеченные как `required: true` (кроме `id`).
 *   Пустые значения (null, undefined, пустая строка) вызывают ошибку «Обязательное поле».
 * - Ошибки отображаются под конкретным полем. Глобальные ошибки (неиспользуются)
 *   могут быть показаны в `errors._form`.
 * - При изменении поля ошибка для него сбрасывается.
 *
 * ## Отправка данных
 * - Перед отправкой числовые и FK-поля с пустой строкой преобразуются в `null`.
 * - Для toggles/radioGroup значение остаётся как есть.
 * - В случае ошибки мутации выводится тост с сообщением от сервера.
 * - После успеха вызывается `onClose()`, который инвалидирует список (внешний код).
 *
 * ## Состояния
 * - Если метаданные не найдены (`meta === undefined`), компонент возвращает `null`.
 * - Во время загрузки существующих данных (edit) форма не блокируется, но поля
 *   могут быть пустыми до получения данных.
 * - Кнопка «Сохранить» блокируется на время выполнения мутации (`isPending`).
 * - Для связанных выпадающих списков отображается индикатор загрузки (`disabled`).
 *
 * ## Примечания
 * - Поле `id` всегда скрыто.
 * - Поля, у которых `showInCreate === false`, скрываются только в режиме создания.
 * - Кэширование tRPC не инвалидируется внутри формы – это задача родительского
 *   компонента (`DataTable`), который передаёт `onClose`.
 * - Для работы необходим глобально доступный `trpc`-клиент и контекст подтверждения
 *   не требуется.
 *
 * @param tableName - ключ из `tablesMeta`, определяющий таблицу.
 * @param editId - ID редактируемой записи или `null` для создания новой.
 * @param onClose - колбэк, вызываемый после успешного сохранения или при отмене.
 */
"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { tablesMeta, type FieldMeta } from "@/lib/table-meta";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";

const TOGGLE_FIELDS = new Set(["isActive", "positionFlag", "classroomFlag", "isBuffered"]);

function isNumericField(field: FieldMeta): boolean {
  if (field.dbName === "unitCode" || field.dbName === "code" || field.dbName === "letterCode") return false;
  return (
    field.dbName.includes("year") ||
    field.dbName.includes("count") ||
    field.dbName.includes("Id") ||
    field.dbName.includes("course") ||
    field.dbName.includes("semester") ||
    field.dbName.includes("capacity") ||
    field.dbName.includes("code")
  );
}

interface CrudRouter {
  get: {
    useQuery: (input: { id: number }, opts?: unknown) => {
      data?: Record<string, unknown> | null;
    };
  };
  create: {
    useMutation: (opts?: unknown) => {
      mutateAsync: (input: Record<string, unknown>) => Promise<unknown>;
      isPending: boolean;
    };
  };
  update: {
    useMutation: (opts?: unknown) => {
      mutateAsync: (input: { id: number } & Record<string, unknown>) => Promise<unknown>;
      isPending: boolean;
    };
  };
}

interface RecordFormProps {
  tableName: string;
  editId: number | null;
  onClose: () => void;
  onSaved: (savedRow: Record<string, unknown>) => void;
}

export function RecordForm({ tableName, editId, onClose, onSaved }: RecordFormProps) {
  const meta = tablesMeta[tableName];

  const router = meta
    ? (trpc as unknown as Record<string, CrudRouter>)[meta.routerKey] as CrudRouter | undefined
    : undefined;

  const { data: existingData } = router?.get?.useQuery?.(
    { id: editId! },
    { enabled: !!editId && !!router }
  ) ?? { data: null };

  const createMutation = router?.create?.useMutation?.();
  const updateMutation = router?.update?.useMutation?.();

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedDisciplineId = (tableName === "disciplineTeachers" ? formValues.disciplineId : undefined) as number | undefined;
  const { data: selectedDiscipline } = trpc.disciplines.get.useQuery(
    { id: selectedDisciplineId! },
    { enabled: tableName === "disciplineTeachers" && !!selectedDisciplineId }
  );

  const selectedTeacherDeptId = (tableName === "disciplineTeachers" ? formValues.teacherDepartmentId : undefined) as number | undefined;
  const { data: selectedEmpDept } = trpc.employeesDepartments.get.useQuery(
    { id: selectedTeacherDeptId! },
    { enabled: tableName === "disciplineTeachers" && !!selectedTeacherDeptId }
  );

  useEffect(() => {
    if (!meta) return;
    if (editId && existingData) {
      setFormValues({ ...existingData } as Record<string, unknown>);
    } else if (!editId) {
      const initial: Record<string, unknown> = {};
      meta.fields.forEach((f) => {
        if (f.dbName === "id") return;
        if (f.inputType === "radioGroup") {
          initial[f.dbName] = 3;
        } else if (TOGGLE_FIELDS.has(f.dbName)) {
          initial[f.dbName] = f.dbName === "isActive" ? true : false;
        } else if (isNumericField(f)) {
          initial[f.dbName] = null;
        } else {
          initial[f.dbName] = "";
        }
      });
      setFormValues(initial);
    }
  }, [editId, existingData, meta]);

  if (!meta) return null;

  const handleChange = (field: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedValues = { ...formValues };

    meta.fields.forEach((f) => {
      const key = f.dbName;
      if (key === "id") return;
      const val = cleanedValues[key];
      if (!TOGGLE_FIELDS.has(key) && typeof val === "string" && val.trim() === "") {
        if (f.isFK || isNumericField(f) || key === "email" || key === "phone") {
          cleanedValues[key] = null;
        }
      }
    });

    const newErrors: Record<string, string> = {};
    meta.fields.forEach((f) => {
      if (f.required && f.dbName !== "id") {
        const val = cleanedValues[f.dbName];
        if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
          newErrors[f.dbName] = "Обязательное поле";
        }
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    try {
        if (editId) {
          const mutationResult = await updateMutation?.mutateAsync({ id: editId, ...cleanedValues });
          const savedRow = Array.isArray(mutationResult) ? mutationResult[0] : mutationResult;
          if (savedRow) onSaved(savedRow as Record<string, unknown>);
        } else {
          const mutationResult = await createMutation?.mutateAsync(cleanedValues);
          const savedRow = Array.isArray(mutationResult) ? mutationResult[0] : mutationResult;
          if (savedRow) onSaved(savedRow as Record<string, unknown>);
        }
      } catch (err: unknown) {
        console.log('tRPC error:', err); 
        const message = err instanceof TRPCClientError ? err.message : (err instanceof Error ? err.message : "Неизвестная ошибка");
        toast.error(message);
      }
  };

  const renderField = (field: FieldMeta) => {
    if (!editId && field.showInCreate === false) return null;
    if (field.dbName === "id") return null;
    const value = formValues[field.dbName] ?? (field.isFK ? null : "");
    const hasError = !!errors[field.dbName];
    const errorMsg = errors[field.dbName];

    if (field.isFK && field.references) {
      const refTable = field.references.table;
      const refRouterKey = tablesMeta[refTable]?.routerKey;
      let input: Record<string, unknown> | undefined;

      if (field.dbName === "classroomId" && tableName === "lessonClassrooms") {
        input = formValues.lessonId ? { lessonId: formValues.lessonId as number } : undefined;
      } else if (field.dbName === "directorId") {
        input = formValues.universityCode ? { instituteId: formValues.universityCode as number } : undefined;
      } else if (field.dbName === "headId") {
        input = editId ? { departmentId: editId as number } : undefined;
      } else if (field.dbName === "curatorId") {
        const profileId = editId
          ? (existingData as Record<string, unknown> | null)?.profileId
          : formValues.profileId;
        input = profileId ? { profileId: profileId as number } : undefined;
      }

      // ========== БЛОК: фильтрация для disciplineTeachers ==========
      if (tableName === "disciplineTeachers") {
        if (field.dbName === "teacherDepartmentId") {
          // При выборе дисциплины – фильтруем преподавателей по её кафедре
          if (selectedDiscipline?.departmentId) {
            input = { departmentId: selectedDiscipline.departmentId as number };
          }
        } else if (field.dbName === "disciplineId") {
          // При выборе преподавателя – фильтруем дисциплины по его кафедре
          if (selectedEmpDept?.departmentId) {
            input = { departmentId: selectedEmpDept.departmentId as number };
          }
        }
      }
      // ========== КОНЕЦ БЛОКА ==========

      const refRouter = refRouterKey
        ? (trpc as unknown as Record<string, { list: { useQuery: (input?: unknown) => { data?: Record<string, unknown>[]; isLoading?: boolean } } }>)[refRouterKey]
        : undefined;
      const { data: options = [] as Record<string, unknown>[], isLoading: optionsLoading = false } =
        refRouter?.list?.useQuery?.(input) ?? {};

      return (
        <div key={field.dbName} className="mb-3">
          <label className="mb-1 block text-sm font-medium text-foreground">
            {field.displayName}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <select
            value={(value as string | number | undefined) ?? ""}
            onChange={(e) => handleChange(field.dbName, e.target.value === "" ? null : Number(e.target.value))}
            className={`w-full rounded border bg-background px-3 py-1.5 text-foreground ${hasError ? "border-red-500" : "border-border"}`}
            disabled={optionsLoading}
          >
            <option value="">-- Не выбрано --</option>
            {options.map((opt) => (
              <option key={opt.id as number} value={opt.id as number}>
                {opt[field.references!.displayField] as string ?? String(opt.id)}
              </option>
            ))}
          </select>
          {hasError && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
        </div>
      );
    }
    if (field.inputType === "radioGroup") {
      const selectedValue = (value as number) || 3;
      const options = [
        { value: 3, label: "Низкий" },
        { value: 2, label: "Средний" },
        { value: 1, label: "Высокий" },
      ];
      return (
        <div key={field.dbName} className="mb-3">
          <label className="mb-1 block text-sm font-medium text-foreground">
            {field.displayName}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <div className="flex gap-4">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={field.dbName}
                  value={opt.value}
                  checked={selectedValue === opt.value}
                  onChange={() => handleChange(field.dbName, opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {hasError && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
        </div>
      );
    }
    if (TOGGLE_FIELDS.has(field.dbName) || field.inputType === "toggle") {
      const isActive = !!value;
      return (
        <div key={field.dbName} className="mb-3">
          <label className="mb-1 block text-sm font-medium text-foreground">
            {field.displayName}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isActive ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            onClick={() => handleChange(field.dbName, !isActive)}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="ml-2 text-xs text-muted-foreground">
            {isActive ? (field.displayName === "Активен" ? "Да" : "Вкл") : (field.displayName === "Активен" ? "Нет" : "Выкл")}
          </span>
          {hasError && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
        </div>
      );
    }

    return (
      <div key={field.dbName} className="mb-3">
        <label className="mb-1 block text-sm font-medium text-foreground">
          {field.displayName}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <input
          type={isNumericField(field) ? "number" : "text"}
          value={(value as string | number) ?? ""}
          onChange={(e) => {
            if (isNumericField(field)) {
              const raw = e.target.value;
              handleChange(field.dbName, raw.trim() === "" ? null : Number(raw));
            } else {
              handleChange(field.dbName, e.target.value);
            }
          }}
          className={`w-full rounded border bg-background px-3 py-1.5 text-foreground ${hasError ? "border-red-500" : "border-border"}`}
        />
        {hasError && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
      </div>
    );
  };

  const isPending = createMutation?.isPending || updateMutation?.isPending;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {editId ? `Редактировать запись (ID: ${editId})` : `Создать запись в таблице «${meta.nameRu}»`}
        </h2>
        <form onSubmit={handleSubmit}>
          {meta.fields.map(renderField)}
          {errors._form && <p className="mb-3 text-sm text-red-500">{errors._form}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="hover:bg-muted/50 rounded border border-border bg-background px-4 py-1.5 text-sm text-foreground" disabled={isPending}>
              Отмена
            </button>
            <button type="submit" className="hover:bg-primary/90 rounded bg-primary px-4 py-1.5 text-sm text-white" disabled={isPending}>
              {isPending ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}