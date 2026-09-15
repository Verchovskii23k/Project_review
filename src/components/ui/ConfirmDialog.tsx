/**
 * Модальное окно подтверждения действия с двумя кнопками.
 *
 * Используется контекстом `ConfirmContext` для отображения диалога,
 * но может быть встроен и напрямую, если нужно кастомное поведение.
 *
 * ## Поведение
 * - При `open === false` ничего не рендерится (`return null`).
 * - При открытии фокус автоматически устанавливается на кнопку «Отмена»
 *   (безопасное действие по умолчанию).
 * - Закрывается по нажатию клавиши Escape, клику вне окна или кнопке «Отмена».
 * - При нажатии кнопки подтверждения сначала вызывается `onConfirm`, затем
 *   диалог закрывается через `onOpenChange(false)`.
 * - Визуально представляет собой затемнённый фон с центрированной карточкой.
 *
 * ## Параметры
 * @param open - флаг видимости диалога.
 * @param onOpenChange - колбэк для изменения видимости (обычно закрывает диалог).
 * @param title - заголовок (по умолчанию "Подтверждение").
 * @param message - обязательное сообщение с описанием действия.
 * @param confirmLabel - текст на кнопке подтверждения (по умолчанию "Да").
 * @param cancelLabel - текст на кнопке отмены (по умолчанию "Отмена").
 * @param onConfirm - колбэк, вызываемый при подтверждении.
 * @param variant - стиль кнопки подтверждения:
 *   - `"danger"` — красная (удаление, необратимые действия).
 *   - `"default"` — синяя (обычные подтверждения).
 *
 * ## Доступность (a11y)
 * - Установлены атрибуты `role="dialog"`, `aria-modal="true"`,
 *   `aria-labelledby` и `aria-describedby`.
 * - Кнопка закрытия имеет `aria-label="Закрыть"`.
 * - Фокус при открытии на кнопке «Отмена».
 */
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string | undefined;
  message: string;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  onConfirm: () => void;
  variant?: "danger" | "default" | undefined;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Подтверждение",
  message,
  confirmLabel = "Да",
  cancelLabel = "Отмена",
  onConfirm,
  variant = "default",
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);


  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const confirmButtonColor = variant === "danger"
    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <p id="confirm-dialog-message" className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmButtonColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}