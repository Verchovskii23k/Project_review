"use client";
import { trpc } from "@/trpc/client";
import { useState } from "react";
import { useConfirmContext } from "@/contexts/ConfirmContext";
type SecurityLevel = "low" | "medium" | "high";

export default function CredentialsPage() {
  const { confirm } = useConfirmContext();
  const [error, setError] = useState<string | null>(null);
  const [credSecurity, setCredSecurity] = useState<SecurityLevel>("medium");
  const [credLength, setCredLength] = useState<number>(16);
  const [credTargets, setCredTargets] = useState({
    employees: true,
    students: true,
  });
  const [credResult, setCredResult] = useState<{
    count: number;
    credentials: { fullName: string; email: string; password: string; role: string }[];
  } | null>(null);

  const credMut = trpc.generations.generateCredentials.useMutation({
    onSuccess: (data) => setCredResult(data),
    onError: (e) => setError(e.message),
  });

  const clearAllMut = trpc.generations.clearAllCredentials.useMutation({
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (e) => setError(e.message),
  });

  const downloadCredentials = () => {
    if (!credResult) return;
    const header = "ФИО;Email;Пароль;Роль\n";
    const rows = credResult.credentials
      .map((c) => `${c.fullName};${c.email};${c.password};${c.role}`)
      .join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto bg-background p-6 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">Генерация логинов и паролей</h1>
      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">Параметры</h2>
        <div className="mb-3 flex flex-wrap gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Уровень защиты</label>
            <select
              value={credSecurity}
              onChange={(e) => setCredSecurity(e.target.value as SecurityLevel)}
              className="ml-2 rounded border border-border bg-background px-2 py-1 text-foreground"
            >
              <option value="low">Низкий (случайный 10 символов)</option>
              <option value="medium">Средний (случайный 12 символов)</option>
              <option value="high">Высокий (заданная длина, спецсимволы)</option>
            </select>
          </div>
          {credSecurity === "high" && (
            <div>
              <label className="text-sm text-muted-foreground">Длина логина</label>
              <input
                type="number"
                min={6}
                max={32}
                value={credLength}
                onChange={(e) => setCredLength(Number(e.target.value))}
                className="ml-2 w-20 rounded border border-border bg-background px-2 py-1 text-foreground"
              />
            </div>
          )}
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1 text-sm text-foreground">
              <input
                type="checkbox"
                checked={credTargets.employees}
                onChange={(e) =>
                  setCredTargets({ ...credTargets, employees: e.target.checked })
                }
              />
              Сотрудники
            </label>
            <label className="flex items-center gap-1 text-sm text-foreground">
              <input
                type="checkbox"
                checked={credTargets.students}
                onChange={(e) =>
                  setCredTargets({ ...credTargets, students: e.target.checked })
                }
              />
              Студенты
            </label>
          </div>
        </div>

        <button
          className="hover:bg-primary/90 rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
          onClick={() =>
            credMut.mutate({
              securityLevel: credSecurity,
              loginLength: credSecurity === "high" ? credLength : undefined,
              generateFor: [
                ...(credTargets.employees ? ["employees" as const] : []),
                ...(credTargets.students ? ["students" as const] : []),
              ],
            })
          }
          disabled={credMut.isPending || (!credTargets.employees && !credTargets.students)}
        >
          {credMut.isPending ? "Генерация..." : "Сгенерировать"}
        </button>

        {credResult && (
          <div className="mt-4 rounded border border-border bg-muted p-3">
            <p className="mb-2 text-sm">
              Создано записей: <strong>{credResult.count}</strong>
            </p>
            <div className="mb-3 max-h-48 overflow-y-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>ФИО</th>
                    <th>Email (логин)</th>
                    <th>Пароль</th>
                    <th>Роль</th>
                  </tr>
                </thead>
                <tbody>
                  {credResult.credentials.map((c, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 pr-2">{c.fullName}</td>
                      <td className="py-1 pr-2">{c.email}</td>
                      <td className="py-1 pr-2">{c.password}</td>
                      <td className="py-1">{c.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={downloadCredentials}
              className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
            >
              Скачать CSV
            </button>
          </div>
        )}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-background p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-red-600">Опасная зона</h2>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: "Сброс всех учётных записей",
              message: "Удалить ВСЕ учётные записи (логины/пароли) студентов и сотрудников? Это действие нельзя отменить!",
              confirmLabel: "Удалить всё",
              variant: "danger",
            });
            if (ok) clearAllMut.mutate();
          }}
          disabled={clearAllMut.isPending}
          className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {clearAllMut.isPending ? "Удаление..." : "Сбросить все учётные записи"}
        </button>
      </div>
    </div>
  );
}