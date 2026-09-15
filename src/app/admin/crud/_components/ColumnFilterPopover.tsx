/**
 * Всплывающий фильтр для одного столбца таблицы.
 *
 * Отображается как иконка 🔍 в заголовке колонки внутри {@link DataTable}.
 * Позволяет временно **скрыть** строки с определёнными значениями в этом столбце.
 * В отличие от обычных фильтров, где выбирают "что показать", здесь выбирают
 * **"что спрятать"** – это сделано для удобства работы с длинными списками,
 * где нужно убрать только пару мешающих значений.
 *
 * ## Как пользоваться (с точки зрения администратора)
 * 1. Нажать на иконку 🔍 в заголовке нужного столбца.
 * 2. В появившемся окошке отображаются все уникальные значения этого столбца
 *    (например, все фамилии преподавателей или названия кафедр).
 * 3. Рядом с каждым значением стоит **галочка**. Изначально галочки стоят везде –
 *    это значит, что все значения видны.
 * 4. Чтобы скрыть строки с каким-то значением, нужно **снять галочку** напротив него.
 *    Скрытые значения собираются в список "исключённых".
 * 5. Таблица мгновенно обновляется – строки с исключёнными значениями исчезают.
 * 6. Можно исключить несколько значений одновременно.
 * 7. Кнопка «Сбросить все» возвращает все галочки и показывает все строки.
 * 8. Внизу окошка показан счётчик: сколько значений видимо из общего количества
 *    (например, "7 / 10" означает, что 3 значения исключены).
 *
 * ## Пример
 * В столбце «Кафедра» есть значения: ЭВМ, ПМИ, ИБ, АСУ. Администратор хочет
 * временно не видеть строки, относящиеся к кафедрам ПМИ и ИБ. Он открывает
 * фильтр, снимает галочки с "ПМИ" и "ИБ", и таблица показывает только записи
 * для ЭВМ и АСУ. При этом данные не удаляются – фильтр можно сбросить в любой
 * момент.
 *
 * ## Логика работы компонента
 * 1. При открытии попап получает массив `allValues` – все значения поля из
 *    загруженных строк (может содержать дубликаты).
 * 2. Из них формируется отсортированный список уникальных значений `uniqueIds`.
 * 3. Если поле является внешним ключом (FK), вместо числовых ID пользователь
 *    видит осмысленные имена из связанной таблицы (через `labelMap`). Например,
 *    вместо `teacherId = 5` отображается "Иванов И.И.".
 * 4. Состояние фильтра хранится в родительском `DataTable` как массив
 *    `excludedSet` (исключённые ID). При каждом изменении чекбокса этот
 *    массив обновляется через `onFilterChange`.
 * 5. Поисковая строка внутри попапа фильтрует список уникальных значений по
 *    подстроке (удобно, когда значений много).
 * 6. При закрытии попапа состояние фильтра сохраняется – исключения продолжают
 *    действовать.
 *
 * ## Взаимодействие с DataTable
 * - DataTable использует функцию-фильтр `arrayFilterFn`, которая принимает
 *   массив исключённых значений и скрывает строки, где значение поля попало
 *   в этот массив.
 * - Если фильтр сброшен (`onFilterChange(undefined)`), в колонке не применяется
 *   никакой фильтр, и `arrayFilterFn` возвращает `true` для всех строк.
 *
 * ## Визуальные состояния
 * - **Закрыт**: только иконка 🔍.
 * - **Открыт**: попап с полем поиска, списком чекбоксов, кнопкой «Сбросить все»
 *   и счётчиком.
 * - **Нет значений**: если `filteredItems` пуст (после поиска), отображается
 *   "Нет значений".
 * - **FK-поле**: вместо ID показываются имена из связанной таблицы; если связные
 *   данные ещё не загружены, отображаются ID.
 *
 * @param field - метаданные поля из `tablesMeta.fields`. Содержат информацию о том,
 *   является ли поле внешним ключом и как его отображать.
 * @param allValues - массив всех значений этого поля во всех строках таблицы
 *   (может содержать дубликаты и null).
 * @param currentFilter - текущий массив исключённых значений, хранящийся в
 *   состоянии DataTable. Если `undefined` – фильтр не активен.
 * @param onFilterChange - колбэк, вызываемый при изменении фильтра. Получает
 *   новый массив исключённых значений или `undefined` (сброс).
 */
