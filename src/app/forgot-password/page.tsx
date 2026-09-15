"use client";
import { useState } from "react";
import { trpc } from "@/trpc/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const forgotMut = trpc.auth.forgotPassword.useMutation({
    onSuccess: (data) => setMessage(data.message),
    onError: (e) => setError(e.message),
  });

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border p-6">
      <h1 className="mb-4 text-xl font-semibold">Забыли пароль?</h1>
      {error && <p className="mb-4 text-red-500">{error}</p>}
      {message && <p className="mb-4 text-green-600">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          forgotMut.mutate({ email });
        }}
      >
        <input
          className="mb-3 w-full rounded border px-3 py-2"
          type="email"
          placeholder="Ваш email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          className="w-full rounded bg-primary px-4 py-2 text-white"
          type="submit"
          disabled={forgotMut.isPending}
        >
          {forgotMut.isPending ? "Отправка..." : "Восстановить пароль"}
        </button>
      </form>
    </div>
  );
}