/**
 * Отображает значение внешнего ключа в таблицах CRUD, заменяя числовой ID
 * на читаемое имя из связанной таблицы.
 *
 * ## Как работает
 * 1. По `table` (ключу из `tablesMeta`) определяется `routerKey` связанной таблицы.
 * 2. Через `router.get.useQuery({ id })` загружается одна запись.
 * 3. Если данные загружены, из них извлекается значение поля `displayField`
 *    (например, `"name"` или `"display"`). Если поля нет, используется `id`.
 * 4. Результат оборачивается в компонент `EntityTooltip`, который при наведении
 *    показывает дополнительную информацию о связанной сущности.
 *
 * ## Состояния
 * - `id === null / undefined` → прочерк «—».
 * - `isLoading` → троеточие «...».
 * - Ошибка загрузки или нет данных → красный знак «???».
 * - Если `routerKey` не найден в метаданных → просто отображается числовой `id`.
 *
 * ## Использование
 * Компонент используется в `DataTable` для каждой ячейки с внешним ключом.
 * Он избавляет от необходимости загружать все связанные данные заранее —
 * подгрузка происходит лениво, только для видимых строк.
 *
 * @param table - ключ из `tablesMeta` для связанной таблицы (например, `"employees"`).
 * @param id - числовой идентификатор связанной записи.
 * @param displayField - имя поля, значение которого показывается пользователю
 *   (например, `"display"`, `"name"`, `"number"`).
 */
"use client";
import { trpc } from "@/trpc/client";
import { tablesMeta } from "@/lib/table-meta";
import { EntityTooltip } from "@/components/EntityTooltip";

interface ForeignKeyCellProps {
  table: string;
  id: number;
  displayField: string;
  dbTableName?: string
}

interface ReadonlyRouter {
  get: {
    useQuery: (input: { id: number }, opts?: unknown) => {
      data?: Record<string, unknown> | null;
      isLoading: boolean;
    };
  };
}

export function ForeignKeyCell({ table, id, displayField }: ForeignKeyCellProps) {
  if (id === undefined || id === null) return <>—</>;

  const meta = tablesMeta[table];
  const routerKey = meta?.routerKey;

  if (!routerKey) {
    return <span>{id}</span>;
  }

  const router = (trpc as unknown as Record<string, ReadonlyRouter>)[routerKey] as ReadonlyRouter | undefined;
  const { data, isLoading } = router?.get?.useQuery?.({ id }, { enabled: !!id }) ?? { data: null, isLoading: false };

  if (isLoading) return <span className="text-muted-foreground">...</span>;
  if (!data) return <span className="text-red-500 dark:text-red-400">???</span>;

  const displayValue = data[displayField] !== undefined && data[displayField] !== null
    ? String(data[displayField])
    : String(data.id ?? id);

  return (
    <EntityTooltip tableName={table} id={id}>
      {displayValue}
    </EntityTooltip>
  );
}