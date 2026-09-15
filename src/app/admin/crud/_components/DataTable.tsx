// /**
//  * Универсальная таблица данных для всех CRUD-справочников админ-панели.
//  *
//  * Полностью строится по метаданным из {@link tablesMeta}: набор колонок, их типы,
//  * внешние ключи, фильтры и действия генерируются автоматически на основе переданного
//  * `tableName`. Один и тот же компонент обслуживает 30+ таблиц без дублирования кода.
//  *
//  * ## Основные возможности
//  * - **Сортировка** по любому столбцу (клик по заголовку).
//  * - **Глобальный поиск** по всем текстовым полям (строка ввода над таблицей).
//  * - **Фильтрация по значениям столбца** через попап `ColumnFilterPopover` (исключение
//  *   выбранных значений).
//  * - **Массовое удаление** выбранных записей с проверкой зависимостей (`batchDeleteRouter`).
//  * - **Импорт / экспорт** данных в JSON.
//  * - **Создание и редактирование** записей через модальную форму `RecordForm`.
//  * - **Подсветка архивных записей** красным фоном, если `row.original.isActive === false`.
//  *
//  * ## Как работает
//  * 1. По `tableName` извлекается объект `TableMeta` из `tablesMeta`.
//  * 2. Через `routerKey` динамически получается tRPC-роутер (например, `trpc.institutes`).
//  * 3. Вызывается `list.useQuery()` для загрузки всех записей (пагинация на 10000 строк).
//  * 4. Для каждого поля из `meta.fields` строится колонка `ColumnDef`:
//  *    - Обычное поле → текстовое отображение (`String(value)`).
//  *    - Внешний ключ → компонент `ForeignKeyCell`, который по ID показывает осмысленное
//  *      имя из связанной таблицы.
//  *    - Заголовок колонки содержит `displayName` поля и кнопку фильтра.
//  * 5. Добавляются служебные колонки:
//  *    - Чекбокс выбора строки.
//  *    - Порядковый номер (отображается в `<tbody>`, а не в данных).
//  *    - Колонка «Действия» с кнопками «Ред.» и «Удалить».
//  * 6. `useReactTable` из TanStack Table управляет сортировкой, фильтрацией,
//  *    пагинацией и глобальным поиском.
//  * 7. При смене `tableName` все состояния (сортировка, фильтры, пагинация, выбранные ID)
//  *    сбрасываются в начальное состояние через `useEffect`.
//  *
//  * ## Состояния
//  * - `isLoading` → отображается скелетон таблицы (`SkeletonTable`).
//  * - `isError` → красный текст с сообщением ошибки.
//  * - Пустые данные → строка «Нет данных» с минимальной высотой 250px.
//  * - `meta === undefined` → сообщение «Таблица не найдена».
//  *
//  * ## Обработчики
//  * - **Удаление одиночной записи** – диалог подтверждения → мутация `delete` → инвалидация
//  *   кеша tRPC.
//  * - **Массовое удаление** – диалог подтверждения → мутация `batchDelete.deleteMany` →
//  *   тост с результатом (сколько удалено, сколько не удалось и почему).
//  * - **Экспорт** – запрос `crudImportExport.exportAll` с отключённым автоматическим
//  *   выполнением (`enabled: false`), запускается вручную через `refetch()`. Результат
//  *   сохраняется как JSON-файл.
//  * - **Импорт** – выбор файла → `FileReader` → мутация `crudImportExport.importData` →
//  *   тост с количеством вставленных, обновлённых, пропущенных записей и списком ошибок.
//  * - **Добавление** – открывает `RecordForm` с `editId = null`.
//  * - **Редактирование** – открывает `RecordForm` с `editId = id` выбранной строки.
//  *
//  * ## UI-структура
//  * - **Панель инструментов**: глобальный поиск, кнопки «Добавить», «JSON-экспорт»,
//  *   «JSON-импорт», кнопка массового удаления (появляется при выборе строк).
//  * - **Таблица**: шапка с сортируемыми заголовками, тело с данными.
//  * - **Строки**: чекбокс, порядковый номер, значения полей, кнопки действий.
//  * - **Пейджинг**: отображается только если страниц больше одной.
//  * - **Модальная форма**: рендерится поверх таблицы при `showForm === true`.
//  *
//  * ## Примечания
//  * - `pageSize` установлен в 10000, чтобы показывать все записи без пагинации
//  *   (в типовых справочниках данных немного). При необходимости можно уменьшить.
//  * - Фильтрация работает как **исключение**: выбранные значения скрываются из таблицы,
//  *   а не показываются только они.
//  * - Для добавления новой таблицы достаточно создать запись в `tablesMeta` и
//  *   соответствующий tRPC-роутер с методами `list`, `create`, `update`, `delete`.
//  *   Компонент подхватит её автоматически.
//  * - Тип `CrudRouter` – упрощённая версия реального типа tRPC-роутера для обхода
//  *   сложной типизации. В production-коде рекомендуется использовать точные типы
//  *   из `@trpc/server`.
//  *
//  * @param tableName - ключ из `tablesMeta`, определяющий, какую таблицу отображать.
//  */
"use client";
import * as React from "react";
import { useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type ColumnFiltersState,
  type FilterFn,
} from "@tanstack/react-table";
import { trpc } from "@/trpc/client";
import { tablesMeta } from "@/lib/table-meta";
import { RecordForm } from "./RecordForm";
import { ForeignKeyCell } from "./ForeignKeyCell";
import { ColumnFilterPopover } from "./ColumnFilterPopover";
import { toast } from "sonner";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useConfirmContext } from "@/contexts/ConfirmContext";

