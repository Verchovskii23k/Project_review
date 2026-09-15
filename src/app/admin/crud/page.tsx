"use client";
import { useState, useEffect } from "react";
import { tableNames, tablesMeta, TABLE_CATEGORIES } from "@/lib/table-meta";
import { DataTable } from "./_components/DataTable";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TABLE_ICONS: Record<string, string> = {
  institutes: "🏛️",
  buildings: "🏗️",
  departments: "🏢",
  specialties: "🦾",
  profiles: "👤",
  disciplines: "📚",
  unitTypes: "📊",
  lessonTypes: "🎓",
  classrooms: "🚪",
  employees: "👨‍🏫",
  students: "👩‍🎓",
  studyGroups: "👥",
  units: "📦",
  lessons: "📝",
  curriculum: "📅",
  lessonClassrooms: "🔗",
  unitRoots: "🌱",
  curriculumProfiles: "📋",
  academicLoadTypes: "⚖️",
  controlTypes: "✅",
  hourTypeMapping: "🔄",
  employeesDepartments: "👔",
  disciplineTeachers: "👩‍🏫",
  daysOfWeek: "📆",
  pairs: "🔢",
  weeks: "📅",
  educationLevels: "📈",
  educationForms: "📒",
  education: "📜",
  positions: "💼",
  employmentTypes: "🕒",
};

function SortableItem({
  id,
  label,
  icon,
  isActive,
  onClick,
}: {
  id: string;
  label: string;
  icon?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-center gap-2 rounded px-3 py-2 ${
        isActive
          ? "bg-primary text-white"
          : "hover:bg-muted/70 text-foreground"
      }`}
    >
      <span className="cursor-grab select-none text-muted-foreground">⠿</span>
      {icon && <span className="text-base leading-none">{icon}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex-1 text-left"
      >
        {label}
      </button>
    </li>
  );
}

function getDefaultOrderForCategory(category: string): string[] {
  return tableNames
    .filter(t => tablesMeta[t.key]?.category === category)
    .map(t => t.key)
    .sort((a, b) => {
      const labelA = tableNames.find(t => t.key === a)?.label ?? a;
      const labelB = tableNames.find(t => t.key === b)?.label ?? b;
      return labelA.localeCompare(labelB, "ru");
    });
}

function CategorySection({
  category,
  selectedTable,
  onSelectTable,
}: {
  category: string;
  selectedTable: string | null;
  onSelectTable: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const storageKey = `crud_order_${category}`;

  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return getDefaultOrderForCategory(category);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const allKeys = tableNames.filter(t => tablesMeta[t.key]?.category === category).map(t => t.key);
        const missing = allKeys.filter(k => !parsed.includes(k));
        return [...parsed.filter((k: string) => allKeys.includes(k)), ...missing];
      } catch {
        return getDefaultOrderForCategory(category);
      }
    }
    return getDefaultOrderForCategory(category);
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(order));
  }, [order, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = typeof active.id === 'string' ? active.id : String(active.id);
    const overId = typeof over.id === 'string' ? over.id : String(over.id);

    setOrder((items) => {
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const items = order
    .map(key => {
      const meta = tableNames.find(t => t.key === key);
      if (!meta) return null;
      return { key, label: meta.label, icon: TABLE_ICONS[key] ?? "📄" };
    })
    .filter((item): item is { key: string; label: string; icon: string } => item !== null);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-1 flex w-full items-center justify-between text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <span>{TABLE_CATEGORIES[category] || category}</span>
        <span className="text-xs">{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(i => i.key)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {items.map(item => (
                <SortableItem
                  key={item.key}
                  id={item.key}
                  label={item.label}
                  icon={item.icon}
                  isActive={selectedTable === item.key}
                  onClick={() => onSelectTable(item.key)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

export default function AdminCrudPage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const handleSelectTable = (tableKey: string) => {
    setSelectedTable(tableKey);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-64 overflow-y-auto border-r border-border bg-muted p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Таблицы</h2>
        {(["reference", "people", "generated"] as const).map(category => (
          <CategorySection
            key={category}
            category={category}
            selectedTable={selectedTable}
            onSelectTable={handleSelectTable}
          />
        ))}
      </aside>
      <main className="flex-1 overflow-auto bg-background p-6">
        {selectedTable ? (
          <>
            <DataTable key={selectedTable} tableName={selectedTable} />
          </>
        ) : (
          <div className="mt-10 text-center text-muted-foreground">
            Выберите таблицу для просмотра и редактирования
          </div>
        )}
      </main>
    </div>
  );
}