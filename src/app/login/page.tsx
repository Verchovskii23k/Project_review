'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    if (res?.error) {
      setError('Неверный email или пароль');
      setLoading(false);
      return;
    }
    router.push('/');
  };

  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border p-6">
      <h1 className="mb-4 text-xl font-semibold">Вход</h1>
      {error && <p className="mb-4 text-red-500">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          className="mb-3 w-full rounded border px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <div className="relative mb-4">
          <input
            className="w-full rounded border px-3 py-2 pr-10"
            type={showPassword ? 'text' : 'password'}
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            aria-label="Показать пароль"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <button
          className="w-full rounded bg-primary px-4 py-2 text-white"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="hover:underline">
            Забыли пароль?
          </Link>
        </p>
      </form>
    </div>
  );
}