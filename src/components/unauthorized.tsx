import Link from 'next/link';

export default function Unauthorized() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold">401</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Вы не авторизованы для просмотра этой страницы.
      </p>
      <Link
        href="/login"
        className="hover:bg-primary/90 mt-6 rounded bg-primary px-4 py-2 text-white"
      >
        Войти
      </Link>
    </div>
  );
}