/**
 * Всплывающая подсказка с полной информацией о записи из любой таблицы,
 * описанной в {@link tablesMeta}.
 *
 * Отображается при клике на значение внешнего ключа в {@link ForeignKeyCell}.
 * Вместо сухого числа (ID) пользователь видит компактное читаемое значение
 * (например, фамилию преподавателя), а при клике на него открывается карточка
 * со **всеми полями** связанной записи. Вложенные внешние ключи, в свою очередь,
 * тоже становятся кликабельными и открывают следующие подсказки — получается
 * "бесконечная" навигация по цепочке связанных сущностей.
 *
 * ## Как работает
 * 1. При клике на значение-триггер (`children`) отправляется запрос
 *    `trpc.lookup.getRow` с параметрами `tableName` и `id`.
 * 2. Запрос выполняется **только при открытии** тултипа (`enabled: show`) и
 *    кэшируется на 60 секунд (`staleTime: 60_000`).
 * 3. Пока данные грузятся, отображается скелетон. Если запись не найдена —
 *    сообщение "Не найдено". Если всё хорошо — карточка с перечнем полей.
 * 4. Каждое поле выводится в формате "название: значение". Для полей-внешних
 *    ключей значение рендерится как вложенный `EntityTooltip`, позволяя
 *    проваливаться дальше.
 * 5. Тултип позиционируется справа от триггера, а если не помещается — слева,
 *    сверху или снизу (адаптивно, с учётом границ окна).
 * 6. Закрывается при повторном клике на триггер или при клике в любом месте
 *    за пределами тултипа и триггера.
 *
 * ## Параметры
 * @param tableName - ключ из `tablesMeta` для таблицы, запись которой нужно показать.
 * @param id - идентификатор записи.
 * @param children - содержимое, по клику на которое открывается тултип (обычно
 *   строка с читаемым значением, переданная из `ForeignKeyCell`).
 *
 * ## Состояния
 * - **Нет метаданных** (tableName не найден в `tablesMeta`) — просто отображаются
 *   children без тултипа.
 * - **Загрузка** — скелетон внутри карточки.
 * - **Ошибка / нет данных** — красный текст "Не найдено".
 *
 * ## Примечания
 * - Использует фиксированное позиционирование (`position: fixed`) с динамическим
 *   расчётом координат на основе размеров триггера и тултипа.
 * - Максимальная высота тултипа ограничена 80% высоты экрана, ширина — 90vw,
 *   минимальная — 240px.
 * - Рекурсивное отображение вложенных тултипов теоретически может привести к
 *   глубокой вложенности, но на практике ограничено разумным количеством связей.
 */
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/trpc/client";
import { tablesMeta } from "@/lib/table-meta";
import { Skeleton } from "./ui/skeleton";

interface EntityTooltipProps {
  tableName: string;
  id: number;
  children: React.ReactNode;
}

export function EntityTooltip({ tableName, id, children }: EntityTooltipProps) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({});
  const meta = tablesMeta[tableName];
  const { data, isLoading } = trpc.lookup.getRow.useQuery(
    { tableName: meta?.dbTableName ?? "", id },
    { enabled: show, staleTime: 60_000 }
  );

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShow(prev => !prev);
  }, []);

  useEffect(() => {
    if (!show) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [show]);

  useEffect(() => {
    if (!show || !triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;

    const updatePosition = () => {
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const gap = 4;

      let left = triggerRect.right + gap;
      let top = triggerRect.top;

      if (left + tooltipRect.width > window.innerWidth - gap) {
        left = triggerRect.left - tooltipRect.width - gap;
        if (left < gap) left = window.innerWidth - tooltipRect.width - gap;
      }

      if (top + tooltipRect.height > window.innerHeight - gap) {
        top = triggerRect.bottom - tooltipRect.height - gap;
        if (top < gap) top = window.innerHeight - tooltipRect.height - gap;
      }

      if (left < gap) left = gap;
      if (top < gap) top = gap;

      setPosStyle({
        position: "fixed",
        left,
        top,
        zIndex: 50,
      });
    };

    requestAnimationFrame(updatePosition);
  }, [show, data]);

  if (!meta) return <>{children}</>;

  const renderFieldValue = (field: typeof meta.fields[number], row: Record<string, unknown>) => {
    if (field.isFK && row[field.dbName] != null) {
      return (
        <EntityTooltip
          tableName={field.references!.table}
          id={row[field.dbName] as number}
        >
          <span className="cursor-pointer font-medium text-blue-600 hover:bg-blue-100">
            {String(row[field.dbName])}
          </span>
        </EntityTooltip>
      );
    }
    return <span>{row[field.dbName] !== undefined ? String(row[field.dbName]) : "—"}</span>;
  };

  return (
    <span ref={triggerRef} className="relative inline-block">
      <span
        onClick={handleToggle}
        className="cursor-pointer select-none font-medium text-blue-600 hover:bg-blue-100"
      >
        {children}
      </span>
      {show && (
        <div
          ref={tooltipRef}
          style={posStyle}
          className="max-h-[80vh] min-w-[240px] max-w-[90vw] overflow-y-auto rounded-md border border-gray-300 bg-white p-2 text-sm shadow-lg"
        >
          <div className="mb-1 font-semibold">{meta.nameRu}</div>
          {isLoading && <Skeleton className="my-1 h-4 w-24" />}
          {data === null && <div className="text-red-500">Не найдено</div>}
          {data && typeof data === 'object' ? (
            meta.fields.map((field) => (
              <div key={field.dbName} className="flex justify-between gap-4">
                <span className="text-gray-600">{field.displayName}:</span>
                {renderFieldValue(field, data as Record<string, unknown>)}
              </div>
            ))
          ) : null}
        </div>
      )}
    </span>
  );
}