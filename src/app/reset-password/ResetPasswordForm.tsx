"use client";
import { useState } from "react";
import { trpc } from "@/trpc/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const resetMut = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success('Пароль успешно изменён. Войдите с новыми данными.');
      router.push("/login");
    },
    onError: (e) => {
      setError(e.message);
      toast.error(e.message);
    },
  });

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border p-6">
      <h1 className="mb-4 text-xl font-semibold">Новый пароль</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          resetMut.mutate({
            token,
            newPassword,
            newEmail: newEmail.trim() || undefined,
          });
        }}
      >
        {/* Новый email (необязательно) */}
        <label className="text-sm text-muted-foreground">
          Новый email (необязательно)
        </label>
        <input
          type="email"
          className="mb-3 w-full rounded border px-3 py-2"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Оставьте пустым, чтобы не менять"
        />

        <label className="text-sm text-muted-foreground">Новый пароль (мин. 6 символов)</label>
        <div className="relative mb-3">
          <input
            type={showPassword ? "text" : "password"}
            className="w-full rounded border px-3 py-2 pr-10"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            suppressHydrationWarning
          />
          <button
            type="button"
            aria-label="Показать пароль"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {error && <p className="mb-3 text-red-500">{error}</p>}
        <button
          type="submit"
          aria-label="Сохранить новый пароль"
          className="w-full rounded bg-primary px-4 py-2 text-white"
          disabled={resetMut.isPending}
        >
          {resetMut.isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </form>
    </div>
  );
}