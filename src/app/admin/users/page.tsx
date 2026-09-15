"use client";
import { trpc } from "@/trpc/client";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirmContext } from "@/contexts/ConfirmContext";
import { PageSkeleton } from "@/components/ui/page_skeleton";

export default function UsersPage() {
  const [filterRole, setFilterRole] = useState<"teacher" | "student" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const utils = trpc.useUtils();
  const { confirm } = useConfirmContext();

  // Состояние для отображения результата сброса
  const [resetResult, setResetResult] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const { data, isLoading, error } = trpc.userManagement.getUsers.useQuery({
    role: filterRole,
  });

  // Новая мутация сброса логина и пароля
  const resetCredentialsMut = trpc.userManagement.resetUserPassword.useMutation({
    onSuccess: (data) => {
      setResetResult({
        email: data.newEmail,
        password: data.newPassword,
      });
      utils.userManagement.getUsers.invalidate();
    },
    onError: (e) => { toast.error(e.message) },
  });

  const handleResetCredentials = async (userId: string, fullName: string) => {
    const ok = await confirm({
      title: "Сброс логина и пароля",
      message: `Вы уверены, что хотите сбросить логин и пароль для ${fullName}? Новые данные будут показаны на экране.`,
      confirmLabel: "Сбросить",
      variant: "danger",
    });
    if (ok) {
      resetCredentialsMut.mutate({ userId });
    }
  };

  if (isLoading) return <PageSkeleton />;

  // Локальная фильтрация по поисковому запросу
  const filteredData = data?.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  return (
  <div className="mx-auto flex h-full max-w-5xl flex-col bg-background p-6 text-foreground">
    {/* Верхняя панель (не прокручивается) */}
    <div className="flex-shrink-0">
      <h1 className="mb-6 text-2xl font-bold">Управление пользователями</h1>

      {resetResult && (
        <div className="mb-4 rounded border border-green-400 bg-green-50 p-4 dark:bg-green-900/20">
          <p className="font-semibold text-green-800 dark:text-green-200">Новые логин и пароль</p>
          <p>Email: <strong>{resetResult.email}</strong></p>
          <p>Пароль: <strong>{resetResult.password}</strong></p>
          <button
            onClick={() => setResetResult(null)}
            className="mt-2 text-sm text-green-700 underline dark:text-green-300"
          >
            Скрыть
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Роль:</label>
        <select
          value={filterRole ?? ""}
          onChange={(e) =>
            setFilterRole(
              e.target.value === "teacher" || e.target.value === "student"
                ? e.target.value
                : undefined
            )
          }
          className="rounded border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="">Все</option>
          <option value="teacher">Преподаватель</option>
          <option value="student">Студент</option>
        </select>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Поиск по ФИО или email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-xs rounded border border-border bg-background px-3 py-1 text-sm"
        />
      </div>

      {error && <p className="text-red-500">Ошибка: {error.message}</p>}
    </div>

    {/* Прокручиваемая таблица */}
    {filteredData && (
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4">ФИО</th>
              <th className="py-2 pr-4">Email (логин)</th>
              <th className="py-2 pr-4">Роль</th>
              <th className="py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  {u.fullName}
                  {u.isSelf && (
                    <span className="ml-1 text-xs text-muted-foreground">(вы)</span>
                  )}
                </td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.role}</td>
                <td className="flex items-center gap-2 py-2">
                  {!u.isSelf && (
                    <button
                      onClick={() => handleResetCredentials(u.id, u.fullName)}
                      disabled={resetCredentialsMut.isPending}
                      className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      Сбросить логин и пароль
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
}