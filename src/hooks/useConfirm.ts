/**
 * Хук для асинхронного вызова диалога подтверждения действия.
 *
 * Позволяет в любом компоненте вызвать модальное окно подтверждения
 * и дождаться ответа пользователя в виде `Promise<boolean>`.
 *
 * ## Как это работает
 * 1. Компонент (или хук верхнего уровня) вызывает `confirm(options)`.
 * 2. Внутри создаётся новый `Promise`, его функция `resolve` сохраняется
 *    в состоянии `resolveRef`.
 * 3. Устанавливаются `options` (текст, заголовок, вариант кнопки) и флаг
 *    `isOpen = true` – это приводит к открытию диалога `ConfirmDialog`.
 * 4. Когда пользователь нажимает кнопку «Подтвердить», вызывается
 *    `handleConfirm`, который:
 *    - вызывает сохранённый `resolve(true)`,
 *    - закрывает диалог (`isOpen = false`).
 * 5. Когда пользователь нажимает «Отмена», закрывает диалог (Escape, клик
 *    вне окна), вызывается `handleCancel`, который:
 *    - вызывает `resolve(false)`,
 *    - закрывает диалог.
 * 6. Вызывающий код получает `true` или `false` и продолжает выполнение.
 *
 * ## Почему `resolve` хранится в состоянии, а не в ref
 * В данной реализации используется `useState` для `resolveRef`. Это сделано
 * для совместимости с рендерингом React и избежания проблем с устаревшими
 * замыканиями в колбэках. Несмотря на то, что `useRef` кажется более
 * очевидным для хранения мутируемого значения, `useState` гарантирует
 * актуальность функции при каждом рендере.
 *
 * ## Возвращаемые значения
 * - `isOpen: boolean` – открыт ли диалог в данный момент.
 * - `options: ConfirmOptions | null` – параметры текущего диалога.
 * - `confirm: (opts) => Promise<boolean>` – функция для вызова диалога.
 * - `handleConfirm: () => void` – внутренний обработчик подтверждения.
 * - `handleCancel: () => void` – внутренний обработчик отмены.
 *
 * ## Пример использования
 * ```tsx
 * const { confirm } = useConfirm();
 * const handleDelete = async () => {
 *   const ok = await confirm({
 *     title: "Удаление",
 *     message: "Удалить запись?",
 *     variant: "danger",
 *   });
 *   if (ok) { ... }
 * };
 * ```
 */
import { useState, useCallback } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolveRef(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef) {
      resolveRef(true);
      setIsOpen(false);
    }
  }, [resolveRef]);

  const handleCancel = useCallback(() => {
    if (resolveRef) {
      resolveRef(false);
      setIsOpen(false);
    }
  }, [resolveRef]);

  return {
    isOpen,
    options,
    confirm,
    handleConfirm,
    handleCancel,
  };
}