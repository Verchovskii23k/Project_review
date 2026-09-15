import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-4 text-lg text-muted-foreground">Страница не найдена</p>
      <Link
        href="/"
        className="hover:bg-primary/90 mt-6 rounded bg-primary px-4 py-2 text-white"
      >
        На главную
      </Link>
    </div>
  );
}