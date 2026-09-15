/**
 * ## Глобальный контекст активной версии расписания
 *
 * Предоставляет состояние `selectedVersionId` и функцию для его изменения
 * всем страницам администрирования. Используется на странице расписания
 * и странице генераторов для согласованного управления версиями.
 *
 * ### Экспортируемые элементы
 * - `VersionProvider` – компонент-обёртка, монтируется в корневом `layout.tsx`.
 * - `useSelectedVersionId()` – хук, возвращающий `{ selectedVersionId, setSelectedVersionId }`.
 *
 * ### Модель
 * - `selectedVersionId === null` – «Чистый лист» (активной версии нет).
 * - `selectedVersionId !== null` – ID активной сохранённой версии.
 */
"use client";
import { createContext, useContext, useState, ReactNode } from "react";

type VersionContextType = {
  selectedVersionId: number | null;
  setSelectedVersionId: (id: number | null) => void;
};

const VersionContext = createContext<VersionContextType>({
  selectedVersionId: null,
  setSelectedVersionId: () => {},
});

export function VersionProvider({ children }: { children: ReactNode }) {
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  return (
    <VersionContext.Provider value={{ selectedVersionId, setSelectedVersionId }}>
      {children}
    </VersionContext.Provider>
  );
}

export function useSelectedVersionId() {
  return useContext(VersionContext);
}