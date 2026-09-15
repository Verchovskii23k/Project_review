import Link from 'next/link';

export default function Forbidden() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">403 – Доступ запрещён</h1>
      <p className="mt-2 text-muted-foreground">У вас недостаточно прав для просмотра этой страницы.</p>
      <Link href="/" className="mt-4 text-primary hover:underline">
        Вернуться на главную
      </Link>
    </div>
  );
}