"use client";
import { useState, useMemo } from "react";
import { trpc } from "@/trpc/client";
import { tablesMeta, type FieldMeta } from "@/lib/table-meta";

interface ColumnFilterPopoverProps {
  field: FieldMeta;
  allValues: unknown[];
  currentFilter: unknown[] | undefined;
  onFilterChange: (excludedValues: unknown[] | undefined) => void;
}

export function ColumnFilterPopover({
  field,
  allValues,
  currentFilter,
  onFilterChange,
}: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const relatedMeta = field.isFK && field.references
    ? tablesMeta[field.references.table]
    : null;

  const { data: relatedData } = relatedMeta?.routerKey
    ? ((trpc as unknown as Record<string, { list: { useQuery: (input?: unknown) => { data?: Record<string, unknown>[]; isLoading?: boolean } } }>)[relatedMeta.routerKey])?.list?.useQuery?.(undefined) ?? { data: [] as Record<string, unknown>[] }
    : { data: [] as Record<string, unknown>[] };

  const labelMap = useMemo(() => {
    if (!relatedData || !field.references) return null;
    const map = new Map<unknown, string>();
    for (const row of relatedData) {
      const display = row[field.references.displayField];
      map.set(row.id, display !== undefined && display !== null ? String(display) : String(row.id));
    }
    return map;
  }, [relatedData, field.references]);

  const uniqueIds = useMemo(
    () => [...new Set(allValues.filter(v => v != null))].sort((a, b) =>
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
    ),
    [allValues]
  );

  const excludedSet = useMemo(() => new Set(currentFilter || []), [currentFilter]);

  const handleToggle = (id: unknown) => {
    const newExcluded = new Set(excludedSet);
    if (newExcluded.has(id)) {
      newExcluded.delete(id);
    } else {
      newExcluded.add(id);
    }
    onFilterChange(newExcluded.size > 0 ? Array.from(newExcluded) : undefined);
  };

  const handleReset = () => {
    onFilterChange(undefined);
  };

  const filteredItems = useMemo(() => {
    if (!search) return uniqueIds;
    return uniqueIds.filter(id => {
      const label = labelMap ? (labelMap.get(id) ?? String(id)) : String(id);
      return label.toLowerCase().includes(search.toLowerCase());
    });
  }, [uniqueIds, search, labelMap]);

  const getDisplay = (id: unknown) => {
    if (labelMap) return labelMap.get(id) ?? String(id);
    return String(id);
  };

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  return (
    <div className="relative ml-1 inline-block">
      <button
        type="button"
        onClick={handleOpenClick}
        aria-label="Открыть фильтр"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        🔍
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-background p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Фильтр</span>
            <button onClick={() => setOpen(false)} className="px-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Закрыть фильтр">
              ✕
            </button>
          </div>
          <input
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filteredItems.map(id => (
              <label key={String(id)} className="hover:bg-muted/50 flex cursor-pointer items-center space-x-2 rounded px-1 py-0.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={!excludedSet.has(id)}
                  onChange={() => handleToggle(id)}
                />
                <span className="truncate">{getDisplay(id)}</span>
              </label>
            ))}
            {filteredItems.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет значений</div>
            )}
          </div>
          <div className="mt-2 flex justify-between">
            <button
              onClick={handleReset}
              className="hover:text-primary/90 text-xs text-primary"
            >
              Сбросить все
            </button>
            <span className="text-xs text-muted-foreground">
              {uniqueIds.length - excludedSet.size} / {uniqueIds.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}