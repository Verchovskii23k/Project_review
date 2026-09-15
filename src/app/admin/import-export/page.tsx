"use client";
import { trpc } from "@/trpc/client";
import { useState } from "react";
import { toast } from "sonner";

export default function ImportExportPage() {
  const [importResult, setImportResult] = useState<Record<
    string,
    { inserted: number; updated: number; skipped: number; errors: string[] }
  > | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const exportQuery = trpc.globalImportExport.exportAll.useQuery(undefined, {
    enabled: false,
  });

  const importMutation = trpc.globalImportExport.importAll.useMutation({
    onSuccess: (data) => {
      setImportResult(data);

      let totalInserted = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const errorTables: string[] = [];

      for (const [table, stats] of Object.entries(data)) {
        totalInserted += stats.inserted;
        totalUpdated += stats.updated;
        if (stats.errors.length > 0) {
          totalErrors += stats.errors.length;
          errorTables.push(table);
        }
      }

      if (totalErrors === 0) {
        toast.success(`Импорт завершён. Вставлено: ${totalInserted}, обновлено: ${totalUpdated}.`);
      } else {
        toast.error(
          `Импорт завершён с ошибками. Вставлено: ${totalInserted}, обновлено: ${totalUpdated}. Ошибок: ${totalErrors} (таблицы: ${errorTables.join(", ")}).`
        );
      }
      setIsImporting(false);
    },
    onError: (error) => {
      toast.error(`Ошибка импорта: ${error.message}`);
      setIsImporting(false);
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const json = JSON.stringify(result.data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "backup.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Экспорт выполнен – файл backup.json скачан");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Неизвестная ошибка";
      toast.error(`Ошибка экспорта: ${message}`);
    }
    setIsExporting(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') {
          toast.error('Ошибка чтения файла: неверный формат');
          setIsImporting(false);
          return;
        }
        const data = JSON.parse(result);
        await importMutation.mutateAsync(data);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Неизвестная ошибка";
        toast.error(`Ошибка импорта: ${message}`);
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto bg-background p-6 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">Импорт / Экспорт данных</h1>

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-muted p-4">
          <h2 className="mb-2 text-lg font-semibold">Экспорт справочников</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Скачать все справочные таблицы в формате JSON (исключая расписание, занятия и учётные записи).
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isExporting ? "Экспорт..." : "Скачать JSON"}
          </button>
        </section>

        <section className="rounded-lg border border-border bg-muted p-4">
          <h2 className="mb-2 text-lg font-semibold">Импорт справочников</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Загрузите JSON-файл, экспортированный из этой системы. <br />
            <strong>Внимание:</strong> дубликаты в таблицах сотрудников и студентов будут созданы заново.
            Остальные записи обновятся при совпадении уникальных полей.
          </p>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className="hover:file:bg-primary/90 block w-full text-sm
              text-foreground file:mr-4 file:rounded
              file:border-0 file:bg-primary
              file:px-4 file:py-2
              file:text-sm file:font-medium
              file:text-white
              disabled:opacity-50"
          />
          {isImporting && <p className="mt-2 text-sm text-blue-600">Импорт выполняется...</p>}
        </section>

        {importResult && (
          <div className="bg-card rounded border border-border p-4">
            <h3 className="mb-2 font-semibold">Результаты импорта</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(importResult).map(([table, stats]) => (
                <div key={table} className="border-t border-border pt-2">
                  <strong>{table}</strong>: вставлено {stats.inserted}, обновлено {stats.updated},
                  пропущено {stats.skipped}
                  {stats.errors.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-red-500">
                        Ошибки ({stats.errors.length})
                      </summary>
                      <ul className="list-disc pl-5 text-red-600 dark:text-red-400">
                        {stats.errors.map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}