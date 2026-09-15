import Link from 'next/link';

export default function StudentPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">Раздел студента</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Этот раздел находится в разработке. В будущем здесь появится личный кабинет студента с расписанием, успеваемостью и другой полезной информацией.
      </p>
      <Link
        href="/"
        className="hover:bg-primary/90 mt-6 rounded bg-primary px-4 py-2 text-white"
      >
        На главную
      </Link>
    </div>
  );
}