interface BaseRow extends Record<string, unknown> {
  id: number;
  isActive?: boolean;
}
/** Динамические методы tRPC-утилит для работы с кешем */
interface DynamicListUtils {
  getData?: () => BaseRow[] | undefined;
  setData?: (input: undefined, data: BaseRow[]) => void;
  invalidate?: () => void;
}

interface DynamicUtils {
  list?: DynamicListUtils;
}
interface CrudRouter {
  list: {
    useQuery: (input?: unknown, opts?: unknown) => {
      data?: BaseRow[];
      isLoading: boolean;
      isError: boolean;
      error: { message: string } | null;
    };
  };
  delete: {
    useMutation: (opts?: unknown) => {
      mutateAsync?: (input: { id: number }) => Promise<unknown>;
      mutate: (input: { id: number }) => void;
      isPending?: boolean;
    };
  };
}

const arrayFilterFn: FilterFn<BaseRow> = (row, columnId, filterValue: unknown[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const cellValue = row.getValue(columnId);
  return !filterValue.includes(cellValue);
};

interface DataTableProps {
  tableName: string;
}

export function DataTable({ tableName }: DataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10000,
  });
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [editId, setEditId] = React.useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const meta = tablesMeta[tableName];
  const metaExists = meta !== undefined;

  const routerKey = meta?.routerKey as keyof typeof trpc;
  const router = metaExists
    ? (trpc as unknown as Record<string, CrudRouter>)[meta!.routerKey] as CrudRouter | undefined
    : undefined;

  const { data: rawData, isLoading, isError, error } = router?.list?.useQuery?.() ?? {
    data: [] as BaseRow[],
    isLoading: false,
    isError: false,
    error: { message: "" } as { message: string },
  };

  const rows: BaseRow[] = React.useMemo(() => rawData ?? [], [rawData]);
  const utils = trpc.useUtils();

  const deleteMutation = router?.delete?.useMutation?.({
    onSuccess: () => {
      (utils as unknown as Record<string, { list?: { invalidate?: () => void } }>)[routerKey]?.list?.invalidate?.()
    },
  });

  const deleteManyMutation = trpc.batchDelete.deleteMany.useMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportQuery = trpc.crudImportExport.exportAll.useQuery(
    { tableName },
    { enabled: false }
  );
  const importMutation = trpc.crudImportExport.importData.useMutation();

  const { confirm } = useConfirmContext();

  const hasActiveToggle = metaExists && meta.fields.some(f => f.dbName === 'isActive' && f.inputType === 'toggle');

  const batchUpdateActiveMutation = trpc.batchUpdateActive.updateMany.useMutation();
  const handleDeactivateSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "Деактивация записей",
      message: `Перевести в неактивные ${selectedIds.size} записей?`,
      confirmLabel: "Деактивировать",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const result = await batchUpdateActiveMutation.mutateAsync({
        tableName,
        ids: Array.from(selectedIds),
        isActive: false,
      });
      toast.success(`Деактивировано ${result.updated} записей из ${selectedIds.size} выбранных`);
      setSelectedIds(new Set());
      (utils as unknown as Record<string, DynamicUtils>)[routerKey]?.list?.invalidate?.();
      } catch (e: unknown) {
        toast.error("Ошибка: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
      }
  };

  const handleActivateSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "Активация записей",
      message: `Сделать активными ${selectedIds.size} записей?`,
      confirmLabel: "Активировать",
      variant: "default",
    });
    if (!ok) return;
    try {
      const result = await batchUpdateActiveMutation.mutateAsync({
        tableName,
        ids: Array.from(selectedIds),
        isActive: true,
      });
      toast.success(`Активировано ${result.updated} записей из ${selectedIds.size} выбранных`);
      setSelectedIds(new Set());
      (utils as unknown as Record<string, DynamicUtils>)[routerKey]?.list?.invalidate?.();
      } catch (e: unknown) {
        toast.error("Ошибка: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
      }
  };
  React.useEffect(() => {
    setSorting([{ id: 'id', desc: false }]);
    setPagination({ pageIndex: 0, pageSize: 10000 });
    setGlobalFilter("");
    setColumnFilters([]);
    setSelectedIds(new Set());
  }, [tableName]);

  const toggleSelectAll = React.useCallback(() => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }, [selectedIds, rows]);

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: "Удаление записей",
      message: `Удалить ${selectedIds.size} записей?`,
      confirmLabel: "Удалить",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const result = await deleteManyMutation.mutateAsync({
        tableName,
        ids: Array.from(selectedIds),
      });
      let message = `Удалено: ${result.deleted}`;
      if (result.errors.length > 0) {
        message += `\nНе удалось удалить: ${result.errors.length}\n${result.errors
          .map((e) => `ID ${e.id}: ${e.message}`)
          .join("\n")}`;
      }
      toast(message);
      setSelectedIds(new Set());
      (utils as unknown as Record<string, { list?: { invalidate?: () => void } }>)[routerKey]?.list?.invalidate?.()
    } catch (e: unknown) {
      toast.error("Ошибка: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const jsonStr = JSON.stringify(result.data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${tableName}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast.error("Нет данных для экспорта");
      }
    } catch (e: unknown) {
      toast.error("Ошибка экспорта: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        if (!Array.isArray(json)) throw new Error("Файл должен содержать массив объектов");
        const result = await importMutation.mutateAsync({ tableName, data: json });
        toast.success(
          `Импорт завершён:\nВсего: ${result.total}\nВставлено: ${result.inserted}\nОбновлено: ${result.updated}\nПропущено (совпадают): ${result.skipped}\nОшибок: ${result.errors.length}\n${result.errors.slice(0, 5).join("\n")}`
        );
        (utils as unknown as Record<string, { list?: { invalidate?: () => void } }>)[routerKey]?.list?.invalidate?.()
      } catch (e: unknown) {
        toast.error("Ошибка импорта: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const columns = React.useMemo<ColumnDef<BaseRow>[]>(() => {
    if (!metaExists) return [];

    const cols: ColumnDef<BaseRow>[] = [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={rows.length > 0 && selectedIds.size === rows.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={() => toggleSelectOne(row.original.id)}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
          />
        ),
        enableSorting: false,
        enableGlobalFilter: false,
      },
      {
        id: "index",
        header: "№",
        cell: () => null,
        enableSorting: false,
        enableGlobalFilter: false,
      },
    ];

    meta!.fields.forEach(field => {
      const columnDef: ColumnDef<BaseRow> = {
        id: field.dbName,
        accessorFn: (row) => row[field.dbName],
        header: () => (
          <div className="flex items-center">
            <span>{field.displayName}</span>
            <ColumnFilterPopover
              field={field}
              allValues={rows.map(row => row[field.dbName])}
              currentFilter={
                columnFilters.find(f => f.id === field.dbName)?.value as unknown[]
              }
              onFilterChange={(values) => {
                setColumnFilters(prev => {
                  const other = prev.filter(f => f.id !== field.dbName);
                  if (values && values.length > 0)
                    return [...other, { id: field.dbName, value: values }];
                  return other;
                });
              }}
            />
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (field.isFK && field.references) {
            return (
              <ForeignKeyCell
                table={field.references.table}
                id={value as number}
                displayField={field.references.displayField}
                dbTableName={field.references.dbTableName || tablesMeta[field.references.table]?.dbTableName}
              />
            );
          }
          if (value === null || value === undefined) return "—";
          return String(value);
        },
        enableSorting: true,
        filterFn: arrayFilterFn,
      };
      cols.push(columnDef);
    });

    cols.push({
      id: "actions",
      header: "Действия",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            aria-label={`Редактировать запись ${row.original.id}`}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            onClick={() => {
              setEditId(row.original.id);
              setShowForm(true);
            }}
          >
            Ред.
          </button>
          <button
            aria-label={`Удалить запись ${row.original.id}`}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            onClick={async () => {
              if (!deleteMutation || !deleteMutation.mutateAsync) {
                toast.error('Удаление недоступно');
                return;
              }
              const ok = await confirm({
                title: "Удаление записи",
                message: `Удалить запись с ID ${row.original.id}?`,
                confirmLabel: "Удалить",
                variant: "danger",
              });
              if (!ok) return;
              try {
                await deleteMutation.mutateAsync({ id: row.original.id });
                const dyn = (utils as unknown as Record<string, DynamicUtils>)[routerKey];
                const listCache = dyn?.list?.getData?.();
                if (listCache && Array.isArray(listCache)) {
                  const newData = listCache.filter((r: BaseRow) => r.id !== row.original.id);
                  dyn?.list?.setData?.(undefined, newData);
                } else {
                  dyn?.list?.invalidate?.();
                }
                } catch (e: unknown) {
                  toast.error("Ошибка: " + (e instanceof Error ? e.message : "Неизвестная ошибка"));
                }
            }}
          >
            Удалить
          </button>
        </div>
      ),
    });

    return cols;  
  }, [metaExists, meta, rows, selectedIds, toggleSelectAll, pagination.pageIndex, pagination.pageSize, columnFilters, deleteMutation, utils, routerKey]);

  React.useEffect(() => {
    const validIds = new Set(columns.map(col => col.id));
    const filtered = columnFilters.filter(f => validIds.has(f.id));
    if (filtered.length !== columnFilters.length) {
      setColumnFilters(filtered);
    }
  }, [columns, columnFilters]);
  
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "auto",
    filterFns: {
      arrayFilter: arrayFilterFn,
    },
  });

  if (!metaExists) {
    return <div>Таблица не найдена</div>;
  }

  if (isLoading) return <div className="p-6"><SkeletonTable rows={8} /></div>;
  if (isError && error) return <div className="text-red-500">Ошибка: {error.message}</div>;

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col overflow-y-auto">
      {/* Верхняя панель инструментов — прилипает к верху, не скроллится горизонтально */}
      <div className="sticky top-0 z-30 bg-background pb-2">
        <div className="mb-4 flex items-center gap-2">
          <input
            placeholder="Поиск по всем полям..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="max-w-sm rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button
            className="hover:bg-primary/90 rounded bg-primary px-3 py-1.5 text-sm text-white"
            onClick={() => {
              setEditId(null);
              setShowForm(true);
            }}
          >
            Добавить
          </button>
          <button
            className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
            onClick={handleExport}
            disabled={exportQuery.isFetching}
          >
            {exportQuery.isFetching ? "..." : "JSON-экспорт"}
          </button>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImport}
          />
          <button
            className="rounded bg-yellow-600 px-3 py-1.5 text-sm text-white hover:bg-yellow-700"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? "..." : "JSON-импорт"}
          </button>
          {selectedIds.size > 0 && (
            <button
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              onClick={handleDeleteSelected}
              disabled={deleteManyMutation.isPending}
            >
              {deleteManyMutation.isPending
                ? "Удаление..."
                : `Удалить выбранные (${selectedIds.size})`}
            </button>
          )}
          {selectedIds.size > 0 && hasActiveToggle && (
            <>
              <button
                className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700"
                onClick={handleDeactivateSelected}
                disabled={batchUpdateActiveMutation.isPending}
              >
                {batchUpdateActiveMutation.isPending ? "..." : `Деактивировать (${selectedIds.size})`}
              </button>
              <button
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                onClick={handleActivateSelected}
                disabled={batchUpdateActiveMutation.isPending}
              >
                {batchUpdateActiveMutation.isPending ? "..." : `Активировать (${selectedIds.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Таблица с горизонтальной прокруткой – панель не скроллится, шапка прилипает */}
      <div className="overflow-x-auto rounded border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead
            className="sticky z-20 bg-muted"
            style={{ top: "0px" }}
          >
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  let extraClasses = "";
                  if (header.column.id === "select") {
                    extraClasses = "sticky left-0 z-20 bg-muted w-10";
                  } else if (header.column.id === "index") {
                    extraClasses = "sticky left-[40px] z-20 bg-muted w-10";
                  } else if (header.column.id === "actions") {
                    extraClasses = "sticky right-0 z-20 bg-muted";
                  }
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${
                        header.column.getCanSort()
                          ? "hover:bg-muted/70 cursor-pointer select-none"
                          : ""
                      } ${extraClasses}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: " 🔼", desc: " 🔽" }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="min-h-[500px] divide-y divide-border bg-background">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-4 text-center align-middle text-sm text-muted-foreground"
                >
                  <div className="flex h-full min-h-[250px] items-center justify-center">
                    Нет данных
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => {
                const isSelected = selectedIds.has(row.original.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-muted/50 ${
                      row.original.isActive === false ? "bg-red-50 dark:bg-red-900/20" : ""
                    } ${isSelected ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                  >
                    {row.getVisibleCells().map(cell => {
                      if (cell.column.id === "index") {
                        return (
                          <td
                            key={cell.id}
                            className="sticky left-[40px] z-10 w-10 whitespace-nowrap bg-background px-4 py-2 text-xs text-muted-foreground"
                          >
                            {rowIndex + 1}
                          </td>
                        );
                      }

                      if (cell.column.id === "actions") {
                        let actionsBg = "bg-background";
                        if (row.original.isActive === false) {
                          actionsBg = "bg-red-50 dark:bg-red-900/20";
                        } else if (isSelected) {
                          actionsBg = "bg-gray-100 dark:bg-gray-800";
                        }
                        return (
                          <td
                            key={cell.id}
                            className={`sticky right-0 z-10 whitespace-nowrap px-4 py-2 text-sm text-foreground ${actionsBg}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      }

                      let cellExtraClasses = "";
                      if (cell.column.id === "select") {
                        cellExtraClasses = "sticky left-0 z-10 w-10 bg-background";
                        if (row.original.isActive === false) {
                          cellExtraClasses += " bg-red-50 dark:bg-red-900/20";
                        } else if (isSelected) {
                          cellExtraClasses += " bg-gray-100 dark:bg-gray-800";
                        }
                      }

                      return (
                        <td
                          key={cell.id}
                          className={`whitespace-nowrap px-4 py-2 text-sm text-foreground ${cellExtraClasses}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Страница {pagination.pageIndex + 1} из {table.getPageCount()}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded border border-border bg-background px-3 py-1 text-sm text-foreground disabled:opacity-50"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Назад
            </button>
            <button
              className="rounded border border-border bg-background px-3 py-1 text-sm text-foreground disabled:opacity-50"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Вперёд
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <RecordForm
          tableName={tableName}
          editId={editId}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditId(null);
            (utils as unknown as Record<string, DynamicUtils>)[routerKey]?.list?.invalidate?.();
          }}
        />
      )}
    </div>
  );
}