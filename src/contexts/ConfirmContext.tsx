/**
 * Глобальный контекст для вызова диалогов подтверждения действий.
 *
 * Оборачивает приложение (или его часть) в провайдер, который предоставляет
 * единственный метод `confirm()`. Этот метод возвращает `Promise<boolean>`,
 * который разрешается `true`, если пользователь нажал кнопку подтверждения,
 * и `false`, если отказался или закрыл диалог.
 *
 * ## Как использовать
 * 1. Обернуть корень приложения (или нужную часть) в `<ConfirmProvider>`.
 * 2. В любом вложенном компоненте вызвать `const { confirm } = useConfirmContext()`.
 * 3. Вызвать `confirm({ title?, message, confirmLabel?, cancelLabel?, variant? })`
 *    и дождаться результата.
 *
 * ## Пример
 * ```tsx
 * const ok = await confirm({
 *   title: "Удаление записи",
 *   message: "Вы уверены? Это действие необратимо.",
 *   confirmLabel: "Удалить",
 *   variant: "danger",
 * });
 * if (!ok) return;
 * // выполнить удаление
 * ```
 *
 * ## Внутреннее устройство
 * - Контекст создаётся через `createContext`.
 * - Провайдер использует хук `useConfirm`, который управляет состоянием диалога:
 *   `isOpen`, `options` (переданные параметры), а также колбэки `handleConfirm`
 *   и `handleCancel`.
 * - Когда `confirm()` вызывается, хук открывает диалог и сохраняет `resolve`
 *   и `reject` промиса. При нажатии кнопки «Подтвердить» вызывается `handleConfirm`,
 *   промис разрешается `true`, диалог закрывается. При отмене (Escape, клик вне,
 *   кнопка «Отмена») промис разрешается `false`.
 * - Визуально диалог рендерится компонентом `ConfirmDialog` поверх остального
 *   интерфейса.
 *
 * ## Ограничения
 * - Одновременно может быть открыт только один диалог подтверждения (повторный
 *   вызов `confirm()` пока предыдущий не завершён, перезапишет его).
 * - Хук `useConfirmContext` выбросит ошибку, если использован вне провайдера.
 */
"use client";
import { createContext, useContext, ReactNode } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ConfirmContextType {
  confirm: (opts: { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; variant?: "danger" | "default" }) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { isOpen, options, confirm, handleConfirm, handleCancel } = useConfirm();

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <ConfirmDialog
          open={isOpen}
          onOpenChange={handleCancel}
          title={options.title}
          message={options.message}
          confirmLabel={options.confirmLabel}
          cancelLabel={options.cancelLabel}
          variant={options.variant}
          onConfirm={handleConfirm}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmContext() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirmContext must be used within ConfirmProvider");
  return context;
}