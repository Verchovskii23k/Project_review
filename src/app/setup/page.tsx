"use client";
import { useState } from "react";
import { trpc } from "@/trpc/client";
import { CheckCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function SetupPage() {
  const [form, setForm] = useState({
    surname: "",
    name: "",
    patronymic: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setupMutation = trpc.auth.setup.useMutation({
    onSuccess: () => setDone(true),
    onError: (e) => setError(e.message),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-lg">
          <div className="mb-4 flex justify-center">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <h2 className="mb-2 text-2xl font-bold">Готово!</h2>
          <p className="mb-6 text-muted-foreground">
            Первый администратор успешно создан. Теперь вы можете войти в систему.
          </p>
          <Link
            href="/login"
            className="hover:bg-primary/90 inline-block w-full rounded bg-primary px-4 py-2 font-medium text-white transition-colors"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border border-border bg-background p-6 text-foreground">
      <h1 className="mb-4 text-xl font-semibold">Первоначальная настройка</h1>
      {error && <p className="mb-4 text-red-500">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setupMutation.mutate({
            surname: form.surname,
            name: form.name,
            patronymic: form.patronymic || undefined,
            email: form.email,
            password: form.password,
          });
        }}
      >
        {/* Фамилия */}
        <div className="mb-3">
          <label className="mb-1 block text-sm text-muted-foreground">
            Фамилия <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
            name="surname"
            value={form.surname}
            onChange={handleChange}
            required
          />
        </div>

        {/* Имя */}
        <div className="mb-3">
          <label className="mb-1 block text-sm text-muted-foreground">
            Имя <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        {/* Отчество */}
        <div className="mb-3">
          <label className="mb-1 block text-sm text-muted-foreground">
            Отчество
          </label>
          <input
            className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
            name="patronymic"
            value={form.patronymic}
            onChange={handleChange}
            placeholder="Необязательно"
          />
        </div>

        {/* Email */}
        <div className="mb-3">
          <label className="mb-1 block text-sm text-muted-foreground">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        {/* Пароль */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted-foreground">
            Пароль <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              className="w-full rounded border border-border bg-background px-3 py-2 pr-10 text-foreground"
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Показать пароль"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          className="hover:bg-primary/90 w-full rounded bg-primary px-4 py-2 font-medium text-white transition-colors"
          type="submit"
          disabled={setupMutation.isPending}
        >
          {setupMutation.isPending ? "Создание..." : "Создать администратора"}
        </button>
      </form>
    </div>
  );
}